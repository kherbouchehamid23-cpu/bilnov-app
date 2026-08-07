import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken, signAccessToken, apiError, apiSuccess, IDLE_SECONDS } from '@/lib/auth';
import bcrypt from 'bcryptjs';

// Rafraichit le token d'acces (15 min). Fenetre glissante de 4h d'inactivite :
// chaque activite repousse l'echeance du refresh token de 4h. Au-dela de 4h sans
// activite, le refresh echoue (401) => reconnexion demandee, avec message clair cote client.
// Plafond absolu de session : 30 jours (expiration JWT du refresh token).
export async function POST(req: NextRequest) {
  try {
    const rt = req.cookies.get('refresh_token')?.value;
    if (!rt) return apiError('Session expiree', 'UNAUTHORIZED', 401);
    const payload = verifyToken(rt);
    if (!payload) return apiError('Session expiree', 'UNAUTHORIZED', 401);

    const now = new Date();
    // Respecte la revocation (deconnexion) et la fenetre d'inactivite (expiresAt > now).
    const rows = await prisma.refreshToken.findMany({
      where: { userId: payload.sub, revokedAt: null, expiresAt: { gt: now } },
      select: { id: true, tokenHash: true },
    });
    let matchedId: string | null = null;
    for (const row of rows) {
      if (await bcrypt.compare(rt, row.tokenHash)) { matchedId = row.id; break; }
    }
    if (!matchedId) return apiError('Session expiree', 'UNAUTHORIZED', 401);

    // Fenetre glissante : on repousse l'echeance de 4h a chaque activite (sans rotation du token).
    await prisma.refreshToken.update({
      where: { id: matchedId },
      data: { expiresAt: new Date(now.getTime() + IDLE_SECONDS * 1000) },
    });

    const accessToken = signAccessToken({
      sub: payload.sub, email: payload.email, organizationId: payload.organizationId,
    });
    const response = apiSuccess({ accessToken });
    response.headers.set('Set-Cookie',
      `refresh_token=${rt}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${IDLE_SECONDS}`
    );
    return response;
  } catch {
    return apiError('Erreur serveur', 'INTERNAL_ERROR', 500);
  }
}
