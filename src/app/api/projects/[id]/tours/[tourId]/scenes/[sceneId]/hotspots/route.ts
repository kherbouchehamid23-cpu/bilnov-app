import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { HotspotType, Prisma } from '@prisma/client';

async function sceneInProject(sceneId: string, tourId: string, projectId: string) {
  return prisma.tourScene.findFirst({ where: { id: sceneId, tourId, tour: { projectId } }, select: { id: true } });
}

// GET : hotspots d'une scène (SFD §11).
export async function GET(req: NextRequest, { params }: { params: { id: string; tourId: string; sceneId: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const hotspots = await prisma.tourHotspot.findMany({ where: { sceneId: params.sceneId }, orderBy: { createdAt: 'asc' } });
    return apiSuccess({ hotspots });
  } catch (e) {
    return apiError(e instanceof Error ? e.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}

// POST : créer un hotspot (direction = LINK+targetSceneId ; info = TEXT/IMAGE/VIDEO+content).
export async function POST(req: NextRequest, { params }: { params: { id: string; tourId: string; sceneId: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const scene = await sceneInProject(params.sceneId, params.tourId, params.id);
    if (!scene) return apiError('Scène introuvable', 'NOT_FOUND', 404);
    const body = await req.json() as {
      type?: string; positionYaw?: number; positionPitch?: number; targetSceneId?: string | null; content?: unknown;
      // Doc 1 §10/§19/§14 — additif : icône choisie + personnalisation + visibilité + lien commentaire transversal.
      iconId?: string | null; iconColor?: string | null; iconScale?: number | null; iconOpacity?: number | null;
      visible?: boolean; commentId?: string | null;
    };
    const type = (['LINK', 'TEXT', 'IMAGE', 'VIDEO'].includes(body.type ?? '') ? body.type : 'TEXT') as HotspotType;
    if (typeof body.positionYaw !== 'number' || typeof body.positionPitch !== 'number') return apiError('Position requise', 'VALIDATION_ERROR', 400);
    const created = await prisma.tourHotspot.create({
      data: {
        sceneId: params.sceneId, type,
        positionYaw: body.positionYaw, positionPitch: body.positionPitch,
        targetSceneId: type === 'LINK' ? (body.targetSceneId ?? null) : null,
        content: (body.content ?? {}) as Prisma.InputJsonValue,
        iconId: body.iconId ?? undefined,
        iconColor: body.iconColor ?? undefined,
        iconScale: typeof body.iconScale === 'number' ? body.iconScale : undefined,
        iconOpacity: typeof body.iconOpacity === 'number' ? body.iconOpacity : undefined,
        visible: typeof body.visible === 'boolean' ? body.visible : undefined,
        commentId: body.commentId ?? undefined,
      },
    });
    return apiSuccess(created, 201);
  } catch (e) {
    return apiError(e instanceof Error ? e.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
