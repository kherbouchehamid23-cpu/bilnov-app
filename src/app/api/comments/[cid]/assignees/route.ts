import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { getCommentWithAccess, logActivity, notify } from '@/lib/comments';
import { isResponsibility } from '@/lib/commentWorkflow';
import { ResponsibilityType, NotificationType } from '@prisma/client';

// POST : affecter un intervenant/entreprise (SFD §4.2).
export async function POST(req: NextRequest, { params }: { params: { cid: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const ctx = await getCommentWithAccess(user, params.cid);
    if (!ctx) return apiError('Commentaire introuvable', 'NOT_FOUND', 404);
    if (!ctx.access.canComment) return apiError('Droit requis', 'FORBIDDEN', 403);
    const body = await req.json() as { userId?: string; companyId?: string; responsibility?: string };
    if (!body.userId && !body.companyId) return apiError('userId ou companyId requis', 'VALIDATION_ERROR', 400);
    const created = await prisma.commentAssignee.create({
      data: {
        commentId: params.cid, userId: body.userId ?? null, companyId: body.companyId ?? null,
        responsibility: (body.responsibility && isResponsibility(body.responsibility) ? body.responsibility : 'RESPONSIBLE') as ResponsibilityType,
        assignedById: user.sub,
      },
    });
    await logActivity(params.cid, user.sub, 'assigned', undefined, { to: body.userId ?? body.companyId });
    await notify([body.userId], { actorId: user.sub, projectId: ctx.comment.projectId, type: NotificationType.ASSIGNED, message: 'Vous avez été affecté à un commentaire' });
    return apiSuccess(created, 201);
  } catch (e) {
    return apiError(e instanceof Error ? e.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}

// DELETE ?assigneeId=... : retirer une affectation.
export async function DELETE(req: NextRequest, { params }: { params: { cid: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const ctx = await getCommentWithAccess(user, params.cid);
    if (!ctx) return apiError('Commentaire introuvable', 'NOT_FOUND', 404);
    if (!ctx.access.canComment) return apiError('Droit requis', 'FORBIDDEN', 403);
    const assigneeId = req.nextUrl.searchParams.get('assigneeId');
    if (!assigneeId) return apiError('assigneeId requis', 'VALIDATION_ERROR', 400);
    await prisma.commentAssignee.deleteMany({ where: { id: assigneeId, commentId: params.cid } });
    await logActivity(params.cid, user.sub, 'unassigned', { assigneeId });
    return apiSuccess({ id: assigneeId });
  } catch (e) {
    return apiError(e instanceof Error ? e.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
