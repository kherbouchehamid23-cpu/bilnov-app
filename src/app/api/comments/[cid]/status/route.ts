import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { getCommentWithAccess, commentInclude, logActivity, notify, participantIds } from '@/lib/comments';
import { isStatus, canTransition, requiresPrivilege } from '@/lib/commentWorkflow';
import { CommentStatus, NotificationType } from '@prisma/client';

// POST : transition de statut contrôlée par la machine à états (SFD §4.3/5).
export async function POST(req: NextRequest, { params }: { params: { cid: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const ctx = await getCommentWithAccess(user, params.cid);
    if (!ctx) return apiError('Commentaire introuvable', 'NOT_FOUND', 404);
    if (!ctx.access.canComment && !ctx.access.canValidate) return apiError('Droit insuffisant', 'FORBIDDEN', 403);

    const body = await req.json() as { status?: string; note?: string };
    if (!body.status || !isStatus(body.status)) return apiError('Statut invalide', 'VALIDATION_ERROR', 400);
    const from = ctx.comment.status as CommentStatus;
    const to = body.status as CommentStatus;
    if (from === to) return apiError('Statut inchangé', 'VALIDATION_ERROR', 400);
    if (!canTransition(from, to)) return apiError(`Transition ${from} → ${to} non autorisée`, 'VALIDATION_ERROR', 400);
    if (requiresPrivilege(to) && !ctx.access.canValidate) return apiError('Validation réservée à un rôle habilité', 'FORBIDDEN', 403);

    const now = new Date();
    const updated = await prisma.comment.update({
      where: { id: params.cid },
      data: {
        status: to,
        ...(to === 'RESOLVED' ? { resolvedAt: now } : {}),
        ...(to === 'VALIDATED' ? { validatedAt: now, validatedById: user.sub } : {}),
      },
      include: commentInclude,
    });
    await prisma.commentStatusHistory.create({ data: { commentId: params.cid, previousStatus: from, newStatus: to, changedById: user.sub, note: body.note ?? null } });
    await logActivity(params.cid, user.sub, 'status_changed', { from }, { to });
    await notify(participantIds(ctx.comment), { actorId: user.sub, projectId: ctx.comment.projectId, type: to === 'VALIDATED' ? NotificationType.COMMENT_CLOSED : NotificationType.STATUS_CHANGED, message: `Statut → ${to}` });
    return apiSuccess(updated);
  } catch (e) {
    return apiError(e instanceof Error ? e.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
