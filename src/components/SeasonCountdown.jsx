import { useEffect, useState } from 'react';
import { LEAGUES } from '../leagues.js';
import { fmtDate, fmtTime, getSeasonCountdown, seasonPhase } from '../api.js';
import { useNow } from '../store.jsx';
import { LeagueLogo } from './common.jsx';

// Countdowns to the next regular season for leagues in their off-season (or preseason).
// The data comes from getSeasonCountdown() in api.js; see there for where dates come from.

const DAY = 86400000;
const HOUR = 3600000;

// { leagueId: info|null } for every league, worked out from the Home poller's scoreboards.
// Re-checked when a league's phase or season changes, and every 6 hours.
export function useSeasonCountdowns(hubData) {
  const [map, setMap] = useState({});
  const bucket = Math.floor(Date.now() / (6 * HOUR));
  const sig = hubData ? `${LEAGUES.map((l) => `${l.id}:${seasonPhase(hubData[l.id])}:${hubData[l.id]?.season?.year}`).join('|')}|${bucket}` : '';
  useEffect(() => {
    if (!hubData) return undefined;
    let cancelled = false;
    LEAGUES.forEach((l) => {
      getSeasonCountdown(l, hubData[l.id])
        .then((info) => {
          if (!cancelled) setMap((m) => (m[l.id] === info ? m : { ...m, [l.id]: info }));
        })
        .catch(() => {}); // keep whatever we had
    });
    return () => {
      cancelled = true;
    };
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  return map;
}

const dayStart = (t) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
// Whole calendar days between now and t, in local time.
const calDays = (t, now) => Math.round((dayStart(t) - dayStart(now)) / DAY);

// An exact kick-off time we can count down to the second.
const isTimed = (info) => !!info?.opener?.exact && !info.opener.timeTbd;

function split(left) {
  const l = Math.max(0, left);
  return { d: Math.floor(l / DAY), h: Math.floor((l % DAY) / HOUR), m: Math.floor((l % HOUR) / 60000), s: Math.floor((l % 60000) / 1000) };
}

// Is the countdown still worth showing? (Hidden once the opener is 6 h past.)
export const hasCountdown = (info, now = Date.now()) => !!info?.opener && Date.parse(info.opener.date) > now - 6 * HOUR;

// Big number + unit for compact cards: "136" days, "~136" days, or "5h 20m" to go.
export function countValue(info, now) {
  const t = Date.parse(info.opener.date);
  if (isTimed(info)) {
    const { d, h, m } = split(t - now);
    if (t <= now) return { value: 'Now', unit: 'starting' };
    if (d >= 1) return { value: String(d), unit: d === 1 ? 'day' : 'days' };
    return { value: `${h}h ${m}m`, unit: 'to go' };
  }
  const n = calDays(t, now);
  if (n <= 0) return { value: 'Today', unit: info.opener.exact ? '' : 'about' };
  return { value: `${info.opener.exact ? '' : '~'}${n}`, unit: n === 1 ? 'day' : 'days' };
}

// One line: "~136 days", "12 days", "1d 4h", "5h 20m".
export function shortCountdown(info, now) {
  if (!hasCountdown(info, now)) return null;
  const t = Date.parse(info.opener.date);
  if (isTimed(info)) {
    const { d, h, m } = split(t - now);
    if (t <= now) return 'Starting now';
    if (d >= 2) return `${d} days`;
    return d === 1 ? `1d ${h}h` : `${h}h ${m}m`;
  }
  const n = calDays(t, now);
  if (n <= 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  return `${info.opener.exact ? '' : '~'}${n} days`;
}

// "Wed, Mar 24, 2027 · 10:05 AM", or "around Wed, Mar 24, 2027" when estimated.
export function openerDate(info) {
  const o = info.opener;
  const day = fmtDate(o.date, { year: 'numeric' });
  if (!o.exact) return `around ${day}`;
  return o.timeTbd ? day : `${day} · ${fmtTime(o.date)}`;
}

const openerLabel = (lg, info) => (info.opener.offSeasonEnd ? 'Off-season ends' : `${lg.opener || 'Season starts'}${info.opener.round ? ` (${info.opener.round})` : ''}`);

function Tile({ n, label }) {
  return (
    <div className="ssn-tile">
      <strong>{n}</strong>
      <span>{label}</span>
    </div>
  );
}

// Full-width banner at the top of a league's scoreboard.
export function SeasonBanner({ lg, info }) {
  const now = useNow(isTimed(info) ? 1000 : 60000);
  if (!info || (info.phase !== 'off' && info.phase !== 'pre')) return null;
  const kicker = info.phase === 'off' ? 'Off-season' : 'Preseason';
  const title = `${info.name} ${lg.name} ${info.phase === 'pre' ? 'regular season' : 'season'}`;

  if (!hasCountdown(info, now)) {
    if (info.phase !== 'off') return null;
    return (
      <section className="ssn-banner" style={{ '--lg': lg.accent }}>
        <div className="ssn-head">
          <span className="ssn-kicker">{kicker}</span>
          <h2>{title}</h2>
        </div>
        <p className="muted">ESPN hasn't posted dates for next season yet. Check back closer to the start.</p>
        {info.lastGame && <p className="muted small">Last game: {fmtDate(info.lastGame, { year: 'numeric' })}</p>}
      </section>
    );
  }

  const t = Date.parse(info.opener.date);
  const timed = isTimed(info);
  const p = split(t - now);
  const days = calDays(t, now);
  return (
    <section className="ssn-banner" style={{ '--lg': lg.accent }}>
      <div className="ssn-head">
        <span className="ssn-kicker">{kicker}</span>
        <h2>{title}</h2>
      </div>
      <div className="ssn-count" aria-live="off">
        {timed ? (
          <>
            <Tile n={p.d} label={p.d === 1 ? 'day' : 'days'} />
            <Tile n={String(p.h).padStart(2, '0')} label="hrs" />
            <Tile n={String(p.m).padStart(2, '0')} label="min" />
            <Tile n={String(p.s).padStart(2, '0')} label="sec" />
          </>
        ) : (
          <Tile n={days > 0 ? `${info.opener.exact ? '' : '~'}${days}` : 'Today'} label={days > 0 ? (days === 1 ? 'day' : 'days') : ''} />
        )}
      </div>
      <div className="ssn-lines">
        <p>
          <strong>{openerLabel(lg, info)}</strong> · {openerDate(info)}
          {info.opener.game && <span className="muted"> · {info.opener.game}</span>}
        </p>
        {!info.opener.exact && (
          <p className="muted small">
            {info.opener.offSeasonEnd
              ? `ESPN doesn't have the ${info.name} schedule yet, so this is when its off-season window closes. The exact start will show here once ESPN has it.`
              : info.opener.guessed
                ? `ESPN doesn't have the ${info.name} schedule yet, so this is a year on from last season's start. The exact first game will show here once ESPN has it.`
                : `Estimated from ESPN's season calendar. The exact first game will show here once the schedule is published.`}
          </p>
        )}
        {info.preseason && (
          <p className="muted small">
            {info.preseason.name || 'Preseason'} starts around {fmtDate(info.preseason.date, { year: 'numeric' })}
          </p>
        )}
        {info.lastGame && <p className="muted small">Last game: {fmtDate(info.lastGame, { year: 'numeric' })}</p>}
      </div>
    </section>
  );
}

// Small card for Home's off-season list.
export function SeasonCard({ lg, info, onClick }) {
  const now = useNow(60000);
  const has = hasCountdown(info, now);
  const c = has ? countValue(info, now) : null;
  return (
    <button className="ssn-card" style={{ '--lg': lg.accent }} onClick={onClick} title={`${lg.full}: next season`}>
      <LeagueLogo lg={lg} size={30} />
      <div className="ssn-card-body">
        <strong>
          {info.name} {lg.name}
        </strong>
        <span className="muted small">{has ? `${openerLabel(lg, info)} · ${openerDate(info)}` : 'Dates not announced yet'}</span>
      </div>
      {c && (
        <div className="ssn-card-count">
          <strong>{c.value}</strong>
          <span>{c.unit}</span>
        </div>
      )}
    </button>
  );
}
