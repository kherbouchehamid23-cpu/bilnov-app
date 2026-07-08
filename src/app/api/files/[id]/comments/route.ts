import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { getProjectAccess } from '@/lib/access';
import { commentInclude, statusColor, logEvent, notify, isStatus, isPriority } from '@/lib/cadComments';
import { CadPriority, CadStatus } from '@prisma/client';

// GET : liste des commentaires-fiches d'un fichier (accès projet requis).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const file = await prisma.file.findUnique({ where: { id: params.id }, select: { projectId: true } });
    if (!file) return apiError('Fichier introuvable', 'NOT_FOUND', 404);
    const access = await getProjectAccess(user, file.projectId);
    if (!access || !access.canView) return apiError('Accès refusé', 'FORBIDDEN', 403);

    const comments = await prisma.cadAnnotation.findMany({
      where: { fileId: params.id },
      orderBy: { number: 'asc' },
      include: commentInclude,
    });
    return apiSuccess({ comments });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}

// POST : créer un commentaire-fiche. Corps : x, y (coords modèle), text,
// title?, priority?, status?, assigneeId?, dueDate?.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const file = await prisma.file.findUnique({ where: { id: params.id }, select: { projectId: true } });
    if (!file) return apiError('Fichier introuvable', 'NOT_FOUND', 404);
    const access = await getProjectAccess(user, file.projectId);
    if (!access || !access.canView) return apiError('Accès refusé', 'FORBIDDEN', 403);

    const body = await req.json() as {
      x?: number; y?: number; title?: string; text?: string;
      priority?: string; status?: string; assigneeId?: string | null; dueDate?: string | null;
    };
    if (typeof body.x !== 'number' || typeof body.y !== 'number' || !body.text?.trim()) {
      return apiError('x, y et text requis', 'VALIDATION_ERROR', 400);
    }
    const priority: CadPriority = isPriority(body.priority) ? body.priority : CadPriority.NORMAL;
    const status: CadStatus = isStatus(body.status) ? body.status : CadStatus.OPEN;

    const last = await prisma.cadAnnotation.findFirst({
      where: { fileId: params.id }, orderBy: { number: 'desc' }, select: { number: true },
    });
    const number = (last?.number ?? 0) + 1;

    const created = await prisma.cadAnnotation.create({
      data: {
        fileId: params.id,
        authorId: user.sub,
        number,
        type: 'marker',
        x: body.x,
        y: body.y,
        title: body.title?.trim() || null,
        text: body.text.trim(),
        priority,
        status,
        assigneeId: body.assigneeId || null,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        color: statusColor(status),
      },
      include: commentInclude,
    });

    await logEvent(created.id, user.sub, 'created', { number });
    await notify({
      recipientIds: [created.assigneeId],
      actorId: user.sub,
      type: 'COMMENT_CREATED',
      message: `Nouveau commentaire #${number}${created.title ? ' – ' + created.title : ''}`,
      projectId: file.projectId,
      fileId: params.id,
      annotationId: created.id,
    });
    return apiSuccess(created, 201);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
