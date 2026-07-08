import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { getProjectAccess } from '@/lib/access';

// DELETE : supprimer une mesure (auteur ou gestionnaire).
export async function DELETE(req: NextRequest, { params }: { params: { id: string; mid: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const m = await prisma.cadMeasurement.findUnique({
      where: { id: params.mid },
      include: { file: { select: { projectId: true } } },
    });
    if (!m || m.fileId !== params.id) return apiError('Mesure introuvable', 'NOT_FOUND', 404);
    const access = await getProjectAccess(user, m.file.projectId);
    const isAuthor = m.authorId === user.sub;
    if (!access || (!isAuthor && !access.canManage)) return apiError('Suppression non autorisée', 'FORBIDDEN', 403);

    await prisma.cadMeasurement.delete({ where: { id: params.mid } });
    return apiSuccess({ id: params.mid });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
