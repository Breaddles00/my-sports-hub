import { LEAGUES } from '../leagues.js';
import { seasonPhase } from '../api.js';
import { useApp, useNow } from '../store.jsx';
import GameCard from './GameCard.jsx';
import { Empty, Logo, Spinner } from './common.jsx';
import { SeasonCard, hasCountdown, shortCountdown } from './SeasonCountdown.jsx';

export default function Home({ hub, seasons = {}, onNavigate }) {
  const { favorites, settings, openTeam } = useApp();
  const now = useNow(60000);
  const leagues = LEAGUES.filter((l) => !settings.hiddenLeagues.includes(l.id));
  // Off-season leagues: ESPN still serves their last game day, which isn't "today's slate".
  const isOff = (l) => seasonPhase(hub.data?.[l.id]) === 'off';
  const inSeason = leagues.filter((l) => !isOff(l));
  const countdowns = leagues.filter((l) => seasons[l.id] && (seasons[l.id].phase === 'off' || hasCountdown(seasons[l.id], now)));
  const all = inSeason.flatMap((l) => hub.data?.[l.id]?.events || []);
  const live = all.filter((g) => g.state === 'in');
  const favKeys = new Set(Object.keys(favorites));
  const favGames = all.filter((g) => g.competitors.some((c) => favKeys.has(`${g.leagueId}:${c.id}`)));
  const favList = Object.values(favorites);

  if (!hub.data && hub.loading) return <Spinner label="Loading every league…" />;

  return (
    <div className="home">
      <section className="home-hero">
        <div>
          <h1>
            {live.length ? (
              <>
                <span className="live-dot big" /> {live.length} game{live.length === 1 ? '' : 's'} live right now
              </>
            ) : (
              'Your sports, live'
            )}
          </h1>
          <p className="muted">
            {all.length} games on today's slates across {inSeason.length} leagues
            {inSeason.length < leagues.length && ` (${leagues.length - inSeason.length} in the off-season)`} · times shown in your local time zone (
            {Intl.DateTimeFormat().resolvedOptions().timeZone})
          </p>
        </div>
        <div className="league-pills">
          {leagues.map((l) => {
            const evs = hub.data?.[l.id]?.events || [];
            const n = evs.filter((e) => e.state === 'in').length;
            const off = isOff(l);
            const cd = off ? shortCountdown(seasons[l.id], now) : null;
            const status = hub.data?.[l.id]?.error
              ? 'unavailable'
              : n
                ? `${n} live`
                : off
                  ? cd
                    ? /^(Today|Tomorrow)$/.test(cd)
                      ? `Back ${cd.toLowerCase()}`
                      : cd === 'Starting now'
                        ? cd
                        : `Back in ${cd}`
                    : 'Off-season'
                  : `${evs.length} game${evs.length === 1 ? '' : 's'}`;
            return (
              <button key={l.id} className={`league-pill ${off ? 'off' : ''}`} style={{ '--lg': l.accent }} onClick={() => onNavigate(l.id)}>
                <strong>{l.name}</strong>
                <span>{status}</span>
              </button>
            );
          })}
        </div>
      </section>

      {live.length > 0 && (
        <section>
          <h2 className="section-title">
            <span className="live-dot" /> Live now
          </h2>
          <div className="game-grid">
            {live.map((g) => (
              <GameCard key={g.leagueId + g.id} g={g} showLeague />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="section-title">
          ★ My teams
          {favList.length > 0 && (
            <button className="link small" onClick={() => onNavigate('starred')}>
              News, stats & depth charts →
            </button>
          )}
        </h2>
        {favList.length === 0 ? (
          <Empty title="You're not following any teams yet" icon="☆">
            Click the ☆ next to any team on a scoreboard, standings table or Teams tab. Followed teams show here and trigger desktop alerts when they score.
          </Empty>
        ) : (
          <>
            <div className="fav-chips">
              {favList.map((f) => (
                <button key={`${f.leagueId}:${f.id}`} className="fav-chip" onClick={() => openTeam(f.leagueId, f.id)}>
                  <Logo src={f.logo} alt={f.name} size={20} /> {f.name}
                  <span className="muted small">{LEAGUES.find((l) => l.id === f.leagueId)?.name}</span>
                </button>
              ))}
            </div>
            {favGames.length ? (
              <div className="game-grid">
                {favGames
                  .filter((g) => g.state !== 'in')
                  .map((g) => (
                    <GameCard key={g.leagueId + g.id} g={g} showLeague showDate />
                  ))}
              </div>
            ) : (
              <p className="muted">None of your teams are on the current slates. Click a team above for its full schedule.</p>
            )}
          </>
        )}
      </section>

      {countdowns.length > 0 && (
        <section>
          <h2 className="section-title">⏳ Season countdowns</h2>
          <div className="ssn-grid">
            {countdowns.map((l) => (
              <SeasonCard key={l.id} lg={l} info={seasons[l.id]} onClick={() => onNavigate(l.id)} />
            ))}
          </div>
        </section>
      )}

      {inSeason.map((l) => {
        const evs = (hub.data?.[l.id]?.events || []).filter((g) => g.state !== 'in');
        if (!evs.length) return null;
        return (
          <section key={l.id}>
            <h2 className="section-title">
              <span className="lg-dot" style={{ background: l.accent }} /> {l.full}
              <button className="link small" onClick={() => onNavigate(l.id)}>
                Full scoreboard →
              </button>
            </h2>
            <div className="game-grid compact-grid">
              {evs.slice(0, 8).map((g) => (
                <GameCard key={g.id} g={g} showDate compact />
              ))}
            </div>
            {evs.length > 8 && (
              <button className="link small more" onClick={() => onNavigate(l.id)}>
                + {evs.length - 8} more games
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}
