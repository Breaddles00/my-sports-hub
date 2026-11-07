import { useMemo, useState } from 'react';
import { LEAGUE_BY_ID } from '../leagues.js';
import { fmtDate, fmtTime, getSummary, openExternal } from '../api.js';
import { useApp, usePoll } from '../store.jsx';
import { StatusChip } from './GameCard.jsx';
import { Empty, ErrorBox, Logo, Spinner, Star, Tabs, timeAgo } from './common.jsx';

const REG = { football: 4, basketball: 4, hockey: 3, baseball: 9, 'australian-football': 4 };

function periodLabels(lg, n) {
  if (lg.sport === 'baseball') return Array.from({ length: n }, (_, i) => String(i + 1));
  const reg = REG[lg.sport] || 4;
  return Array.from({ length: n }, (_, i) => (i < reg ? String(i + 1) : i === reg ? 'OT' : `${i - reg + 1}OT`));
}

function Linescore({ h, lg }) {
  const order = lg.homeFirst ? [h.home, h.away] : [h.away, h.home];
  const n = Math.max(...order.map((t) => t?.linescores?.length || 0));
  if (!n) return null;
  const labels = periodLabels(lg, n);
  return (
    <div className="table-wrap">
      <table className="linescore">
        <thead>
          <tr>
            <th className="left">Team</th>
            {labels.map((l, i) => (
              <th key={i}>{l}</th>
            ))}
            <th>T</th>
          </tr>
        </thead>
        <tbody>
          {order.filter(Boolean).map((t) => (
            <tr key={t.id} className={t.winner ? 'win' : ''}>
              <td className="left">
                <span className="cell-flex">
                  <Logo src={t.logo} alt={t.name} size={18} /> {t.abbr || t.short}
                </span>
              </td>
              {labels.map((_, i) => (
                <td key={i}>{t.linescores[i] ?? '-'}</td>
              ))}
              <td className="total">{t.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WinProb({ wp, h }) {
  if (!wp || wp.length < 3) return null;
  const W = 640;
  const H = 120;
  const pts = wp.map((p, i) => `${(i / (wp.length - 1)) * W},${H - p * H}`).join(' ');
  const last = wp[wp.length - 1];
  const homeC = 'var(--accent)';
  const awayC = 'var(--warn)';
  return (
    <section className="panel">
      <h4>
        Win probability
        <span className="muted">
          {' '}
          · {h.home?.abbr} {(last * 100).toFixed(1)}% / {h.away?.abbr} {((1 - last) * 100).toFixed(1)}%
        </span>
      </h4>
      <svg viewBox={`0 0 ${W} ${H}`} className="wp-chart" preserveAspectRatio="none">
        <defs>
          <linearGradient id="wpg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={homeC} stopOpacity="0.55" />
            <stop offset="50%" stopColor={homeC} stopOpacity="0.05" />
            <stop offset="50%" stopColor={awayC} stopOpacity="0.05" />
            <stop offset="100%" stopColor={awayC} stopOpacity="0.55" />
          </linearGradient>
        </defs>
        <line x1="0" x2={W} y1={H / 2} y2={H / 2} className="wp-mid" />
        <polygon points={`0,${H / 2} ${pts} ${W},${H / 2}`} fill="url(#wpg)" />
        <polyline points={pts} fill="none" stroke="var(--text)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="wp-legend">
        <span>
          <Logo src={h.home?.logo} alt={h.home?.name} size={16} /> {h.home?.short} ▲
        </span>
        <span>
          {h.away?.short} ▼ <Logo src={h.away?.logo} alt={h.away?.name} size={16} />
        </span>
      </div>
    </section>
  );
}

function Leaders({ leaders }) {
  if (!leaders?.length) return null;
  return (
    <section className="panel">
      <h4>Game leaders</h4>
      <div className="leaders">
        {leaders.map((t) => (
          <div key={t.team.id} className="leader-team">
            <div className="leader-team-head">
              <Logo src={t.team.logo} alt={t.team.name} size={20} /> {t.team.name}
            </div>
            {t.cats.slice(0, 4).map((c) => (
              <div className="leader" key={c.name}>
                <span className="leader-cat">{c.name}</span>
                <span className="leader-name">{c.top.name}</span>
                <span className="leader-val">{c.top.value}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function Scoring({ scoring, lg }) {
  if (!scoring?.length) return null;
  return (
    <section className="panel">
      <h4>Scoring summary</h4>
      <ul className="plays">
        {scoring.map((p) => (
          <li key={p.id} className="play scoring">
            <Logo src={p.teamLogo} alt={p.teamAbbr} size={20} />
            <span className="play-when">
              {lg.periodName}
              {p.period} {p.clock}
            </span>
            <span className="play-text">
              {p.type && <strong>{p.type}: </strong>}
              {p.text}
            </span>
            {p.away !== undefined && (
              <span className="play-score">
                {p.away}-{p.home}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Plays({ plays }) {
  if (!plays?.length) return <Empty title="No play-by-play available" />;
  return (
    <section className="panel">
      <h4>{plays[0].drive ? 'Drives (latest first)' : 'Play-by-play (latest first)'}</h4>
      <ul className="plays">
        {plays.map((p) => (
          <li key={p.id} className={`play ${p.scoring ? 'scoring' : ''}`}>
            {p.drive ? (
              <>
                <Logo src={p.teamLogo} alt="" size={20} />
                <span className="play-text">
                  <strong>{p.result}</strong> · {p.text}
                  {p.last && <div className="muted small">{p.last}</div>}
                </span>
              </>
            ) : (
              <>
                <span className="play-when">
                  {p.period} {p.clock}
                </span>
                <span className="play-text">{p.text}</span>
                {p.away !== undefined && (
                  <span className="play-score">
                    {p.away}-{p.home}
                  </span>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

const parseNum = (v) => {
  if (v === undefined || v === null) return NaN;
  const m = String(v).match(/^-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : NaN;
};

function TeamStats({ teamStats }) {
  if (teamStats?.length !== 2) return <Empty title="Team stats not available yet" />;
  const [a, b] = teamStats;
  const labels = a.stats.map((s) => s.label);
  const bMap = Object.fromEntries(b.stats.map((s) => [s.label, s.value]));
  return (
    <section className="panel">
      <div className="ts-head">
        <span>
          <Logo src={a.team.logo} alt={a.team.name} size={22} /> {a.team.abbr}
        </span>
        <span>
          {b.team.abbr} <Logo src={b.team.logo} alt={b.team.name} size={22} />
        </span>
      </div>
      {labels.map((l) => {
        const av = a.stats.find((s) => s.label === l)?.value;
        const bv = bMap[l];
        const an = parseNum(av);
        const bn = parseNum(bv);
        const tot = Math.abs(an) + Math.abs(bn);
        const ap = tot > 0 && !Number.isNaN(an) && !Number.isNaN(bn) ? (Math.abs(an) / tot) * 100 : null;
        return (
          <div className="ts-row" key={l}>
            <span className="ts-val">{av}</span>
            <div className="ts-mid">
              <span className="ts-label">{l}</span>
              {ap !== null && (
                <div className="ts-bar">
                  <i style={{ width: `${ap}%`, background: 'var(--accent)' }} />
                  <i style={{ width: `${100 - ap}%`, background: 'var(--warn)' }} />
                </div>
              )}
            </div>
            <span className="ts-val">{bv}</span>
          </div>
        );
      })}
    </section>
  );
}

function BoxScore({ players }) {
  const [teamIdx, setTeamIdx] = useState(0);
  if (!players?.length) return <Empty title="Box score not available yet" />;
  const p = players[Math.min(teamIdx, players.length - 1)];
  return (
    <div>
      <div className="seg team-seg">
        {players.map((t, i) => (
          <button key={t.team.id} className={i === teamIdx ? 'active' : ''} onClick={() => setTeamIdx(i)}>
            <Logo src={t.team.logo} alt={t.team.name} size={18} /> {t.team.name}
          </button>
        ))}
      </div>
      {p.groups.map((g, gi) => (
        <section className="panel" key={g.name + gi}>
          <h4>{g.title || g.name}</h4>
          <div className="table-wrap">
            <table className="box">
              <thead>
                <tr>
                  <th className="left">Player</th>
                  {g.labels.map((l, i) => (
                    <th key={i}>{l}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {g.athletes.map((a, i) => (
                  <tr key={a.name + i} className={a.dnp ? 'dnp' : ''}>
                    <td className="left player">
                      <span>{a.short || a.name}</span>
                      {a.pos && <span className="muted small"> {a.pos}</span>}
                    </td>
                    {a.stats.length ? a.stats.map((s, j) => <td key={j}>{s}</td>) : <td colSpan={g.labels.length} className="muted">DNP</td>}
                  </tr>
                ))}
                {g.totals?.length > 0 && g.totals.some(Boolean) && (
                  <tr className="totals">
                    <td className="left">Team</td>
                    {g.totals.map((s, j) => (
                      <td key={j}>{s}</td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

function Info({ info, h, news }) {
  const rows = [
    ['Date', `${fmtDate(h.date, { year: 'numeric' })} · ${fmtTime(h.date)}`],
    ['Venue', [info.venue || h.venue, info.city || h.city].filter(Boolean).join(' — ')],
    ['Broadcast', info.broadcast],
    ['Attendance', info.attendance ? Number(info.attendance).toLocaleString() : ''],
    ['Weather', info.weather],
    ['Line', info.odds],
    ['Over/Under', info.overUnder],
    ['Officials', info.officials?.join(', ')],
  ].filter(([, v]) => v !== undefined && v !== null && v !== '');
  return (
    <>
      <section className="panel">
        <h4>Game info</h4>
        <dl className="info">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </section>
      {news?.length > 0 && (
        <section className="panel">
          <h4>Related news</h4>
          {news.map((n) => (
            <a key={n.id} className="news-mini" onClick={() => openExternal(n.link)}>
              {n.headline}
              <span className="muted small"> · {timeAgo(n.published)}</span>
            </a>
          ))}
        </section>
      )}
    </>
  );
}

function BigTeam({ t, lg, side }) {
  const { isFav, toggleFav, openTeam } = useApp();
  if (!t) return <div />;
  return (
    <div className={`big-team ${side}`}>
      <Logo src={t.logo} alt={t.name} size={64} />
      <button className="link team-link" onClick={() => openTeam(lg.id, t.id)}>
        {t.rank && <span className="rank">{t.rank}</span>}
        {t.name}
      </button>
      <span className="muted small">{t.record}</span>
      <Star on={isFav(lg.id, t.id)} onClick={() => toggleFav(lg.id, t)} />
    </div>
  );
}

export default function GameDetail({ leagueId, eventId }) {
  const lg = LEAGUE_BY_ID[leagueId];
  const [tab, setTab] = useState('summary');
  const { data, error, loading, refresh, updated } = usePoll(() => getSummary(lg, eventId), `${leagueId}:${eventId}`, {
    isLive: (d) => d.header.state === 'in',
  });

  const tabs = useMemo(
    () => [
      { id: 'summary', label: 'Summary' },
      { id: 'box', label: 'Box score' },
      { id: 'team', label: 'Team stats' },
      { id: 'plays', label: data?.plays?.[0]?.drive ? 'Drives' : 'Plays' },
      { id: 'info', label: 'Info' },
    ],
    [data]
  );

  if (loading && !data) return <Spinner label="Loading game…" />;
  if (error && !data) return <ErrorBox error={error} onRetry={refresh} />;
  const h = data.header;
  const left = lg.homeFirst ? h.home : h.away;
  const right = lg.homeFirst ? h.away : h.home;

  return (
    <div className="game-detail" style={{ '--c1': left?.color || '#334155', '--c2': right?.color || '#334155' }}>
      <div className="gd-hero">
        <div className="gd-league" style={{ '--lg': lg.accent }}>
          {lg.name}
          {h.headline && <span className="muted"> · {h.headline}</span>}
        </div>
        <div className="gd-score">
          <BigTeam t={left} lg={lg} side="l" />
          <div className="gd-center">
            {h.state !== 'pre' ? (
              <div className="gd-nums">
                <span className={left?.winner ? 'w' : ''}>{left?.score}</span>
                <span className="dash">–</span>
                <span className={right?.winner ? 'w' : ''}>{right?.score}</span>
              </div>
            ) : (
              <div className="gd-time">
                {fmtTime(h.date)}
                <div className="muted small">{fmtDate(h.date)}</div>
              </div>
            )}
            <StatusChip g={h} />
            {h.state === 'in' && h.situation.downDistance && <div className="small">{h.situation.downDistance}</div>}
          </div>
          <BigTeam t={right} lg={lg} side="r" />
        </div>
        <div className="gd-updated muted small">
          {lg.homeFirst ? 'Home v Away' : 'Away @ Home'} · updated {updated ? updated.toLocaleTimeString() : '—'}
          {h.state === 'in' && ' · auto-refreshing'}
        </div>
      </div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <div className="gd-body">
        {tab === 'summary' && (
          <>
            <section className="panel">
              <Linescore h={h} lg={lg} />
              {h.state === 'pre' && <div className="muted">Game hasn't started. {h.odds && `Line: ${h.odds}`}</div>}
            </section>
            <WinProb wp={data.wp} h={h} />
            <Leaders leaders={data.leaders} />
            <Scoring scoring={data.scoring} lg={lg} />
          </>
        )}
        {tab === 'box' && <BoxScore players={data.players} />}
        {tab === 'team' && <TeamStats teamStats={data.teamStats} />}
        {tab === 'plays' && <Plays plays={data.plays} />}
        {tab === 'info' && <Info info={data.info} h={h} news={data.news} />}
      </div>
    </div>
  );
}
