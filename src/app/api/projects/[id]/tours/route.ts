import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';

export async function GET(req, { params }) {
  try {
    const user = await getCurrentUser(req);
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

export async function POST(req, { params }) {
  try {
    const user = await getCurrentUser(req);
    const { name, nodeId } = await req.json();
    const tour = await prisma.virtualTour.create({
      data: { projectId: params.id, nodeId: nodeId ?? null, name, createdById: user.sub },
    });
    return apiSuccess(tour, 201);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
