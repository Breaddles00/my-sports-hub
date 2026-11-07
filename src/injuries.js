// Injury tags for depth charts.
//
// Colours: Out = red, Injured Reserve / IL = bold red, Questionable = orange,
// Active = green. Anything else ESPN reports (Doubtful, Day-To-Day, Suspension…) keeps
// the amber "warn" chip.
//
// "Active" is only shown for a player who was Questionable or Out in the past week.
// ESPN doesn't give a player's injury history in the depth chart feed, so the app keeps
// its own: every time a depth chart loads, Q and O players are stamped in localStorage,
// and a player who is later Active (or no longer listed) within 7 days of their last
// Q/O stamp gets the green "Active" tag. Players the app hasn't seen as Q/O never do.
//
// Each tag also carries `injury` (from src/api.js mapInjury: injury, note, update date,
// return date) for the hover card. For "Active" the stamp keeps the last Q/O note too,
// so the card can say what the player came back from.

const KEY = 'sportshub.injuryHistory';
const DAY = 24 * 3600 * 1000;
const ACTIVE_WINDOW = 7 * DAY; // "previous week"
const KEEP = 30 * DAY; // prune older stamps

export function injuryKind(status) {
  const s = String(status || '').trim().toLowerCase();
  if (!s) return '';
  if (/injured reserve|injured list|^ir\b|\bir$|\bil\b|-il\b/.test(s)) return 'ir';
  if (s === 'out' || s === 'o') return 'out';
  if (s.startsWith('questionable') || s === 'q') return 'q';
  if (s === 'active' || s === 'a') return 'active';
  return 'other';
}

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

// Only what the hover card needs, to keep localStorage small.
function slim(inj) {
  if (!inj) return null;
  const { type, side, detail, date, comment } = inj;
  return { type, side, detail, date, comment: comment ? comment.slice(0, 300) : '' };
}

function save(hist) {
  try {
    localStorage.setItem(KEY, JSON.stringify(hist));
  } catch {
    /* ignore */
  }
}

// Adds `tag: { label, kind } | null` to every athlete in a team's depth charts, and
// records Q/O players. `charts` is what getDepthChart returns.
export function applyInjuryHistory(leagueId, charts, now = Date.now()) {
  const hist = load();
  for (const [k, v] of Object.entries(hist)) if (!v || now - v.t > KEEP) delete hist[k];

  const key = (a) => (a.id != null ? `${leagueId}:${a.id}` : null);

  // Stamp first, so a player listed Q on one chart and blank on another isn't shown Active.
  for (const c of charts)
    for (const p of c.positions)
      for (const a of p.athletes) {
        const kind = injuryKind(a.status);
        const k = key(a);
        if (k && (kind === 'q' || kind === 'out')) hist[k] = { s: kind, t: now, st: a.status, inj: slim(a.injury) };
      }

  const recentlyHurt = (a) => {
    const h = hist[key(a)];
    return !!h && now - h.t <= ACTIVE_WINDOW;
  };

  const out = charts.map((c) => ({
    ...c,
    positions: c.positions.map((p) => ({
      ...p,
      athletes: p.athletes.map((a) => {
        const kind = injuryKind(a.status);
        let tag = null;
        if (kind === 'active' || kind === '') {
          if (key(a) && recentlyHurt(a)) {
            const h = hist[key(a)];
            tag = {
              label: 'Active',
              kind: 'active',
              injury: a.injury,
              previous: { status: h.st || (h.s === 'out' ? 'Out' : 'Questionable'), seen: h.t, injury: h.inj || null },
            };
          }
        } else {
          tag = { label: a.status, kind, injury: a.injury };
        }
        return { ...a, tag };
      }),
    })),
  }));

  save(hist);
  return out;
}
