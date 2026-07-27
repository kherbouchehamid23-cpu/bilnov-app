import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { getProjectAccess } from '@/lib/access';
import { commentInclude, logActivity } from '@/lib/comments';
import { isType, isPriority } from '@/lib/commentWorkflow';
import { CommentType, CommentPriority } from '@prisma/client';

export async function GET(req: NextRequest, { params }: { params: { cid: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const comment = await prisma.comment.findFirst({ where: { id: params.cid, deletedAt: null }, include: commentInclude });
    if (!comment) return apiError('Commentaire introuvable', 'NOT_FOUND', 404);
    const access = await getProjectAccess(user, comment.projectId);
    if (!access || !access.canView) return apiError('Accès refusé', 'FORBIDDEN', 403);
    return apiSuccess(comment);
  } catch (e) {
    return apiError(e instanceof Error ? e.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { cid: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const existing = await prisma.comment.findFirst({ where: { id: params.cid, deletedAt: null }, select: { projectId: true, createdById: true, title: true, description: true, type: true, priority: true } });
    if (!existing) return apiError('Commentaire introuvable', 'NOT_FOUND', 404);
    const access = await getProjectAccess(user, existing.projectId);
    if (!access) return apiError('Accès refusé', 'FORBIDDEN', 403);
    const isAuthor = existing.createdById === user.sub;
    if (!isAuthor && !access.canManage) return apiError('Modification non autorisée', 'FORBIDDEN', 403);

    const body = await req.json() as { title?: string | null; description?: string; type?: string; priority?: string; dueDate?: string | null; lotId?: string | null; spaceId?: string | null };
    const data: Record<string, unknown> = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined && body.description.trim()) data.description = body.description;
    if (body.type && isType(body.type)) data.type = body.type as CommentType;
    if (body.priority && isPriority(body.priority)) data.priority = body.priority as CommentPriority;
    if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.lotId !== undefined) data.lotId = body.lotId;
    if (body.spaceId !== undefined) data.spaceId = body.spaceId;

    const updated = await prisma.comment.update({ where: { id: params.cid }, data, include: commentInclude });
    await logActivity(params.cid, user.sub, 'edited', { title: existing.title, priority: existing.priority, type: existing.type }, data);
    return apiSuccess(updated);
  } catch (e) {
    return apiError(e instanceof Error ? e.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { cid: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const existing = await prisma.comment.findFirst({ where: { id: params.cid, deletedAt: null }, select: { projectId: true, createdById: true } });
    if (!existing) return apiError('Commentaire introuvable', 'NOT_FOUND', 404);
    const access = await getProjectAccess(user, existing.projectId);
    if (!access) return apiError('Accès refusé', 'FORBIDDEN', 403);
    if (existing.createdById !== user.sub && !access.canManage) return apiError('Suppression non autorisée', 'FORBIDDEN', 403);
    await prisma.comment.update({ where: { id: params.cid }, data: { deletedAt: new Date() } });
    await logActivity(params.cid, user.sub, 'deleted');
    return apiSuccess({ id: params.cid });
  } catch (e) {
    return apiError(e instanceof Error ? e.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
