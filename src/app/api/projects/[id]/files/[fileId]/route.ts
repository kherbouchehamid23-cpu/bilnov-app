import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { deleteFile as deleteFileFromStorage } from '@/lib/storage';

export async function PUT(req: NextRequest, { params }: { params: { id: string; fileId: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const file = await prisma.file.findUnique({ where: { id: params.fileId } });
    if (!file || file.projectId !== params.id || file.deletedAt || file.status !== 'ACTIVE') {
      return apiError('Fichier introuvable', 'NOT_FOUND', 404);
    }

    const body = await req.json() as { name?: string; nodeId?: string | null };
    if (!body.name || !body.name.trim()) {
      return apiError('Nom du fichier requis', 'VALIDATION_ERROR', 400);
    }

    const updatedFile = await prisma.file.update({
      where: { id: file.id },
      data: {
        name: body.name.trim(),
        nodeId: body.nodeId === undefined ? file.nodeId : body.nodeId,
      },
    });

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

    return apiSuccess({ id: file.id });
  } catch (error) {
    console.error('DELETE file error:', error);
    return apiError('Erreur lors de la suppression du fichier', 'INTERNAL_ERROR', 500);
  }
}
