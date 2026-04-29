import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';

export async function POST(req, { params }) {
  try {
    const user = await getCurrentUser(req);
    const tour = await prisma.virtualTour.update({
      where: { id: params.tourId },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
    return apiSuccess(tour);
  } catch (error) {
    return apiError('Erreur', 'INTERNAL_ERROR', 500);
  }
}
