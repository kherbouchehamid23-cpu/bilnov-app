import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { getProjectAccess } from '@/lib/access';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';

// §3 — création ATOMIQUE d'une direction aller-retour A↔B.
// scene A = params.sceneId (sens A→B) ; scene B = body.aToB.targetSceneId (sens B→A).
// Les deux hotspots sont créés dans une seule transaction et partagent un directionPairId :
// si l'un échoue, aucun n'est enregistré (pas de paire partielle).

interface Side {
  positionYaw?: number;
  positionPitch?: number;
  content?: unknown;
  iconId?: string | null;
  iconColor?: string | null;
  iconScale?: number | null;
  iconOpacity?: number | null;
}

function toData(side: Side, targetSceneId: string, pairId: string, sceneId: string): Prisma.TourHotspotCreateManyInput | null {
  if (typeof side.positionYaw !== 'number' || typeof side.positionPitch !== 'number') return null;
  return {
    sceneId,
    type: 'LINK',
    positionYaw: side.positionYaw,
    positionPitch: side.positionPitch,
    targetSceneId,
    content: (side.content ?? {}) as Prisma.InputJsonValue,
    iconId: side.iconId ?? undefined,
    iconColor: side.iconColor ?? undefined,
    iconScale: typeof side.iconScale === 'number' ? side.iconScale : undefined,
    iconOpacity: typeof side.iconOpacity === 'number' ? side.iconOpacity : undefined,
    directionPairId: pairId,
  };
}

export async function POST(req: NextRequest, { params }: { params: { id: string; tourId: string; sceneId: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const access = await getProjectAccess(user, params.id);
    if (!access || !access.canManage) return apiError('Accès refusé', 'FORBIDDEN', 403);

    const body = await req.json() as { aToB?: Side; bToA?: Side; sceneBId?: string };
    const sceneAId = params.sceneId;
    const sceneBId = body.sceneBId;
    if (!sceneBId || sceneBId === sceneAId) return apiError('Scène B invalide', 'VALIDATION_ERROR', 400);

    // Les deux scènes doivent appartenir à ce tour ET à ce projet.
    const scenes = await prisma.tourScene.findMany({
      where: { id: { in: [sceneAId, sceneBId] }, tourId: params.tourId, tour: { projectId: params.id } },
      select: { id: true },
    });
    if (scenes.length !== 2) return apiError('Scènes introuvables dans ce tour', 'NOT_FOUND', 404);

    const pairId = randomUUID();
    const aData = toData(body.aToB ?? {}, sceneBId, pairId, sceneAId); // A→B, placé dans A
    const bData = toData(body.bToA ?? {}, sceneAId, pairId, sceneBId); // B→A, placé dans B
    if (!aData || !bData) return apiError('Position requise pour les deux sens', 'VALIDATION_ERROR', 400);

    // Transaction : les deux ou aucun.
    const [aHotspot, bHotspot] = await prisma.$transaction([
      prisma.tourHotspot.create({ data: aData }),
      prisma.tourHotspot.create({ data: bData }),
    ]);

    return apiSuccess({ directionPairId: pairId, aToB: aHotspot, bToA: bHotspot }, 201);
  } catch (e) {
    return apiError(e instanceof Error ? e.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
