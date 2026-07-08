import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { getProjectAccess } from '@/lib/access';
import { logEvent, notify, participantIds } from '@/lib/cadComments';

// POST : répondre à un commentaire (§9). Journalise + notifie les participants.
export async function POST(req: NextRequest, { params }: { params: { id: string; cid: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const ann = await prisma.cadAnnotation.findUnique({
      where: { id: params.cid },
      include: { file: { select: { projectId: true } } },
    });
    if (!ann || ann.fileId !== params.id) return apiError('Commentaire introuvable', 'NOT_FOUND', 404);
    const access = await getProjectAccess(user, ann.file.projectId);
    if (!access || !access.canView) return apiError('Accès refusé', 'FORBIDDEN', 403);

    if (!access.canReply) return apiError('Droit de répondre requis', 'FORBIDDEN', 403);
    const body = await req.json() as { body?: string };
    if (!body.body?.trim()) return apiError('Réponse vide', 'VALIDATION_ERROR', 400);

    const recipientsBefore = await participantIds(params.cid);
    const reply = await prisma.cadAnnotationReply.create({
      data: { annotationId: params.cid, authorId: user.sub, body: body.body.trim() },
      include: { author: { select: { id: true, firstName: true, lastName: true } } },
    });
    await logEvent(params.cid, user.sub, 'replied', {});
    await notify({
      recipientIds: recipientsBefore,
      actorId: user.sub,
      type: 'COMMENT_REPLIED',
      message: `Nouvelle réponse au commentaire #${ann.number}`,
      projectId: ann.file.projectId, fileId: params.id, annotationId: params.cid,
    });
    return apiSuccess(reply, 201);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
