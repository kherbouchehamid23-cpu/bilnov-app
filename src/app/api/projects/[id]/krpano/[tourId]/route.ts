import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { deletePrefix } from '@/lib/krpano';
import { deleteFile as deleteZipFromStorage } from '@/lib/storage';

// GET : détail d'un tour krpano
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; tourId: string } },
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const tour = await prisma.krpanoTour.findUnique({ where: { id: params.tourId } });
    if (!tour || tour.projectId !== params.id || tour.deletedAt) {
      return apiError('Tour introuvable', 'NOT_FOUND', 404);
    }
    return apiSuccess(tour);
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : 'Erreur',
      'INTERNAL_ERROR',
      500,
    );
  }
}

// PUT : renommer / modifier la description d'un tour
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string; tourId: string } },
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const tour = await prisma.krpanoTour.findUnique({ where: { id: params.tourId } });
    if (!tour || tour.projectId !== params.id || tour.deletedAt) {
      return apiError('Tour introuvable', 'NOT_FOUND', 404);
    }

    const body = (await req.json()) as { name?: string; description?: string };
    if (body.name !== undefined && !body.name.trim()) {
      return apiError('Nom requis', 'VALIDATION_ERROR', 400);
    }

    const updated = await prisma.krpanoTour.update({
      where: { id: tour.id },
      data: {
        name: body.name?.trim() ?? tour.name,
        description: body.description ?? tour.description,
      },
    });
    return apiSuccess(updated);
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : 'Erreur',
      'INTERNAL_ERROR',
      500,
    );
  }
}

// DELETE : supprime tous les fichiers extraits + le ZIP source, puis soft-delete
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; tourId: string } },
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const tour = await prisma.krpanoTour.findUnique({ where: { id: params.tourId } });
    if (!tour || tour.projectId !== params.id || tour.deletedAt) {
      return apiError('Tour introuvable', 'NOT_FOUND', 404);
    }

    // 1) Supprimer tous les fichiers extraits sous le préfixe R2
    try {
      await deletePrefix(tour.storagePrefix);
    } catch (e) {
      console.warn('Suppression préfixe R2 partielle:', e);
    }

    // 2) Supprimer le ZIP source
    const meta = (tour.metadata ?? {}) as { zipKey?: string };
    if (meta.zipKey) {
      try {
        await deleteZipFromStorage(meta.zipKey);
      } catch (e) {
        console.warn('Suppression ZIP impossible:', e);
      }
    }

    // 3) Soft-delete + décrément du quota
    await prisma.krpanoTour.update({
      where: { id: tour.id },
      data: { status: 'ERROR', deletedAt: new Date() },
    });
    if (tour.totalSize && tour.totalSize > BigInt(0)) {
      await prisma.organization.update({
        where: { id: user.organizationId },
        data: { storageUsedBytes: { decrement: tour.totalSize } },
      });
    }

    return apiSuccess({ id: tour.id });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : 'Erreur',
      'INTERNAL_ERROR',
      500,
    );
  }
}
