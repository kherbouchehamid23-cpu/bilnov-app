// src/lib/tourHotspots.ts
// -----------------------------------------------------------------------------
// Bilnov 360 — Moteur des types de hotspots (Phase 2 du cahier des charges).
//
// Principe (cf. rapport d'analyse) : le type FIN du hotspot est stocké dans
// `content.kind`. Le type DB (enum Prisma existant LINK/TEXT/IMAGE/VIDEO) reste
// grossier -> AUCUNE migration de schéma nécessaire pour ajouter des types.
//
// Ce module est PUR (aucune dépendance React/DOM) et testé par vitest.
// -----------------------------------------------------------------------------

/** Les 12 types fonctionnels demandés (§8.1). */
export type HotspotKind =
  | 'DIRECTION'
  | 'IMAGE'
  | 'GALLERY'
  | 'PDF'
  | 'DESCRIPTION'
  | 'COMMENT'
  | 'URL'
  | 'VIDEO'
  | 'AUDIO'
  | 'FILE'
  | 'PRODUCT'
  | 'INFO';

/** Enum Prisma existant (inchangé). */
export type DbHotspotType = 'LINK' | 'TEXT' | 'IMAGE' | 'VIDEO';

/** Orientation d'arrivée d'un lien Direction (§23). */
export interface ArrivalView {
  yaw: number;
  pitch: number;
  hfov: number;
}

export interface HotspotTypeDef {
  kind: HotspotKind;
  label: string;
  description: string;
  /** Nom d'icône (jeu de traits, pas d'emoji). */
  icon: string;
  /** Mappe vers l'enum DB pour rester rétro-compatible. */
  dbType: DbHotspotType;
  /** Classe CSS Pannellum (direction vs info). */
  cssClass: string;
  /** Direction : une scène cible est obligatoire. */
  needsTarget: boolean;
  /** Champs du formulaire (pilote l'UI). */
  fields: string[];
}

/** Registre unique — source de vérité des types. */
export const HOTSPOT_TYPES: Record<HotspotKind, HotspotTypeDef> = {
  DIRECTION:   { kind: 'DIRECTION',   label: 'Direction',            description: 'Aller vers une autre scène',       icon: 'arrow', dbType: 'LINK',  cssClass: 'pnlm-hotspot bilnov-dir',  needsTarget: true,  fields: ['targetSceneId', 'title', 'returnLink'] },
  IMAGE:       { kind: 'IMAGE',       label: 'Image',                description: 'Afficher une image',               icon: 'image', dbType: 'IMAGE', cssClass: 'pnlm-hotspot bilnov-info', needsTarget: false, fields: ['title', 'url', 'caption'] },
  GALLERY:     { kind: 'GALLERY',     label: 'Galerie',              description: 'Plusieurs images',                 icon: 'image', dbType: 'IMAGE', cssClass: 'pnlm-hotspot bilnov-info', needsTarget: false, fields: ['title', 'images'] },
  PDF:         { kind: 'PDF',         label: 'PDF',                  description: 'Document PDF',                     icon: 'pdf',   dbType: 'TEXT',  cssClass: 'pnlm-hotspot bilnov-info', needsTarget: false, fields: ['title', 'url', 'allowDownload'] },
  DESCRIPTION: { kind: 'DESCRIPTION', label: 'Description',          description: 'Texte descriptif',                 icon: 'text',  dbType: 'TEXT',  cssClass: 'pnlm-hotspot bilnov-info', needsTarget: false, fields: ['title', 'text', 'link'] },
  COMMENT:     { kind: 'COMMENT',     label: 'Commentaire',          description: 'Observation / réserve',            icon: 'chat',  dbType: 'TEXT',  cssClass: 'pnlm-hotspot bilnov-info', needsTarget: false, fields: ['title', 'text', 'status', 'priority'] },
  URL:         { kind: 'URL',         label: 'Lien',                 description: 'Lien externe',                     icon: 'link',  dbType: 'TEXT',  cssClass: 'pnlm-hotspot bilnov-info', needsTarget: false, fields: ['title', 'url', 'openMode'] },
  VIDEO:       { kind: 'VIDEO',       label: 'Vidéo',                description: 'Vidéo YouTube/Vimeo/URL',          icon: 'play',  dbType: 'VIDEO', cssClass: 'pnlm-hotspot bilnov-info', needsTarget: false, fields: ['title', 'url'] },
  AUDIO:       { kind: 'AUDIO',       label: 'Audio',                description: 'Fichier audio',                    icon: 'audio', dbType: 'TEXT',  cssClass: 'pnlm-hotspot bilnov-info', needsTarget: false, fields: ['title', 'url', 'loop'] },
  FILE:        { kind: 'FILE',        label: 'Fichier',              description: 'Document à télécharger',            icon: 'file',  dbType: 'TEXT',  cssClass: 'pnlm-hotspot bilnov-info', needsTarget: false, fields: ['title', 'url', 'allowDownload'] },
  PRODUCT:     { kind: 'PRODUCT',     label: 'Produit',              description: 'Produit Bilnov Store (modulaire)', icon: 'cube',  dbType: 'TEXT',  cssClass: 'pnlm-hotspot bilnov-info', needsTarget: false, fields: ['title', 'productRef', 'url'] },
  INFO:        { kind: 'INFO',        label: 'Info technique',       description: 'Note technique',                   icon: 'info',  dbType: 'TEXT',  cssClass: 'pnlm-hotspot bilnov-info', needsTarget: false, fields: ['title', 'text'] },
};

