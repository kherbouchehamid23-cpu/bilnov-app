import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const payload = await getCurrentUser(req);
    if (payload) {
      await prisma.refreshToken.updateMany({
        where: { userId: payload.sub, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    const response = apiSuccess({ message: 'Déconnecté' });
    response.headers.set('Set-Cookie',
      'refresh_token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'
    );
    return response;
  } catch {
    return apiError('Erreur serveur', 'INTERNAL_ERROR', 500);
  }
}
