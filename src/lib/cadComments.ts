import { prisma } from '@/lib/prisma';
import { Prisma, CadPriority, CadStatus, NotificationType } from '@prisma/client';

// Couleur + libellé par statut (marqueurs §11 et badges UI).
export const STATUS_META: Record<CadStatus, { color: string; label: string }> = {
  OPEN:        { color: '#EF4444', label: 'Ouvert' },
  IN_PROGRESS: { color: '#F59E0B', label: 'En cours' },
  RESOLVED:    { color: '#10B981', label: 'Résolu' },
  VALIDATED:   { color: '#3B82F6', label: 'Validé' },
  CLOSED:      { color: '#6B7280', label: 'Clôturé' },
  ARCHIVED:    { color: '#9CA3AF', label: 'Archivé' },
};

export function isStatus(v: unknown): v is CadStatus {
  return typeof v === 'string' && v in CadStatus;
}
export function isPriority(v: unknown): v is CadPriority {
  return typeof v === 'string' && v in CadPriority;
}
export function statusColor(status: CadStatus): string {
  return STATUS_META[status]?.color ?? '#EF4444';
}

// Include commun pour renvoyer une fiche complète (auteur, responsable,
// discussion, historique, pièces jointes).
export const commentInclude = {
  author:      { select: { id: true, firstName: true, lastName: true } },
  assignee:    { select: { id: true, firstName: true, lastName: true } },
  replies:     { include: { author: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { createdAt: 'asc' } },
  events:      { include: { actor:  { select: { id: true, firstName: true, lastName: true } } }, orderBy: { createdAt: 'asc' } },
  attachments: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.CadAnnotationInclude;

export async function logEvent(
  annotationId: string,
  actorId: string,
  type: string,
  meta?: Prisma.InputJsonValue,
) {
  return prisma.cadAnnotationEvent.create({
    data: { annotationId, actorId, type, ...(meta !== undefined ? { meta } : {}) },
  });
}

// Crée des notifications pour des destinataires (dédupliqués, hors acteur).
export async function notify(params: {
  recipientIds: (string | null | undefined)[];
  actorId: string;
  type: NotificationType;
  message: string;
  projectId?: string;
  fileId?: string;
  annotationId?: string;
}): Promise<void> {
  const recips = [...new Set(params.recipientIds.filter((x): x is string => !!x))]
    .filter((id) => id !== params.actorId);
  if (recips.length === 0) return;
  await prisma.notification.createMany({
    data: recips.map((userId) => ({
      userId,
      actorId: params.actorId,
      type: params.type,
      message: params.message,
      projectId: params.projectId ?? null,
      fileId: params.fileId ?? null,
      annotationId: params.annotationId ?? null,
    })),
  });
}

// Participants à notifier par défaut : auteur + responsable + répondants.
export async function participantIds(annotationId: string): Promise<string[]> {
  const ann = await prisma.cadAnnotation.findUnique({
    where: { id: annotationId },
    select: { authorId: true, assigneeId: true, replies: { select: { authorId: true } } },
  });
  if (!ann) return [];
  const ids = [ann.authorId, ann.assigneeId, ...ann.replies.map((r) => r.authorId)];
  return [...new Set(ids.filter((x): x is string => !!x))];
}
