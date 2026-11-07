import { getStandings } from '../api.js';
import { useApp, usePoll } from '../store.jsx';
import { Empty, ErrorBox, Logo, Spinner, Star } from './common.jsx';

export default function Standings({ lg }) {
  const { openTeam, isFav, toggleFav } = useApp();
  const { data, error, loading, refresh } = usePoll(() => getStandings(lg), `standings:${lg.id}`);

  if (loading && !data) return <Spinner label="Loading standings…" />;
  if (error && !data) return <ErrorBox error={error} onRetry={refresh} />;
  if (!data?.length) return <Empty title="Standings not available" icon="📊" />;

  return (
    <div className="standings">
      {data.map((g) => (
        <section className="panel" key={g.name}>
          <h4>{g.name}</h4>
          <div className="table-wrap">
            <table className="stand">
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th className="left">Team</th>
                  {g.cols.map((c) => (
                    <th key={c.key} title={c.title}>
                      {c.label}
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r, i) => {
                  const clickable = r.team.id && !String(r.team.id).startsWith('sq-');
                  return (
                    <tr
                      key={r.team.id || r.team.name}
                      className={`${isFav(lg.id, r.team.id) ? 'fav' : ''} ${clickable ? 'clickable' : ''}`}
                      onClick={() => clickable && openTeam(lg.id, r.team.id)}
                      title={r.note || ''}
                    >
                      <td className="num muted">{i + 1}</td>
                      <td className="left team-cell">
                        {r.noteColor && <i className="seed-bar" style={{ background: r.noteColor }} />}
                        <span className="cell-flex">
                          <Logo src={r.team.logo} alt={r.team.name} size={20} />
                          <span>{r.team.name}</span>
                        </span>
                      </td>
                      {g.cols.map((c) => (
                        <td key={c.key}>{r.values[c.key]}</td>
                      ))}
                      <td>{clickable && <Star on={isFav(lg.id, r.team.id)} onClick={() => toggleFav(lg.id, r.team)} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
