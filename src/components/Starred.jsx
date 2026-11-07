import { useEffect, useMemo, useState } from 'react';
import { LEAGUES, LEAGUE_BY_ID } from '../leagues.js';
import { fmtDate, fmtTime, getDepthChart, getTeamNews, getTeamStats, getTeamSummary } from '../api.js';
import { applyInjuryHistory } from '../injuries.js';
import { useApp, usePoll } from '../store.jsx';
import { NewsGrid } from './News.jsx';
import { Empty, ErrorBox, Logo, Spinner, Star, Tabs } from './common.jsx';

// The Starred view: schedule, news, stats and depth charts for followed teams only.
// "All teams" merges or compares every starred team; picking a chip focuses on one.

const favKey = (f) => `${f.leagueId}:${f.id}`;
const LEAGUE_ORDER = Object.fromEntries(LEAGUES.map((l, i) => [l.id, i]));

// One fetch per team. Failed teams come back as { error } so one bad feed doesn't blank
// the page; the whole call only throws if every team failed.
async function perTeam(teams, fn) {
  const res = await Promise.allSettled(teams.map((f) => fn(LEAGUE_BY_ID[f.leagueId], f.id)));
  if (teams.length && res.every((r) => r.status === 'rejected')) throw res[0].reason;
  return Object.fromEntries(
    res.map((r, i) => [favKey(teams[i]), r.status === 'fulfilled' ? r.value : { error: r.reason?.message || 'Failed to load' }])
  );
}

function matchup(g, teamId) {
  const me = g.competitors.find((c) => String(c.id) === String(teamId));
  const opp = g.competitors.find((c) => String(c.id) !== String(teamId));
  if (!me || !opp) return null;
  const res = g.state === 'post' ? (me.winner ? 'W' : opp.winner ? 'L' : 'T') : null;
  return { me, opp, home: me.homeAway === 'home', res };
}

function Result({ g, m }) {
  if (g.state === 'post') {
    return (
      <span className={`res res-${m.res}`}>
        {m.res} {m.me.score}-{m.opp.score}
      </span>
    );
  }
  if (g.state === 'in') {
    return (
      <span className="res live">
        LIVE {m.me.score}-{m.opp.score}
      </span>
    );
  }
  return <span className="muted">{/TBD/.test(g.detail) ? 'TBD' : fmtTime(g.date)}</span>;
}

const vsWord = (lg, home) => (lg.homeFirst ? (home ? 'v' : '@') : home ? 'vs' : '@');

// ---------- page ----------
export default function Starred({ hub }) {
  const { favorites } = useApp();
  const teams = useMemo(
    () =>
      Object.values(favorites)
        .filter((f) => LEAGUE_BY_ID[f.leagueId])
        .sort((a, b) => LEAGUE_ORDER[a.leagueId] - LEAGUE_ORDER[b.leagueId] || String(a.name).localeCompare(String(b.name))),
    [favorites]
  );
  const [sel, setSel] = useState('all');
  const [tab, setTab] = useState('schedule');

  const selected = sel === 'all' ? teams : teams.filter((f) => favKey(f) === sel);
  const single = sel !== 'all' && selected.length === 1;
  const hasDepth = selected.some((f) => LEAGUE_BY_ID[f.leagueId].depthChart);

  // Fall back when the focused team is unstarred, or the depth tab no longer applies.
  useEffect(() => {
    if (sel !== 'all' && !teams.some((f) => favKey(f) === sel)) setSel('all');
  }, [teams, sel]);
  useEffect(() => {
    if (tab === 'depth' && !hasDepth) setTab('schedule');
  }, [tab, hasDepth]);

  if (!teams.length) {
    return (
      <div className="starred">
        <div className="league-head" style={{ '--lg': 'var(--gold)' }}>
          <h1>Starred teams</h1>
        </div>
        <Empty title="You haven't starred any teams yet" icon="☆">
          Click the ☆ next to a team on any scoreboard, standings table or Teams tab. Their schedule, news, stats and depth charts will
          all show up here.
        </Empty>
      </div>
    );
  }

  const tabs = [
    { id: 'schedule', label: 'Schedule' },
    { id: 'news', label: 'News' },
    { id: 'stats', label: 'Stats' },
    ...(hasDepth ? [{ id: 'depth', label: 'Depth charts' }] : []),
  ];
  const scope = selected.map(favKey).join(',');

  return (
    <div className="starred">
      <div className="league-head starred-head" style={{ '--lg': 'var(--gold)' }}>
        <h1>Starred teams</h1>
        <div className="star-picker">
          <button className={`fav-chip ${sel === 'all' ? 'active' : ''}`} onClick={() => setSel('all')}>
            ★ All teams <span className="muted small">{teams.length}</span>
          </button>
          {teams.map((f) => (
            <button key={favKey(f)} className={`fav-chip ${sel === favKey(f) ? 'active' : ''}`} onClick={() => setSel(favKey(f))}>
              <Logo src={f.logo} alt={f.name} size={20} /> {f.name}
              <span className="muted small">{LEAGUE_BY_ID[f.leagueId].name}</span>
            </button>
          ))}
        </div>
        <Tabs tabs={tabs} value={tab} onChange={setTab} />
      </div>

      {tab === 'schedule' && <ScheduleTab key={scope} teams={selected} single={single} hub={hub} onPick={setSel} />}
      {tab === 'news' && <NewsTab key={scope} teams={selected} />}
      {tab === 'stats' && <StatsTab key={scope} teams={selected} single={single} onPick={setSel} />}
      {tab === 'depth' && <DepthTab key={scope} teams={selected} single={single} />}
    </div>
  );
}

