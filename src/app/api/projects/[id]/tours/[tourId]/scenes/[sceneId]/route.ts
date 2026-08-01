import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { getProjectAccess } from '@/lib/access';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; tourId: string; sceneId: string } }
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    // Sécurité — la scène doit appartenir à ce tour ET à ce projet (pas d'accès transversal).
    const owned = await prisma.tourScene.findFirst({
      where: { id: params.sceneId, tourId: params.tourId, tour: { projectId: params.id } },
      select: { id: true },
    });
    if (!owned) return apiError('Scène introuvable', 'NOT_FOUND', 404);

    // Autorisation — l'utilisateur doit pouvoir gérer ce projet (cohérent avec POST /scenes).
    const access = await getProjectAccess(user, params.id);
    if (!access || !access.canManage) return apiError('Accès refusé', 'FORBIDDEN', 403);

    const body = await req.json() as {
      name?: string;
      isInitial?: boolean;
      position?: number;
      // Réimport en place : nouvelle image source (préserve la scène, ses hotspots, sa position).
      fileId?: string;
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

    // Réimport en place : si fileId fourni, on remplace l'image source (nouvel objet R2 déjà
    // uploadé + enregistré) et on réinitialise les dérivés — la scène et ses hotspots sont
    // conservés. Le fichier doit appartenir à ce projet (pas de référence transversale).
    let reimport: { imageUrl: string; thumbnailKey: null; previewKey: null; derivStatus: string; derivError: null } | undefined;
    if (body.fileId) {
      const file = await prisma.file.findFirst({
        where: { id: body.fileId, projectId: params.id },
        select: { storageKey: true },
      });
      if (!file) return apiError('Fichier introuvable', 'NOT_FOUND', 404);
      reimport = { imageUrl: file.storageKey, thumbnailKey: null, previewKey: null, derivStatus: 'PENDING', derivError: null };
    }

    const scene = await prisma.tourScene.update({
      where: { id: params.sceneId },
      data: {
        ...(reimport ?? {}),
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

    // Sécurité — la scène doit appartenir à ce tour ET à ce projet.
    const scene = await prisma.tourScene.findFirst({
      where: { id: params.sceneId, tourId: params.tourId, tour: { projectId: params.id } },
    });
    if (!scene) return apiError('Scène introuvable', 'NOT_FOUND', 404);

    // Autorisation — l'utilisateur doit pouvoir gérer ce projet (cohérent avec POST /scenes).
    const access = await getProjectAccess(user, params.id);
    if (!access || !access.canManage) return apiError('Accès refusé', 'FORBIDDEN', 403);

    await prisma.tourScene.delete({
      where: { id: params.sceneId },
    });

    // §nav — neutraliser les flèches de direction d'autres scènes qui pointaient vers
    // la scène supprimée (sinon elles deviennent des liens morts / hotspots vides).
    await prisma.tourHotspot.updateMany({
      where: { targetSceneId: params.sceneId },
      data: { targetSceneId: null },
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
