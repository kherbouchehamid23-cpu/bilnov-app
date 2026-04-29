import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { getSignedFileUrl } from '@/lib/storage';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; tourId: string } }
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const scenes = await prisma.tourScene.findMany({
      where: { tourId: params.tourId },
      orderBy: { position: 'asc' },
    });

    const scenesWithUrls = await Promise.all(
      scenes.map(async scene => {
        try {
          const { url } = await getSignedFileUrl(scene.imageUrl, 'view');
          return { ...scene, imageUrl: url };
        } catch {
          return scene;
        }
      })
    );

    return apiSuccess({ scenes: scenesWithUrls });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; tourId: string } }
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const { fileId, name } = (await req.json()) as { fileId?: string; name?: string };
    if (!fileId || !name) {
      return apiError('fileId et name requis', 'VALIDATION_ERROR', 400);
    }

    const file = await prisma.file.findUnique({ where: { id: fileId } });
    if (!file) return apiError('Fichier introuvable', 'NOT_FOUND', 404);

    const storageKey: string = file.storageKey;
    const count = await prisma.tourScene.count({ where: { tourId: params.tourId } });

    const scene = await prisma.tourScene.create({
      data: {
        tourId: params.tourId,
        name,
        position: count,
        isInitial: count === 0,
        imageUrl: storageKey,
      },
    });

    const { url } = await getSignedFileUrl(storageKey, 'view');
    return apiSuccess({ ...scene, imageUrl: url }, 201);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
