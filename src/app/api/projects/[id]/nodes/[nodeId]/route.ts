import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { getProjectAccess } from '@/lib/access';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; nodeId: string } }
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const access = await getProjectAccess(user, params.id);
    if (!access) return apiError('Accès refusé', 'FORBIDDEN', 403);
    if (!access.canManage && !access.canUpload) return apiError('Gestion des espaces non autorisée', 'FORBIDDEN', 403);
    const node = await prisma.projectStructureNode.findUnique({ where: { id: params.nodeId } });
    if (!node || node.projectId !== params.id) return apiError('Espace introuvable', 'NOT_FOUND', 404);

    // Détacher les fichiers de ce node avant suppression
    await prisma.file.updateMany({
      where: { nodeId: params.nodeId },
      data: { nodeId: null },
    });

    await prisma.projectStructureNode.delete({
      where: { id: params.nodeId },
    });

    await logAudit({ projectId: params.id, userId: user.sub, action: 'node.delete', entityType: 'node', entityId: params.nodeId });
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

    const access = await getProjectAccess(user, params.id);
    if (!access) return apiError('Accès refusé', 'FORBIDDEN', 403);
    if (!access.canManage && !access.canUpload) return apiError('Gestion des espaces non autorisée', 'FORBIDDEN', 403);
    const existing = await prisma.projectStructureNode.findUnique({ where: { id: params.nodeId } });
    if (!existing || existing.projectId !== params.id) return apiError('Espace introuvable', 'NOT_FOUND', 404);

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

    await logAudit({ projectId: params.id, userId: user.sub, action: 'node.update', entityType: 'node', entityId: params.nodeId });
    return apiSuccess(node);
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : 'Erreur',
      'INTERNAL_ERROR',
      500
    );
  }
}
