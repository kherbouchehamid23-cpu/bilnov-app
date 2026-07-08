import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';

// GET : notifications de l'utilisateur courant (§13). ?unread=1 pour non-lues.
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const unreadOnly = new URL(req.url).searchParams.get('unread') === '1';
    const notifications = await prisma.notification.findMany({
      where: { userId: user.sub, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { actor: { select: { id: true, firstName: true, lastName: true } } },
    });
    const unreadCount = await prisma.notification.count({ where: { userId: user.sub, readAt: null } });
    return apiSuccess({ notifications, unreadCount });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}

// PATCH : marquer des notifications comme lues. Corps : { ids?: string[] } ou
// { all: true }.
export async function PATCH(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const body = await req.json() as { ids?: string[]; all?: boolean };
    const where = body.all
      ? { userId: user.sub, readAt: null }
      : { userId: user.sub, id: { in: body.ids ?? [] } };
    await prisma.notification.updateMany({ where, data: { readAt: new Date() } });
    return apiSuccess({ ok: true });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
