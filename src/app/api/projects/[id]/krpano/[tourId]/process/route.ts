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

    // Traitement repreneable : ne dépasse pas ~45s par appel. Tant que `done`
    // est faux, le tour reste en PROCESSING et l'UI relance cette route.
    const result = await extractZipToStorage(meta.zipKey, tour.storagePrefix);

    const wasReady = tour.status === 'READY';

    const updated = await prisma.krpanoTour.update({
      where: { id: tour.id },
      data: {
        status: result.done ? 'READY' : 'PROCESSING',
        entryKey: result.entryKey,
        thumbKey: result.thumbKey,
        fileCount: result.fileCount,
        totalSize: BigInt(result.totalSize),
        sceneCount: result.sceneCount,
      },
    });

    // Comptabilise l'espace utilisé une seule fois, au passage en READY
    if (result.done && !wasReady) {
      await prisma.organization.update({
        where: { id: user.organizationId },
        data: { storageUsedBytes: { increment: BigInt(result.totalSize) } },
      });
    }

    const json = JSON.stringify(
      {
        success: true,
        data: {
          ...updated,
          done: result.done,
          uploaded: result.uploaded,
          fileCount: result.fileCount,
        },
      },
      (_k, v) => (typeof v === 'bigint' ? Number(v) : v),
    );
    return new Response(json, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    // Marque le tour en ERROR pour permettre une nouvelle