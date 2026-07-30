import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { getSignedFileUrl } from '@/lib/storage';

// Niveaux d'une visite (V4). Le plan 2D d'un niveau est stocké comme storageKey
// dans `planImageUrl` ; on renvoie une URL signée `planUrl` prête pour <img>.
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; tourId: string } }
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const levels = await prisma.tourLevel.findMany({
      where: { tourId: params.tourId },
      orderBy: { position: 'asc' },
    });

    const withUrls = await Promise.all(
      levels.map(async (lvl) => {
        let planUrl: string | null = null;
        if (lvl.planImageUrl) {
          try { planUrl = (await getSignedFileUrl(lvl.planImageUrl, 'view')).url; } catch { planUrl = null; }
        }
        return { ...lvl, planUrl };
      })
    );

    return apiSuccess({ levels: withUrls });
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

    const { name } = (await req.json()) as { name?: string };
    if (!name || !name.trim()) return apiError('name requis', 'VALIDATION_ERROR', 400);

    const count = await prisma.tourLevel.count({ where: { tourId: params.tourId } });
    const level = await prisma.tourLevel.create({
      data: { tourId: params.tourId, name: name.trim().slice(0, 120), position: count },
    });

    return apiSuccess({ ...level, planUrl: null }, 201);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
