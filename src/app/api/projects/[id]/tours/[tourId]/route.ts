import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';

export async function GET(req: import("next/server").NextRequest, { params }) {
  try {
    const user = await getCurrentUser(req);
    const tour = await prisma.virtualTour.findFirst({
      where: { id: params.tourId, projectId: params.id },
      include: { _count: { select: { scenes: true } } },
    });
    return apiSuccess(tour);
  } catch (error) {
    return apiError('Erreur', 'INTERNAL_ERROR', 500);
  }
}
