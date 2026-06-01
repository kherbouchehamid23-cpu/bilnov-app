import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';

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
