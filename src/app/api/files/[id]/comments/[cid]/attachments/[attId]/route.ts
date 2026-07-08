import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { getProjectAccess } from '@/lib/access';
import { deleteFile, getSignedFileUrl } from '@/lib/storage';

// GET : URL signée d'aperçu/téléchargement d'une pièce jointe (?download=1).
export async function GET(req: NextRequest, { params }: { params: { id: string; cid: string; attId: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const att = await prisma.cadAnnotationAttachment.findUnique({
      where: { id: params.attId },
      include: { annotation: { include: { file: { select: { projectId: true } } } } },
    });
    if (!att || att.annotationId !== params.cid || att.annotation.fileId !== params.id) {
      return apiError('Pièce jointe introuvable', 'NOT_FOUND', 404);
    }
    const access = await getProjectAccess(user, att.annotation.file.projectId);
    if (!access || !access.canView) return apiError('Accès refusé', 'FORBIDDEN', 403);

    const download = new URL(req.url).searchParams.get('download') === '1';
    const { url } = await getSignedFileUrl(att.storageKey, download ? 'download' : 'view', att.name);
    return apiSuccess({ url });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}

// DELETE : retirer une pièce jointe (uploadeur ou gestionnaire).
export async function DELETE(req: NextRequest, { params }: { params: { id: string; cid: string; attId: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const att = await prisma.cadAnnotationAttachment.findUnique({
      where: { id: params.attId },
      include: { annotation: { include: { file: { select: { projectId: true } } } } },
    });
    if (!att || att.annotationId !== params.cid || att.annotation.fileId !== params.id) {
      return apiError('Pièce jointe introuvable', 'NOT_FOUND', 404);
    }
    const access = await getProjectAccess(user, att.annotation.file.projectId);
    const isUploader = att.uploaderId === user.sub;
    if (!access || (!isUploader && !access.canManage)) return apiError('Suppression non autorisée', 'FORBIDDEN', 403);

    try { await deleteFile(att.storageKey); } catch { /* best effort */ }
    await prisma.cadAnnotationAttachment.delete({ where: { id: params.attId } });
    return apiSuccess({ id: params.attId });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