export const HOTSPOT_KINDS = Object.keys(HOTSPOT_TYPES) as HotspotKind[];

export function isHotspotKind(v: unknown): v is HotspotKind {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(HOTSPOT_TYPES, v);
}

/** Type DB à écrire pour un kind donné. */
export function dbTypeForKind(kind: HotspotKind): DbHotspotType {
  return HOTSPOT_TYPES[kind]?.dbType ?? 'TEXT';
}

/**
 * Retrouve le kind fin depuis un hotspot en base (rétro-compatible).
 * Priorité à `content.kind` ; sinon on déduit de l'ancien type DB.
 */
export function kindFromContent(dbType: string, content: unknown): HotspotKind {
  const c = (content && typeof content === 'object' ? content as Record<string, unknown> : {});
  if (isHotspotKind(c.kind)) return c.kind;
  switch (dbType) {
    case 'LINK':  return 'DIRECTION';
    case 'IMAGE': return 'IMAGE';
    case 'VIDEO': return 'VIDEO';
    case 'TEXT':  return 'DESCRIPTION';
    default:      return 'INFO';
  }
}

/** Échappement anti-XSS pour tout texte affiché (§13, §38). */
export function sanitizeText(input: unknown): string {
  const s = input == null ? '' : String(input);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Valide une URL : http(s) uniquement, jamais javascript:/data: (§15, §38). */
export function isValidUrl(input: unknown, opts: { allowRelative?: boolean } = {}): boolean {
  if (typeof input !== 'string') return false;
  const s = input.trim();
  if (!s) return false;
  if (opts.allowRelative && s.startsWith('/')) return true;
  if (/^(javascript|data|vbscript|file):/i.test(s)) return false;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function clampHfov(n: unknown): number {
  const v = typeof n === 'number' && isFinite(n) ? n : 100;
  return Math.min(120, Math.max(30, v));
}

function isFiniteNum(n: unknown): n is number {
  return typeof n === 'number' && isFinite(n);
}

/** Normalise/borne une orientation d'arrivée depuis un content brut. */
export function normalizeArrival(content: unknown): ArrivalView | null {
  const c = (content && typeof content === 'object' ? content as Record<string, unknown> : null);
  if (!c) return null;
  const a = (c.arrival && typeof c.arrival === 'object' ? c.arrival as Record<string, unknown> : c);
  if (!isFiniteNum(a.yaw) && !isFiniteNum(a.pitch)) return null;
  const yaw = isFiniteNum(a.yaw) ? ((a.yaw % 360) + 360) % 360 : 0;
  const pitch = isFiniteNum(a.pitch) ? Math.min(85, Math.max(-85, a.pitch)) : 0;
  const hfov = clampHfov(a.hfov);
  return { yaw, pitch, hfov };
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

/** Valide le content d'un hotspot selon son kind (avant enregistrement). */
export function validateHotspot(kind: HotspotKind, content: unknown): ValidationResult {
  const errors: string[] = [];
  const c = (content && typeof content === 'object' ? content as Record<string, unknown> : {});
  const def = HOTSPOT_TYPES[kind];
  if (!def) return { ok: false, errors: ['Type de hotspot inconnu.'] };

  if (def.needsTarget && !(typeof c.targetSceneId === 'string' && c.targetSceneId.trim())) {
    errors.push('Une scène cible est requise.');
  }
  switch (kind) {
    case 'IMAGE':
      if (!isValidUrl(c.url, { allowRelative: true })) errors.push("URL d'image invalide.");
      break;
    case 'GALLERY': {
      const imgs = Array.isArray(c.images) ? c.images : [];
      if (imgs.length === 0) errors.push('Ajoutez au moins une image.');
      break;
    }
    case 'PDF':
    case 'AUDIO':
    case 'FILE':
    case 'VIDEO':
    case 'URL':
      if (!isValidUrl(c.url, { allowRelative: true })) errors.push('URL invalide.');
      break;
    case 'DESCRIPTION':
    case 'INFO':
      if (!(typeof c.text === 'string' && c.text.trim())) errors.push('Le texte est requis.');
      break;
    case 'COMMENT':
      if (!(typeof c.text === 'string' && c.text.trim())) errors.push('Le commentaire est requis.');
      break;
    case 'PRODUCT':
      if (!(typeof c.productRef === 'string' && c.productRef.trim()) && !isValidUrl(c.url)) {
        errors.push('Référence produit ou lien requis.');
      }
      break;
    case 'DIRECTION':
      // cible déjà vérifiée ci-dessus
      break;
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Construit un content prêt à enregistrer (kind inclus, longueurs bornées).
 * NB : on stocke le texte BRUT — l'échappement se fait au rendu (React échappe
 * automatiquement, Pannellum échappe ses tooltips). `sanitizeText` reste
 * disponible pour tout endroit qui injecterait du HTML brut.
 */
export function buildContent(kind: HotspotKind, raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw, kind };
  if (typeof out.title === 'string') out.title = out.title.trim().slice(0, 200);
  if (typeof out.text === 'string') out.text = out.text.slice(0, 5000);
  if (typeof out.caption === 'string') out.caption = out.caption.trim().slice(0, 500);
  return out;
}

// -----------------------------------------------------------------------------
// Métadonnées de formulaire (pilotent l'UI du panneau coulissant) — Phase 2.
// -----------------------------------------------------------------------------

export type FieldControl = 'text' | 'textarea' | 'url' | 'scene' | 'select' | 'checkbox' | 'images';

export interface FieldDef {
  name: string;
  label: string;
  control: FieldControl;
  placeholder?: string;
  options?: { value: string; label: string }[];
}

const FIELD_META: Record<string, FieldDef> = {
  targetSceneId: { name: 'targetSceneId', label: 'Scène cible',    control: 'scene' },
  title:         { name: 'title',         label: 'Titre',          control: 'text',     placeholder: 'Titre (optionnel)' },
  text:          { name: 'text',          label: 'Texte',          control: 'textarea', placeholder: 'Votre texte…' },
  url:           { name: 'url',           label: 'Lien / URL',     control: 'url',      placeholder: 'https://…' },
  caption:       { name: 'caption',       label: 'Légende',        control: 'text',     placeholder: 'Légende (optionnel)' },
  link:          { name: 'link',          label: 'Lien associé',   control: 'url',      placeholder: 'https://… (optionnel)' },
  images:        { name: 'images',        label: 'Images',         control: 'images',   placeholder: 'Une URL par ligne' },
  productRef:    { name: 'productRef',    label: 'Référence produit', control: 'text',  placeholder: 'REF-000' },
  allowDownload: { name: 'allowDownload', label: 'Téléchargement autorisé', control: 'checkbox' },
  loop:          { name: 'loop',          label: 'Lecture en boucle', control: 'checkbox' },
  status:        { name: 'status',        label: 'Statut',         control: 'select', options: [
    { value: 'NEW', label: 'Nouveau' }, { value: 'TODO', label: 'À traiter' }, { value: 'DOING', label: 'En cours' }, { value: 'DONE', label: 'Résolu' }, { value: 'CLOSED', label: 'Fermé' },
  ] },
  priority:      { name: 'priority',      label: 'Priorité',       control: 'select', options: [
    { value: 'LOW', label: 'Basse' }, { value: 'NORMAL', label: 'Normale' }, { value: 'HIGH', label: 'Haute' },
  ] },
  returnLink:    { name: 'returnLink',    label: 'Créer aussi le lien retour (B → A)', control: 'checkbox' },
  openMode:      { name: 'openMode',      label: 'Ouverture',      control: 'select', options: [
    { value: 'newTab', label: 'Nouvel onglet' }, { value: 'panel', label: 'Panneau interne' },
  ] },
};

/** Retourne les champs de formulaire à afficher pour un kind. */
export function fieldsFor(kind: HotspotKind): FieldDef[] {
  const def = HOTSPOT_TYPES[kind];
  if (!def) return [];
  return def.fields
    .map((f) => FIELD_META[f])
    .filter((f): f is FieldDef => Boolean(f));
}

export interface HotspotPayload {
  type: DbHotspotType;
  positionYaw: number;
  positionPitch: number;
  targetSceneId: string | null;
  content: Record<string, unknown>;
}

export interface BuildResult {
  ok: boolean;
  errors: string[];
  payload?: HotspotPayload;
}

/**
 * Construit le corps de requête POST à partir des valeurs de formulaire et de
 * la position cliquée. Valide, sanitize, sépare targetSceneId (colonne) du
 * content (Json). Fonction PURE -> testable.
 */
export function buildHotspotPayload(
  kind: HotspotKind,
  form: Record<string, unknown>,
  draft: { yaw: number; pitch: number } | null,
): BuildResult {
  const errors: string[] = [];
  if (!draft || !isFiniteNum(draft.yaw) || !isFiniteNum(draft.pitch)) {
    errors.push('Position invalide — cliquez dans le panorama.');
  }
  const v = validateHotspot(kind, form);
  errors.push(...v.errors);
  if (errors.length) return { ok: false, errors };

  const { targetSceneId, ...rest } = form;
  const content = buildContent(kind, rest);
  const arrival = normalizeArrival(form);
  if (arrival) content.arrival = arrival;

  return {
    ok: true,
    errors: [],
    payload: {
      type: dbTypeForKind(kind),
      positionYaw: draft!.yaw,
      positionPitch: draft!.pitch,
      targetSceneId: kind === 'DIRECTION' && typeof targetSceneId === 'string' && targetSceneId.trim()
        ? targetSceneId
        : null,
      content,
    },
  };
}


/** Construit le hotspot RETOUR (B->A) d'un lien bidirectionnel (§22). */
export function buildReturnPayload(
  forward: HotspotPayload,
  sourceSceneId: string,
  title?: string,
): HotspotPayload | null {
  if (!forward.targetSceneId) return null;
  const yaw = (((forward.positionYaw + 180) % 360) + 360) % 360;
  const content: Record<string, unknown> = { kind: 'DIRECTION' };
  if (title && title.trim()) content.title = title.trim().slice(0, 200);
  return { type: 'LINK', positionYaw: yaw, positionPitch: 0, targetSceneId: sourceSceneId, content };
}
