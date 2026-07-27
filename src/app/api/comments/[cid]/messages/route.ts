import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { getCommentWithAccess, logActivity, notify, participantIds } from '@/lib/comments';
import { NotificationType } from '@prisma/client';

// POST : ajouter une réponse au fil de discussion (SFD §8).
export async function POST(req: NextRequest, { params }: { params: { cid: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const ctx = await getCommentWithAccess(user, params.cid);
    if (!ctx) return apiError('Commentaire introuvable', 'NOT_FOUND', 404);
    if (!ctx.access.canReply && !ctx.access.canComment) return apiError('Droit de répondre requis', 'FORBIDDEN', 403);

    const body = await req.json() as { body?: string; parentMessageId?: string | null };
    if (!body.body || !body.body.trim()) return apiError('Message vide', 'VALIDATION_ERROR', 400);
    const message = await prisma.commentMessage.create({
      data: { commentId: params.cid, authorId: user.sub, parentMessageId: body.parentMessageId ?? null, body: body.body },
      include: { author: { select: { id: true, firstName: true, lastName: true } } },
    });
    await logActivity(params.cid, user.sub, 'replied');
    await notify(participantIds(ctx.comment), { actorId: user.sub, projectId: ctx.comment.projectId, type: NotificationType.COMMENT_REPLIED, message: 'Nouvelle réponse' });
    return apiSuccess(message, 201);
  } catch (e) {
    return apiError(e instanceof Error ? e.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
