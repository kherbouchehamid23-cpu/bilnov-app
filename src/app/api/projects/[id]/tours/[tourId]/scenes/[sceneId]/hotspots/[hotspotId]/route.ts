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
    const body = await req.json() as { positionYaw?: number; positionPitch?: number; targetSceneId?: string | null; content?: unknown };
    const data: Record<string, unknown> = {};
    if (typeof body.positionYaw === 'number') data.positionYaw = body.positionYaw;
    if (typeof body.positionPitch === 'number') data.positionPitch = body.positionPitch;
    if (body.targetSceneId !== undefined) data.targetSceneId = body.targetSceneId;
    if (body.content !== undefined) data.content = body.content as Prisma.InputJsonValue;
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
    const hs = await prisma.tourHotspot.findFirst({ where: { id: params.hotspotId, sceneId: params.sceneId, scene: { tourId: params.tourId, tour: { projectId: params.id } } }, select: { id: true } });
    if (!hs) return apiError('Hotspot introuvable', 'NOT_FOUND', 404);
    await prisma.tourHotspot.delete({ where: { id: params.hotspotId } });
    return apiSuccess({ id: params.hotspotId });
  } catch (e) {
    return apiError(e instanceof Error ? e.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
