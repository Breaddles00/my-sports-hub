import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// An injury chip (Out, Questionable, IR, Active…) with a hover card showing ESPN's
// latest note on the injury and when it was updated. `tag` is { label, kind, injury,
// previous? } from src/injuries.js; `injury` is src/api.js mapInjury's shape.
//
// The card is portalled to <body> with fixed positioning so table scroll areas and
// blurred panels can't clip it. It also opens on keyboard focus.

const DAY = 24 * 3600 * 1000;

// ESPN return dates are bare "YYYY-MM-DD"; read those as local dates, not UTC midnight.
const toDate = (v) => {
  if (!v) return null;
  const d = typeof v === 'number' ? new Date(v) : new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00` : v);
  return Number.isNaN(d.getTime()) ? null : d;
};

function fmtDay(v) {
  const d = toDate(v);
  if (!d) return '';
  const opts = { weekday: 'short', day: 'numeric', month: 'short' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString([], opts);
}

function ago(v) {
  const d = toDate(v);
  if (!d) return '';
  const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((start(new Date()) - start(d)) / DAY);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'last week';
  return `${Math.floor(days / 7)} weeks ago`;
}

export function describeInjury(inj) {
  if (!inj) return '';
  let s = inj.type || '';
  if (s && inj.side) s += ` (${inj.side.toLowerCase()})`;
  if (inj.detail && inj.detail !== inj.type) s = s ? `${s} · ${inj.detail}` : inj.detail;
  return s;
}

function InjuryCard({ tag, pos }) {
  const inj = tag.injury;
  const prev = tag.previous;
  const what = describeInjury(inj) || describeInjury(prev?.injury);
  const note = inj?.comment || (prev && prev.injury?.comment) || '';
  const updated = inj?.date || prev?.injury?.date || '';
  const ret = tag.kind !== 'active' ? inj?.returnDate : '';

  const above = pos.top > 200;
  const width = 300;
  const left = Math.max(8, Math.min(pos.x - width / 2, window.innerWidth - width - 8));
  const style = above
    ? { left, width, top: pos.top - 8, transform: 'translateY(-100%)' }
    : { left, width, top: pos.bottom + 8 };

  return (
    <div className={`inj-card inj-card-${tag.kind}`} style={style} role="tooltip">
      <div className="inj-card-head">
        <span className="inj-card-status">{tag.label}</span>
        {what && <span className="inj-card-what">{what}</span>}
      </div>
      {prev && (
        <p className="inj-card-prev">
          Back from {prev.status}
          {prev.status && ` (listed ${fmtDay(prev.seen)})`}.
        </p>
      )}
      {note ? <p className="inj-card-note">{note}</p> : !prev && <p className="inj-card-note muted">ESPN hasn't posted a note on this injury.</p>}
      {(updated || ret) && (
        <div className="inj-card-foot">
          {updated && (
            <span>
              Updated {fmtDay(updated)} · {ago(updated)}
            </span>
          )}
          {ret && <span>Est. return {fmtDay(ret)}</span>}
        </div>
      )}
    </div>
  );
}

export function InjuryTag({ tag, className = '' }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ x: r.left + r.width / 2, top: r.top, bottom: r.bottom });
  };
  const hide = () => setPos(null);

  // A fixed card would drift away from its chip on scroll, so just close it.
  useEffect(() => {
    if (!pos) return;
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    window.addEventListener('blur', hide);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
      window.removeEventListener('blur', hide);
    };
  }, [pos]);

  if (!tag) return null;
  const cls = className || (tag.kind === 'other' ? 'warn' : `inj-${tag.kind}`);
  return (
    <>
      <span
        ref={ref}
        className={`chip ${cls} inj-tag`}
        tabIndex={0}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {tag.label}
      </span>
      {pos && createPortal(<InjuryCard tag={tag} pos={pos} />, document.body)}
    </>
  );
}
