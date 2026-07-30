// src/lib/tourShare.ts
// -----------------------------------------------------------------------------
// Bilnov 360 — V6 : partage public d'une visite par lien / iframe.
// Module PUR (aucune dépendance React/DOM/Prisma) -> testé par vitest.
// La GÉNÉRATION du jeton se fait côté serveur (crypto.randomUUID) ; ici on
// valide le format et on construit les URLs / le code d'intégration.
// -----------------------------------------------------------------------------

/** Chemin relatif de la visite publique. */
export function publicPath(token: string): string {
  return `/public/${encodeURIComponent(token)}`;
}

/** URL absolue de partage (origin sans slash final + chemin public). */
export function buildShareUrl(origin: string, token: string): string {
  const base = (origin || '').replace(/\/+$/, '');
  return `${base}${publicPath(token)}`;
}

/**
 * Valide le format d'un jeton public : uniquement [A-Za-z0-9_-], longueur
 * 16..64 (couvre un UUID v4 avec ou sans tirets). Rejette tout le reste pour
 * éviter les lookups abusifs / injections de chemin.
 */
export function isValidShareToken(token: unknown): boolean {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(token);
}

export interface EmbedOptions {
  width?: string;   // ex. '100%'
  height?: string;  // ex. '480'
  title?: string;
}

/** Code <iframe> d'intégration prêt à copier-coller. */
export function buildEmbedCode(origin: string, token: string, opts: EmbedOptions = {}): string {
  const url = buildShareUrl(origin, token);
  const width = opts.width ?? '100%';
  const height = opts.height ?? '480';
  const title = (opts.title ?? 'Visite virtuelle Bilnov').replace(/"/g, '&quot;');
  return `<iframe src="${url}" width="${width}" height="${height}" style="border:0;border-radius:12px" allowfullscreen allow="fullscreen; gyroscope; accelerometer" title="${title}"></iframe>`;
}
