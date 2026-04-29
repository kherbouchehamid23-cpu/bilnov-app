import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { getSignedFileUrl } from '@/lib/storage';

export async function GET(req: import("next/server").NextRequest, { params }) {
  try {
    const user = await getCurrentUser(req);
    const scenes = await prisma.tourScene.findMany({
      where: { tourId: params.tourId },
      include: { _count: { select: { hotspots: true } } },
      orderBy: { position: 'asc' },
    });
    const scenesWithUrls = await Promise.all(scenes.map(async scene => {
      try {
        const { url } = await getSignedFileUrl(scene.imageUrl, 'view');
        return { ...scene, imageUrl: url };
      } catch { return scene; }
    }));
    return apiSuccess({ scenes: scenesWithUrls });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}

export async function POST(req: import("next/server").NextRequest, { params }) {
  try {
    const user = await getCurrentUser(req);
    const { fileId, name } = await req.json();
    const file = await prisma.file.findUnique({ where: { id: fileId } });
    const count = await prisma.tourScene.count({ where: { tourId: params.tourId } });
    const scene = await prisma.tourScene.create({
      data: { tourId: params.tourId, name, position: count, isInitial: count === 0, imageUrl: file.storageKey },
    });
    const { url } = await getSignedFileUrl(file.storageKey, 'view');
    return apiSuccess({ ...scene, imageUrl: url }, 201);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
