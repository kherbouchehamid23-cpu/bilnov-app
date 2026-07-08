import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { getProjectAccess } from '@/lib/access';
import { uploadFile } from '@/lib/storage';
import { logEvent, notify, participantIds } from '@/lib/cadComments';
import { CadAttachmentKind } from '@prisma/client';

const PHOTO_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const PDF_MIME = 'application/pdf';
const MAX_BYTES = 25 * 1024 * 1024; // 25 Mo / fichier (MVP)

// POST : ajouter une pièce jointe (photo ou PDF) via multipart/form-data (§10).
export async function POST(req: NextRequest, { params }: { params: { id: string; cid: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const ann = await prisma.cadAnnotation.findUnique({
      where: { id: params.cid },
      include: { file: { select: { projectId: true, project: { select: { organizationId: true } } } } },
    });
    if (!ann || ann.fileId !== params.id) return apiError('Commentaire introuvable', 'NOT_FOUND', 404);
    const access = await getProjectAccess(user, ann.file.projectId);
    if (!access || !access.canView) return apiError('Accès refusé', 'FORBIDDEN', 403);

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return apiError('Fichier manquant', 'VALIDATION_ERROR', 400);
    const mime = file.type || 'application/octet-stream';
    const isPhoto = PHOTO_MIME.has(mime);
    const isPdf = mime === PDF_MIME;
    if (!isPhoto && !isPdf) return apiError('Format non autorisé (JPG, PNG, WEBP ou PDF)', 'VALIDATION_ERROR', 400);
    if (file.size > MAX_BYTES) return apiError('Fichier trop volumineux (max 25 Mo)', 'VALIDATION_ERROR', 400);

    const buffer = Buffer.from(await file.arrayBuffer());
    const { storageKey, sizeBytes } = await uploadFile(
      buffer, file.name, mime, ann.file.project.organizationId, ann.file.projectId,
    );

    const att = await prisma.cadAnnotationAttachment.create({
      data: {
        annotationId: params.cid,
        uploaderId: user.sub,
        kind: isPhoto ? CadAttachmentKind.PHOTO : CadAttachmentKind.PDF,
        name: file.name,
        storageKey,
        mimeType: mime,
        sizeBytes: BigInt(sizeBytes),
      },
    });
    await logEvent(params.cid, user.sub, 'attachment_added', { name: file.name });
    const recipients = await participantIds(params.cid);
    await notify({
      recipientIds: recipients,
      actorId: user.sub,
      type: 'ATTACHMENT_ADDED',
      message: `Pièce jointe ajoutée au commentaire #${ann.number}`,
      projectId: ann.file.projectId, fileId: params.id, annotationId: params.cid,
    });
    return apiSuccess(att, 201);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
