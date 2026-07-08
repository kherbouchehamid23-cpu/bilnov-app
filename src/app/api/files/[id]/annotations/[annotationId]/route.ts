import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { getProjectAccess } from '@/lib/access';

// DELETE : supprimer une annotation (auteur ou propriétaire du projet)
export async function DELETE(req: NextRequest, { params }: { params: { id: string; annotationId: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const ann = await prisma.cadAnnotation.findUnique({
      where: { id: params.annotationId },
      include: { file: { select: { projectId: true } } },
    });
    if (!ann || ann.fileId !== params.id) return apiError('Annotation introuvable', 'NOT_FOUND', 404);

    const access = await getProjectAccess(user, ann.file.projectId);
    const isAuthor = ann.authorId === user.sub;
    if (!access || (!isAuthor && !access.canManage)) {
      return apiError('Suppression non autorisée', 'FORBIDDEN', 403);
    }

    await prisma.cadAnnotation.delete({ where: { id: params.annotationId } });
    return apiSuccess({ id: params.annotationId });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
