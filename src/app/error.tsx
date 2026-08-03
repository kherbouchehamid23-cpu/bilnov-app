'use client';

import { useEffect } from 'react';
import Link from 'next/link';

// Amélioration UI/UX responsive (doc §15) — état « erreur » global.
// Filet de sécurité (error boundary) pour tout segment sans boundary propre :
// remplace l'écran d'erreur brut par une page de marque avec une action de
// reprise (« réessayer »). 100 % additif : ne s'affiche qu'en cas d'erreur.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Trace côté client pour diagnostic (visible dans la console navigateur).
    // eslint-disable-next-line no-console
    console.error('[Bilnov] Erreur non gérée :', error);
  }, [error]);

  return (
    <main
      className="lg-immersif safe-x"
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        textAlign: 'center',
        overflowX: 'hidden',
      }}
    >
      <div style={{ maxWidth: 480 }}>
        <div
          aria-hidden
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 13,
            letterSpacing: '.22em',
            color: '#ffb4a2',
            textTransform: 'uppercase',
          }}
        >
          Une erreur est survenue
        </div>
        <h1
          style={{
            fontFamily: 'Syne, sans-serif',
            fontSize: 'clamp(32px,7vw,52px)',
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: '-.02em',
            margin: '14px 0 0',
            color: '#f4f7fd',
          }}
        >
          <span className="lg-grad">Quelque chose a mal tourné</span>
        </h1>
        <p
          className="break-anywhere"
          style={{ color: '#9fb0c9', fontSize: 16, lineHeight: 1.6, margin: '16px auto 0', maxWidth: '44ch' }}
        >
          Nous n&apos;avons pas pu afficher cette page. Vous pouvez réessayer&nbsp;; si le problème persiste, revenez à
          l&apos;accueil.
        </p>
        {error?.digest ? (
          <p
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 11,
              color: '#6b7c98',
              marginTop: 12,
            }}
          >
            Référence&nbsp;: {error.digest}
          </p>
        ) : null}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginTop: 28 }}>
          <button
            type="button"
            onClick={() => reset()}
            className="lg-pill-solid"
            style={{ padding: '13px 22px', borderRadius: 13, fontWeight: 500, fontSize: 15, cursor: 'pointer', border: 'none' }}
          >
            Réessayer
          </button>
          <Link
            href="/"
            className="lg-pill-ghost"
            style={{ padding: '13px 22px', borderRadius: 13, fontWeight: 500, fontSize: 15 }}
          >
            Retour à l&apos;accueil
          </Link>
        </div>
      </div>
    </main>
  );
}
