import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { getSignedFileUrl } from '@/lib/storage';

// PATCH : renommer, (ré)affecter le plan 2D (planImageUrl = storageKey), réordonner.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; tourId: string; levelId: string } }
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const body = (await req.json()) as { name?: string; position?: number; planImageUrl?: string | null };
    const data: { name?: string; position?: number; planImageUrl?: string | null } = {};
    if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim().slice(0, 120);
    if (typeof body.position === 'number' && Number.isFinite(body.position)) data.position = body.position;
    if (body.planImageUrl === null || typeof body.planImageUrl === 'string') data.planImageUrl = body.planImageUrl;

    const level = await prisma.tourLevel.update({ where: { id: params.levelId }, data });

    let planUrl: string | null = null;
    if (level.planImageUrl) {
      try { planUrl = (await getSignedFileUrl(level.planImageUrl, 'view')).url; } catch { planUrl = null; }
    }
    return apiSuccess({ ...level, planUrl });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}

// DELETE : supprime le niveau. Les scènes rattachées voient leur levelId remis à
// NULL (onDelete: SetNull côté schéma) ; leurs positions de carte sont effacées.
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; tourId: string; levelId: string } }
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    await prisma.tourScene.updateMany({
      where: { levelId: params.levelId },
      data: { mapX: null, mapY: null },
    });
    await prisma.tourLevel.delete({ where: { id: params.levelId } });

    // Réindexer les positions des niveaux restants.
    const remaining = await prisma.tourLevel.findMany({
      where: { tourId: params.tourId },
      orderBy: { position: 'asc' },
    });
    await Promise.all(remaining.map((l, i) =>
      prisma.tourLevel.update({ where: { id: l.id }, data: { position: i } })
    ));

    return apiSuccess({ message: 'Niveau supprimé' });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
