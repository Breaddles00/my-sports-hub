import { useEffect, useState } from 'react';
import { LEAGUES } from '../leagues.js';
import { DEFAULT_SETTINGS, useApp } from '../store.jsx';
import { openExternal } from '../api.js';
import { Logo } from './common.jsx';

const RELEASES_URL = 'https://github.com/Breaddles00/my-sports-hub/releases/latest';
const isWeb = () => window.api?.platform === 'web';

// Web version: nothing to install, a reload always gets the newest build.
function WebPanel() {
  const build = window.api?.build || {};
  const installed = window.api?.standalone?.();
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const built = build.date ? new Date(build.date).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
  return (
    <section className="panel">
      <h4>Web version</h4>
      <div className="row">
        <span>
          My Sports Hub {build.version}
          <small className="muted">
            {build.sha ? `Build ${build.sha}` : 'Local build'}
            {built && ` · ${built}`} · Reloading the page picks up new versions
          </small>
        </span>
        <button className="btn" onClick={() => location.reload()}>
          Reload
        </button>
      </div>
      {!installed && (
        <div className="row">
          <span>
            Add to Home Screen
            <small className="muted">
              {ios
                ? 'In Safari, tap Share, then "Add to Home Screen". It then opens full screen like an app (and can show notifications).'
                : 'In Chrome, open the ⋮ menu and choose "Add to Home screen" or "Install app" to open it full screen like an app.'}
            </small>
          </span>
        </div>
      )}
      <div className="row">
        <span>
          Windows app
          <small className="muted">Starred teams and settings are kept separately on each device</small>
        </span>
        <button className="btn" onClick={() => openExternal(RELEASES_URL)}>
          Download
        </button>
      </div>
    </section>
  );
}

