// ============================================================
// FILE 1: src/app/api/projects/[id]/tours/route.ts
// ============================================================
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { getProjectAccess } from '@/lib/access';
import { getSignedFileUrl } from '@/lib/storage';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const access = await getProjectAccess(user, params.id);
    if (!access || !access.canView) return apiError('Accès refusé', 'FORBIDDEN', 403);
    const tours = await prisma.virtualTour.findMany({
      where: { projectId: params.id },
      include: {
        _count: { select: { scenes: true } },
        scenes: { where: { hidden: false }, orderBy: [{ isInitial: 'desc' }, { position: 'asc' }], take: 1, select: { thumbnailKey: true, previewKey: true, imageUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const sign = async (k: string | null | undefined): Promise<string | null> => {
      if (!k) return null;
      try { return (await getSignedFileUrl(k, 'view')).url; } catch { return null; }
    };
    const ids = tours.map((t) => t.id);
    const visRows = ids.length
      ? await prisma.tourScene.groupBy({ by: ['tourId'], where: { tourId: { in: ids }, hidden: false }, _count: { _all: true } })
      : [];
    const visMap: Record<string, number> = Object.fromEntries(visRows.map((v) => [v.tourId, v._count._all]));
    const withCover = await Promise.all(tours.map(async (t) => {
      const s = t.scenes[0];
      const coverUrl = s ? ((await sign(s.thumbnailKey)) ?? (await sign(s.previewKey)) ?? (await sign(s.imageUrl))) : null;
      const rest: Record<string, unknown> = { ...t };
      delete rest.scenes;
      return { ...rest, coverUrl, sceneCount: t._count.scenes, visibleSceneCount: visMap[t.id] ?? 0 };
    }));
    return apiSuccess({ tours: withCover });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const access = await getProjectAccess(user, params.id);
    if (!access || !access.canManage) return apiError('Accès refusé', 'FORBIDDEN', 403);
    const { name, nodeId } = (await req.json()) as { name?: string; nodeId?: string };
    if (!name) return apiError('Nom requis', 'VALIDATION_ERROR', 400);
    const userId = user.sub;
    const tour = await prisma.virtualTour.create({
      data: { projectId: params.id, nodeId: nodeId ?? null, name, createdById: userId },
    });
    return apiSuccess(tour, 201);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
