import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; tourId: string; sceneId: string } }
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const body = await req.json() as {
      name?: string;
      isInitial?: boolean;
      position?: number;
      // V4 — rattachement niveau + position sur le plan 2D.
      levelId?: string | null;
      mapX?: number | null;
      mapY?: number | null;
      // Doc 1 §6.4/§7 — additif : métadonnées scène + panorama mono/stéréo + orientation initiale.
      panoramaType?: string | null;
      stereoLayout?: string | null;
      spaceName?: string | null;
      hidden?: boolean;
      status?: string | null;
      initialYaw?: number | null;
      initialPitch?: number | null;
      initialFov?: number | null;
    };

    // Si on définit isInitial = true, retirer isInitial des autres scènes
    if (body.isInitial === true) {
      await prisma.tourScene.updateMany({
        where: { tourId: params.tourId },
        data: { isInitial: false },
      });
    }

    // Bornage des coordonnées de carte (0..1) si fournies.
    const clamp01 = (n: number | null | undefined): number | null | undefined =>
      typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : (n === null ? null : undefined);

    const scene = await prisma.tourScene.update({
      where: { id: params.sceneId },
      data: {
        name: body.name,
        isInitial: body.isInitial,
        position: body.position,
        levelId: body.levelId === undefined ? undefined : body.levelId,
        mapX: clamp01(body.mapX),
        mapY: clamp01(body.mapY),
        panoramaType: body.panoramaType === undefined ? undefined : body.panoramaType,
        stereoLayout: body.stereoLayout === undefined ? undefined : body.stereoLayout,
        spaceName: body.spaceName === undefined ? undefined : body.spaceName,
        hidden: typeof body.hidden === 'boolean' ? body.hidden : undefined,
        status: body.status === undefined ? undefined : body.status,
        initialYaw: body.initialYaw === undefined ? undefined : body.initialYaw,
        initialPitch: body.initialPitch === undefined ? undefined : body.initialPitch,
        initialFov: body.initialFov === undefined ? undefined : body.initialFov,
      },
    });

    return apiSuccess(scene);
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : 'Erreur',
      'INTERNAL_ERROR',
      500
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; tourId: string; sceneId: string } }
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    // Vérifier si c'est la scène initiale
    const scene = await prisma.tourScene.findUnique({
      where: { id: params.sceneId },
    });

    await prisma.tourScene.delete({
      where: { id: params.sceneId },
    });

    // Si c'était la scène initiale, définir la première restante comme initiale
    if (scene?.isInitial) {
      const firstScene = await prisma.tourScene.findFirst({
        where: { tourId: params.tourId },
        orderBy: { position: 'asc' },
      });
      if (firstScene) {
        await prisma.tourScene.update({
          where: { id: firstScene.id },
          data: { isInitial: true },
        });
      }
    }

    // Réindexer les positions
    const remaining = await prisma.tourScene.findMany({
      where: { tourId: params.tourId },
      orderBy: { position: 'asc' },
    });

    await Promise.all(
      remaining.map((s, i) =>
        prisma.tourScene.update({
          where: { id: s.id },
          data: { position: i },
        })
      )
    );

    return apiSuccess({ message: 'Scène supprimée' });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : 'Erreur',
      'INTERNAL_ERROR',
      500
    );
  }
}
