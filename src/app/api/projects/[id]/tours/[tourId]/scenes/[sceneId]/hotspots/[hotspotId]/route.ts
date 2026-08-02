import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { Prisma } from '@prisma/client';

// PATCH : modifier un hotspot (position, cible, contenu).
export async function PATCH(req: NextRequest, { params }: { params: { id: string; tourId: string; sceneId: string; hotspotId: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const hs = await prisma.tourHotspot.findFirst({ where: { id: params.hotspotId, sceneId: params.sceneId, scene: { tourId: params.tourId, tour: { projectId: params.id } } }, select: { id: true } });
    if (!hs) return apiError('Hotspot introuvable', 'NOT_FOUND', 404);
    const body = await req.json() as {
      positionYaw?: number; positionPitch?: number; targetSceneId?: string | null; content?: unknown;
      iconId?: string | null; iconColor?: string | null; iconScale?: number | null; iconOpacity?: number | null;
      visible?: boolean; commentId?: string | null;
    };
    const data: Record<string, unknown> = {};
    if (typeof body.positionYaw === 'number') data.positionYaw = body.positionYaw;
    if (typeof body.positionPitch === 'number') data.positionPitch = body.positionPitch;
    if (body.targetSceneId !== undefined) data.targetSceneId = body.targetSceneId;
    if (body.content !== undefined) data.content = body.content as Prisma.InputJsonValue;
    if (body.iconId !== undefined) data.iconId = body.iconId;
    if (body.iconColor !== undefined) data.iconColor = body.iconColor;
    if (body.iconScale !== undefined) data.iconScale = body.iconScale;
    if (body.iconOpacity !== undefined) data.iconOpacity = body.iconOpacity;
    if (typeof body.visible === 'boolean') data.visible = body.visible;
    if (body.commentId !== undefined) data.commentId = body.commentId;
    const updated = await prisma.tourHotspot.update({ where: { id: params.hotspotId }, data });
    return apiSuccess(updated);
  } catch (e) {
    return apiError(e instanceof Error ? e.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}

// DELETE : supprimer un hotspot.
export async function DELETE(req: NextRequest, { params }: { params: { id: string; tourId: string; sceneId: string; hotspotId: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const hs = await prisma.tourHotspot.findFirst({ where: { id: params.hotspotId, sceneId: params.sceneId, scene: { tourId: params.tourId, tour: { projectId: params.id } } }, select: { id: true, directionPairId: true } });
    if (!hs) return apiError('Hotspot introuvable', 'NOT_FOUND', 404);
    // §3 — ?scope=pair : supprime les DEUX sens d'une paire aller-retour A↔B (par directionPairId,
    // borné à ce tour). Par défaut, seule la direction cliquée est supprimée.
    const scope = req.nextUrl.searchParams.get('scope');
    if (scope === 'pair' && hs.directionPairId) {
      const del = await prisma.tourHotspot.deleteMany({
        where: { directionPairId: hs.directionPairId, scene: { tourId: params.tourId, tour: { projectId: params.id } } },
      });
      return apiSuccess({ id: params.hotspotId, deletedPair: hs.directionPairId, count: del.count });
    }
    await prisma.tourHotspot.delete({ where: { id: params.hotspotId } });
    return apiSuccess({ id: params.hotspotId });
  } catch (e) {
    return apiError(e instanceof Error ? e.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
