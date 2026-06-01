import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const payload = await getCurrentUser(req);
    if (!payload) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { organization: true },
    });

    if (!user) return apiError('Utilisateur introuvable', 'NOT_FOUND', 404);

    return apiSuccess({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
      organizationId: user.organization?.id ?? null,
      organizationName: user.organization?.name ?? null,
      plan: user.organization?.plan ?? 'TRIAL',
    });
  } catch (error) {
    return apiError('Erreur serveur', 'INTERNAL_ERROR', 500);
  }
}
