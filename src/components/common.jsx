import { useEffect, useState } from 'react';

export function Logo({ src, alt = '', size = 28, className = '' }) {
  const [bad, setBad] = useState(false);
  if (!src || bad) {
    const initials = (alt || '?')
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .slice(0, 3)
      .toUpperCase();
    return (
      <span className={`logo-fallback ${className}`} style={{ width: size, height: size, fontSize: size * 0.34 }}>
        {initials}
      </span>
    );
  }
  return (
    <img
      className={`logo ${className}`}
      src={src}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      draggable={false}
      onError={() => setBad(true)}
    />
  );
}

export const Spinner = ({ label = 'Loading…' }) => (
  <div className="center-state">
    <div className="spinner" />
    <span>{label}</span>
  </div>
);

export const ErrorBox = ({ error, onRetry }) => (
  <div className="center-state error">
    <div className="state-icon">⚠</div>
    <div>Couldn't load data</div>
    <small>{error}</small>
    {onRetry && (
      <button className="btn" onClick={onRetry}>
        Try again
      </button>
    )}
  </div>
);

export const Empty = ({ title, children, icon = '◌' }) => (
  <div className="center-state">
    <div className="state-icon">{icon}</div>
    <div>{title}</div>
    {children && <small>{children}</small>}
  </div>
);

export const LiveDot = () => <span className="live-dot" aria-hidden="true" />;

export function Star({ on, onClick, title }) {
  return (
    <button
      className={`star ${on ? 'on' : ''}`}
      title={title || (on ? 'Unfollow team' : 'Follow team')}
      aria-pressed={on}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {on ? '★' : '☆'}
    </button>
  );
}

export function Tabs({ tabs, value, onChange, className = '' }) {
  return (
    <div className={`tabs ${className}`} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          className={`tab ${value === t.id ? 'active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
          {t.badge ? <span className="tab-badge">{t.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Drawer({ onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className={`drawer ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <button className="drawer-close" onClick={onClose} title="Close (Esc)">
          ✕
        </button>
        {children}
      </aside>
    </div>
  );
}

export function timeAgo(date, now = Date.now()) {
  if (!date) return '';
  const s = Math.round((now - new Date(date).getTime()) / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}
