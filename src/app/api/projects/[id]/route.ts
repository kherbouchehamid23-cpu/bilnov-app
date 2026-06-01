import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const project = await prisma.project.findFirst({
      where: { id: params.id, organizationId: user.organizationId, deletedAt: null },
      include: { _count: { select: { files: true, tours: true, members: true } } },
    });

    if (!project) return apiError('Projet introuvable', 'NOT_FOUND', 404);
    return apiSuccess(project);
  } catch {
    return apiError('Erreur serveur', 'INTERNAL_ERROR', 500);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const body = await req.json();
    const project = await prisma.project.updateMany({
      where: { id: params.id, organizationId: user.organizationId },
      data: { name: body.name, description: body.description, sector: body.sector },
    });

    return apiSuccess(project);
  } catch {
    return apiError('Erreur serveur', 'INTERNAL_ERROR', 500);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    await prisma.project.updateMany({
      where: { id: params.id, organizationId: user.organizationId },
      data: { deletedAt: new Date(), status: 'DELETED' },
    });

    return apiSuccess({ message: 'Projet supprimé' });
  } catch {
    return apiError('Erreur serveur', 'INTERNAL_ERROR', 500);
  }
}
