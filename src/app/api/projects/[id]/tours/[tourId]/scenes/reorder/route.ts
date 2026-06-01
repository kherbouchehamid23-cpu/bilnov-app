import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; tourId: string } }
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const body = await req.json() as { order?: string[] };
    const { order } = body;

    if (!order || !Array.isArray(order)) {
      return apiError('order requis (tableau d\'IDs)', 'VALIDATION_ERROR', 400);
    }

    // Mettre à jour les positions en parallèle
    await Promise.all(
      order.map((sceneId, index) =>
        prisma.tourScene.update({
          where: { id: sceneId },
          data: { position: index },
        })
      )
    );

    return apiSuccess({ message: 'Ordre mis à jour' });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : 'Erreur',
      'INTERNAL_ERROR',
      500
    );
  }
}
