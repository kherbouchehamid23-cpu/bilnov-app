import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; nodeId: string } }
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    // Détacher les fichiers de ce node avant suppression
    await prisma.file.updateMany({
      where: { nodeId: params.nodeId },
      data: { nodeId: null },
    });

    await prisma.projectStructureNode.delete({
      where: { id: params.nodeId },
    });

    return apiSuccess({ message: 'Espace supprimé' });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : 'Erreur',
      'INTERNAL_ERROR',
      500
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; nodeId: string } }
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const body = await req.json() as {
      name?: string;
      nodeType?: string;
      position?: number;
    };

    const node = await prisma.projectStructureNode.update({
      where: { id: params.nodeId },
      data: {
        name: body.name,
        nodeType: body.nodeType,
        position: body.position,
      },
    });

    return apiSuccess(node);
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : 'Erreur',
      'INTERNAL_ERROR',
      500
    );
  }
}
