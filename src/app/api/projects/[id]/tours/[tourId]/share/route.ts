import { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';

// État de partage courant (le propriétaire voit le code et l'expiration).
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; tourId: string } }
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const tour = await prisma.virtualTour.findFirst({
      where: { id: params.tourId, projectId: params.id },
      select: { isPublic: true, publicToken: true, shareExpiresAt: true, shareCode: true },
    });
    if (!tour) return apiError('Introuvable', 'NOT_FOUND', 404);
    return apiSuccess({
      isPublic: tour.isPublic,
      token: tour.isPublic ? tour.publicToken : null,
      expiresAt: tour.isPublic ? (tour.shareExpiresAt ? tour.shareExpiresAt.toISOString() : null) : null,
      code: tour.isPublic ? (tour.shareCode ?? null) : null,
    });
  } catch {
    return apiError('Erreur', 'INTERNAL_ERROR', 500);
  }
}

// Activer/mettre à jour le partage : jeton public + expiration + code d'accès facultatifs.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; tourId: string } }
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const body = await req.json().catch(() => ({})) as { expiresAt?: string | null; code?: string | null };
    const existing = await prisma.virtualTour.findFirst({
      where: { id: params.tourId, projectId: params.id },
      select: { publicToken: true },
    });
    if (!existing) return apiError('Introuvable', 'NOT_FOUND', 404);
    const token = existing.publicToken ?? randomUUID().replace(/-/g, '');

    // Expiration : date valide, sinon null (pas d'expiration).
    let shareExpiresAt: Date | null = null;
    if (body.expiresAt) {
      const d = new Date(body.expiresAt);
      if (!Number.isNaN(d.getTime())) shareExpiresAt = d;
    }
    // Code : chaîne non vide (nettoyée), sinon null (pas de code).
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    const shareCode = code.length > 0 ? code.slice(0, 64) : null;

    const tour = await prisma.virtualTour.update({
      where: { id: params.tourId },
      data: { isPublic: true, publicToken: token, shareExpiresAt, shareCode },
      select: { isPublic: true, publicToken: true, shareExpiresAt: true, shareCode: true },
    });
    return apiSuccess({
      isPublic: tour.isPublic,
      token: tour.publicToken,
      expiresAt: tour.shareExpiresAt ? tour.shareExpiresAt.toISOString() : null,
      code: tour.shareCode ?? null,
    });
  } catch {
    return apiError('Erreur', 'INTERNAL_ERROR', 500);
  }
}

// Désactiver le partage : jeton, expiration et code effacés (le lien est invalidé).
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; tourId: string } }
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    await prisma.virtualTour.updateMany({
      where: { id: params.tourId, projectId: params.id },
      data: { isPublic: false, publicToken: null, shareExpiresAt: null, shareCode: null },
    });
    return apiSuccess({ isPublic: false, token: null });
  } catch {
    return apiError('Erreur', 'INTERNAL_ERROR', 500);
  }
}
