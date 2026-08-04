import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { deleteFile as deleteFileFromStorage } from '@/lib/storage';
import { getProjectAccess } from '@/lib/access';

export async function PUT(req: NextRequest, { params }: { params: { id: string; fileId: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const file = await prisma.file.findUnique({ where: { id: params.fileId } });
    if (!file || file.projectId !== params.id || file.deletedAt || file.status !== 'ACTIVE') {
      return apiError('Fichier introuvable', 'NOT_FOUND', 404);
    }

    const access = await getProjectAccess(user, params.id);
    if (!access) return apiError('Accès refusé', 'FORBIDDEN', 403);
    if (!access.canModify) return apiError('Modification non autorisée', 'FORBIDDEN', 403);

    const body = await req.json() as { name?: string; nodeId?: string | null; nodeIds?: string[] };
    if (!body.name || !body.name.trim()) {
      return apiError('Nom du fichier requis', 'VALIDATION_ERROR', 400);
    }

    const hasSpaces = Array.isArray(body.nodeIds);
    const spaceIds = hasSpaces ? [...new Set((body.nodeIds as string[]).filter(Boolean))] : [];
    const primaryNodeId = hasSpaces
      ? (spaceIds[0] ?? null)
      : (body.nodeId === undefined ? file.nodeId : body.nodeId);

    const updatedFile = await prisma.file.update({
      where: { id: file.id },
      data: {
        name: body.name.trim(),
        nodeId: primaryNodeId,
      },
    });

    if (hasSpaces) {
      await prisma.fileSpace.deleteMany({ where: { fileId: file.id } });
      if (spaceIds.length) {
        await prisma.fileSpace.createMany({
          data: spaceIds.map((nid) => ({ fileId: file.id, nodeId: nid })),
          skipDuplicates: true,
        });
      }
    }

    await logAudit({ projectId: params.id, userId: user.sub, action: 'file.update', entityType: 'file', entityId: file.id });
    return apiSuccess(updatedFile);
  } catch (error) {
    console.error('PUT file error:', error);
    return apiError('Erreur lors de la modification du fichier', 'INTERNAL_ERROR', 500);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string; fileId: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const file = await prisma.file.findUnique({ where: { id: params.fileId } });
    if (!file || file.projectId !== params.id || file.deletedAt || file.status !== 'ACTIVE') {
      return apiError('Fichier introuvable', 'NOT_FOUND', 404);
    }

    const access = await getProjectAccess(user, params.id);
    if (!access) return apiError('Accès refusé', 'FORBIDDEN', 403);
    if (!access.canDelete) return apiError('Suppression non autorisée', 'FORBIDDEN', 403);

    try {
      await deleteFileFromStorage(file.storageKey);
    } catch (error) {
      console.warn('Suppression stockage impossible:', error);
    }

    await prisma.file.update({
      where: { id: file.id },
      data: {
        status: 'DELETED',
        deletedAt: new Date(),
      },
    });

    await prisma.organization.update({
      where: { id: user.organizationId },
      data: { storageUsedBytes: { decrement: file.sizeBytes as bigint } },
    });

    await logAudit({ projectId: params.id, userId: user.sub, action: 'file.delete', entityType: 'file', entityId: file.id });
    return apiSuccess({ id: file.id });
  } catch (error) {
    console.error('DELETE file error:', error);
    return apiError('Erreur lors de la suppression du fichier', 'INTERNAL_ERROR', 500);
  }
}
