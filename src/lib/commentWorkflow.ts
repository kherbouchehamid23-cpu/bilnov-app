// M1 — Système de commentaires unifiés : machine à états, types, priorités,
// responsabilités et types de localisation. Module PUR (aucune dépendance
// prisma/UI) → importable serveur + client, entièrement testable.

export type CommentStatus =
  | 'NEW' | 'ASSIGNED' | 'IN_PROGRESS' | 'ON_HOLD' | 'BLOCKED'
  | 'TO_VERIFY' | 'RESOLVED' | 'VALIDATED' | 'REJECTED'
  | 'CANCELLED' | 'REOPENED' | 'ARCHIVED';

export type CommentPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' | 'CRITICAL';

export type CommentType =
  | 'GENERAL' | 'OBSERVATION' | 'TECHNICAL' | 'QUESTION' | 'INFO_REQUEST'
  | 'INSTRUCTION' | 'DECISION' | 'TASK' | 'RESERVE' | 'NON_CONFORMITY'
  | 'BLOCKER' | 'RISK' | 'VALIDATION_REQUEST' | 'COORDINATION'
  | 'QUALITY' | 'SAFETY' | 'COST' | 'DELAY';

export type ResponsibilityType = 'RESPONSIBLE' | 'APPROVER' | 'CONSULTED' | 'INFORMED';

export type CommentLocationType =
  | 'DWG' | 'PDF' | 'BIM_IFC' | 'PANORAMA_360' | 'PHOTO' | 'VIDEO'
  | 'DOCUMENT' | 'MODEL_3D' | 'AUGMENTED_REALITY' | 'GPS'
  | 'TASK' | 'LOT' | 'SPACE' | 'SITE_DIARY' | 'MEETING';

// Cycle de vie (SFD §4.3) : transitions autorisées depuis chaque statut.
export const STATUS_TRANSITIONS: Record<CommentStatus, CommentStatus[]> = {
  NEW:         ['ASSIGNED', 'CANCELLED'],
  ASSIGNED:    ['IN_PROGRESS', 'ON_HOLD'],
  IN_PROGRESS: ['TO_VERIFY', 'BLOCKED', 'ON_HOLD'],
  ON_HOLD:     ['IN_PROGRESS'],
  BLOCKED:     ['IN_PROGRESS'],
  TO_VERIFY:   ['RESOLVED', 'REJECTED'],
  RESOLVED:    ['VALIDATED', 'REOPENED'],
  VALIDATED:   ['REOPENED', 'ARCHIVED'],
  REJECTED:    ['IN_PROGRESS'],
  REOPENED:    ['IN_PROGRESS'],
  CANCELLED:   ['REOPENED'],
  ARCHIVED:    [],
};

// Transitions réservées à un rôle habilité (canValidate).
export const PRIVILEGED_TRANSITIONS: ReadonlyArray<CommentStatus> = ['VALIDATED', 'ARCHIVED'];

export const STATUS_META: Record<CommentStatus, { label: string; color: string; open: boolean }> = {
  NEW:         { label: 'Nouveau',       color: '#EF4444', open: true },
  ASSIGNED:    { label: 'Affecté',       color: '#F97316', open: true },
  IN_PROGRESS: { label: 'En cours',      color: '#F59E0B', open: true },
  ON_HOLD:     { label: 'En attente',    color: '#A16207', open: true },
  BLOCKED:     { label: 'Bloqué',        color: '#B91C1C', open: true },
  TO_VERIFY:   { label: 'À vérifier',    color: '#7C3AED', open: true },
  RESOLVED:    { label: 'Résolu',        color: '#10B981', open: false },
  VALIDATED:   { label: 'Validé',        color: '#3B82F6', open: false },
  REJECTED:    { label: 'Rejeté',        color: '#DC2626', open: true },
  CANCELLED:   { label: 'Annulé',        color: '#6B7280', open: false },
  REOPENED:    { label: 'Rouvert',       color: '#F59E0B', open: true },
  ARCHIVED:    { label: 'Archivé',       color: '#9CA3AF', open: false },
};

export const PRIORITY_META: Record<CommentPriority, { label: string; color: string; rank: number }> = {
  LOW:      { label: 'Faible',   color: '#94A3B8', rank: 0 },
  NORMAL:   { label: 'Normale',  color: '#3B82F6', rank: 1 },
  HIGH:     { label: 'Élevée',   color: '#F59E0B', rank: 2 },
  URGENT:   { label: 'Urgente',  color: '#EF4444', rank: 3 },
  CRITICAL: { label: 'Critique', color: '#7F1D1D', rank: 4 },
};

export const COMMENT_TYPES: CommentType[] = [
  'GENERAL', 'OBSERVATION', 'TECHNICAL', 'QUESTION', 'INFO_REQUEST', 'INSTRUCTION',
  'DECISION', 'TASK', 'RESERVE', 'NON_CONFORMITY', 'BLOCKER', 'RISK',
  'VALIDATION_REQUEST', 'COORDINATION', 'QUALITY', 'SAFETY', 'COST', 'DELAY',
];
export const RESPONSIBILITY_TYPES: ResponsibilityType[] = ['RESPONSIBLE', 'APPROVER', 'CONSULTED', 'INFORMED'];
export const LOCATION_TYPES: CommentLocationType[] = [
  'DWG', 'PDF', 'BIM_IFC', 'PANORAMA_360', 'PHOTO', 'VIDEO', 'DOCUMENT', 'MODEL_3D',
  'AUGMENTED_REALITY', 'GPS', 'TASK', 'LOT', 'SPACE', 'SITE_DIARY', 'MEETING',
];

const ALL_STATUSES = Object.keys(STATUS_TRANSITIONS) as CommentStatus[];

export function isStatus(s: string): s is CommentStatus { return (ALL_STATUSES as string[]).includes(s); }
export function isPriority(p: string): p is CommentPriority { return p in PRIORITY_META; }
export function isType(t: string): t is CommentType { return (COMMENT_TYPES as string[]).includes(t); }
export function isLocationType(t: string): t is CommentLocationType { return (LOCATION_TYPES as string[]).includes(t); }
export function isResponsibility(r: string): r is ResponsibilityType { return (RESPONSIBILITY_TYPES as string[]).includes(r); }

/** Statuts atteignables depuis `from`. */
export function nextStatuses(from: CommentStatus): CommentStatus[] {
  return STATUS_TRANSITIONS[from] ?? [];
}

/** Transition autorisée ? */
export function canTransition(from: CommentStatus, to: CommentStatus): boolean {
  return nextStatuses(from).includes(to);
}

/** La transition exige-t-elle un rôle habilité (canValidate) ? */
export function requiresPrivilege(to: CommentStatus): boolean {
  return PRIVILEGED_TRANSITIONS.includes(to);
}

/** Une priorité critique déclenche une alerte renforcée (SFD §6). */
export function isCriticalPriority(p: CommentPriority): boolean {
  return p === 'CRITICAL';
}

/** Un statut « ouvert » compte dans les points à traiter (tableau de bord). */
export function isOpen(s: CommentStatus): boolean {
  return STATUS_META[s]?.open ?? false;
}
