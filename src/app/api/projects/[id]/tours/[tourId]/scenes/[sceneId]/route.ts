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
    };

    // Si on définit isInitial = true, retirer isInitial des autres scènes
    if (body.isInitial === true) {
      await prisma.tourScene.updateMany({
        where: { tourId: params.tourId },
        data: { isInitial: false },
      });
    }

    const scene = await prisma.tourScene.update({
      where: { id: params.sceneId },
      data: {
        name: body.name,
        isInitial: body.isInitial,
        position: body.position,
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
