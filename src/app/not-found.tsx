import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Page introuvable — Bilnov',
  description: "La page demandée n'existe pas ou a été déplacée.",
};

// Amélioration UI/UX responsive (doc §15) — état « page introuvable » (404).
// Remplace la page 404 par défaut de Next.js (anglaise, non stylée) par une
// page de marque, en français, cohérente avec l'univers immersif du site.
// 100 % additif : n'affecte aucune route existante.
export default function NotFound() {
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
            color: '#93dcf2',
            textTransform: 'uppercase',
          }}
        >
          Erreur 404
        </div>
        <h1
          style={{
            fontFamily: 'Syne, sans-serif',
            fontSize: 'clamp(40px,9vw,72px)',
            fontWeight: 700,
            lineHeight: 1.02,
            letterSpacing: '-.02em',
            margin: '14px 0 0',
            color: '#f4f7fd',
          }}
        >
          <span className="lg-grad">Page introuvable</span>
        </h1>
        <p
          className="break-anywhere"
          style={{ color: '#9fb0c9', fontSize: 16, lineHeight: 1.6, margin: '16px auto 0', maxWidth: '42ch' }}
        >
          La page que vous cherchez a été déplacée, renommée, ou n&apos;existe pas. Vérifiez l&apos;adresse saisie ou
          revenez à l&apos;accueil.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginTop: 28 }}>
          <Link
            href="/"
            className="lg-pill-solid"
            style={{ padding: '13px 22px', borderRadius: 13, fontWeight: 500, fontSize: 15 }}
          >
            Retour à l&apos;accueil
          </Link>
          <Link
            href="/dashboard"
            className="lg-pill-ghost"
            style={{ padding: '13px 22px', borderRadius: 13, fontWeight: 500, fontSize: 15 }}
          >
            Mes projets
          </Link>
        </div>
      </div>
    </main>
  );
}