// ---------- schedule ----------
function ScheduleTab({ teams, single, hub, onPick }) {
  const { data, error, loading, refresh } = usePoll(() => perTeam(teams, getTeamSummary), `starred-sched:${teams.map(favKey)}`, {
    isLive: (d) => Object.values(d).some((s) => s.games?.some((g) => g.state === 'in')),
  });
  // The Home poller refreshes live games faster than team schedules, so prefer its copy.
  const hubGames = useMemo(() => {
    const m = new Map();
    Object.values(hub.data || {}).forEach((l) => (l.events || []).forEach((g) => m.set(`${g.leagueId}:${g.id}`, g)));
    return m;
  }, [hub.data]);

  if (loading && !data) return <Spinner label="Loading schedules…" />;
  if (error && !data) return <ErrorBox error={error} onRetry={refresh} />;

  const entries = teams.map((f) => {
    const s = data?.[favKey(f)] || {};
    const games = (s.games || []).map((g) => hubGames.get(`${g.leagueId}:${g.id}`) || g);
    return { f, lg: LEAGUE_BY_ID[f.leagueId], s, games };
  });

  // Merge every team's games. A game between two starred teams is listed once.
  const seen = new Set();
  const rows = [];
  entries.forEach(({ f, lg, games }) =>
    games.forEach((g) => {
      const k = `${g.leagueId}:${g.id}`;
      if (seen.has(k)) return;
      const m = matchup(g, f.id);
      if (!m) return;
      seen.add(k);
      rows.push({ g, f, lg, m });
    })
  );
  const upcoming = rows.filter((r) => r.g.state !== 'post').sort((a, b) => new Date(a.g.date) - new Date(b.g.date));
  const results = rows.filter((r) => r.g.state === 'post').sort((a, b) => new Date(b.g.date) - new Date(a.g.date));
  const cap = single ? Infinity : 20;

  return (
    <div className="starred-body">
      <div className={`star-cards ${single ? 'single' : ''}`}>
        {entries.map((e) => (
          <TeamCard key={favKey(e.f)} {...e} single={single} onPick={onPick} />
        ))}
      </div>
      <div className="star-cols">
        <section className="panel">
          <h4>Coming up</h4>
          {upcoming.length ? (
            <ul className="schedule">
              {upcoming.slice(0, cap).map((r) => (
                <GameRow key={`${r.g.leagueId}:${r.g.id}`} {...r} showTeam={!single} />
              ))}
            </ul>
          ) : (
            <p className="muted">No upcoming games on the schedule.</p>
          )}
        </section>
        <section className="panel">
          <h4>Results</h4>
          {results.length ? (
            <ul className="schedule">
              {results.slice(0, cap).map((r) => (
                <GameRow key={`${r.g.leagueId}:${r.g.id}`} {...r} showTeam={!single} />
              ))}
            </ul>
          ) : (
            <p className="muted">No completed games yet this season.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function TeamCard({ f, lg, s, games, single, onPick }) {
  const { openTeam, toggleFav } = useApp();
  const t = s.team || {};
  const live = games.find((g) => g.state === 'in');
  const next = games.find((g) => g.state === 'pre');
  const last = [...games].reverse().find((g) => g.state === 'post');
  return (
    <div
      className={`star-card ${single ? 'big' : 'clickable'}`}
      style={{ '--tc': t.color || '#334155' }}
      onClick={single ? undefined : () => onPick(favKey(f))}
      title={single ? undefined : `Focus on ${f.name}`}
    >
      <div className="sc-head">
        <Logo src={t.logo || f.logo} alt={t.name || f.name} size={single ? 56 : 36} />
        <div className="sc-title">
          <strong>{t.name || f.name}</strong>
          <span className="muted small">
            <span className="league-tag" style={{ '--lg': lg.accent }}>
              {lg.name}
            </span>
            {t.record && <> · {t.record}</>}
            {t.standing && <> · {t.standing}</>}
          </span>
        </div>
        <Star on onClick={() => toggleFav(f.leagueId, f)} title="Unstar team" />
      </div>
      {s.error ? (
        <p className="muted small">Couldn't load this team's schedule.</p>
      ) : (
        <div className="sc-games">
          {live && <MiniGame label="Live" g={live} f={f} lg={lg} />}
          {!live && last && <MiniGame label="Last" g={last} f={f} lg={lg} />}
          {next && <MiniGame label="Next" g={next} f={f} lg={lg} />}
          {!live && !last && !next && <span className="muted small">No games on the schedule</span>}
        </div>
      )}
      {single && (
        <button className="btn ghost" onClick={() => openTeam(f.leagueId, f.id)}>
          Roster & team page →
        </button>
      )}
    </div>
  );
}

function MiniGame({ label, g, f, lg }) {
  const { openGame } = useApp();
  const m = matchup(g, f.id);
  if (!m) return null;
  return (
    <button
      className={`mini-game state-${g.state}`}
      onClick={(e) => {
        e.stopPropagation();
        openGame(lg.id, g.id);
      }}
    >
      <span className="mg-label">{label}</span>
      <span className="muted small">{g.state === 'pre' ? fmtDate(g.date) : ''}</span>
      <span className="sched-vs">{vsWord(lg, m.home)}</span>
      <Logo src={m.opp.logo} alt={m.opp.name} size={18} />
      <span className="mg-opp">{m.opp.short}</span>
      <span className="spacer" />
      <Result g={g} m={m} />
    </button>
  );
}

function GameRow({ g, f, lg, m, showTeam }) {
  const { openGame } = useApp();
  return (
    <li className={`sched-row state-${g.state}`} onClick={() => openGame(lg.id, g.id)}>
      <span className="sched-date">{fmtDate(g.date)}</span>
      {showTeam && (
        <>
          <Logo src={m.me.logo || f.logo} alt={m.me.name} size={20} />
          <span className="sched-me">{m.me.short}</span>
        </>
      )}
      <span className="sched-vs">{vsWord(lg, m.home)}</span>
      <Logo src={m.opp.logo} alt={m.opp.name} size={20} />
      <span className="sched-opp">{showTeam ? m.opp.short : m.opp.name}</span>
      {showTeam && (
        <span className="league-tag" style={{ '--lg': lg.accent }}>
          {lg.name}
        </span>
      )}
      <span className="spacer" />
      <Result g={g} m={m} />
    </li>
  );
}

// ---------- news ----------
function NewsTab({ teams }) {
  const per = teams.length > 1 ? 15 : 30;
  const { data, error, loading, refresh } = usePoll(
    () => perTeam(teams, (lg, id) => getTeamNews(lg, id, per)),
    `starred-news:${teams.map(favKey)}`,
    { minIdle: 300 }
  );
  const articles = useMemo(() => {
    const byId = new Map();
    teams.forEach((f) => {
      const list = data?.[favKey(f)];
      (Array.isArray(list) ? list : []).forEach((a) => {
        const k = `${f.leagueId}:${a.id}`;
        if (byId.has(k)) byId.get(k).starred.push(f);
        else byId.set(k, { ...a, id: k, starred: [f] });
      });
    });
    return [...byId.values()].sort((a, b) => new Date(b.published || 0) - new Date(a.published || 0));
  }, [data, teams]);

  if (loading && !data) return <Spinner label="Loading news…" />;
  if (error && !data) return <ErrorBox error={error} onRetry={refresh} />;
  if (!articles.length) return <Empty title="No news for your starred teams right now" icon="📰" />;
  return (
    <NewsGrid
      articles={articles}
      renderTag={
        teams.length > 1
          ? (a) => (
              <span className="news-tags">
                {a.starred.map((f) => (
                  <span key={favKey(f)} className="news-tag">
                    <Logo src={f.logo} alt={f.name} size={16} /> {f.abbr || f.name}
                  </span>
                ))}
              </span>
            )
          : undefined
      }
    />
  );
}

// ---------- stats ----------
const findStat = (s, [cat, name]) => s?.categories?.find((c) => c.name === cat)?.stats.find((x) => x.name === name);

function StatsTab({ teams, single, onPick }) {
  const { data, error, loading, refresh } = usePoll(() => perTeam(teams, getTeamStats), `starred-stats:${teams.map(favKey)}`, { minIdle: 600 });
  if (loading && !data) return <Spinner label="Loading team stats…" />;
  if (error && !data) return <ErrorBox error={error} onRetry={refresh} />;

  if (single) {
    const f = teams[0];
    const s = data?.[favKey(f)];
    if (s?.error) return <ErrorBox error={s.error} onRetry={refresh} />;
    if (!s?.categories?.length) return <Empty title="No stats available yet this season" icon="📊" />;
    return <TeamStats lg={LEAGUE_BY_ID[f.leagueId]} s={s} />;
  }

  // All teams: one comparison table per league (stats aren't comparable across sports).
  const leagues = LEAGUES.filter((l) => teams.some((f) => f.leagueId === l.id));
  return (
    <div className="starred-body">
      <div className="stat-panels">
        {leagues.map((lg) => {
          const lt = teams.filter((f) => f.leagueId === lg.id);
          const season = lt.map((f) => data?.[favKey(f)]?.season).find(Boolean);
          const rows = (lg.keyStats || []).filter((k) => lt.some((f) => findStat(data?.[favKey(f)], k)));
          return (
            <section className="panel" key={lg.id}>
              <h4>
                {lg.name} key stats{season ? <span className="muted"> · {season}</span> : null}
              </h4>
              {rows.length ? (
                <div className="table-wrap">
                  <table className="box compare">
                    <thead>
                      <tr>
                        <th className="left">Stat</th>
                        {lt.map((f) => (
                          <th key={favKey(f)} className="team-col" onClick={() => onPick(favKey(f))} title={`Focus on ${f.name}`}>
                            <Logo src={f.logo} alt={f.name} size={22} />
                            <span>{f.abbr || f.name}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((k) => (
                        <tr key={k.join('.')}>
                          <td className="left">{k[2]}</td>
                          {lt.map((f) => (
                            <td key={favKey(f)} className="strong">
                              {findStat(data?.[favKey(f)], k)?.value ?? '–'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">No stats available yet this season.</p>
              )}
            </section>
          );
        })}
      </div>
      <p className="muted small">Click a team to see its full stats.</p>
    </div>
  );
}

function TeamStats({ lg, s }) {
  const keys = (lg.keyStats || []).map((k) => [k, findStat(s, k)]).filter(([, st]) => st);
  return (
    <div className="starred-body">
      {s.season && <p className="muted small">{s.season}</p>}
      {keys.length > 0 && (
        <div className="key-stats">
          {keys.map(([k, st]) => (
            <div key={k.join('.')} className="ks">
              <span className="muted small">{k[2]}</span>
              <strong>{st.value}</strong>
            </div>
          ))}
        </div>
      )}
      <div className="stat-panels">
        {s.categories.map((c) => {
          const perGame = c.stats.some((st) => st.perGame != null && st.perGame !== st.value);
          return (
            <section className="panel" key={c.name}>
              <h4>{c.label}</h4>
              <table className="box stat-table">
                <thead>
                  <tr>
                    <th className="left">Stat</th>
                    <th>Total</th>
                    {perGame && <th>Per game</th>}
                  </tr>
                </thead>
                <tbody>
                  {c.stats.map((st) => (
                    <tr key={st.name}>
                      <td className="left">
                        {st.label} {st.abbr && st.abbr !== st.label && <span className="muted small">{st.abbr}</span>}
                      </td>
                      <td className="strong">{st.value}</td>
                      {perGame && <td>{st.perGame ?? ''}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
        })}
      </div>
    </div>
  );
}

// ---------- depth charts ----------
function DepthTab({ teams, single }) {
  const eligible = teams.filter((f) => LEAGUE_BY_ID[f.leagueId].depthChart);
  const skipped = teams.filter((f) => !LEAGUE_BY_ID[f.leagueId].depthChart);
  const { data, error, loading, refresh } = usePoll(
    () => perTeam(eligible, async (lg, id) => applyInjuryHistory(lg.id, await getDepthChart(lg, id))),
    `starred-depth:${eligible.map(favKey)}`,
    { minIdle: 1800 }
  );
  if (loading && !data) return <Spinner label="Loading depth charts…" />;
  if (error && !data) return <ErrorBox error={error} onRetry={refresh} />;

  return (
    <div className="starred-body">
      {eligible.map((f) => {
        const charts = data?.[favKey(f)];
        return (
          <section className="panel" key={favKey(f)}>
            {!single && (
              <h4 className="depth-title">
                <Logo src={f.logo} alt={f.name} size={22} /> {f.name}
                <span className="league-tag" style={{ '--lg': LEAGUE_BY_ID[f.leagueId].accent }}>
                  {LEAGUE_BY_ID[f.leagueId].name}
                </span>
              </h4>
            )}
            {charts?.error ? (
              <p className="muted">Couldn't load this depth chart.</p>
            ) : Array.isArray(charts) && charts.length ? (
              <DepthChart charts={charts} />
            ) : (
              <p className="muted">ESPN hasn't published a depth chart for this team.</p>
            )}
          </section>
        );
      })}
      {skipped.length > 0 && (
        <p className="muted small">
          ESPN doesn't publish depth charts for {[...new Set(skipped.map((f) => LEAGUE_BY_ID[f.leagueId].name))].join(' or ')} teams, so{' '}
          {skipped.map((f) => f.name).join(', ')} {skipped.length === 1 ? "isn't" : "aren't"} shown.
        </p>
      )}
    </div>
  );
}

const ORD = ['Starter', '2nd', '3rd', '4th', '5th'];

function DepthChart({ charts }) {
  const [id, setId] = useState(charts[0].id);
  const c = charts.find((x) => x.id === id) || charts[0];
  const depth = Math.min(ORD.length, Math.max(1, ...c.positions.map((p) => p.athletes.length)));
  return (
    <>
      {charts.length > 1 && (
        <div className="seg depth-seg">
          {charts.map((x) => (
            <button key={x.id} className={x.id === c.id ? 'active' : ''} onClick={() => setId(x.id)}>
              {x.name}
            </button>
          ))}
        </div>
      )}
      <div className="table-wrap">
        <table className="box depth">
          <thead>
            <tr>
              <th className="left">Pos</th>
              {ORD.slice(0, depth).map((o) => (
                <th key={o} className="left">
                  {o}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {c.positions.map((p) => (
              <tr key={p.key}>
                <td className="left" title={p.name}>
                  <strong>{p.abbr}</strong>
                </td>
                {ORD.slice(0, depth).map((o, i) => {
                  const a = p.athletes[i];
                  return (
                    <td key={o} className={`left ${i === 0 ? 'player' : ''}`}>
                      {a ? (
                        <>
                          {a.name}
                          {a.tag && <span className={`chip ${a.tag.kind === 'other' ? 'warn' : `inj-${a.tag.kind}`}`}>{a.tag.label}</span>}
                        </>
                      ) : (
                        ''
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
