import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError, apiSuccess } from '@/lib/auth';
import { getSignedFileUrl } from '@/lib/storage';
import { isValidShareToken } from '@/lib/tourShare';

// Endpoint PUBLIC (sans authentification) — V6.
// Ne sert QUE les visites explicitement partagées (isPublic + jeton exact),
// en lecture seule, avec des URLs d'images signées (temporaires). Aucune
// donnée d'écriture, aucune info projet/utilisateur exposée.
export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    if (!isValidShareToken(params.token)) return apiError('Lien invalide', 'BAD_REQUEST', 400);

    const tour = await prisma.virtualTour.findFirst({
      where: { publicToken: params.token, isPublic: true },
      select: {
        id: true, name: true,
        scenes: {
          orderBy: { position: 'asc' },
          select: {
            id: true, name: true, isInitial: true, position: true, imageUrl: true,
            levelId: true, mapX: true, mapY: true,
            hotspots: { select: { id: true, type: true, positionYaw: true, positionPitch: true, targetSceneId: true, content: true } },
          },
        },
        levels: { orderBy: { position: 'asc' }, select: { id: true, name: true, position: true, planImageUrl: true } },
      },
    });
    if (!tour) return apiError('Visite introuvable ou non partagée', 'NOT_FOUND', 404);

    const scenes = await Promise.all(tour.scenes.map(async (s) => {
      let imageUrl = s.imageUrl;
      try { imageUrl = (await getSignedFileUrl(s.imageUrl, 'view')).url; } catch { /* garde la clé brute */ }
      return {
        id: s.id, name: s.name, isInitial: s.isInitial, position: s.position,
        imageUrl, levelId: s.levelId, mapX: s.mapX, mapY: s.mapY, hotspots: s.hotspots,
      };
    }));

    const levels = await Promise.all(tour.levels.map(async (l) => {
      let planUrl: string | null = null;
      if (l.planImageUrl) { try { planUrl = (await getSignedFileUrl(l.planImageUrl, 'view')).url; } catch { planUrl = null; } }
      return { id: l.id, name: l.name, position: l.position, planUrl };
    }));

    return apiSuccess({ name: tour.name, scenes, levels });
  } catch {
    return apiError('Erreur', 'INTERNAL_ERROR', 500);
  }
}
