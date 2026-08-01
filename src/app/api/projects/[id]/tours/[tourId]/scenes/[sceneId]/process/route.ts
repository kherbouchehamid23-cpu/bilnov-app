import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { getProjectAccess } from '@/lib/access';
import { getObjectBuffer } from '@/lib/storage';
import { generateSceneDerivatives } from '@/lib/panoramaDerivatives';

// Vague 2 — traitement asynchrone (déclenché par le client après upload d'une scène) :
// télécharge l'original, génère miniature + aperçu via sharp, met la scène à READY.
// Séparé de l'upload : l'utilisateur n'attend pas sur un écran bloqué.
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; tourId: string; sceneId: string } },
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const scene = await prisma.tourScene.findFirst({
      where: { id: params.sceneId, tourId: params.tourId, tour: { projectId: params.id } },
      select: { id: true, imageUrl: true, derivStatus: true },
    });
    if (!scene) return apiError('Introuvable', 'NOT_FOUND', 404);

    const access = await getProjectAccess(user, params.id);
    if (!access || !access.canManage) return apiError('Accès refusé', 'FORBIDDEN', 403);

    await prisma.tourScene.update({ where: { id: scene.id }, data: { derivStatus: 'PROCESSING', derivError: null } });
    try {
      const src = await getObjectBuffer(scene.imageUrl);
      const { thumbnailKey, previewKey } = await generateSceneDerivatives(src, params.id, scene.id);
      await prisma.tourScene.update({
        where: { id: scene.id },
        data: { thumbnailKey, previewKey, derivStatus: 'READY', derivError: null },
      });
      return apiSuccess({ id: scene.id, derivStatus: 'READY' });
    } catch (e) {
      await prisma.tourScene.update({
        where: { id: scene.id },
        data: { derivStatus: 'FAILED', derivError: e instanceof Error ? e.message.slice(0, 300) : 'erreur' },
      });
      return apiError('Optimisation du panorama échouée', 'PROCESSING_FAILED', 502);
    }
  } catch (e) {
    return apiError(e instanceof Error ? e.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
