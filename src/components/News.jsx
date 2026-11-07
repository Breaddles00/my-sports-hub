import { getNews, openExternal } from '../api.js';
import { usePoll, useNow } from '../store.jsx';
import { Empty, ErrorBox, Spinner, timeAgo } from './common.jsx';

export default function News({ lg }) {
  const now = useNow();
  const { data, error, loading, refresh } = usePoll(() => getNews(lg), `news:${lg.id}`);
  if (loading && !data) return <Spinner label="Loading news…" />;
  if (error && !data) return <ErrorBox error={error} onRetry={refresh} />;
  if (!data?.length) return <Empty title="No news right now" icon="📰" />;
  return (
    <div className="news-grid">
      {data.map((a) => (
        <article key={a.id} className="news-card" onClick={() => openExternal(a.link)} title="Open in browser">
          {a.image ? <img src={a.image} alt="" loading="lazy" /> : <div className="news-ph" />}
          <div className="news-body">
            <h4>{a.headline}</h4>
            {a.description && <p>{a.description}</p>}
            <span className="muted small">
              {timeAgo(a.published, now)}
              {a.byline ? ` · ${a.byline}` : ''}
            </span>
          </div>
        </article>
      ))}
    </div>
  );
}
