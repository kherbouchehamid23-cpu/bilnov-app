// ============================================================
// FILE 1: src/app/api/projects/[id]/tours/route.ts
// ============================================================
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const tours = await prisma.virtualTour.findMany({
      where: { projectId: params.id },
      include: { _count: { select: { scenes: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return apiSuccess({ tours });
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
