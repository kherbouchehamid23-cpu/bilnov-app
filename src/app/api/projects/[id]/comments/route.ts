import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { getProjectAccess } from '@/lib/access';
import { commentInclude, logActivity, notify } from '@/lib/comments';
import { isType, isPriority, isLocationType, isResponsibility, isStatus } from '@/lib/commentWorkflow';
import { CommentStatus, CommentType, CommentPriority, CommentLocationType, ResponsibilityType, NotificationType, Prisma } from '@prisma/client';

// GET : liste filtrable des commentaires d'un projet (SFD §22).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const access = await getProjectAccess(user, params.id);
    if (!access || !access.canView) return apiError('Accès refusé', 'FORBIDDEN', 403);

    const q = req.nextUrl.searchParams;
    const where: Prisma.CommentWhereInput = { projectId: params.id, deletedAt: null };
    const status = q.get('status'); if (status && isStatus(status)) where.status = status as CommentStatus;
    const type = q.get('type'); if (type && isType(type)) where.type = type as CommentType;
    const priority = q.get('priority'); if (priority && isPriority(priority)) where.priority = priority as CommentPriority;
    const assignee = q.get('assignee'); if (assignee) where.assignees = { some: { userId: assignee } };
    const lotId = q.get('lotId'); if (lotId) where.lotId = lotId;
    const spaceId = q.get('spaceId'); if (spaceId) where.spaceId = spaceId;
    const text = q.get('q');
    if (text) where.OR = [{ title: { contains: text, mode: 'insensitive' } }, { description: { contains: text, mode: 'insensitive' } }];

    const comments = await prisma.comment.findMany({ where, orderBy: { createdAt: 'desc' }, include: commentInclude });
    return apiSuccess({ comments, projectId: params.id, canManage: access.canManage });
  } catch (e) {
    return apiError(e instanceof Error ? e.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}

// POST : créer un commentaire central (affectations + localisations optionnelles).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const access = await getProjectAccess(user, params.id);
    if (!access || !access.canView) return apiError('Accès refusé', 'FORBIDDEN', 403);
    if (!access.canComment) return apiError('Droit de commenter requis', 'FORBIDDEN', 403);

    const body = await req.json() as {
      type?: string; title?: string; description?: string; priority?: string;
      dueDate?: string | null; nodeId?: string; spaceId?: string; lotId?: string;
      tradeId?: string; buildingId?: string; floorId?: string; zoneId?: string; companyId?: string;
      assignees?: { userId?: string; companyId?: string; responsibility?: string }[];
      locations?: { locationType?: string; resourceType?: string; resourceId?: string; resourceVersionId?: string; title?: string; metadata?: unknown }[];
    };
    if (!body.description || !body.description.trim()) return apiError('Description requise', 'VALIDATION_ERROR', 400);
    const type = (body.type && isType(body.type) ? body.type : 'GENERAL') as CommentType;
    const priority = (body.priority && isPriority(body.priority) ? body.priority : 'NORMAL') as CommentPriority;

    const last = await prisma.comment.findFirst({ where: { projectId: params.id }, orderBy: { number: 'desc' }, select: { number: true } });
    const number = (last?.number ?? 0) + 1;

    const assignees = (body.assignees ?? []).filter((a) => a.userId || a.companyId).map((a) => ({
      userId: a.userId ?? null, companyId: a.companyId ?? null,
      responsibility: (a.responsibility && isResponsibility(a.responsibility) ? a.responsibility : 'RESPONSIBLE') as ResponsibilityType,
      assignedById: user.sub,
    }));
    const locations = (body.locations ?? []).filter((l) => l.locationType && isLocationType(l.locationType)).map((l) => ({
      locationType: l.locationType as CommentLocationType,
      resourceType: l.resourceType ?? null, resourceId: l.resourceId ?? null, resourceVersionId: l.resourceVersionId ?? null,
      title: l.title ?? null, metadata: (l.metadata ?? undefined) as Prisma.InputJsonValue, createdById: user.sub,
    }));

    const created = await prisma.comment.create({
      data: {
        projectId: params.id, number, type, priority,
        title: body.title ?? null, description: body.description,
        status: assignees.length > 0 ? CommentStatus.ASSIGNED : CommentStatus.NEW,
        nodeId: body.nodeId ?? null, spaceId: body.spaceId ?? null, lotId: body.lotId ?? null,
        tradeId: body.tradeId ?? null, buildingId: body.buildingId ?? null, floorId: body.floorId ?? null,
        zoneId: body.zoneId ?? null, companyId: body.companyId ?? null,
        createdById: user.sub, dueDate: body.dueDate ? new Date(body.dueDate) : null,
        assignees: { create: assignees }, locations: { create: locations },
      },
      include: commentInclude,
    });
    await logActivity(created.id, user.sub, 'created', undefined, { number, type, priority });
    await notify(assignees.map((a) => a.userId), { actorId: user.sub, projectId: params.id, type: NotificationType.ASSIGNED, message: `Commentaire #${number} : ${body.title ?? body.description.slice(0, 40)}` });
    return apiSuccess(created, 201);
  } catch (e) {
    return apiError(e instanceof Error ? e.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
