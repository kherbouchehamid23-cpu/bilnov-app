import { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';

// État de partage courant.
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; tourId: string } }
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const tour = await prisma.virtualTour.findFirst({
      where: { id: params.tourId, projectId: params.id },
      select: { isPublic: true, publicToken: true },
    });
    if (!tour) return apiError('Introuvable', 'NOT_FOUND', 404);
    return apiSuccess({ isPublic: tour.isPublic, token: tour.isPublic ? tour.publicToken : null });
  } catch {
    return apiError('Erreur', 'INTERNAL_ERROR', 500);
  }
}

// Activer le partage : génère un jeton public (s'il n'existe pas) + isPublic=true.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; tourId: string } }
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const existing = await prisma.virtualTour.findFirst({
      where: { id: params.tourId, projectId: params.id },
      select: { publicToken: true },
    });
    if (!existing) return apiError('Introuvable', 'NOT_FOUND', 404);
    const token = existing.publicToken ?? randomUUID().replace(/-/g, '');
    const tour = await prisma.virtualTour.update({
      where: { id: params.tourId },
      data: { isPublic: true, publicToken: token },
      select: { isPublic: true, publicToken: true },
    });
    return apiSuccess({ isPublic: tour.isPublic, token: tour.publicToken });
  } catch {
    return apiError('Erreur', 'INTERNAL_ERROR', 500);
  }
}

// Désactiver le partage : isPublic=false et jeton effacé (le lien est invalidé).
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; tourId: string } }
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    await prisma.virtualTour.updateMany({
      where: { id: params.tourId, projectId: params.id },
      data: { isPublic: false, publicToken: null },
    });
    return apiSuccess({ isPublic: false, token: null });
  } catch {
    return apiError('Erreur', 'INTERNAL_ERROR', 500);
  }
}
