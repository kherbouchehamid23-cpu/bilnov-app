import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { getProjectAccess } from '@/lib/access';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; tourId: string } }
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    // Sécurité — le tour doit appartenir à ce projet, et seul un gestionnaire publie.
    const owned = await prisma.virtualTour.findFirst({
      where: { id: params.tourId, projectId: params.id },
      select: { id: true },
    });
    if (!owned) return apiError('Introuvable', 'NOT_FOUND', 404);
    const access = await getProjectAccess(user, params.id);
    if (!access || !access.canManage) return apiError('Accès refusé', 'FORBIDDEN', 403);
    const tour = await prisma.virtualTour.update({
      where: { id: params.tourId },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
    return apiSuccess(tour);
  } catch {
    return apiError('Erreur', 'INTERNAL_ERROR', 500);
  }
}
