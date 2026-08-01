import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { getSignedFileUrl } from '@/lib/storage';
import { getProjectAccess } from '@/lib/access';

// Sécurité — le tour appartient-il à ce projet et l'utilisateur y a-t-il accès ?
async function tourAccess(user: Parameters<typeof getProjectAccess>[0], projectId: string, tourId: string) {
  const tour = await prisma.virtualTour.findFirst({ where: { id: tourId, projectId }, select: { id: true } });
  if (!tour) return { error: apiError('Introuvable', 'NOT_FOUND', 404) as Response };
  const access = await getProjectAccess(user, projectId);
  return { access };
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; tourId: string } }
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const chk = await tourAccess(user, params.id, params.tourId);
    if (chk.error) return chk.error;
    if (!chk.access || !chk.access.canView) return apiError('Accès refusé', 'FORBIDDEN', 403);

    const scenes = await prisma.tourScene.findMany({
      where: { tourId: params.tourId },
      orderBy: { position: 'asc' },
    });

    const sign = async (key: string | null | undefined): Promise<string | null> => {
      if (!key) return null;
      try { return (await getSignedFileUrl(key, 'view')).url; } catch { return null; }
    };
    const scenesWithUrls = await Promise.all(
      scenes.map(async scene => {
        const proxy = `/api/projects/${params.id}/tours/${params.tourId}/scenes/${scene.id}/raw`;
        // Vague 2 — la vignette utilise la miniature dédiée (jamais l'original),
        // et le viewer sert l'aperçu léger si disponible (sinon le proxy sur l'original).
        const [imageUrl, thumbnailUrl, previewUrl] = await Promise.all([
          sign(scene.imageUrl), sign(scene.thumbnailKey), sign(scene.previewKey),
        ]);
        return {
          ...scene,
          imageUrl: imageUrl ?? scene.imageUrl,
          panoramaProxy: proxy,
          thumbnailUrl,
          previewUrl,
        };
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
    const chk = await tourAccess(user, params.id, params.tourId);
    if (chk.error) return chk.error;
    if (!chk.access || !chk.access.canManage) return apiError('Accès refusé', 'FORBIDDEN', 403);

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
        derivStatus: 'PENDING', // Vague 2 — le client déclenchera /process pour générer miniature+aperçu
      },
    });

    const { url } = await getSignedFileUrl(storageKey, 'view');
    return apiSuccess({ ...scene, imageUrl: url, panoramaProxy: `/api/projects/${params.id}/tours/${params.tourId}/scenes/${scene.id}/raw` }, 201);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
