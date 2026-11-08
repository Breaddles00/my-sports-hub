import { useMemo, useState } from 'react';
import { calendarDays, getScoreboard, isoDayFromYmd, weekOptions, ymd, ymdFromIsoDay } from '../api.js';
import { useApp, usePoll } from '../store.jsx';
import GameCard from './GameCard.jsx';
import { Empty, ErrorBox, Logo, Spinner } from './common.jsx';
import { SeasonBanner } from './SeasonCountdown.jsx';

function addDays(ymdStr, n) {
  const d = new Date(`${isoDayFromYmd(ymdStr)}T12:00:00`);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

function DayNav({ data, sel, setSel }) {
  const current = sel || ymdFromIsoDay(data?.day) || ymd(new Date());
  const days = calendarDays(data?.calendar);
  const prev = days.filter((d) => d < current).pop() || addDays(current, -1);
  const next = days.find((d) => d > current) || addDays(current, 1);
  const label = new Date(`${isoDayFromYmd(current)}T12:00:00`).toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  return (
    <div className="date-nav">
      <button className="btn icon" onClick={() => setSel(prev)} title="Previous game day">
        ‹
      </button>
      <div className="date-label">
        <strong>{label}</strong>
        {!sel && <span className="muted"> · Today's slate</span>}
      </div>
      <button className="btn icon" onClick={() => setSel(next)} title="Next game day">
        ›
      </button>
      <input
        type="date"
        className="date-input"
        value={isoDayFromYmd(current)}
        onChange={(e) => e.target.value && setSel(e.target.value.replace(/-/g, ''))}
        title="Jump to date"
      />
      {sel && (
        <button className="btn ghost" onClick={() => setSel(null)}>
          Today
        </button>
      )}
    </div>
  );
}

function WeekNav({ data, sel, setSel }) {
  const opts = useMemo(() => weekOptions(data?.calendar), [data?.calendar]);
  const curKey = sel ? `${sel.seasontype}-${sel.week}` : `${data?.seasonType}-${data?.week}`;
  const idx = opts.findIndex((o) => `${o.seasontype}-${o.week}` === curKey);
  const go = (o) => o && setSel({ seasontype: o.seasontype, week: o.week });
  const groups = [...new Set(opts.map((o) => o.group))];
  const cur = opts[idx];
  return (
    <div className="date-nav">
      <button className="btn icon" disabled={idx <= 0} onClick={() => go(opts[idx - 1])} title="Previous week">
        ‹
      </button>
      <select className="week-select" value={idx >= 0 ? curKey : ''} onChange={(e) => go(opts.find((o) => `${o.seasontype}-${o.week}` === e.target.value))}>
        {idx < 0 && <option value="">{data?.week ? `Week ${data.week}` : 'Current'}</option>}
        {groups.map((gname) => (
          <optgroup key={gname} label={gname}>
            {opts
              .filter((o) => o.group === gname)
              .map((o) => (
                <option key={`${o.seasontype}-${o.week}`} value={`${o.seasontype}-${o.week}`}>
                  {o.label}
                  {o.detail ? ` (${o.detail})` : ''}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      <button className="btn icon" disabled={idx < 0 || idx >= opts.length - 1} onClick={() => go(opts[idx + 1])} title="Next week">
        ›
      </button>
      {cur?.group && <span className="muted">{cur.group}</span>}
      {sel && (
        <button className="btn ghost" onClick={() => setSel(null)}>
          This week
        </button>
      )}
    </div>
  );
}

// Teams on bye this week / round (football, AFL), or without a game that day (MLB, NBA, NHL).
// See getByes() in api.js. Click a team to open its page.
function ByeStrip({ lg, byes, q }) {
  const { openTeam } = useApp();
  if (!byes?.teams?.length) return null;
  const s = q.trim().toLowerCase();
  const teams = s ? byes.teams.filter((t) => `${t.name} ${t.abbr}`.toLowerCase().includes(s)) : byes.teams;
  if (!teams.length) return null;
  const title = byes.kind === 'idle' ? 'No game' : byes.round ? `${byes.round} byes` : 'On bye';
  return (
    <section className={`day-group bye-strip bye-${byes.kind}`}>
      <h3 className="day-head">
        {title} <span className="bye-n">{teams.length}</span>
      </h3>
      <div className="bye-list">
        {teams.map((t) => (
          <button key={t.id || t.name} className="bye-team" disabled={!t.id} onClick={() => t.id && openTeam(lg.id, t.id)} title={t.name}>
            <Logo src={t.logo} alt={t.name} size={22} />
            <span>{t.short || t.name}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'in', label: 'Live' },
  { id: 'pre', label: 'Upcoming' },
  { id: 'post', label: 'Final' },
];

export default function Scoreboard({ lg, season }) {
  const [sel, setSel] = useState(null);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const key = `${lg.id}|${JSON.stringify(sel)}`;
  const { data, error, loading, refresh } = usePoll(
    () => getScoreboard(lg, lg.mode === 'week' ? sel || {} : { date: sel }),
    key,
    { isLive: (d) => d.events.some((e) => e.state === 'in') }
  );

  const events = useMemo(() => {
    let ev = data?.events || [];
    if (filter !== 'all') ev = ev.filter((e) => e.state === filter);
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      ev = ev.filter((e) => e.competitors.some((c) => `${c.name} ${c.abbr}`.toLowerCase().includes(s)));
    }
    return ev;
  }, [data, filter, q]);

  // Group by day when a slate spans multiple days (football weeks)
  const byDay = useMemo(() => {
    const m = new Map();
    events.forEach((e) => {
      const k = new Date(e.date).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(e);
    });
    return [...m.entries()];
  }, [events]);

  const counts = useMemo(() => {
    const c = { all: 0, in: 0, pre: 0, post: 0 };
    (data?.events || []).forEach((e) => {
      c.all++;
      c[e.state]++;
    });
    return c;
  }, [data]);

  return (
    <div className="scoreboard">
      <SeasonBanner lg={lg} info={season} />
      <div className="toolbar">
        {data && (lg.mode === 'week' ? <WeekNav data={data} sel={sel} setSel={setSel} /> : <DayNav data={data} sel={sel} setSel={setSel} />)}
        <span className="spacer" />
        <div className="seg">
          {FILTERS.map((f) => (
            <button key={f.id} className={filter === f.id ? 'active' : ''} onClick={() => setFilter(f.id)}>
              {f.label}
              {counts[f.id] ? <span className="seg-n">{counts[f.id]}</span> : null}
            </button>
          ))}
        </div>
        <input className="search" placeholder="Filter teams…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {loading && !data && <Spinner />}
      {error && !data && <ErrorBox error={error} onRetry={refresh} />}
      {data && !events.length && (
        <Empty title={data.events.length ? 'No games match this filter' : 'No games scheduled'} icon="📅">
          {data.events.length
            ? 'Try a different filter.'
            : season?.phase === 'off'
              ? 'The league is in its off-season. Use the arrows to browse last season.'
              : 'Use the arrows to browse other game days — the league may be in its off-season.'}
        </Empty>
      )}
      {byDay.map(([day, list]) => (
        <section key={day} className="day-group">
          {byDay.length > 1 && <h3 className="day-head">{day}</h3>}
          <div className="game-grid">
            {list.map((g) => (
              <GameCard key={g.id} g={g} showDate={false} />
            ))}
          </div>
        </section>
      ))}
      {data && filter === 'all' && data.events.length > 0 && <ByeStrip lg={lg} byes={data.byes} q={q} />}
    </div>
  );
}
