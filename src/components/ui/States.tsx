'use client';

// Amelioration UI/UX (doc §15) — etats d'interface reutilisables.
// Composants presentationnels, opt-in : ne changent rien tant qu'une page ne les
// importe pas. Reutilisent les classes existantes (.skeleton, .btn-secondary) et
// les classes .ui-* ajoutees dans globals.css (Lot 7).

import type { ReactNode } from 'react';

export function Skeleton({
  w,
  h = 14,
  r = 8,
  className = '',
}: {
  w?: number | string;
  h?: number | string;
  r?: number;
  className?: string;
}) {
  return (
    <span
      className={`skeleton ${className}`}
      style={{ display: 'block', width: w ?? '100%', height: h, borderRadius: r }}
      aria-hidden
    />
  );
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <span
          key={i}
          className="skeleton"
          style={{ display: 'block', height: 12, borderRadius: 6, width: i === lines - 1 ? '55%' : '100%', marginBottom: 9 }}
        />
      ))}
    </div>
  );
}

export function InlineLoader({ label = 'Chargement…' }: { label?: string }) {
  return (
    <span className="ui-loader" role="status" aria-live="polite">
      <span className="ui-spinner" aria-hidden />
      {label}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="ui-state" role="status">
      {icon ? (
        <div className="ui-state-icon" aria-hidden>
          {icon}
        </div>
      ) : null}
      <h3 className="ui-state-title">{title}</h3>
      {description ? <p className="ui-state-desc">{description}</p> : null}
      {action ? <div className="ui-state-actions">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = 'Une erreur est survenue',
  description,
  onRetry,
  retryLabel = 'Réessayer',
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="ui-state ui-state-error" role="alert">
      <div className="ui-state-icon ui-state-icon-error" aria-hidden>
        !
      </div>
      <h3 className="ui-state-title">{title}</h3>
      {description ? <p className="ui-state-desc">{description}</p> : null}
      {onRetry ? (
        <div className="ui-state-actions">
          <button type="button" className="btn-secondary" onClick={onRetry}>
            {retryLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}
