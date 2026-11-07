import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

// ---------- persisted state ----------
function useStored(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? { ...initial, ...JSON.parse(raw) } : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }, [key, value]);
  return [value, setValue];
}

export const DEFAULT_SETTINGS = {
  liveRefresh: 15, // seconds between refreshes while any game is live
  idleRefresh: 60, // seconds between refreshes otherwise
  notify: true, // desktop notifications for favourite teams
  notifyAll: false, // notifications for every score change (all games)
  theme: 'dark',
  startView: 'home',
  hiddenLeagues: [],
};

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

export function AppProvider({ children }) {
  const [settings, setSettings] = useStored('sportshub.settings', DEFAULT_SETTINGS);
  const [favState, setFavState] = useStored('sportshub.favorites', { teams: {} });
  const [drawer, setDrawer] = useState(null); // {type:'game'|'team', leagueId, id}

  const favorites = favState.teams || {};
  const isFav = useCallback((leagueId, teamId) => !!favorites[`${leagueId}:${teamId}`], [favorites]);
  const toggleFav = useCallback(
    (leagueId, team) => {
      const key = `${leagueId}:${team.id}`;
      setFavState((s) => {
        const teams = { ...(s.teams || {}) };
        if (teams[key]) delete teams[key];
        else teams[key] = { leagueId, id: team.id, name: team.name, abbr: team.abbr, logo: team.logo };
        return { ...s, teams };
      });
    },
    [setFavState]
  );

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    window.api?.setTheme?.(settings.theme);
  }, [settings.theme]);

  const value = useMemo(
    () => ({
      settings,
      setSettings,
      favorites,
      isFav,
      toggleFav,
      drawer,
      openGame: (leagueId, id) => setDrawer({ type: 'game', leagueId, id }),
      openTeam: (leagueId, id) => setDrawer({ type: 'team', leagueId, id }),
      closeDrawer: () => setDrawer(null),
    }),
    [settings, setSettings, favorites, isFav, toggleFav, drawer]
  );
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

// ---------- polling ----------
export const REFRESH_EVENT = 'sportshub:refresh';
export const refreshAll = () => window.dispatchEvent(new Event(REFRESH_EVENT));

/**
 * Fetches data and keeps it fresh. Polls faster while `isLive(data)` is true.
 * Resets when `key` changes; manual refresh keeps showing the old data while loading.
 * `minIdle` (seconds) slows idle polling for data that rarely changes (news, stats, depth charts).
 */
export function usePoll(fetcher, key, { isLive, enabled = true, minIdle = 0 } = {}) {
  const { settings } = useApp();
  const [state, setState] = useState({ data: null, error: null, loading: true, updated: null, key });
  const [nonce, setNonce] = useState(0);
  const fetcherRef = useRef(fetcher);
  const liveRef = useRef(isLive);
  fetcherRef.current = fetcher;
  liveRef.current = isLive;

  useEffect(() => {
    const onRefresh = () => setNonce((n) => n + 1);
    window.addEventListener(REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(REFRESH_EVENT, onRefresh);
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    let timer;
    setState((s) => (s.key === key ? { ...s, loading: true } : { data: null, error: null, loading: true, updated: null, key }));

    const run = async () => {
      try {
        const data = await fetcherRef.current();
        if (cancelled) return;
        setState({ data, error: null, loading: false, updated: new Date(), key });
        const live = liveRef.current ? liveRef.current(data) : false;
        timer = setTimeout(run, (live ? settings.liveRefresh : Math.max(settings.idleRefresh, minIdle)) * 1000);
      } catch (e) {
        if (cancelled) return;
        setState((s) => ({ ...s, error: e.message || String(e), loading: false, key }));
        timer = setTimeout(run, Math.max(30, settings.idleRefresh, minIdle) * 1000);
      }
    };
    run();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, nonce, enabled, settings.liveRefresh, settings.idleRefresh, minIdle]);

  return { ...state, refresh: () => setNonce((n) => n + 1) };
}

export function useNow(ms = 30000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
