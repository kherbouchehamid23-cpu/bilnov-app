import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getProjectAccess } from '@/lib/access';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifie', 'UNAUTHORIZED', 401);
    const access = await getProjectAccess(user, params.id);
    if (!access || !access.canManage) return apiError('Acces refuse', 'FORBIDDEN', 403);
    const logs = await prisma.auditLog.findMany({
      where: { projectId: params.id },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return apiSuccess({ logs });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
