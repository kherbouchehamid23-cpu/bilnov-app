import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { getCommentWithAccess, logActivity } from '@/lib/comments';
import { isLocationType } from '@/lib/commentWorkflow';
import { CommentLocationType, Prisma } from '@prisma/client';

// GET : localisations d'un commentaire (SFD §9).
export async function GET(req: NextRequest, { params }: { params: { cid: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const ctx = await getCommentWithAccess(user, params.cid);
    if (!ctx) return apiError('Commentaire introuvable', 'NOT_FOUND', 404);
    const locations = await prisma.commentLocation.findMany({ where: { commentId: params.cid, deletedAt: null }, orderBy: { createdAt: 'asc' } });
    return apiSuccess({ locations });
  } catch (e) {
    return apiError(e instanceof Error ? e.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}

// POST : ajouter une localisation (DWG/PDF/IFC/360°/…) — association manuelle v1 (SFD §15).
export async function POST(req: NextRequest, { params }: { params: { cid: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const ctx = await getCommentWithAccess(user, params.cid);
    if (!ctx) return apiError('Commentaire introuvable', 'NOT_FOUND', 404);
    if (!ctx.access.canComment) return apiError('Droit requis', 'FORBIDDEN', 403);
    const body = await req.json() as { locationType?: string; resourceType?: string; resourceId?: string; resourceVersionId?: string; title?: string; metadata?: unknown };
    if (!body.locationType || !isLocationType(body.locationType)) return apiError('locationType invalide', 'VALIDATION_ERROR', 400);
    const created = await prisma.commentLocation.create({
      data: {
        commentId: params.cid, locationType: body.locationType as CommentLocationType,
        resourceType: body.resourceType ?? null, resourceId: body.resourceId ?? null, resourceVersionId: body.resourceVersionId ?? null,
        title: body.title ?? null, metadata: (body.metadata ?? undefined) as Prisma.InputJsonValue, createdById: user.sub,
      },
    });
    await logActivity(params.cid, user.sub, 'location_added', undefined, { locationType: body.locationType });
    return apiSuccess(created, 201);
  } catch (e) {
    return apiError(e instanceof Error ? e.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