function UpdatesPanel({ version }) {
  const [state, setState] = useState(null);
  const check = async () => {
    setState({ status: 'checking' });
    setState((await window.api?.checkForUpdates?.()) || { status: 'error', message: 'Not available in this mode' });
  };
  return (
    <section className="panel">
      <h4>Updates</h4>
      <div className="row">
        <span>
          My Sports Hub {version && `v${version}`}
          <small className="muted">Checks GitHub (Breaddles00/my-sports-hub) every time the app launches and installs new versions automatically</small>
        </span>
        <button className="btn" onClick={check} disabled={state?.status === 'checking'}>
          {state?.status === 'checking' ? 'Checking…' : 'Check now'}
        </button>
      </div>
      {state && state.status !== 'checking' && (
        <div className="row">
          <span>
            {state.status === 'current' && "✓ You're on the latest version."}
            {state.status === 'available' && `⬆ ${state.version ? `Version ${state.version} is available.` : state.message}`}
            {state.status === 'error' && <span className="muted">Couldn't check: {state.message}</span>}
          </span>
          {state.status === 'available' &&
            (state.canRestart ? (
              <button className="btn primary" onClick={() => window.api.restartToUpdate()}>
                Restart &amp; update
              </button>
            ) : (
              state.url && (
                <button className="btn primary" onClick={() => openExternal(state.url)}>
                  Download
                </button>
              )
            ))}
        </div>
      )}
    </section>
  );
}

export default function Settings() {
  const { settings, setSettings, favorites, toggleFav } = useApp();
  const [version, setVersion] = useState('');
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  useEffect(() => {
    window.api?.version?.().then(setVersion);
  }, []);
  const set = (patch) => setSettings((s) => ({ ...s, ...patch }));
  const toggleLeague = (id) =>
    set({ hiddenLeagues: settings.hiddenLeagues.includes(id) ? settings.hiddenLeagues.filter((x) => x !== id) : [...settings.hiddenLeagues, id] });

  const testNotify = async () => {
    if (typeof Notification === 'undefined') return;
    let p = Notification.permission;
    if (p === 'default') p = await Notification.requestPermission();
    setPerm(p);
    if (p === 'granted') new Notification('My Sports Hub', { body: 'Notifications are working. You will be alerted when your teams score.' });
  };

  return (
    <div className="settings">
      <h2>Settings</h2>

      <section className="panel">
        <h4>Live updates</h4>
        <label className="row">
          <span>
            Refresh while games are live
            <small className="muted">How often scores update when anything is in progress</small>
          </span>
          <select value={settings.liveRefresh} onChange={(e) => set({ liveRefresh: Number(e.target.value) })}>
            {[10, 15, 20, 30, 60].map((s) => (
              <option key={s} value={s}>
                every {s} seconds
              </option>
            ))}
          </select>
        </label>
        <label className="row">
          <span>
            Refresh when nothing is live
            <small className="muted">Schedules, standings and news</small>
          </span>
          <select value={settings.idleRefresh} onChange={(e) => set({ idleRefresh: Number(e.target.value) })}>
            {[30, 60, 120, 300].map((s) => (
              <option key={s} value={s}>
                every {s >= 60 ? `${s / 60} min` : `${s} seconds`}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="panel">
        <h4>Notifications</h4>
        <label className="row">
          <span>
            Alerts for teams I follow
            <small className="muted">Kick-off / first pitch / puck drop, every score change, and final result</small>
          </span>
          <input type="checkbox" checked={settings.notify} onChange={(e) => set({ notify: e.target.checked })} />
        </label>
        <label className="row">
          <span>
            Alerts for every game
            <small className="muted">Final results for all games on today's slates (can be noisy)</small>
          </span>
          <input type="checkbox" checked={settings.notifyAll} onChange={(e) => set({ notifyAll: e.target.checked })} />
        </label>
        {isWeb() && (
          <p className="muted small">
            {perm === 'unsupported'
              ? /iPhone|iPad|iPod/.test(navigator.userAgent)
                ? 'On iPhone, notifications need the site added to your Home Screen first (see Web version below).'
                : "This browser doesn't support notifications."
              : 'Alerts only arrive while My Sports Hub is open in a tab or on your home screen.'}
          </p>
        )}
        <div className="row">
          <span className="muted small">Permission: {perm}</span>
          <button className="btn" onClick={testNotify}>
            Send test notification
          </button>
        </div>
      </section>

      <section className="panel">
        <h4>Appearance</h4>
        <label className="row">
          <span>Theme</span>
          <select value={settings.theme} onChange={(e) => set({ theme: e.target.value })}>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>
        <label className="row">
          <span>Open on</span>
          <select value={settings.startView} onChange={(e) => set({ startView: e.target.value })}>
            <option value="home">Home</option>
            <option value="starred">Starred teams</option>
            {LEAGUES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.full}
              </option>
            ))}
          </select>
        </label>
        <div className="row wrap">
          <span>Leagues in sidebar</span>
          <div className="league-toggles">
            {LEAGUES.map((l) => (
              <label key={l.id} className="check">
                <input type="checkbox" checked={!settings.hiddenLeagues.includes(l.id)} onChange={() => toggleLeague(l.id)} /> {l.name}
              </label>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <h4>Teams you follow ({Object.keys(favorites).length})</h4>
        {Object.values(favorites).length === 0 && <p className="muted">None yet — tap ☆ next to any team.</p>}
        <div className="fav-chips">
          {Object.values(favorites).map((f) => (
            <span key={`${f.leagueId}:${f.id}`} className="fav-chip">
              <Logo src={f.logo} alt={f.name} size={18} /> {f.name}
              <span className="muted small">{LEAGUES.find((l) => l.id === f.leagueId)?.name}</span>
              <button className="x" onClick={() => toggleFav(f.leagueId, f)} title="Unfollow">
                ✕
              </button>
            </span>
          ))}
        </div>
      </section>

      {isWeb() ? <WebPanel /> : <UpdatesPanel version={version} />}

      <section className="panel">
        <h4>About</h4>
        <p className="muted small">
          Data from ESPN's public scoreboard feeds (AFL ladder backup via Squiggle). Not affiliated with any league. Keyboard: F5 refresh · Esc close panel · 1–6 switch league · H home.
        </p>
        <button className="btn ghost" onClick={() => setSettings(DEFAULT_SETTINGS)}>
          Reset settings
        </button>
      </section>
    </div>
  );
}
