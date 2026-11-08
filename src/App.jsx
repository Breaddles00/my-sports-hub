import { useEffect, useRef, useState } from 'react';
import { LEAGUES, LEAGUE_BY_ID } from './leagues.js';
import { getScoreboard, openExternal } from './api.js';
import { refreshAll, useApp, useNow, usePoll } from './store.jsx';
import { Drawer, LeagueLogo, Tabs, timeAgo } from './components/common.jsx';
import Home from './components/Home.jsx';
import Starred from './components/Starred.jsx';
import Scoreboard from './components/Scoreboard.jsx';
import Standings from './components/Standings.jsx';
import News from './components/News.jsx';
import GameDetail from './components/GameDetail.jsx';
import Settings from './components/Settings.jsx';
import { TeamDetail, TeamsGrid } from './components/Teams.jsx';

// Polls the current slate of every league (powers Home, sidebar badges and notifications).
async function fetchHub() {
  const results = await Promise.allSettled(LEAGUES.map((l) => getScoreboard(l)));
  const out = {};
  results.forEach((r, i) => {
    out[LEAGUES[i].id] = r.status === 'fulfilled' ? r.value : { events: [], error: r.reason?.message || 'Failed' };
  });
  if (results.every((r) => r.status === 'rejected')) throw new Error(results[0].reason?.message || 'Network error');
  return out;
}

function notify(title, body, icon) {
  if (typeof Notification === 'undefined') return;
  const fire = () => {
    try {
      const n = new Notification(title, { body, icon, silent: false });
      n.onclick = () => window.focus();
      window.api?.flash?.();
    } catch {
      /* ignore */
    }
  };
  if (Notification.permission === 'granted') fire();
  // Browsers only allow the permission prompt after a tap, so the web version asks from Settings instead.
  else if (Notification.permission === 'default' && window.api?.platform !== 'web')
    Notification.requestPermission().then((p) => p === 'granted' && fire());
}

function useScoreAlerts(hubData) {
  const { settings, favorites } = useApp();
  const prev = useRef(null);
  useEffect(() => {
    if (!hubData) return;
    const snapshot = {};
    Object.values(hubData).forEach((lgData) =>
      (lgData.events || []).forEach((g) => {
        snapshot[`${g.leagueId}:${g.id}`] = g;
      })
    );
    const before = prev.current;
    prev.current = snapshot;
    if (!before || (!settings.notify && !settings.notifyAll)) return;

    Object.entries(snapshot).forEach(([k, g]) => {
      const old = before[k];
      if (!old) return;
      const lg = LEAGUE_BY_ID[g.leagueId];
      const isFavGame = g.competitors.some((c) => favorites[`${g.leagueId}:${c.id}`]);
      const followed = settings.notify && isFavGame;
      if (!followed && !settings.notifyAll) return;
      const [a, b] = lg.homeFirst ? [g.home, g.away] : [g.away, g.home];
      if (!a || !b) return;
      const line = `${a.short} ${a.score ?? ''} – ${b.score ?? ''} ${b.short}`;
      const favTeam = g.competitors.find((c) => favorites[`${g.leagueId}:${c.id}`]);
      const icon = favTeam?.logo || a.logo;

      if (followed && old.state === 'pre' && g.state === 'in') {
        notify(`${lg.name}: Underway`, `${a.name} ${lg.homeFirst ? 'v' : '@'} ${b.name} has started`, icon);
      } else if (followed && g.state === 'in' && (old.home?.score !== g.home?.score || old.away?.score !== g.away?.score)) {
        const scorer = Number(g.home?.score) > Number(old.home?.score) ? g.home : Number(g.away?.score) > Number(old.away?.score) ? g.away : null;
        notify(`${lg.name}: ${scorer ? `${scorer.short} score!` : 'Score update'}`, `${line}\n${g.detail}`, scorer?.logo || icon);
      } else if (old.state === 'in' && g.state === 'post') {
        notify(`${lg.name}: Final`, line, icon);
      }
    });
  }, [hubData, settings.notify, settings.notifyAll, favorites]);
}

function TitleBar({ hub, liveCount }) {
  const now = useNow(5000);
  const isWin = window.api?.platform === 'win32';
  return (
    <header className={`titlebar ${isWin ? 'win' : ''}`}>
      <div className="brand">
        <span className="brand-mark">◆</span> My Sports Hub
      </div>
      {liveCount > 0 && (
        <span className="chip live small">
          <span className="live-dot" /> {liveCount} live
        </span>
      )}
      <span className="spacer" />
      <span className="muted small no-drag">{hub.updated ? `Updated ${timeAgo(hub.updated, now)}` : hub.error ? 'Offline' : 'Connecting…'}</span>
      <button className={`btn icon no-drag ${hub.loading ? 'spinning' : ''}`} title="Refresh all (F5)" onClick={refreshAll}>
        ⟳
      </button>
    </header>
  );
}

