// League configuration. All data comes from ESPN's public JSON feeds
// (the same ones espn.com uses), with Squiggle as a backup for the AFL ladder.

// Key stats shown in the Starred view: [ESPN stat category, stat name, label].
// Missing stats are skipped, so it's safe to list ones that only some seasons have.
const FOOTBALL_KEY_STATS = [
  ['scoring', 'totalPointsPerGame', 'Points/G'],
  ['passing', 'yardsPerGame', 'Yards/G'],
  ['passing', 'passingYardsPerGame', 'Pass yds/G'],
  ['rushing', 'rushingYardsPerGame', 'Rush yds/G'],
  ['miscellaneous', 'thirdDownConvPct', '3rd down %'],
  ['miscellaneous', 'turnOverDifferential', 'Turnover diff'],
  ['defensive', 'sacks', 'Sacks'],
  ['defensiveInterceptions', 'interceptions', 'Interceptions'],
];

// `logo` is ESPN's league logo; `logoDark` is its dark-theme variant where ESPN has one.
export const LEAGUES = [
  {
    id: 'nfl',
    opener: 'Kickoff', // first day of the regular season (off-season countdown)
    name: 'NFL',
    full: 'National Football League',
    sport: 'football',
    league: 'nfl',
    mode: 'week',
    accent: '#3b82f6',
    logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png',
    logoDark: 'https://a.espncdn.com/i/teamlogos/leagues/500-dark/nfl.png',
    periodName: 'Q',
    depthChart: true,
    keyStats: FOOTBALL_KEY_STATS,
    standingsCols: ['wins', 'losses', 'ties', 'winPercent', 'pointsFor', 'pointsAgainst', 'differential', 'streak'],
  },
  {
    id: 'ncaaf',
    opener: 'Kickoff', // first day of the regular season (off-season countdown)
    name: 'NCAAF',
    full: 'NCAA Football (FBS)',
    sport: 'football',
    league: 'college-football',
    mode: 'week',
    accent: '#f59e0b',
    logo: 'https://a.espncdn.com/redesign/assets/img/icons/NCAASports_Football.png',
    periodName: 'Q',
    scoreboardParams: { groups: '80', limit: '400' },
    // /teams ignores `groups` and returns all ~760 college teams, so fetch them all and
    // filter to the teams in the FBS (group 80) standings. See getTeams() in api.js.
    teamsParams: { limit: '1000' },
    teamsFromStandings: { group: '80' },
    keyStats: FOOTBALL_KEY_STATS,
    standingsCols: ['vsConf', 'overall', 'wins', 'losses', 'winPercent', 'pointsFor', 'pointsAgainst', 'streak'],
  },
  {
    id: 'mlb',
    opener: 'Opening Day', // first day of the regular season (off-season countdown)
    name: 'MLB',
    full: 'Major League Baseball',
    sport: 'baseball',
    league: 'mlb',
    mode: 'day',
    accent: '#ef4444',
    logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png',
    logoDark: 'https://a.espncdn.com/i/teamlogos/leagues/500-dark/mlb.png',
    periodName: 'Inn',
    depthChart: true,
    keyStats: [
      ['batting', 'avg', 'AVG'],
      ['batting', 'runs', 'Runs'],
      ['batting', 'homeRuns', 'HR'],
      ['batting', 'OPS', 'OPS'],
      ['pitching', 'ERA', 'ERA'],
      ['pitching', 'WHIP', 'WHIP'],
      ['pitching', 'strikeouts', 'Pitching K'],
      ['fielding', 'errors', 'Errors'],
    ],
    standingsCols: ['wins', 'losses', 'winPercent', 'gamesBehind', 'Home', 'Road', 'differential', 'streak', 'Last Ten Games'],
  },
  {
    id: 'nba',
    opener: 'Opening Night', // first day of the regular season (off-season countdown)
    name: 'NBA',
    full: 'National Basketball Association',
    sport: 'basketball',
    league: 'nba',
    mode: 'day',
    accent: '#f97316',
    logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/nba.png',
    logoDark: 'https://a.espncdn.com/i/teamlogos/leagues/500-dark/nba.png',
    periodName: 'Q',
    depthChart: true,
    keyStats: [
      ['offensive', 'avgPoints', 'Points/G'],
      ['offensive', 'fieldGoalPct', 'FG%'],
      ['offensive', 'threePointPct', '3P%'],
      ['general', 'avgRebounds', 'Rebounds/G'],
      ['offensive', 'avgAssists', 'Assists/G'],
      ['defensive', 'avgSteals', 'Steals/G'],
      ['defensive', 'avgBlocks', 'Blocks/G'],
      ['offensive', 'avgTurnovers', 'Turnovers/G'],
    ],
    standingsCols: ['wins', 'losses', 'winPercent', 'gamesBehind', 'Home', 'Road', 'avgPointsFor', 'avgPointsAgainst', 'streak', 'Last Ten Games'],
  },
  {
    id: 'nhl',
    opener: 'Opening Night', // first day of the regular season (off-season countdown)
    name: 'NHL',
    full: 'National Hockey League',
    sport: 'hockey',
    league: 'nhl',
    mode: 'day',
    accent: '#06b6d4',
    logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/nhl.png',
    logoDark: 'https://a.espncdn.com/i/teamlogos/leagues/500-dark/nhl.png',
    periodName: 'P',
    depthChart: true,
    keyStats: [
      ['offensive', 'goals', 'Goals for'],
      ['defensive', 'goalsAgainst', 'Goals against'],
      ['defensive', 'avgGoalsAgainst', 'GAA'],
      ['offensive', 'shootingPct', 'Shooting %'],
      ['defensive', 'savePct', 'Save %'],
      ['offensive', 'powerPlayGoals', 'PP goals'],
      ['offensive', 'faceoffPercent', 'Faceoff %'],
      ['penalties', 'penaltyMinutes', 'PIM'],
    ],
    standingsCols: ['gamesPlayed', 'wins', 'losses', 'otLosses', 'points', 'pointsFor', 'pointsAgainst', 'differential', 'streak'],
  },
  {
    id: 'afl',
    opener: 'Season opener', // first day of the regular season (off-season countdown)
    name: 'AFL',
    full: 'Australian Football League',
    sport: 'australian-football',
    league: 'afl',
    mode: 'day',
    accent: '#22c55e',
    logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/afl.png',
    periodName: 'Q',
    homeFirst: true, // Australian convention: "Home v Away"
    // ESPN lists a ghost "Sydney Swans" (id 19, abbr GCFC, Gold Coast logo, no games)
    // alongside the real Swans (id 4) and Gold Coast SUNS (id 10).
    excludeTeamIds: ['19'],
    teamStats: 'core', // ESPN only serves AFL team stats from the core API
    keyStats: [
      ['general', 'goals', 'Goals'],
      ['general', 'behinds', 'Behinds'],
      ['general', 'goalAccuracy', 'Goal accuracy %'],
      ['general', 'disposals', 'Disposals'],
      ['general', 'disposalEfficiency', 'Disposal eff. %'],
      ['general', 'inside50s', 'Inside 50s'],
      ['general', 'totalClearances', 'Clearances'],
      ['general', 'tackles', 'Tackles'],
    ],
    standingsCols: ['gamesPlayed', 'wins', 'losses', 'ties', 'points', 'pointsFor', 'pointsAgainst', 'percentage', 'streak'],
  },
];

export const LEAGUE_BY_ID = Object.fromEntries(LEAGUES.map((l) => [l.id, l]));
