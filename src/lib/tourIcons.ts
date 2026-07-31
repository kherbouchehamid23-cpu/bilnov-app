// BILNOV — Doc 1 §10 : bibliothèque d'icônes de hotspots + rendu personnalisable.
// Icônes SVG (path unique, stroke) regroupées en familles Direction / Contenu.
// Utilisé par l'éditeur (sélecteur + aperçu) et le viewer PSV (marqueurs HTML).
// Pur (aucune dépendance) → testable et réutilisable côté serveur comme client.

export type IconFamily = 'direction' | 'contenu';

export interface IconDef {
  id: string;
  label: string;
  family: IconFamily;
  /** Contenu interne du <svg> (paths), tracé en stroke=currentColor. viewBox 0 0 24 24. */
  body: string;
}

// Chaque `body` est tracé sur un viewBox 24x24, stroke=currentColor, fill=none (sauf mention).
export const TOUR_ICONS: IconDef[] = [
  // — Direction —
  { id: 'arrow-forward', label: 'Flèche avant',   family: 'direction', body: '<path d="M12 20V5M6 11l6-6 6 6"/>' },
  { id: 'arrow-left',    label: 'Flèche gauche',  family: 'direction', body: '<path d="M20 12H5M11 6l-6 6 6 6"/>' },
  { id: 'arrow-right',   label: 'Flèche droite',  family: 'direction', body: '<path d="M4 12h15M13 6l6 6-6 6"/>' },
  { id: 'arrow-back',    label: 'Flèche retour',  family: 'direction', body: '<path d="M9 14l-4-4 4-4"/><path d="M5 10h9a5 5 0 0 1 0 10h-1"/>' },
  { id: 'arrow-up',      label: 'Étage supérieur',family: 'direction', body: '<path d="M12 19V6M6 12l6-6 6 6"/><path d="M5 3h14"/>' },
  { id: 'arrow-down',    label: 'Étage inférieur',family: 'direction', body: '<path d="M12 5v13M6 12l6 6 6-6"/><path d="M5 21h14"/>' },
  { id: 'door',          label: 'Porte',          family: 'direction', body: '<path d="M6 3h9a2 2 0 0 1 2 2v16H6zM6 21H4"/><circle cx="13" cy="12" r="1" fill="currentColor" stroke="none"/>' },
  { id: 'entrance',      label: 'Entrée',         family: 'direction', body: '<path d="M15 3h4v18h-4"/><path d="M11 12H3M7 8l-4 4 4 4"/>' },
  { id: 'exit',          label: 'Sortie',         family: 'direction', body: '<path d="M9 3H5v18h4"/><path d="M13 12h8M17 8l4 4-4 4"/>' },
  { id: 'stairs',        label: 'Escalier',       family: 'direction', body: '<path d="M3 20h4v-4h4v-4h4V8h4V4"/>' },
  { id: 'elevator',      label: 'Ascenseur',      family: 'direction', body: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M12 7l-2 3h4zM12 17l-2-3h4"/>' },
  // — Contenu —
  { id: 'image',   label: 'Image',        family: 'contenu', body: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 16l-5-5-9 9"/>' },
  { id: 'camera',  label: 'Caméra',       family: 'contenu', body: '<path d="M3 7h4l2-2h6l2 2h4v12H3z"/><circle cx="12" cy="13" r="3.5"/>' },
  { id: 'pdf',     label: 'PDF',          family: 'contenu', body: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M9 13h1.5a1 1 0 0 1 0 3H9zM9 13v4"/>' },
  { id: 'document',label: 'Document',     family: 'contenu', body: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h6M9 16h6"/>' },
  { id: 'comment', label: 'Commentaire',  family: 'contenu', body: '<path d="M4 5h16v11H9l-4 3v-3H4z"/>' },
  { id: 'info',    label: 'Information',  family: 'contenu', body: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>' },
  { id: 'link',    label: 'Lien',         family: 'contenu', body: '<path d="M9 15l6-6M8 12l-2 2a3 3 0 1 0 4 4l2-2M16 12l2-2a3 3 0 1 0-4-4l-2 2"/>' },
  { id: 'cart',    label: 'Panier',       family: 'contenu', body: '<path d="M3 4h2l2 12h11l2-8H6"/><circle cx="9" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/>' },
  { id: 'shop',    label: 'Boutique',     family: 'contenu', body: '<path d="M4 9l1-5h14l1 5M4 9v11h16V9M4 9h16"/><path d="M9 20v-6h6v6"/>' },
  { id: 'video',   label: 'Vidéo',        family: 'contenu', body: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>' },
  { id: 'youtube', label: 'YouTube',      family: 'contenu', body: '<rect x="3" y="6" width="18" height="12" rx="3"/><path d="M11 9.5l4 2.5-4 2.5z" fill="currentColor" stroke="none"/>' },
  { id: 'play',    label: 'Lecture',      family: 'contenu', body: '<circle cx="12" cy="12" r="9"/><path d="M10 9l5 3-5 3z" fill="currentColor" stroke="none"/>' },
  { id: 'audio',   label: 'Audio',        family: 'contenu', body: '<path d="M4 9h4l5-4v14l-5-4H4zM17 8a5 5 0 0 1 0 8"/>' },
  { id: 'headset', label: 'Casque',       family: 'contenu', body: '<path d="M4 13a8 8 0 0 1 16 0"/><rect x="3" y="13" width="4" height="6" rx="1"/><rect x="17" y="13" width="4" height="6" rx="1"/>' },
  { id: 'mic',     label: 'Microphone',   family: 'contenu', body: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6"/>' },
];

export const TOUR_ICONS_BY_ID: Record<string, IconDef> =
  Object.fromEntries(TOUR_ICONS.map((i) => [i.id, i]));

export function iconsForFamily(family: IconFamily): IconDef[] {
  return TOUR_ICONS.filter((i) => i.family === family);
}

/** Icône par défaut selon le type fin de hotspot (fallback si aucune n'est choisie). */
export function defaultIconFor(kind: string): string {
  switch (kind) {
    case 'DIRECTION': return 'arrow-forward';
    case 'IMAGE':     return 'image';
    case 'PDF':       return 'pdf';
    case 'COMMENT':   return 'comment';
    case 'URL':       return 'link';
    case 'VIDEO':     return 'video';
    case 'AUDIO':     return 'audio';
    default:          return 'info';
  }
}

export interface IconRenderOpts { color?: string | null; size?: number | null; opacity?: number | null; strokeWidth?: number; }

/** Rend une icône en chaîne SVG autonome (utilisable en innerHTML). */
export function iconSvg(iconId: string | null | undefined, opts: IconRenderOpts = {}): string {
  const def = (iconId && TOUR_ICONS_BY_ID[iconId]) || TOUR_ICONS_BY_ID['info'];
  const size = typeof opts.size === 'number' && opts.size > 0 ? opts.size : 24;
  const color = opts.color || 'currentColor';
  const opacity = typeof opts.opacity === 'number' ? Math.max(0, Math.min(1, opts.opacity)) : 1;
  const sw = typeof opts.strokeWidth === 'number' ? opts.strokeWidth : 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" `
    + `fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" `
    + `style="opacity:${opacity}" role="img" aria-hidden="true">${def.body}</svg>`;
}

/** Familles d'icônes pertinentes proposées pour un type de hotspot donné. */
export function familiesForKind(kind: string): IconFamily[] {
  return kind === 'DIRECTION' ? ['direction', 'contenu'] : ['contenu', 'direction'];
}
