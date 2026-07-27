import { prisma } from '@/lib/prisma';
import { getProjectAccess, type ProjectAccess } from '@/lib/access';
import type { JwtPayload } from '@/lib/auth';
import { NotificationType, Prisma } from '@prisma/client';

// Forme d'inclusion standard d'un commentaire central (M1).
export const commentInclude = {
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  assignees: true,
  locations: { where: { deletedAt: null } },
  messages: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' as const },
    include: { author: { select: { id: true, firstName: true, lastName: true } } },
  },
  attachments: { where: { deletedAt: null } },
  history: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.CommentInclude;

// Résout un commentaire + l'accès projet de l'utilisateur, ou null.
export async function getCommentWithAccess(user: JwtPayload, commentId: string): Promise<
  { comment: { id: string; projectId: string; status: string; createdById: string; assignees: { userId: string | null }[] }; access: ProjectAccess } | null
> {
  const comment = await prisma.comment.findFirst({
    where: { id: commentId, deletedAt: null },
    select: { id: true, projectId: true, status: true, createdById: true, assignees: { select: { userId: true } } },
  });
  if (!comment) return null;
  const access = await getProjectAccess(user, comment.projectId);
  if (!access) return null;
  return { comment, access };
}

export async function logActivity(commentId: string, userId: string, action: string, oldValues?: unknown, newValues?: unknown): Promise<void> {
  await prisma.commentActivityLog.create({
    data: {
      commentId, userId, action,
      ...(oldValues !== undefined ? { oldValues: oldValues as Prisma.InputJsonValue } : {}),
      ...(newValues !== undefined ? { newValues: newValues as Prisma.InputJsonValue } : {}),
    },
  });
}

export async function notify(userIds: (string | null | undefined)[], opts: { actorId: string; projectId: string; type: NotificationType; message: string }): Promise<void> {
  const targets = [...new Set(userIds.filter((id): id is string => !!id))].filter((id) => id !== opts.actorId);
  if (targets.length === 0) return;
  await prisma.notification.createMany({
    data: targets.map((userId) => ({ userId, actorId: opts.actorId, projectId: opts.projectId, type: opts.type, message: opts.message })),
  });
}

export function participantIds(comment: { createdById: string; assignees: { userId: string | null }[] }): string[] {
  return [comment.createdById, ...comment.assignees.map((a) => a.userId).filter((x): x is string => !!x)];
}
