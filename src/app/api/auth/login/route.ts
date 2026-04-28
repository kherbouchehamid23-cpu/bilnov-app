import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { comparePassword, signAccessToken, signRefreshToken, apiError, apiSuccess } from '@/lib/auth';
import bcrypt from 'bcryptjs';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return apiError('Email et mot de passe requis', 'VALIDATION_ERROR', 400);
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { organization: true },
    });

    if (!user || !user.passwordHash) {
      return apiError('Email ou mot de passe incorrect', 'INVALID_CREDENTIALS', 401);
    }

    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) {
      return apiError('Email ou mot de passe incorrect', 'INVALID_CREDENTIALS', 401);
    }

    const org = user.organization;
    const organizationId = org?.id ?? '';

    const accessToken = signAccessToken({ sub: user.id, email, organizationId });
    const refreshToken = signRefreshToken({ sub: user.id, email, organizationId });
    const tokenHash = await bcrypt.hash(refreshToken, 10);

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    const response = apiSuccess({
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: user.avatarUrl,
        organizationId,
        organizationName: org?.name ?? '',
        plan: org?.plan ?? 'TRIAL',
      },
    });

    response.headers.set('Set-Cookie',
      `refresh_token=${refreshToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${7 * 24 * 60 * 60}`
    );

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return apiError('Erreur serveur', 'INTERNAL_ERROR', 500);
  }
}
