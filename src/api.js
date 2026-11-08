// Data access + normalisation of ESPN responses into simple shapes the UI can render.

const SITE = 'https://site.api.espn.com/apis/site/v2/sports';
const STANDINGS = 'https://site.api.espn.com/apis/v2/sports';

function buildUrl(base, params = {}) {
  const u = new URL(base);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, v);
  });
  return u.toString();
}

export async function getJSON(base, params) {
  const url = buildUrl(base, params);
  try {
    if (window.api?.get) return await window.api.get(url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    const msg = String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
    throw new Error(msg);
  }
}

export const openExternal = (url) => {
  if (!url) return;
  if (window.api?.openExternal) window.api.openExternal(url);
  else window.open(url, '_blank');
};

const site = (lg) => `${SITE}/${lg.sport}/${lg.league}`;

// ---------- helpers ----------
const val = (x) => (x && typeof x === 'object' ? x.displayValue ?? x.value : x);
export const fmtTime = (iso, opts = {}) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', ...opts }) : '';
export const fmtDate = (iso, opts = {}) =>
  iso ? new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', ...opts }) : '';
export const ymd = (d) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
export const ymdFromIsoDay = (s) => (s ? s.slice(0, 10).replace(/-/g, '') : null);
export const isoDayFromYmd = (s) => (s ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null);

function teamLogo(team) {
  if (!team) return null;
  if (team.logo) return team.logo;
  const logos = team.logos || [];
  const dark = logos.find((l) => (l.rel || []).includes('dark'));
  return (dark || logos[0])?.href || null;
}

// ---------- scoreboard ----------
export function normalizeEvent(ev, lg) {
  const comp = ev.competitions?.[0] || {};
  const status = comp.status || ev.status || {};
  const type = status.type || {};
  const competitors = (comp.competitors || []).map((c) => {
    const rank = c.curatedRank?.current;
    return {
      id: c.team?.id ?? c.id,
      homeAway: c.homeAway,
      name: c.team?.displayName || c.team?.name || 'TBD',
      short: c.team?.shortDisplayName || c.team?.name || c.team?.abbreviation || 'TBD',
      abbr: c.team?.abbreviation || '',
      logo: teamLogo(c.team),
      color: c.team?.color ? `#${c.team.color}` : null,
      score: val(c.score),
      winner: !!c.winner,
      record: c.records?.find((r) => r.type === 'total' || r.name === 'overall')?.summary || c.records?.[0]?.summary || c.record?.[0]?.displayValue || '',
      rank: rank && rank <= 25 ? rank : null,
      linescores: (c.linescores || []).map((l) => l.displayValue ?? l.value),
    };
  });
  const home = competitors.find((c) => c.homeAway === 'home') || competitors[1];
  const away = competitors.find((c) => c.homeAway === 'away') || competitors[0];
  const sit = comp.situation || {};
  return {
    id: ev.id,
    leagueId: lg.id,
    name: ev.name,
    shortName: ev.shortName,
    date: ev.date || comp.date,
    // Football week + season type (2 = regular season), used to find bye weeks.
    week: ev.week?.number ?? null,
    seasonType: num(ev.seasonType?.type ?? ev.season?.type) || null,
    state: type.state || 'pre', // pre | in | post
    completed: !!type.completed,
    detail: type.shortDetail || type.detail || type.description || '',
    statusName: type.name || '',
    period: status.period,
    clock: status.displayClock,
    home,
    away,
    competitors,
    venue: comp.venue?.fullName || '',
    city: [comp.venue?.address?.city, comp.venue?.address?.state || comp.venue?.address?.country].filter(Boolean).join(', '),
    broadcast: (comp.broadcasts || []).flatMap((b) => b.names || []).join(', ') || comp.geoBroadcasts?.[0]?.media?.shortName || '',
    odds: comp.odds?.[0]?.details || '',
    overUnder: comp.odds?.[0]?.overUnder,
    headline: comp.notes?.[0]?.headline || ev.season?.slug?.replace(/-/g, ' ') || '',
    situation: {
      downDistance: sit.downDistanceText || sit.shortDownDistanceText || '',
      possession: sit.possession || null,
      isRedZone: !!sit.isRedZone,
      balls: sit.balls,
      strikes: sit.strikes,
      outs: sit.outs,
      onFirst: !!sit.onFirst,
      onSecond: !!sit.onSecond,
      onThird: !!sit.onThird,
      lastPlay: sit.lastPlay?.text || '',
    },
  };
}

export async function getScoreboard(lg, { date, week, seasontype } = {}) {
  const params = { ...(lg.scoreboardParams || {}) };
  if (lg.mode === 'week' && week) {
    params.week = week;
    if (seasontype) params.seasontype = seasontype;
  } else if (date) {
    params.dates = date;
  }
  const data = await getJSON(`${site(lg)}/scoreboard`, params);
  const league = data.leagues?.[0] || {};
  const events = (data.events || []).map((e) => normalizeEvent(e, lg));
  events.sort((a, b) => stateOrder(a) - stateOrder(b) || new Date(a.date) - new Date(b.date));
  const seasonType = data.season?.type ?? null;
  // Bye teams are a nice-to-have: never let them break the scoreboard.
  const byes = await getByes(lg, { data, events, seasonType }).catch(() => []);
  return {
    events,
    byes,
    day: data.day?.date || null,
    week: data.week?.number ?? null,
    seasonType,
    seasonYear: data.season?.year ?? league.season?.year ?? null,
    // ESPN's window for the current season, used to spot the off-season (see seasonPhase()).
    season: {
      year: num(league.season?.year ?? data.season?.year) || null,
      name: league.season?.displayName || '',
      type: num(data.season?.type ?? league.season?.type?.type) || null,
      start: league.season?.startDate || null,
      end: league.season?.endDate || null,
    },
    calendar: league.calendar || [],
    calendarType: league.calendarType || null,
    leagueName: league.name || lg.full,
  };
}
const stateOrder = (e) => (e.state === 'in' ? 0 : e.state === 'pre' ? 1 : 2);

// Week options for football (from the ESPN season calendar).
export function weekOptions(calendar) {
  const out = [];
  (calendar || []).forEach((grp) => {
    if (!grp || typeof grp !== 'object' || !Array.isArray(grp.entries)) return;
    grp.entries.forEach((en) => {
      out.push({
        seasontype: String(grp.value),
        week: String(en.value),
        label: en.label || `Week ${en.value}`,
        detail: en.detail || '',
        group: grp.label,
        start: en.startDate,
        end: en.endDate,
      });
    });
  });
  return out;
}

// Game days for day-based sports (ESPN gives an array of ISO dates).
export function calendarDays(calendar) {
  if (!Array.isArray(calendar)) return [];
  return calendar
    .map((d) => (typeof d === 'string' ? d : d?.startDate || d?.date))
    .filter(Boolean)
    .map((d) => d.slice(0, 10).replace(/-/g, ''))
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort();
}

// ---------- bye weeks ----------
// Who isn't playing in the slate on screen. Returns { kind, round, teams } or null.
//  NFL:   ESPN lists `week.teamsOnBye` on the scoreboard; worked out if it's missing.
//  NCAAF: ESPN gives no list, so it's FBS teams minus this week's games. Skipped when
//         most teams are idle (week 0, championship week): that's not a bye week.
//  AFL:   byes are per round but ESPN's AFL scoreboard is by day, so the round comes
//         from Squiggle's fixture.
//  MLB, NBA, NHL: no byes; teams without a game that day (kind 'idle').
const MAX_BYE_SHARE = 0.35;
const byName = (a, b) => String(a.name).localeCompare(String(b.name));
const mapByeTeam = (t) => ({
  id: t.id != null ? String(t.id) : null,
  name: t.displayName || t.name || '',
  short: t.shortDisplayName || t.short || t.name || '',
  abbr: t.abbreviation || t.abbr || '',
  logo: teamLogo(t),
});

async function getByes(lg, { data, events, seasonType }) {
  if (!events.length) return null;
  if (lg.id === 'afl') return getAflRoundByes(lg, events);
  if (lg.mode === 'week') {
    if (seasonType != null && Number(seasonType) !== 2) return null; // regular season only
    const listed = data.week?.teamsOnBye;
    if (Array.isArray(listed)) return { kind: 'bye', round: null, teams: listed.map(mapByeTeam).sort(byName) };
  }
  const teams = await getTeamsCached(lg);
  const playing = new Set(events.flatMap((e) => e.competitors.map((c) => String(c.id))));
  if (!teams.some((t) => playing.has(String(t.id)))) return null; // all-star games and the like
  const idle = teams.filter((t) => !playing.has(String(t.id))).map(mapByeTeam);
  if (lg.mode === 'week') {
    if (idle.length > teams.length * MAX_BYE_SHARE) return null;
    return { kind: 'bye', round: null, teams: idle };
  }
  return { kind: 'idle', round: null, teams: idle };
}

// Bye weeks in one team's football schedule: regular-season week numbers missing
// between its first and last game. Each bye sits between the games either side of it.
export function footballByes(games) {
  const reg = games
    .filter((g) => g.week != null && (g.seasonType == null || g.seasonType === 2))
    .sort((a, b) => a.week - b.week || new Date(a.date) - new Date(b.date));
  if (reg.length < 2) return [];
  const have = new Set(reg.map((g) => g.week));
  const out = [];
  for (let w = reg[0].week + 1; w < reg[reg.length - 1].week; w++) {
    if (have.has(w)) continue;
    const prev = reg.filter((g) => g.week < w).pop();
    const next = reg.find((g) => g.week > w);
    const mid = (new Date(prev.date).getTime() + new Date(next.date).getTime()) / 2;
    out.push({ bye: true, id: `bye-${w}`, week: w, label: `Week ${w}`, date: new Date(mid).toISOString(), state: next.state === 'post' ? 'post' : 'pre' });
  }
  return out;
}

// Squiggle's AFL fixture for a year, grouped by round. Cached for an hour.
const squiggleCache = new Map();
const squiggleTime = (g) => (g.unixtime ? Number(g.unixtime) * 1000 : Date.parse(`${String(g.date || '').replace(' ', 'T')}${g.tz || ''}`));
export function getAflSeason(year) {
  const hit = squiggleCache.get(year);
  if (hit && Date.now() - hit.t < 3600 * 1000) return hit.p;
  const p = getJSON('https://api.squiggle.com.au/', { q: 'games', year: String(year) })
    .then((d) => {
      const rounds = new Map();
      const teams = new Set();
      for (const g of d.games || []) {
        if (!g.hteam || !g.ateam) continue;
        const t = squiggleTime(g);
        if (Number.isNaN(t)) continue;
        teams.add(g.hteam);
        teams.add(g.ateam);
        let r = rounds.get(g.round);
        if (!r) {
          r = { round: g.round, name: g.roundname || `Round ${g.round}`, final: false, first: t, last: t, days: new Set(), teams: new Set() };
          rounds.set(g.round, r);
        }
        if (Number(g.is_final) > 0) r.final = true;
        r.first = Math.min(r.first, t);
        r.last = Math.max(r.last, t);
        r.days.add(ymd(new Date(t)));
        r.teams.add(g.hteam);
        r.teams.add(g.ateam);
      }
      return { year, teams: [...teams].sort(), rounds: [...rounds.values()].sort((a, b) => a.round - b.round) };
    })
    .catch((e) => {
      squiggleCache.delete(year);
      throw e;
    });
  squiggleCache.set(year, { t: Date.now(), p });
  return p;
}

// Squiggle names clubs by place ("Sydney", "Greater Western Sydney"); ESPN adds the
// nickname ("Sydney Swans", "GWS Giants"). Exact matches first, then prefixes.
const AFL_ALIASES = { greaterwesternsydney: ['gws', 'gwsgiants'], westernbulldogs: ['footscray', 'bulldogs'] };
const espnNames = (t) => [t.location, t.name, t.short, t.abbr].filter(Boolean).map(nameKey);
function aflMatch(t, sqName, exact) {
  const k = nameKey(sqName);
  const keys = [k, ...(AFL_ALIASES[k] || [])];
  return espnNames(t).some((n) => keys.some((x) => (exact ? n === x : n.startsWith(x))));
}
export function findAflTeam(espnTeams, sqName) {
  return espnTeams.find((t) => aflMatch(t, sqName, true)) || espnTeams.find((t) => aflMatch(t, sqName, false)) || null;
}
export function squiggleNameFor(sqNames, team) {
  return sqNames.find((n) => aflMatch(team, n, true)) || sqNames.find((n) => aflMatch(team, n, false)) || null;
}

async function getAflRoundByes(lg, events) {
  const days = new Set(events.map((e) => ymd(new Date(e.date))));
  const year = new Date(events[0].date).getFullYear();
  const season = await getAflSeason(year);
  const round = season.rounds.find((r) => [...r.days].some((d) => days.has(d)));
  if (!round || round.final) return null;
  const espn = await getTeamsCached(lg).catch(() => []);
  const teams = season.teams
    .filter((n) => !round.teams.has(n))
    .map((n) => {
      const t = findAflTeam(espn, n);
      return t ? mapByeTeam(t) : { id: null, name: n, short: n, abbr: '', logo: null };
    });
  return { kind: 'bye', round: round.name, teams };
}

// AFL byes for one team (Starred schedule), from Squiggle's fixture for `year`.
export async function getAflTeamByes(team, year) {
  const season = await getAflSeason(year);
  const me = squiggleNameFor(season.teams, team);
  if (!me) return [];
  const now = Date.now();
  return season.rounds
    .filter((r) => !r.final && !r.teams.has(me))
    .map((r) => ({
      bye: true,
      id: `bye-r${r.round}`,
      week: r.round,
      label: r.name,
      date: new Date(r.first).toISOString(),
      state: r.last + 4 * 3600 * 1000 < now ? 'post' : 'pre',
    }));
}

// ---------- game summary ----------
export async function getSummary(lg, eventId) {
  const d = await getJSON(`${site(lg)}/summary`, { event: eventId });
  const hc = d.header?.competitions?.[0] || {};
  const header = normalizeEvent({ id: eventId, competitions: [hc], date: hc.date, name: d.header?.name }, lg);

  const teamStats = (d.boxscore?.teams || []).map((t) => ({
    team: { id: t.team?.id, name: t.team?.displayName, abbr: t.team?.abbreviation, logo: teamLogo(t.team), color: t.team?.color ? `#${t.team.color}` : null },
    homeAway: t.homeAway,
    stats: flattenStats(t.statistics || []),
  }));

  const players = (d.boxscore?.players || []).map((p) => ({
    team: { id: p.team?.id, name: p.team?.displayName, abbr: p.team?.abbreviation, logo: teamLogo(p.team) },
    groups: (p.statistics || []).map((g) => ({
      name: g.name || g.type || '',
      title: g.text || g.displayName || g.name || '',
      labels: g.labels || g.names || [],
      athletes: (g.athletes || []).map((a) => ({
        name: a.athlete?.displayName || a.athlete?.shortName || '',
        short: a.athlete?.shortName || a.athlete?.displayName || '',
        pos: a.athlete?.position?.abbreviation || '',
        jersey: a.athlete?.jersey || '',
        starter: !!a.starter,
        dnp: !!a.didNotPlay,
        stats: a.stats || [],
      })),
      totals: g.totals || [],
    })),
  }));

  const leaders = (d.leaders || []).map((t) => ({
    team: { id: t.team?.id, name: t.team?.displayName, abbr: t.team?.abbreviation, logo: teamLogo(t.team) },
    cats: (t.leaders || [])
      .map((c) => ({
        name: c.displayName || c.name,
        top: (c.leaders || []).slice(0, 1).map((l) => ({
          name: l.athlete?.displayName || l.athlete?.shortName,
          headshot: l.athlete?.headshot?.href,
          value: l.displayValue,
        }))[0],
      }))
      .filter((c) => c.top),
  }));

  const scoring = (d.scoringPlays || []).map((p) => ({
    id: p.id,
    text: p.text,
    period: p.period?.number,
    clock: p.clock?.displayValue,
    teamLogo: p.team?.logo || teamLogo(p.team),
    teamAbbr: p.team?.abbreviation,
    away: p.awayScore,
    home: p.homeScore,
    type: p.scoringType?.displayName || p.type?.text || '',
  }));

  let plays = [];
  if (Array.isArray(d.plays) && d.plays.length) {
    plays = d.plays
      .slice(-25)
      .reverse()
      .map((p) => ({
        id: p.id,
        text: p.text,
        period: p.period?.displayValue || (p.period?.number ? `P${p.period.number}` : ''),
        clock: p.clock?.displayValue,
        scoring: !!p.scoringPlay,
        away: p.awayScore,
        home: p.homeScore,
      }));
  } else if (d.drives) {
    const cur = d.drives.current ? [d.drives.current] : [];
    plays = [...cur, ...(d.drives.previous || []).slice().reverse()]
      .slice(0, 14)
      .map((dr) => ({
        id: dr.id,
        drive: true,
        text: `${dr.team?.abbreviation || dr.team?.shortDisplayName || ''} — ${dr.description || ''}`,
        result: dr.displayResult || dr.result || '',
        teamLogo: teamLogo(dr.team),
        last: dr.plays?.[dr.plays.length - 1]?.text || '',
      }));
  }

  const wp = (d.winprobability || []).map((w) => w.homeWinPercentage).filter((x) => typeof x === 'number');

  const gi = d.gameInfo || {};
  const info = {
    venue: gi.venue?.fullName,
    city: [gi.venue?.address?.city, gi.venue?.address?.state].filter(Boolean).join(', '),
    attendance: gi.attendance,
    weather: gi.weather ? `${gi.weather.temperature ?? ''}° ${gi.weather.conditionId ? '' : ''}${gi.weather.displayValue || ''}`.trim() : '',
    officials: (gi.officials || []).map((o) => o.displayName || o.fullName).filter(Boolean),
    odds: d.pickcenter?.[0]?.details || header.odds,
    overUnder: d.pickcenter?.[0]?.overUnder ?? header.overUnder,
    broadcast: (hc.broadcasts || []).map((b) => b.media?.shortName || b.names?.join(', ')).filter(Boolean).join(', ') || header.broadcast,
  };

  const news = (d.news?.articles || []).slice(0, 4).map(mapArticle);

  return { header, teamStats, players, leaders, scoring, plays, wp, info, news };
}

function flattenStats(stats, prefix = '') {
  const out = [];
  stats.forEach((s) => {
    if (Array.isArray(s.stats)) {
      out.push(...flattenStats(s.stats, s.displayName || s.name ? `${s.displayName || s.name}: ` : ''));
    } else if (s.displayValue !== undefined) {
      out.push({ name: s.name, label: prefix + (s.label || s.displayName || s.abbreviation || s.name), value: s.displayValue });
    }
  });
  return out;
}

// ---------- standings ----------
export async function getStandings(lg) {
  let groups = [];
  try {
    const d = await getJSON(`${STANDINGS}/${lg.sport}/${lg.league}/standings`, lg.id === 'ncaaf' ? { group: '80' } : {});
    collectGroups(d, groups);
  } catch (e) {
    if (lg.id !== 'afl') throw e;
  }
  if (!groups.length && lg.id === 'afl') groups = await getSquiggleLadder();
  return groups.map((g) => normalizeGroup(g, lg));
}

function collectGroups(node, out, parent) {
  if (!node) return;
  if (node.standings?.entries?.length) {
    out.push({ name: node.name || node.abbreviation || parent || 'Standings', entries: node.standings.entries });
  }
  (node.children || []).forEach((c) => collectGroups(c, out, node.name));
}

function normalizeGroup(g, lg) {
  const statKey = (s) => s.name || s.type || s.abbreviation || s.displayName;
  const first = g.entries[0]?.stats || [];
  const available = new Map();
  first.forEach((s) => {
    const k = statKey(s);
    if (k && !available.has(k) && s.displayValue !== undefined) available.set(k, s);
  });
  let cols = (lg.standingsCols || []).filter((c) => available.has(c));
  if (cols.length < 3) cols = [...available.keys()].slice(0, 9);
  const colDefs = cols.map((c) => {
    const s = available.get(c);
    return { key: c, label: s.abbreviation || s.shortDisplayName || s.displayName || c, title: s.displayName || s.description || c };
  });

  let rows = g.entries.map((e) => {
    const map = {};
    (e.stats || []).forEach((s) => {
      const k = statKey(s);
      if (k && map[k] === undefined) map[k] = s;
    });
    return {
      team: {
        id: e.team?.id,
        name: e.team?.displayName || e.team?.name,
        short: e.team?.shortDisplayName || e.team?.abbreviation,
        abbr: e.team?.abbreviation,
        logo: teamLogo(e.team),
      },
      note: e.note?.description,
      noteColor: e.note?.color,
      values: Object.fromEntries(colDefs.map((c) => [c.key, map[c.key]?.displayValue ?? ''])),
      sort: {
        seed: num(map.playoffSeed?.value ?? map.rank?.value),
        pts: num(map.points?.value),
        pct: num(map.winPercent?.value ?? map.percentage?.value),
        wins: num(map.wins?.value),
        diff: num(map.differential?.value ?? map.pointDifferential?.value),
      },
    };
  });
  const hasSeed = rows.every((r) => r.sort.seed > 0);
  rows.sort((a, b) => {
    if (hasSeed) return a.sort.seed - b.sort.seed;
    if (lg.id === 'nhl' || lg.id === 'afl') return b.sort.pts - a.sort.pts || b.sort.pct - a.sort.pct;
    return b.sort.pct - a.sort.pct || b.sort.wins - a.sort.wins || b.sort.diff - a.sort.diff;
  });
  return { name: g.name, cols: colDefs, rows };
}
const num = (x) => (typeof x === 'number' && !Number.isNaN(x) ? x : Number(x) || 0);

async function getSquiggleLadder() {
  const d = await getJSON('https://api.squiggle.com.au/', { q: 'standings' });
  const mk = (name, value, abbreviation) => ({ name, value, displayValue: String(value), abbreviation });
  return [
    {
      name: `AFL Ladder (Squiggle)`,
      entries: (d.standings || []).map((t) => ({
        team: { id: `sq-${t.id}`, displayName: t.name, abbreviation: t.name },
        stats: [
          mk('rank', t.rank, '#'),
          mk('gamesPlayed', t.played, 'P'),
          mk('wins', t.wins, 'W'),
          mk('losses', t.losses, 'L'),
          mk('ties', t.draws, 'D'),
          mk('points', t.pts, 'PTS'),
          mk('pointsFor', t.for, 'F'),
          mk('pointsAgainst', t.against, 'A'),
          { name: 'percentage', value: t.percentage, displayValue: Number(t.percentage).toFixed(1), abbreviation: '%' },
        ],
      })),
    },
  ];
}

// ---------- teams ----------
// ESPN's /teams endpoint ignores `groups`, so for college football it returns every
// division (~760 teams) in no useful order; a capped `limit` silently drops real FBS
// teams (e.g. Iowa). Instead we fetch the full list and keep only the team IDs that
// appear in the FBS standings. If the standings call fails or looks wrong, we fall
// back to the full list rather than hiding teams.
async function getStandingsTeamIds(lg, params) {
  const d = await getJSON(`${STANDINGS}/${lg.sport}/${lg.league}/standings`, params);
  const ids = new Set();
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    (o.standings?.entries || []).forEach((e) => e.team?.id && ids.add(String(e.team.id)));
    (o.children || []).forEach(walk);
  };
  walk(d);
  return ids;
}

