import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { getProjectAccess } from '@/lib/access';
import { uploadFile, getSignedFileUrl } from '@/lib/storage';
import { logActivity, notify } from '@/lib/comments';
import { NotificationType } from '@prisma/client';

const ALLOWED = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip', 'text/plain', 'video/mp4', 'audio/mpeg', 'audio/mp4',
]);
const MAX_BYTES = 25 * 1024 * 1024;

async function loadComment(cid: string) {
  return prisma.comment.findFirst({
    where: { id: cid, deletedAt: null },
    select: { id: true, projectId: true, number: true, createdById: true, project: { select: { organizationId: true } }, assignees: { select: { userId: true } } },
  });
}

export async function GET(req: NextRequest, { params }: { params: { cid: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const c = await loadComment(params.cid);
    if (!c) return apiError('Commentaire introuvable', 'NOT_FOUND', 404);
    const access = await getProjectAccess(user, c.projectId);
    if (!access || !access.canView) return apiError('Accès refusé', 'FORBIDDEN', 403);
    const atts = await prisma.commentAttachment.findMany({ where: { commentId: params.cid, deletedAt: null }, orderBy: { createdAt: 'asc' } });
    const withUrls = await Promise.all(atts.map(async (a) => ({ ...a, url: (await getSignedFileUrl(a.storageKey, 'view', a.filename)).url })));
    return apiSuccess({ attachments: withUrls });
  } catch (e) {
    return apiError(e instanceof Error ? e.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}

export async function POST(req: NextRequest, { params }: { params: { cid: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const c = await loadComment(params.cid);
    if (!c) return apiError('Commentaire introuvable', 'NOT_FOUND', 404);
    const access = await getProjectAccess(user, c.projectId);
    if (!access || !access.canView) return apiError('Accès refusé', 'FORBIDDEN', 403);
    if (!access.canComment && !access.canReply) return apiError('Droit requis', 'FORBIDDEN', 403);

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return apiError('Fichier manquant', 'VALIDATION_ERROR', 400);
    const mime = file.type || 'application/octet-stream';
    if (!ALLOWED.has(mime)) return apiError('Format non autorisé', 'VALIDATION_ERROR', 400);
    if (file.size > MAX_BYTES) return apiError('Fichier trop volumineux (max 25 Mo)', 'VALIDATION_ERROR', 400);

    const buffer = Buffer.from(await file.arrayBuffer());
    const { storageKey, sizeBytes } = await uploadFile(buffer, file.name, mime, c.project.organizationId, c.projectId);
    const att = await prisma.commentAttachment.create({
      data: { commentId: params.cid, filename: file.name, storageKey, mimeType: mime, fileSize: sizeBytes, uploadedById: user.sub },
    });
    await logActivity(params.cid, user.sub, 'attachment_added', undefined, { name: file.name });
    await notify([c.createdById, ...c.assignees.map((a) => a.userId)], { actorId: user.sub, projectId: c.projectId, type: NotificationType.ATTACHMENT_ADDED, message: `Pièce jointe au commentaire #${c.number}` });
    return apiSuccess(att, 201);
  } catch (e) {
    return apiError(e instanceof Error ? e.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { cid: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const attId = req.nextUrl.searchParams.get('attachmentId');
    if (!attId) return apiError('attachmentId requis', 'VALIDATION_ERROR', 400);
    const att = await prisma.commentAttachment.findFirst({ where: { id: attId, commentId: params.cid, deletedAt: null }, select: { uploadedById: true } });
    if (!att) return apiError('Pièce jointe introuvable', 'NOT_FOUND', 404);
    const c = await loadComment(params.cid);
    if (!c) return apiError('Commentaire introuvable', 'NOT_FOUND', 404);
    const access = await getProjectAccess(user, c.projectId);
    if (!access || (att.uploadedById !== user.sub && !access.canManage)) return apiError('Suppression non autorisée', 'FORBIDDEN', 403);
    await prisma.commentAttachment.update({ where: { id: attId }, data: { deletedAt: new Date() } });
    return apiSuccess({ id: attId });
  } catch (e) {
    return apiError(e instanceof Error ? e.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
