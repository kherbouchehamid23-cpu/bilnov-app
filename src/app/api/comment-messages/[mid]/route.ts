import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { getProjectAccess } from '@/lib/access';
import { logActivity } from '@/lib/comments';

async function loadMessage(mid: string) {
  return prisma.commentMessage.findFirst({
    where: { id: mid, deletedAt: null },
    select: { id: true, authorId: true, commentId: true, comment: { select: { projectId: true } } },
  });
}

// PATCH : éditer son propre message (SFD §8).
export async function PATCH(req: NextRequest, { params }: { params: { mid: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const m = await loadMessage(params.mid);
    if (!m) return apiError('Message introuvable', 'NOT_FOUND', 404);
    if (m.authorId !== user.sub) return apiError('Édition non autorisée', 'FORBIDDEN', 403);
    const body = await req.json() as { body?: string };
    if (!body.body || !body.body.trim()) return apiError('Message vide', 'VALIDATION_ERROR', 400);
    const updated = await prisma.commentMessage.update({
      where: { id: params.mid }, data: { body: body.body, editedAt: new Date() },
      include: { author: { select: { id: true, firstName: true, lastName: true } } },
    });
    await logActivity(m.commentId, user.sub, 'edited');
    return apiSuccess(updated);
  } catch (e) {
    return apiError(e instanceof Error ? e.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}

// DELETE : suppression logique de son propre message (ou gestionnaire).
export async function DELETE(req: NextRequest, { params }: { params: { mid: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const m = await loadMessage(params.mid);
    if (!m) return apiError('Message introuvable', 'NOT_FOUND', 404);
    const access = await getProjectAccess(user, m.comment.projectId);
    if (!access || (m.authorId !== user.sub && !access.canManage)) return apiError('Suppression non autorisée', 'FORBIDDEN', 403);
    await prisma.commentMessage.update({ where: { id: params.mid }, data: { deletedAt: new Date() } });
    await logActivity(m.commentId, user.sub, 'message_deleted');
    return apiSuccess({ id: params.mid });
  } catch (e) {
    return apiError(e instanceof Error ? e.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