// Team list from the standings feed. Used when /teams can't be reached: ESPN refuses
// /teams from browsers (web version without the proxy), but allows standings.
async function getTeamsFromStandings(lg) {
  const d = await getJSON(`${STANDINGS}/${lg.sport}/${lg.league}/standings`, lg.teamsFromStandings || {});
  const out = [];
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    (o.standings?.entries || []).forEach((e) => e.team?.id && out.push(e.team));
    (o.children || []).forEach(walk);
  };
  walk(d);
  return out;
}

export async function getTeams(lg) {
  let teams;
  try {
    const [d, keepIds] = await Promise.all([
      getJSON(`${site(lg)}/teams`, lg.teamsParams || { limit: '100' }),
      lg.teamsFromStandings ? getStandingsTeamIds(lg, lg.teamsFromStandings).catch(() => null) : null,
    ]);
    teams = (d.sports?.[0]?.leagues?.[0]?.teams || []).map((t) => t.team).filter(Boolean);
    if (keepIds && keepIds.size >= 100) teams = teams.filter((t) => keepIds.has(String(t.id)));
  } catch (e) {
    const fromStandings = await getTeamsFromStandings(lg).catch(() => []);
    if (!fromStandings.length) throw e;
    teams = fromStandings;
  }
  const exclude = new Set(lg.excludeTeamIds || []);
  const seen = new Set();
  teams = teams.filter((t) => {
    const id = String(t.id);
    if (exclude.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return teams
    .map((t) => ({
      id: t.id,
      name: t.displayName,
      short: t.shortDisplayName,
      abbr: t.abbreviation,
      location: t.location,
      logo: teamLogo(t),
      color: t.color ? `#${t.color}` : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Team lists barely change, so the bye-week lookups share one copy per league (6 h).
const teamsCache = new Map();
export function getTeamsCached(lg) {
  const hit = teamsCache.get(lg.id);
  if (hit && Date.now() - hit.t < 6 * 3600 * 1000) return hit.p;
  const p = getTeams(lg).catch((e) => {
    teamsCache.delete(lg.id);
    throw e;
  });
  teamsCache.set(lg.id, { t: Date.now(), p });
  return p;
}

// /teams/{id} is refused from browsers (web version without the proxy), but the team
// schedule carries a smaller team object (name, logo, colour, recordSummary, standingSummary).
const teamObj = (info, schedule) => info.value?.team || schedule.value?.team || {};
const teamRecord = (t) => t.record?.items?.find((i) => i.type === 'total')?.summary || t.record?.items?.[0]?.summary || t.recordSummary || '';

function mapTeamInfo(t, teamId) {
  return {
    id: teamId,
    name: t.displayName,
    short: t.shortDisplayName || t.name,
    abbr: t.abbreviation,
    location: t.location,
    logo: teamLogo(t),
    color: t.color ? `#${t.color}` : null,
    record: teamRecord(t),
    standing: t.standingSummary || '',
  };
}

// Team header + schedule (no roster) for the Starred view.
export async function getTeamSummary(lg, teamId) {
  const [info, schedule] = await Promise.allSettled([
    getJSON(`${site(lg)}/teams/${teamId}`),
    getJSON(`${site(lg)}/teams/${teamId}/schedule`),
  ]);
  if (info.status === 'rejected' && schedule.status === 'rejected') throw info.reason;
  const team = mapTeamInfo(teamObj(info, schedule), teamId);
  const games = (schedule.value?.events || []).map((e) => normalizeEvent(e, lg)).sort((a, b) => new Date(a.date) - new Date(b.date));
  return { leagueId: lg.id, team, games };
}

// News tagged with one team. ESPN's `team` filter works for every league we support;
// we also keep only articles that actually tag the team, in case the filter is ignored.
export async function getTeamNews(lg, teamId, limit = 20) {
  const d = await getJSON(`${site(lg)}/news`, { team: teamId, limit: String(limit) });
  return (d.articles || []).map(mapArticle).filter((a) => a.teamIds.includes(String(teamId)));
}

// Season team stats. Most leagues use the site API; ESPN only serves AFL team stats
// from the core API. `seasontype=2` forces the regular season (otherwise MLB returns
// its postseason split once the playoffs start).
export async function getTeamStats(lg, teamId) {
  let cats = [];
  let season = '';
  if (lg.teamStats === 'core') {
    const year = new Date().getFullYear();
    for (const y of [year, year - 1]) {
      try {
        const d = await getJSON(`https://sports.core.api.espn.com/v2/sports/${lg.sport}/leagues/${lg.league}/seasons/${y}/types/2/teams/${teamId}/statistics`);
        cats = d.splits?.categories || [];
        const gp = cats.flatMap((c) => c.stats || []).find((s) => s.name === 'gamesPlayed');
        if (cats.length && (!gp || gp.value > 0)) {
          season = `${y} regular season`;
          break;
        }
        cats = [];
      } catch {
        /* try the previous season */
      }
    }
  } else {
    const d = await getJSON(`${site(lg)}/teams/${teamId}/statistics`, { seasontype: '2' });
    cats = d.results?.stats?.categories || [];
    if (d.season?.displayName) season = `${d.season.displayName} regular season`;
  }
  const categories = cats
    .map((c) => {
      const seen = new Set();
      const stats = (c.stats || [])
        .filter((s) => {
          if (!s.name || seen.has(s.name) || HIDDEN_STATS.has(s.name) || s.displayValue == null) return false;
          seen.add(s.name);
          return true;
        })
        .map((s) => ({
          name: s.name,
          abbr: s.abbreviation || s.shortDisplayName || '',
          label: s.displayName || s.shortDisplayName || s.name,
          value: s.displayValue,
          perGame: s.perGameDisplayValue,
          rank: s.rankDisplayValue,
        }));
      return { name: c.name, label: c.displayName || c.name, stats };
    })
    .filter((c) => c.stats.length);
  return { season, categories };
}
const HIDDEN_STATS = new Set(['isQualified', 'WARBR', 'offWARBR', 'defWARBR', 'zoneRating']);

// ---------- injuries ----------
// One ESPN injury object → { status, date, type, side, detail, returnDate, comment }.
// Depth chart and roster athletes carry a thin copy (often just status + date); the
// league-wide /injuries feed adds the injury, return date and ESPN's short note.
const notSpecified = (s) => (s && !/^not specified$/i.test(s) ? s : '');
export function mapInjury(inj) {
  if (!inj || typeof inj !== 'object') return null;
  const det = inj.details || {};
  const out = {
    status: inj.status || inj.type?.description || det.fantasyStatus?.description || '',
    date: inj.date || inj.lastModified || '',
    type: notSpecified(det.type || det.location || ''),
    side: notSpecified(det.side || ''),
    detail: notSpecified(det.detail || ''),
    returnDate: det.returnDate || '',
    comment: (inj.shortComment || inj.longComment || inj.comment || '').trim(),
  };
  return out.status || out.date || out.comment ? out : null;
}

const athleteIdOf = (a) => {
  if (!a) return null;
  if (a.id != null) return String(a.id);
  const href = a.links?.find((l) => /\/id\/\d+/.test(l.href || ''))?.href || a.$ref || '';
  return href.match(/\/(?:id|athletes)\/(\d+)/)?.[1] || null;
};
const nameKey = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');

// League-wide injury report, indexed by athlete id and name. Cached for 5 minutes so
// several starred teams in one league share a request. Never throws: no notes is fine.
const injuryCache = new Map();
export function getLeagueInjuries(lg) {
  if (!lg.depthChart) return Promise.resolve(null);
  const hit = injuryCache.get(lg.id);
  if (hit && Date.now() - hit.t < 5 * 60 * 1000) return hit.p;
  const p = getJSON(`${site(lg)}/injuries`)
    .then((d) => {
      const byId = new Map();
      const byName = new Map();
      for (const team of d.injuries || [])
        for (const inj of team.injuries || []) {
          const m = mapInjury(inj);
          if (!m) continue;
          const id = athleteIdOf(inj.athlete);
          // Newest note wins if ESPN lists a player twice.
          const keep = (map, k) => {
            if (!k) return;
            const old = map.get(k);
            if (!old || new Date(m.date || 0) >= new Date(old.date || 0)) map.set(k, m);
          };
          keep(byId, id);
          keep(byName, nameKey(inj.athlete?.displayName));
        }
      return { byId, byName };
    })
    .catch(() => {
      injuryCache.delete(lg.id);
      return null;
    });
  injuryCache.set(lg.id, { t: Date.now(), p });
  return p;
}

// Best injury info for one athlete: the league report's entry (by id, then name) merged
// over whatever the depth chart / roster athlete carried.
function injuryFor(report, a) {
  const own = mapInjury(a.injuries?.[0]);
  const feed = report && (report.byId.get(athleteIdOf(a)) || report.byName.get(nameKey(a.displayName || a.fullName)));
  if (!feed) return own;
  if (!own) return feed;
  const merged = { ...own };
  for (const [k, v] of Object.entries(feed)) if (v) merged[k] = v;
  // Keep the depth chart's own status: it's what the tag shows.
  if (own.status) merged.status = own.status;
  return merged;
}

// Depth chart (NFL, MLB, NBA, NHL; ESPN doesn't publish them for college football or AFL).
export async function getDepthChart(lg, teamId) {
  const [d, report] = await Promise.all([getJSON(`${site(lg)}/teams/${teamId}/depthcharts`), getLeagueInjuries(lg)]);
  const unit = (name) => (/special/i.test(name) ? 2 : /\bD\b|defen|4-3|3-4|nickel|dime/i.test(name) ? 1 : 0);
  // ESPN lists football offense WRs first; show it the usual way (QB, RB, WR, TE, O-line).
  const order = lg.sport === 'football' ? ['QB', 'RB', 'FB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT'] : [];
  const rank = (abbr) => (order.includes(abbr) ? order.indexOf(abbr) : order.length);
  return (d.depthchart || [])
    .map((c) => ({
      id: String(c.id ?? c.name),
      name: c.name === 'Depth Chart' || c.name === 'Default' ? 'Lineup' : c.name,
      positions: Object.entries(c.positions || {}).map(([key, p]) => ({
        key,
        abbr: p.position?.abbreviation || key.toUpperCase(),
        name: p.position?.displayName || p.position?.name || key.toUpperCase(),
        // Raw status, "Active" included; src/injuries.js decides what to show.
        athletes: (p.athletes || []).map((a) => ({
          id: a.id,
          name: a.displayName || a.shortName,
          short: a.shortName,
          status: a.injuries?.[0]?.status || '',
          injury: injuryFor(report, a),
        })),
      })),
    }))
    .map((c) => ({ ...c, positions: [...c.positions].sort((a, b) => rank(a.abbr) - rank(b.abbr)) }))
    .filter((c) => c.positions.length)
    .sort((a, b) => unit(a.name) - unit(b.name));
}

export async function getTeamDetail(lg, teamId) {
  const [info, schedule, roster, injuries] = await Promise.allSettled([
    getJSON(`${site(lg)}/teams/${teamId}`),
    getJSON(`${site(lg)}/teams/${teamId}/schedule`),
    getJSON(`${site(lg)}/teams/${teamId}/roster`),
    getLeagueInjuries(lg),
  ]);
  const report = injuries.value || null;
  const mapAthlete = (a) => mapRosterAthlete(a, report);
  const t = teamObj(info, schedule);
  const team = {
    id: teamId,
    name: t.displayName,
    abbr: t.abbreviation,
    logo: teamLogo(t),
    color: t.color ? `#${t.color}` : null,
    record: teamRecord(t),
    standing: t.standingSummary || '',
    venue: t.franchise?.venue?.fullName || '',
    recordStats: (t.record?.items?.[0]?.stats || []).filter((s) => ['avgPointsFor', 'avgPointsAgainst', 'pointsFor', 'pointsAgainst', 'streak', 'differential'].includes(s.name)),
    link: t.links?.find((l) => (l.rel || []).includes('clubhouse'))?.href || t.clubhouse,
  };
  const games = (schedule.value?.events || []).map((e) => normalizeEvent(e, lg)).sort((a, b) => new Date(a.date) - new Date(b.date));

  let rosterGroups = [];
  const ath = roster.value?.athletes || [];
  if (ath.length && Array.isArray(ath[0]?.items)) {
    rosterGroups = ath.map((g) => ({ name: g.position || g.name || '', players: g.items.map(mapAthlete) }));
  } else if (ath.length) {
    rosterGroups = [{ name: 'Roster', players: ath.map(mapAthlete) }];
  }
  return { team, games, rosterGroups };
}
const mapRosterAthlete = (a, report) => ({
  id: a.id,
  name: a.displayName || a.fullName,
  jersey: a.jersey,
  pos: a.position?.abbreviation || a.position?.name || '',
  posName: a.position?.displayName || a.position?.name || '',
  age: a.age,
  height: a.displayHeight,
  weight: a.displayWeight,
  headshot: a.headshot?.href,
  experience: a.experience?.years,
  college: a.college?.shortName || a.college?.name,
  status: a.injuries?.[0]?.status || '',
  injury: a.injuries?.length ? injuryFor(report, a) : null,
});

// ---------- roster (Starred) ----------
// Football rosters are split into Offense, Defense and Special Teams: ESPN's own roster
// groups ("offense", "defense", "specialTeam") decide, and the position decides for any
// group that doesn't say. Players are ordered by position, then jersey number.
const FOOTBALL_UNITS = [
  { id: 'offense', name: 'Offense', group: /offen/i, pos: ['QB', 'RB', 'HB', 'TB', 'FB', 'WR', 'TE', 'OL', 'OT', 'T', 'LT', 'RT', 'OG', 'G', 'LG', 'RG', 'C'] },
  { id: 'defense', name: 'Defense', group: /defen/i, pos: ['DL', 'DE', 'EDGE', 'DT', 'NT', 'LB', 'OLB', 'ILB', 'MLB', 'DB', 'CB', 'NB', 'S', 'SAF', 'FS', 'SS'] },
  { id: 'special', name: 'Special Teams', group: /special/i, pos: ['PK', 'K', 'P', 'LS', 'H', 'KR', 'PR'] },
];
const jerseyNum = (p) => (p.jersey !== undefined && p.jersey !== '' && !Number.isNaN(Number(p.jersey)) ? Number(p.jersey) : 999);

function footballRoster(groups) {
  const units = FOOTBALL_UNITS.map((u) => ({ ...u, players: [] }));
  const other = { id: 'other', name: 'Other', pos: [], players: [] };
  for (const g of groups) {
    const byGroup = units.find((u) => u.group.test(g.name));
    for (const p of g.players) {
      const pos = String(p.pos || '').toUpperCase();
      (byGroup || units.find((u) => u.pos.includes(pos)) || other).players.push(p);
    }
  }
  const rank = (u, p) => {
    const i = u.pos.indexOf(String(p.pos || '').toUpperCase());
    return i < 0 ? u.pos.length : i;
  };
  return [...units, other]
    .filter((u) => u.players.length)
    .map((u) => ({
      id: u.id,
      name: u.name,
      players: [...u.players].sort((a, b) => rank(u, a) - rank(u, b) || jerseyNum(a) - jerseyNum(b) || byName(a, b)),
    }));
}

// Flat rosters (NBA, AFL): group by position, e.g. Guards / Forwards / Centers.
const POS_GROUP_ORDER = ['Guards', 'Forwards', 'Centers', 'Midfielders', 'Rucks', 'Defenders'];
function groupByPosition(players) {
  const bucket = (p) => {
    const n = String(p.posName || p.pos || '').toLowerCase();
    if (/guard/.test(n)) return 'Guards';
    if (/forward/.test(n)) return 'Forwards';
    if (/center|centre/.test(n)) return 'Centers';
    if (/mid/.test(n)) return 'Midfielders';
    if (/ruck/.test(n)) return 'Rucks';
    if (/defen|back/.test(n)) return 'Defenders';
    return 'Players';
  };
  const m = new Map();
  players.forEach((p) => {
    const b = bucket(p);
    if (!m.has(b)) m.set(b, []);
    m.get(b).push(p);
  });
  const ord = (n) => (POS_GROUP_ORDER.includes(n) ? POS_GROUP_ORDER.indexOf(n) : POS_GROUP_ORDER.length);
  const out = [...m.entries()].sort((a, b) => ord(a[0]) - ord(b[0]));
  if (out.length === 1) out[0][0] = 'Roster';
  return out.map(([name, list]) => ({ id: name, name, players: [...list].sort((a, b) => jerseyNum(a) - jerseyNum(b) || byName(a, b)) }));
}

// { split, sections: [{ id, name, players }] }. `split` (football) means the sections
// are shown one at a time; otherwise they're stacked in one table.
export async function getTeamRoster(lg, teamId) {
  const [d, report] = await Promise.all([getJSON(`${site(lg)}/teams/${teamId}/roster`), getLeagueInjuries(lg)]);
  const ath = d.athletes || [];
  const grouped = ath.length > 0 && Array.isArray(ath[0]?.items);
  const groups = (grouped ? ath.map((g) => ({ name: g.position || g.name || '', players: g.items || [] })) : [{ name: '', players: ath }]).map(
    (g) => ({ name: g.name, players: g.players.map((a) => mapRosterAthlete(a, report)) })
  );
  if (lg.sport === 'football') return { split: true, sections: footballRoster(groups) };
  if (!grouped) return { split: false, sections: groupByPosition(groups[0].players) };
  // ESPN's own groups: MLB pitchers / catchers / infielders…, NHL centers / wings / defense / goalies.
  return {
    split: false,
    sections: groups
      .filter((g) => g.players.length)
      .map((g, i) => ({ id: `${i}:${g.name}`, name: g.name ? g.name.replace(/^./, (c) => c.toUpperCase()) : 'Roster', players: g.players })),
  };
}

// ---------- news ----------
export async function getNews(lg) {
  const d = await getJSON(`${site(lg)}/news`, { limit: '40' });
  return (d.articles || []).map(mapArticle);
}
const mapArticle = (a) => ({
  id: a.id || a.headline,
  headline: a.headline,
  description: a.description,
  published: a.published || a.lastModified,
  image: a.images?.[0]?.url,
  link: a.links?.web?.href || a.links?.mobile?.href,
  type: a.type,
  byline: a.byline,
  teamIds: (a.categories || [])
    .filter((c) => c.type === 'team')
    .map((c) => String(c.teamId ?? c.team?.id ?? ''))
    .filter(Boolean),
});

// ---------- off-season countdown ----------
// When a league's season is over (or still in preseason), find when the next regular
// season starts. ESPN's core API has each season's windows (preseason, regular season,
// postseason, off-season) once the season is created; the first real game comes from the
// scoreboard (or Squiggle for the AFL) once the schedule is published.
const CORE = 'https://sports.core.api.espn.com/v2/sports';
const DAY_MS = 86400000;
const ms = (s) => (s ? Date.parse(s) : NaN);

// 'pre' (preseason, regular season still to come), 'in', or 'off' (season finished).
// ESPN keeps showing the last game day for a while after a season ends (MLB showed the
// World Series for weeks), so a postseason slate whose newest game is 3+ days old also
// counts as over. Regular-season breaks (All-Star, Olympics) never do.
export function seasonPhase(sb, now = Date.now()) {
  const s = sb?.season;
  if (!s || sb.error) return null;
  const evs = sb.events || [];
  if (evs.some((e) => e.state === 'in')) return 'in';
  if (s.type === 4 || ms(s.end) < now) return 'off';
  const upcoming = evs.some((e) => e.state === 'pre' && ms(e.date) > now - 6 * 3600 * 1000);
  const newest = Math.max(...evs.map((e) => ms(e.date)).filter((t) => !Number.isNaN(t)));
  if (evs.length && !upcoming && s.type >= 3 && now - newest > 3 * DAY_MS) return 'off';
  if (s.type === 1) return 'pre';
  return 'in';
}

// The season after `name`: "2026" -> "2027", "2026-27" -> "2027-28".
const nextSeasonName = (name, year) => {
  const m = /^(\d{4})-(\d{2})$/.exec(name || '');
  if (m) return `${+m[1] + 1}-${String((+m[2] + 1) % 100).padStart(2, '0')}`;
  return String(year + 1);
};

// Core API season: { year, name, pre: {start,end}, reg: {start,end}, off: {start,end} }, or null if ESPN hasn't created it.
const coreSeasonCache = new Map();
function getCoreSeason(lg, year) {
  const key = `${lg.id}:${year}`;
  const hit = coreSeasonCache.get(key);
  if (hit && Date.now() - hit.t < 6 * 3600 * 1000) return hit.p;
  const p = getJSON(`${CORE}/${lg.sport}/leagues/${lg.league}/seasons/${year}`)
    .then((d) => {
      const types = {};
      (d.types?.items || []).forEach((t) => {
        types[String(t.type ?? t.id)] = { start: t.startDate || null, end: t.endDate || null, name: t.name || '' };
      });
      return { year, name: d.displayName || String(year), start: d.startDate, pre: types['1'] || null, reg: types['2'] || null, off: types['4'] || null };
    })
    .catch((e) => {
      if (/404/.test(e.message)) return null; // season not created yet
      coreSeasonCache.delete(key);
      throw e;
    });
  coreSeasonCache.set(key, { t: Date.now(), p });
  return p;
}

const tbdTime = (e) => /TBD|TBA/i.test(e.detail || '');
// ESPN stamps games with no start time at midnight US Eastern. Keep that calendar day,
// as local noon, so it doesn't show as the day before west of New York.
const tbdDay = (iso) => {
  const day = new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T12:00:00`).toISOString() : iso;
};
const earliest = (evs) => evs.sort((a, b) => ms(a.date) - ms(b.date))[0] || null;

// First regular-season game on or after `from` (an ISO date), from ESPN's scoreboard.
// Football: week 1 of the season year. Others: the month(s) the regular season starts in
// (ESPN ignores date ranges but takes a whole month, YYYYMM).
async function firstEspnGame(lg, year, from) {
  if (lg.mode === 'week') {
    const d = await getJSON(`${site(lg)}/scoreboard`, { ...(lg.scoreboardParams || {}), seasontype: 2, week: 1, dates: year });
    return earliest((d.events || []).map((e) => normalizeEvent(e, lg)));
  }
  if (!from) return null;
  const start = ms(from) - DAY_MS;
  const months = [...new Set([0, 21].map((k) => ymd(new Date(start + k * DAY_MS)).slice(0, 6)))];
  for (const m of months) {
    const d = await getJSON(`${site(lg)}/scoreboard`, { ...(lg.scoreboardParams || {}), dates: m, limit: 1000 });
    const reg = (d.events || []).map((e) => normalizeEvent(e, lg)).filter((e) => e.seasonType === 2 && ms(e.date) >= start);
    if (reg.length) return earliest(reg);
  }
  return null;
}

// AFL: Squiggle's fixture has the Opening Round as soon as the season is fixtured.
async function firstAflGame(year) {
  const season = await getAflSeason(year);
  const r = season.rounds.filter((x) => !x.final).sort((a, b) => a.first - b.first)[0];
  return r ? { date: new Date(r.first).toISOString(), round: r.name } : null;
}

async function findNextSeason(lg, sb, phase) {
  const now = Date.now();
  const cur = sb.season.year;
  const [thisSeason, nextSeason] = await Promise.all([getCoreSeason(lg, cur).catch(() => null), getCoreSeason(lg, cur + 1).catch(() => null)]);
  // The season we're counting down to: the first whose regular season hasn't started.
  const target = [thisSeason, nextSeason].find((s) => s?.reg?.start && ms(s.reg.start) > now) || null;
  const year = target?.year ?? (phase === 'pre' ? cur : cur + 1);
  const out = {
    phase,
    year,
    name: target?.name || (phase === 'pre' ? sb.season.name || String(cur) : nextSeasonName(sb.season.name, cur)),
    opener: null, // { date, exact, timeTbd, label }
    preseason: target?.pre?.start && ms(target.pre.start) > now ? { date: target.pre.start, name: target.pre.name } : null,
    lastGame: null,
  };
  if (phase === 'off') {
    const done = (sb.events || []).filter((e) => e.state === 'post');
    out.lastGame = done.length ? done.reduce((a, b) => (ms(b.date) > ms(a.date) ? b : a)).date : null;
  }

  // When this off-season ends: roughly when the next preseason starts.
  let offEnd = thisSeason?.off?.end || (sb.calendar || []).find((c) => c && String(c.value) === '4')?.endDate || null;
  if (!(ms(offEnd) > now)) offEnd = null;

  // An exact first game, if the schedule is out.
  const tries = [];
  if (lg.id === 'afl') tries.push(() => firstAflGame(year));
  tries.push(() => firstEspnGame(lg, year, target?.reg?.start || offEnd));
  for (const t of tries) {
    const g = await t().catch(() => null);
    if (g && ms(g.date) > now - 6 * 3600 * 1000) {
      const timeTbd = !!g.detail && tbdTime(g);
      out.opener = { date: timeTbd ? tbdDay(g.date) : g.date, exact: true, timeTbd, game: g.shortName || g.name || '', round: g.round || '' };
      return out;
    }
  }
  // Otherwise ESPN's regular-season window (approximate: it starts at a US midnight). If
  // ESPN hasn't created the season yet, guess a year on from this season's start, and
  // failing that use the end of this off-season (roughly when the next preseason starts).
  if (target?.reg?.start) {
    out.opener = { date: target.reg.start, exact: false };
    return out;
  }
  const guess = thisSeason?.reg?.start ? new Date(ms(thisSeason.reg.start)) : null;
  if (guess) guess.setFullYear(guess.getFullYear() + 1);
  if (guess && guess.getTime() > now) out.opener = { date: guess.toISOString(), exact: false, guessed: true };
  else if (offEnd) out.opener = { date: offEnd, exact: false, offSeasonEnd: true };
  return out;
}

// Countdown info for a league from its current scoreboard (the Home poller's data), or
// null while the league is in season. Cached for 6 hours per league and phase.
const countdownCache = new Map();
export function getSeasonCountdown(lg, sb) {
  const phase = seasonPhase(sb);
  if (phase !== 'off' && phase !== 'pre') return Promise.resolve(null);
  const key = `${lg.id}|${phase}|${sb.season.year}`;
  const hit = countdownCache.get(key);
  if (hit && Date.now() - hit.t < 6 * 3600 * 1000) return hit.p;
  const p = findNextSeason(lg, sb, phase).catch((e) => {
    countdownCache.delete(key);
    throw e;
  });
  countdownCache.set(key, { t: Date.now(), p });
  return p;
}
