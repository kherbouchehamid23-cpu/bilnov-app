// Métadonnées de statut/priorité côté client (couleurs marqueurs §11, libellés).
export type CadStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'VALIDATED' | 'CLOSED' | 'ARCHIVED';
export type CadPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export const STATUS_META: Record<CadStatus, { color: string; label: string; dot: string }> = {
  OPEN:        { color: '#EF4444', label: 'Ouvert',   dot: '🔴' },
  IN_PROGRESS: { color: '#F59E0B', label: 'En cours', dot: '🟠' },
  RESOLVED:    { color: '#10B981', label: 'Résolu',   dot: '🟢' },
  VALIDATED:   { color: '#3B82F6', label: 'Validé',   dot: '🔵' },
  CLOSED:      { color: '#6B7280', label: 'Clôturé',  dot: '⚪' },
  ARCHIVED:    { color: '#9CA3AF', label: 'Archivé',  dot: '⚪' },
};

export const STATUS_ORDER: CadStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'VALIDATED', 'CLOSED', 'ARCHIVED'];

export const PRIORITY_META: Record<CadPriority, { color: string; label: string }> = {
  LOW:    { color: '#94A3B8', label: 'Basse' },
  NORMAL: { color: '#3B82F6', label: 'Normale' },
  HIGH:   { color: '#F59E0B', label: 'Haute' },
  URGENT: { color: '#EF4444', label: 'Urgente' },
};

export const PRIORITY_ORDER: CadPriority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

export function statusColor(s: string): string {
  return STATUS_META[s as CadStatus]?.color ?? '#EF4444';
}
export function statusLabel(s: string): string {
  return STATUS_META[s as CadStatus]?.label ?? s;
}

// Libellés lisibles des événements d'historique (§8).
export function eventLabel(type: string, meta: unknown): string {
  const m = (meta ?? {}) as Record<string, unknown>;
  switch (type) {
    case 'created': return 'Création du commentaire';
    case 'status_changed': return `Statut : ${statusLabel(String(m.from))} → ${statusLabel(String(m.to))}`;
    case 'assigned': return m.to ? 'Responsable assigné' : 'Responsable retiré';
    case 'replied': return 'Réponse ajoutée';
    case 'attachment_added': return `Pièce jointe ajoutée${m.name ? ' : ' + m.name : ''}`;
    case 'priority_changed': return 'Priorité modifiée';
    case 'due_changed': return "Date d'échéance modifiée";
    case 'edited': return 'Contenu modifié';
    default: return type;
  }
}
