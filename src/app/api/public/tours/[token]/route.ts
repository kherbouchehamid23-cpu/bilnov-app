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
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    if (!isValidShareToken(params.token)) return apiError('Lien invalide', 'BAD_REQUEST', 400);

    const tour = await prisma.virtualTour.findFirst({
      where: { publicToken: params.token, isPublic: true },
      select: {
        id: true, name: true, shareExpiresAt: true, shareCode: true,
        scenes: {
          // §22.2 — le partage public masque les scènes cachées et les hotspots non visibles.
          where: { hidden: false },
          orderBy: { position: 'asc' },
          select: {
            id: true, name: true, isInitial: true, position: true, imageUrl: true,
            levelId: true, mapX: true, mapY: true,
            hotspots: { where: { visible: true }, select: { id: true, type: true, positionYaw: true, positionPitch: true, targetSceneId: true, content: true, iconId: true, iconColor: true, iconScale: true } },
          },
        },
        levels: { orderBy: { position: 'asc' }, select: { id: true, name: true, position: true, planImageUrl: true } },
      },
    });
    if (!tour) return apiError('Visite introuvable ou non partagée', 'NOT_FOUND', 404);

    // §22 — expiration du lien (410) puis code d'accès (403 CODE_REQUIRED / CODE_INVALID).
    if (tour.shareExpiresAt && tour.shareExpiresAt.getTime() < Date.now()) {
      return apiError('Ce lien de partage a expiré.', 'SHARE_EXPIRED', 410);
    }
    if (tour.shareCode) {
      const provided = (req.nextUrl.searchParams.get('code') ?? req.headers.get('x-share-code') ?? '').trim();
      if (!provided) return apiError('Code d\'accès requis.', 'CODE_REQUIRED', 403);
      if (provided !== tour.shareCode) return apiError('Code d\'accès invalide.', 'CODE_INVALID', 403);
    }

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