function UpdateBanner() {
  const [notice, setNotice] = useState(null);
  useEffect(() => {
    window.api?.updateNotice?.().then(setNotice).catch(() => {});
  }, []);
  if (!notice) return null;
  return (
    <div className="update-banner">
      <span>⬆ {notice.message}</span>
      {notice.url && (
        <button className="btn primary" onClick={() => openExternal(notice.url)}>
          Download
        </button>
      )}
      <button className="btn ghost" onClick={() => setNotice(null)}>
        Dismiss
      </button>
    </div>
  );
}

const LEAGUE_TABS = [
  { id: 'scores', label: 'Scores & schedule' },
  { id: 'standings', label: 'Standings' },
  { id: 'teams', label: 'Teams' },
  { id: 'news', label: 'News' },
];

export default function App() {
  const { settings, favorites, drawer, closeDrawer } = useApp();
  const [view, setView] = useState(settings.startView || 'home');
  const [leagueTab, setLeagueTab] = useState('scores');
  const hub = usePoll(fetchHub, 'hub', { isLive: (d) => Object.values(d).some((x) => x.events?.some((e) => e.state === 'in')) });
  useScoreAlerts(hub.data);

  const visible = LEAGUES.filter((l) => !settings.hiddenLeagues.includes(l.id));
  const liveCount = (id) => (hub.data?.[id]?.events || []).filter((e) => e.state === 'in').length;
  const totalLive = LEAGUES.reduce((n, l) => n + liveCount(l.id), 0);
  const starredLive = LEAGUES.flatMap((l) => hub.data?.[l.id]?.events || []).filter(
    (g) => g.state === 'in' && g.competitors.some((c) => favorites[`${g.leagueId}:${c.id}`])
  ).length;

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'F5' || (e.ctrlKey && e.key.toLowerCase() === 'r')) {
        e.preventDefault();
        refreshAll();
        return;
      }
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      if (e.key.toLowerCase() === 'h') setView('home');
      if (e.key.toLowerCase() === 's') setView('starred');
      const n = Number(e.key);
      if (n >= 1 && n <= visible.length) setView(visible[n - 1].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible]);

  const go = (id) => {
    setView(id);
    setLeagueTab('scores');
  };
  const lg = LEAGUE_BY_ID[view];

  return (
    <div className="app">
      <TitleBar hub={hub} liveCount={totalLive} />
      <UpdateBanner />
      <div className="body">
        <nav className="sidebar">
          <button className={`nav-item ${view === 'home' ? 'active' : ''}`} onClick={() => go('home')}>
            <span className="nav-ic">⌂</span>
            <span className="nav-label">Home</span>
            {totalLive > 0 && <span className="badge live">{totalLive}</span>}
          </button>
          <button className={`nav-item ${view === 'starred' ? 'active' : ''}`} onClick={() => go('starred')} title="Starred teams (S)">
            <span className="nav-ic star-ic">★</span>
            <span className="nav-label">Starred</span>
            {starredLive > 0 && <span className="badge live">{starredLive}</span>}
          </button>
          <div className="nav-sep">Leagues</div>
          {visible.map((l, i) => (
            <button
              key={l.id}
              className={`nav-item ${view === l.id ? 'active' : ''}`}
              style={{ '--lg': l.accent }}
              onClick={() => go(l.id)}
              title={`${l.full} (${i + 1})`}
            >
              <span className="nav-ic lg">
                <LeagueLogo lg={l} size={20} />
              </span>
              <span className="nav-label">{l.name}</span>
              {liveCount(l.id) > 0 && <span className="badge live">{liveCount(l.id)}</span>}
            </button>
          ))}
          <span className="spacer" />
          <button className={`nav-item ${view === 'settings' ? 'active' : ''}`} onClick={() => go('settings')}>
            <span className="nav-ic">⚙</span>
            <span className="nav-label">Settings</span>
          </button>
        </nav>

        <main className="main">
          {view === 'home' && <Home hub={hub} onNavigate={go} />}
          {view === 'starred' && <Starred hub={hub} />}
          {view === 'settings' && <Settings />}
          {lg && (
            <div className="league-view" style={{ '--lg': lg.accent }}>
              <div className="league-head">
                <div>
                  <h1>
                    <LeagueLogo lg={lg} size={30} /> {lg.full}
                  </h1>
                </div>
                <Tabs tabs={LEAGUE_TABS} value={leagueTab} onChange={setLeagueTab} />
              </div>
              {leagueTab === 'scores' && <Scoreboard key={lg.id} lg={lg} />}
              {leagueTab === 'standings' && <Standings key={lg.id} lg={lg} />}
              {leagueTab === 'teams' && <TeamsGrid key={lg.id} lg={lg} />}
              {leagueTab === 'news' && <News key={lg.id} lg={lg} />}
            </div>
          )}
        </main>
      </div>

      {drawer && (
        <Drawer onClose={closeDrawer} wide={drawer.type === 'game'}>
          {drawer.type === 'game' && <GameDetail key={drawer.leagueId + drawer.id} leagueId={drawer.leagueId} eventId={drawer.id} />}
          {drawer.type === 'team' && <TeamDetail key={drawer.leagueId + drawer.id} leagueId={drawer.leagueId} teamId={drawer.id} />}
        </Drawer>
      )}
    </div>
  );
}
