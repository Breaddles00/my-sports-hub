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
  return {
    events,
    day: data.day?.date || null,
    week: data.week?.number ?? null,
    seasonType: data.season?.type ?? null,
    seasonYear: data.season?.year ?? league.season?.year ?? null,
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
export async function getTeams(lg) {
  const d = await getJSON(`${site(lg)}/teams`, lg.teamsParams || { limit: '100' });
  const teams = (d.sports?.[0]?.leagues?.[0]?.teams || []).map((t) => t.team).filter(Boolean);
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

export async function getTeamDetail(lg, teamId) {
  const [info, schedule, roster] = await Promise.allSettled([
    getJSON(`${site(lg)}/teams/${teamId}`),
    getJSON(`${site(lg)}/teams/${teamId}/schedule`),
    getJSON(`${site(lg)}/teams/${teamId}/roster`),
  ]);
  const t = info.value?.team || {};
  const team = {
    id: teamId,
    name: t.displayName,
    abbr: t.abbreviation,
    logo: teamLogo(t),
    color: t.color ? `#${t.color}` : null,
    record: t.record?.items?.find((i) => i.type === 'total')?.summary || t.record?.items?.[0]?.summary || '',
    standing: t.standingSummary || '',
    venue: t.franchise?.venue?.fullName || '',
    recordStats: (t.record?.items?.[0]?.stats || []).filter((s) => ['avgPointsFor', 'avgPointsAgainst', 'pointsFor', 'pointsAgainst', 'streak', 'differential'].includes(s.name)),
    link: t.links?.find((l) => (l.rel || []).includes('clubhouse'))?.href,
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
const mapAthlete = (a) => ({
  id: a.id,
  name: a.displayName || a.fullName,
  jersey: a.jersey,
  pos: a.position?.abbreviation || a.position?.name || '',
  age: a.age,
  height: a.displayHeight,
  weight: a.displayWeight,
  headshot: a.headshot?.href,
  experience: a.experience?.years,
  college: a.college?.shortName || a.college?.name,
  status: a.injuries?.[0]?.status || '',
});

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
});
