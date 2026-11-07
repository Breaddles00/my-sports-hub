import { useMemo, useState } from 'react';
import { LEAGUE_BY_ID } from '../leagues.js';
import { fmtDate, fmtTime, getTeamDetail, getTeams, openExternal } from '../api.js';
import { useApp, usePoll } from '../store.jsx';
import { Empty, ErrorBox, Logo, Spinner, Star, Tabs } from './common.jsx';
import { InjuryTag } from './InjuryTag.jsx';

export function TeamsGrid({ lg }) {
  const { openTeam, isFav, toggleFav } = useApp();
  const [q, setQ] = useState('');
  const { data, error, loading, refresh } = usePoll(() => getTeams(lg), `teams:${lg.id}`);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const all = data || [];
    const f = s ? all.filter((t) => `${t.name} ${t.abbr} ${t.location}`.toLowerCase().includes(s)) : all;
    return [...f].sort((a, b) => Number(isFav(lg.id, b.id)) - Number(isFav(lg.id, a.id)));
  }, [data, q, isFav, lg.id]);

  if (loading && !data) return <Spinner label="Loading teams…" />;
  if (error && !data) return <ErrorBox error={error} onRetry={refresh} />;
  return (
    <div>
      <div className="toolbar">
        <input className="search wide" placeholder={`Search ${data?.length || ''} teams…`} value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="muted small">Star a team to follow it on your Home page and get score alerts.</span>
      </div>
      <div className="team-grid">
        {list.map((t) => (
          <div key={t.id} className="team-tile" onClick={() => openTeam(lg.id, t.id)} style={{ '--tc': t.color || '#334155' }}>
            <Logo src={t.logo} alt={t.name} size={40} />
            <div className="tt-name">
              <strong>{t.short || t.name}</strong>
              <span className="muted small">{t.name}</span>
            </div>
            <Star on={isFav(lg.id, t.id)} onClick={() => toggleFav(lg.id, t)} />
          </div>
        ))}
      </div>
      {!list.length && <Empty title="No teams found" />}
    </div>
  );
}

function ScheduleRow({ g, teamId, lg, onOpen }) {
  const me = g.competitors.find((c) => String(c.id) === String(teamId));
  const opp = g.competitors.find((c) => String(c.id) !== String(teamId));
  if (!me || !opp) return null;
  const home = me.homeAway === 'home';
  let result = null;
  if (g.state === 'post') {
    const res = me.winner ? 'W' : opp.winner ? 'L' : 'T';
    result = (
      <span className={`res res-${res}`}>
        {res} {me.score}-{opp.score}
      </span>
    );
  } else if (g.state === 'in') {
    result = (
      <span className="res live">
        LIVE {me.score}-{opp.score}
      </span>
    );
  } else {
    result = <span className="muted">{/TBD/.test(g.detail) ? 'TBD' : fmtTime(g.date)}</span>;
  }
  return (
    <li className={`sched-row state-${g.state}`} onClick={() => onOpen(g.id)}>
      <span className="sched-date">{fmtDate(g.date)}</span>
      <span className="sched-vs">{lg.homeFirst ? (home ? 'v' : '@') : home ? 'vs' : '@'}</span>
      <Logo src={opp.logo} alt={opp.name} size={22} />
      <span className="sched-opp">{opp.name}</span>
      <span className="spacer" />
      {result}
    </li>
  );
}

export function TeamDetail({ leagueId, teamId }) {
  const lg = LEAGUE_BY_ID[leagueId];
  const { isFav, toggleFav, openGame } = useApp();
  const [tab, setTab] = useState('schedule');
  const { data, error, loading, refresh } = usePoll(() => getTeamDetail(lg, teamId), `team:${leagueId}:${teamId}`, {
    isLive: (d) => d.games.some((g) => g.state === 'in'),
  });
  if (loading && !data) return <Spinner label="Loading team…" />;
  if (error && !data) return <ErrorBox error={error} onRetry={refresh} />;
  const { team, games, rosterGroups } = data;
  const past = games.filter((g) => g.state === 'post');
  const wins = past.filter((g) => g.competitors.find((c) => String(c.id) === String(teamId))?.winner).length;
  const nextGame = games.find((g) => g.state !== 'post');

  return (
    <div className="team-detail" style={{ '--tc': team.color || '#334155' }}>
      <div className="td-hero">
        <Logo src={team.logo} alt={team.name} size={84} />
        <div>
          <div className="gd-league" style={{ '--lg': lg.accent }}>
            {lg.name}
          </div>
          <h2>{team.name}</h2>
          <div className="td-meta">
            {team.record && <span className="pill">{team.record}</span>}
            {team.standing && <span>{team.standing}</span>}
            {team.venue && <span className="muted">· {team.venue}</span>}
          </div>
          <div className="td-actions">
            <button className={`btn ${isFav(lg.id, team.id) ? 'primary' : ''}`} onClick={() => toggleFav(lg.id, team)}>
              {isFav(lg.id, team.id) ? '★ Following' : '☆ Follow'}
            </button>
            {team.link && (
              <button className="btn ghost" onClick={() => openExternal(team.link)}>
                ESPN clubhouse ↗
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="td-stats">
        <div>
          <span className="muted small">Played</span>
          <strong>{past.length}</strong>
        </div>
        <div>
          <span className="muted small">Won</span>
          <strong>{wins}</strong>
        </div>
        {team.recordStats.slice(0, 3).map((s) => (
          <div key={s.name}>
            <span className="muted small">{s.displayName || s.shortDisplayName || s.name}</span>
            <strong>{s.displayValue ?? (typeof s.value === 'number' && !Number.isInteger(s.value) ? s.value.toFixed(1) : s.value)}</strong>
          </div>
        ))}
        {nextGame && (
          <div className="grow">
            <span className="muted small">Next</span>
            <strong>
              {nextGame.state === 'in' ? 'LIVE now' : `${fmtDate(nextGame.date)} ${fmtTime(nextGame.date)}`} ·{' '}
              {nextGame.competitors.find((c) => String(c.id) !== String(teamId))?.short}
            </strong>
          </div>
        )}
      </div>

      <Tabs
        tabs={[
          { id: 'schedule', label: 'Schedule & results' },
          { id: 'roster', label: 'Roster' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="gd-body">
        {tab === 'schedule' &&
          (games.length ? (
            <ul className="schedule">
              {games.map((g) => (
                <ScheduleRow key={g.id} g={g} teamId={teamId} lg={lg} onOpen={(id) => openGame(lg.id, id)} />
              ))}
            </ul>
          ) : (
            <Empty title="No schedule available" />
          ))}
        {tab === 'roster' &&
          (rosterGroups.length ? (
            rosterGroups.map((grp) => (
              <section className="panel" key={grp.name}>
                <h4>{grp.name}</h4>
                <div className="table-wrap">
                  <table className="box">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th className="left">Name</th>
                        <th>Pos</th>
                        <th>Age</th>
                        <th>Ht</th>
                        <th>Wt</th>
                        <th className="left">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grp.players.map((p) => (
                        <tr key={p.id || p.name}>
                          <td>{p.jersey}</td>
                          <td className="left player">{p.name}</td>
                          <td>{p.pos}</td>
                          <td>{p.age}</td>
                          <td>{p.height}</td>
                          <td>{p.weight}</td>
                          <td className="left">{p.status && <InjuryTag tag={{ label: p.status, kind: 'other', injury: p.injury }} className="warn" />}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))
          ) : (
            <Empty title="Roster not available" />
          ))}
      </div>
    </div>
  );
}
