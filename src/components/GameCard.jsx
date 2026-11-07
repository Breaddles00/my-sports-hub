import { useEffect, useRef, useState } from 'react';
import { LEAGUE_BY_ID } from '../leagues.js';
import { fmtDate, fmtTime } from '../api.js';
import { useApp } from '../store.jsx';
import { LiveDot, Logo, Star } from './common.jsx';

export function StatusChip({ g, showDate }) {
  if (g.state === 'in') {
    return (
      <span className="chip live">
        <LiveDot /> {g.detail || 'Live'}
      </span>
    );
  }
  if (g.state === 'post') {
    return <span className="chip final">{g.detail || 'Final'}</span>;
  }
  const postponed = /postpon|cancel|delay|suspend/i.test(g.statusName + g.detail);
  if (postponed) return <span className="chip warn">{g.detail}</span>;
  const tbd = /TBD/i.test(g.detail);
  return (
    <span className="chip pre">
      {showDate ? `${fmtDate(g.date)} · ` : ''}
      {tbd ? 'TBD' : fmtTime(g.date)}
    </span>
  );
}

function Bases({ s }) {
  const on = (b) => (b ? 'var(--accent-live)' : 'transparent');
  return (
    <svg width="34" height="24" viewBox="0 0 34 24" className="bases" aria-label="Bases">
      <rect x="13" y="1" width="8" height="8" transform="rotate(45 17 5)" fill={on(s.onSecond)} stroke="currentColor" />
      <rect x="23" y="10" width="8" height="8" transform="rotate(45 27 14)" fill={on(s.onFirst)} stroke="currentColor" />
      <rect x="3" y="10" width="8" height="8" transform="rotate(45 7 14)" fill={on(s.onThird)} stroke="currentColor" />
    </svg>
  );
}

function Situation({ g }) {
  const s = g.situation;
  if (g.state !== 'in') return null;
  const lg = LEAGUE_BY_ID[g.leagueId];
  if (lg.sport === 'baseball' && s.outs !== undefined) {
    return (
      <div className="situation">
        <Bases s={s} />
        <span>
          {s.balls ?? 0}-{s.strikes ?? 0}, {s.outs} out{s.outs === 1 ? '' : 's'}
        </span>
        {s.lastPlay && <span className="muted ellipsis">· {s.lastPlay}</span>}
      </div>
    );
  }
  if (s.downDistance || s.lastPlay) {
    return (
      <div className={`situation ${s.isRedZone ? 'redzone' : ''}`}>
        {s.downDistance && <strong>{s.downDistance}</strong>}
        {s.lastPlay && <span className="muted ellipsis">{s.downDistance ? '· ' : ''}{s.lastPlay}</span>}
      </div>
    );
  }
  return null;
}

function TeamRow({ t, g, lg }) {
  const { isFav, toggleFav } = useApp();
  const fav = isFav(lg.id, t.id);
  const lose = g.state === 'post' && !t.winner && g.competitors.some((c) => c.winner);
  const hasBall = g.state === 'in' && g.situation.possession && String(g.situation.possession) === String(t.id);

  // Flash the score when it changes
  const [flash, setFlash] = useState(false);
  const prev = useRef(t.score);
  useEffect(() => {
    if (prev.current !== undefined && prev.current !== t.score && g.state === 'in') {
      setFlash(true);
      const tm = setTimeout(() => setFlash(false), 2200);
      prev.current = t.score;
      return () => clearTimeout(tm);
    }
    prev.current = t.score;
    return undefined;
  }, [t.score, g.state]);

  return (
    <div className={`team-row ${lose ? 'lose' : ''} ${t.winner ? 'win' : ''}`}>
      <Logo src={t.logo} alt={t.name} size={30} />
      <div className="team-name">
        <span className="nm">
          {t.rank && <span className="rank">{t.rank}</span>}
          {t.short}
          {hasBall && <span className="poss" title="Possession">●</span>}
        </span>
        {t.record && <span className="rec">{t.record}</span>}
      </div>
      <Star on={fav} onClick={() => toggleFav(lg.id, t)} />
      <span className={`score ${flash ? 'flash' : ''}`}>{g.state === 'pre' ? '' : t.score ?? ''}</span>
    </div>
  );
}

export default function GameCard({ g, showLeague, showDate, compact }) {
  const { openGame, isFav } = useApp();
  const lg = LEAGUE_BY_ID[g.leagueId];
  const order = lg.homeFirst ? [g.home, g.away] : [g.away, g.home];
  const favGame = g.competitors.some((c) => isFav(lg.id, c.id));
  const c1 = g.away?.color || '#334155';
  const c2 = g.home?.color || '#334155';

  return (
    <article
      className={`game-card state-${g.state} ${favGame ? 'fav' : ''} ${compact ? 'compact' : ''}`}
      onClick={() => openGame(lg.id, g.id)}
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && openGame(lg.id, g.id)}
      style={{ '--c1': c1, '--c2': c2 }}
    >
      <div className="card-strip" />
      <header className="card-head">
        {showLeague && (
          <span className="league-tag" style={{ '--lg': lg.accent }}>
            {lg.name}
          </span>
        )}
        <StatusChip g={g} showDate={showDate} />
        <span className="spacer" />
        {g.broadcast && <span className="bcast">{g.broadcast}</span>}
      </header>
      {order.filter(Boolean).map((t) => (
        <TeamRow key={t.id + t.homeAway} t={t} g={g} lg={lg} />
      ))}
      <Situation g={g} />
      {!compact && (g.headline || g.venue || g.odds) && (
        <footer className="card-foot">
          {g.headline && <span className="headline">{g.headline}</span>}
          {!g.headline && g.venue && <span className="ellipsis">{g.venue}</span>}
          {g.state === 'pre' && g.odds && <span className="odds">{g.odds}</span>}
        </footer>
      )}
    </article>
  );
}
