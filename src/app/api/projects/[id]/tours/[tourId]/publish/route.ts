import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';

export async function POST(req: NextRequest, { params }: { params: Record<string, string> }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const tour = await prisma.virtualTour.update({
      where: { id: params.tourId },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
    return apiSuccess(tour);
  } catch {
    return apiError('Erreur', 'INTERNAL_ERROR', 500);
  }
}
