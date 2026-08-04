import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { getProjectAccess } from '@/lib/access';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; tourId: string } }
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const tour = await prisma.virtualTour.findFirst({
      where: { id: params.tourId, projectId: params.id },
      include: { _count: { select: { scenes: true } } },
    });
    if (!tour) return apiError('Introuvable', 'NOT_FOUND', 404);
    return apiSuccess(tour);
  } catch {
    return apiError('Erreur', 'INTERNAL_ERROR', 500);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; tourId: string } }
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const access = await getProjectAccess(user, params.id);
    if (!access) return apiError('Accès refusé', 'FORBIDDEN', 403);
    if (!access.canManage && !access.canUpload) return apiError('Action non autorisée', 'FORBIDDEN', 403);
    const tour = await prisma.virtualTour.findFirst({ where: { id: params.tourId, projectId: params.id } });
    if (!tour) return apiError('Introuvable', 'NOT_FOUND', 404);
    const body = (await req.json()) as { status?: string; name?: string };
    const data: { status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'; name?: string; publishedAt?: Date } = {};
    if (body.status === 'PUBLISHED' || body.status === 'DRAFT' || body.status === 'ARCHIVED') data.status = body.status;
    if (data.status === 'PUBLISHED') data.publishedAt = new Date();
    if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim();
    const updated = await prisma.virtualTour.update({ where: { id: params.tourId }, data });
    return apiSuccess(updated);
  } catch {
    return apiError('Erreur', 'INTERNAL_ERROR', 500);
  }
}
