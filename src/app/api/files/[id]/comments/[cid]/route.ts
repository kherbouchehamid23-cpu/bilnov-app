import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { getProjectAccess } from '@/lib/access';
import { commentInclude, statusColor, logEvent, notify, participantIds, isStatus, isPriority } from '@/lib/cadComments';
import { CadStatus, Prisma } from '@prisma/client';

async function load(fileId: string, cid: string) {
  const ann = await prisma.cadAnnotation.findUnique({
    where: { id: cid },
    include: { file: { select: { projectId: true } } },
  });
  if (!ann || ann.fileId !== fileId) return null;
  return ann;
}

// GET : détail complet d'une fiche.
export async function GET(req: NextRequest, { params }: { params: { id: string; cid: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const ann = await load(params.id, params.cid);
    if (!ann) return apiError('Commentaire introuvable', 'NOT_FOUND', 404);
    const access = await getProjectAccess(user, ann.file.projectId);
    if (!access || !access.canView) return apiError('Accès refusé', 'FORBIDDEN', 403);

    const full = await prisma.cadAnnotation.findUnique({ where: { id: params.cid }, include: commentInclude });
    return apiSuccess(full);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}

// PATCH : mettre à jour la fiche (statut/workflow §7, champs). Journalise
// chaque changement (§8) et notifie les participants (§13).
export async function PATCH(req: NextRequest, { params }: { params: { id: string; cid: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const ann = await load(params.id, params.cid);
    if (!ann) return apiError('Commentaire introuvable', 'NOT_FOUND', 404);
    const access = await getProjectAccess(user, ann.file.projectId);
    if (!access || !access.canView) return apiError('Accès refusé', 'FORBIDDEN', 403);
    const isAuthor = ann.authorId === user.sub;
    // Édition du contenu réservée à l'auteur / gestionnaire ; changement de
    // statut ouvert à tout intervenant ayant accès (workflow collaboratif).
    const canEditContent = isAuthor || access.canManage;

    const body = await req.json() as {
      title?: string; text?: string; priority?: string;
      status?: string; assigneeId?: string | null; dueDate?: string | null;
    };
    const data: Prisma.CadAnnotationUpdateInput = {};
    const events: { type: string; meta: Prisma.InputJsonValue }[] = [];
    let statusChanged = false;
    let assigned = false;

    if (body.status !== undefined) {
      if (!isStatus(body.status)) return apiError('Statut invalide', 'VALIDATION_ERROR', 400);
      const terminal = body.status === 'VALIDATED' || body.status === 'CLOSED' || body.status === 'ARCHIVED';
      if (terminal && !access.canValidate && !access.canManage) return apiError('Droit de valider/clôturer requis', 'FORBIDDEN', 403);
      if (body.status !== ann.status) {
        data.status = body.status;
        data.color = statusColor(body.status);
        events.push({ type: 'status_changed', meta: { from: ann.status, to: body.status } });
        statusChanged = true;
      }
    }
    if (body.assigneeId !== undefined && body.assigneeId !== ann.assigneeId) {
      if (!canEditContent) return apiError('Modification non autorisée', 'FORBIDDEN', 403);
      data.assignee = body.assigneeId ? { connect: { id: body.assigneeId } } : { disconnect: true };
      events.push({ type: 'assigned', meta: { to: body.assigneeId } });
      assigned = true;
    }
    if (body.title !== undefined && canEditContent) { data.title = body.title.trim() || null; events.push({ type: 'edited', meta: { field: 'title' } }); }
    if (body.text !== undefined && canEditContent && body.text.trim()) { data.text = body.text.trim(); events.push({ type: 'edited', meta: { field: 'text' } }); }
    if (body.priority !== undefined && canEditContent) {
      if (!isPriority(body.priority)) return apiError('Priorité invalide', 'VALIDATION_ERROR', 400);
      data.priority = body.priority;
      events.push({ type: 'priority_changed', meta: { to: body.priority } });
    }
    if (body.dueDate !== undefined && canEditContent) {
      data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
      events.push({ type: 'due_changed', meta: { to: body.dueDate ?? null } });
    }

    const updated = await prisma.cadAnnotation.update({ where: { id: params.cid }, data, include: commentInclude });
    for (const e of events) await logEvent(params.cid, user.sub, e.type, e.meta);

    if (statusChanged) {
      const recipients = await participantIds(params.cid);
      const closed = updated.status === CadStatus.CLOSED || updated.status === CadStatus.ARCHIVED;
      await notify({
        recipientIds: recipients,
        actorId: user.sub,
        type: closed ? 'COMMENT_CLOSED' : 'STATUS_CHANGED',
        message: `Commentaire #${updated.number} : statut → ${updated.status}`,
        projectId: ann.file.projectId, fileId: params.id, annotationId: params.cid,
      });
    }
    if (assigned && updated.assigneeId) {
      await notify({
        recipientIds: [updated.assigneeId],
        actorId: user.sub,
        type: 'ASSIGNED',
        message: `Commentaire #${updated.number} vous a été assigné`,
        projectId: ann.file.projectId, fileId: params.id, annotationId: params.cid,
      });
    }
    return apiSuccess(updated);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}

// DELETE : supprimer une fiche (auteur ou gestionnaire du projet).
export async function DELETE(req: NextRequest, { params }: { params: { id: string; cid: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const ann = await load(params.id, params.cid);
    if (!ann) return apiError('Commentaire introuvable', 'NOT_FOUND', 404);
    const access = await getProjectAccess(user, ann.file.projectId);
    const isAuthor = ann.authorId === user.sub;
    if (!access || (!isAuthor && !access.canManage)) return apiError('Suppression non autorisée', 'FORBIDDEN', 403);

    await prisma.cadAnnotation.delete({ where: { id: params.cid } });
    return apiSuccess({ id: params.cid });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
