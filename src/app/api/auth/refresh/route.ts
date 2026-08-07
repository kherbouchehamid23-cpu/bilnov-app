import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken, signAccessToken, apiError, apiSuccess } from '@/lib/auth';
import bcrypt from 'bcryptjs';

// Rafraichit le token d'acces (15 min) a partir du cookie refresh_token (7 j, HttpOnly).
// Corrige la perte de session au retour : sans cet endpoint, tout appel apres l'expiration
// du token court (~15 min) renvoyait 401 => « Impossible de charger ce projet ».
export async function POST(req: NextRequest) {
  try {
    const rt = req.cookies.get('refresh_token')?.value;
    if (!rt) return apiError('Session expiree', 'UNAUTHORIZED', 401);
    const payload = verifyToken(rt);
    if (!payload) return apiError('Session expiree', 'UNAUTHORIZED', 401);

    // Respecte la revocation (deconnexion) : le refresh token doit exister, non revoque, non expire.
    const rows = await prisma.refreshToken.findMany({
      where: { userId: payload.sub, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { tokenHash: true },
    });
    let match = false;
    for (const row of rows) {
      if (await bcrypt.compare(rt, row.tokenHash)) { match = true; break; }
    }
    if (!match) return apiError('Session expiree', 'UNAUTHORIZED', 401);

    const accessToken = signAccessToken({
      sub: payload.sub, email: payload.email, organizationId: payload.organizationId,
    });
    return apiSuccess({ accessToken });
  } catch {
    return apiError('Erreur serveur', 'INTERNAL_ERROR', 500);
  }
}
