import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { extractZipToStorage } from '@/lib/krpano';

// Décompresse le ZIP du tour et republie tous les fichiers sur R2 sous le préfixe
// du tour. Met à jour le statut (READY / ERROR) et les métadonnées (nb fichiers,
// taille, nb scènes, vignette). Idempotent : peut être relancé en cas d'échec.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; tourId: string } },
) {
  let tourId = params.tourId;
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const tour = await prisma.krpanoTour.findUnique({ where: { id: tourId } });
    if (!tour || tour.projectId !== params.id || tour.deletedAt) {
      return apiError('Tour introuvable', 'NOT_FOUND', 404);
    }

    const meta = (tour.metadata ?? {}) as { zipKey?: string };
    if (!meta.zipKey) {
      return apiError('Archive source manquante', 'VALIDATION_ERROR', 400);
    }

    const result = await extractZipToStorage(meta.zipKey, tour.storagePrefix);

    const updated = await prisma.krpanoTour.update({
      where: { id: tour.id },
      data: {
        status: 'READY',
        entryKey: result.entryKey,
        thumbKey: result.thumbKey,
        fileCount: result.fileCount,
        totalSize: BigInt(result.totalSize),
        sceneCount: result.sceneCount,
      },
    });

    // Comptabilise l'espace utilisé par l'organisation
    await prisma.organization.update({
      where: { id: user.organizationId },
      data: { storageUsedBytes: { increment: BigInt(result.totalSize) } },
    });

    const json = JSON.stringify({ success: true, data: updated }, (_k, v) =>
      typeof v === 'bigint' ? Number(v) : v,
    );
    return new Response(json, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    // Marque le tour en ERROR pour permettre une nouvelle tentative côté UI
    try {
      await prisma.krpanoTour.update({
        where: { id: tourId },
        data: {
          status: 'ERROR',
          metadata: {
            error: error instanceof Error ? error.message : 'Erreur inconnue',
          },
        },
      });
    } catch {
      /* ignore */
    }
    return apiError(
      error instanceof Error ? error.message : 'Erreur de traitement',
      'PROCESSING_ERROR',
      500,
    );
  }
}
