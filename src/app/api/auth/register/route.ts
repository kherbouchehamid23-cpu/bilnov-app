import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword, signAccessToken, signRefreshToken, apiError, apiSuccess } from '@/lib/auth';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, firstName, lastName } = body;

    if (!email || !password || !firstName || !lastName) {
      return apiError('Tous les champs sont requis', 'VALIDATION_ERROR', 400);
    }

    if (password.length < 8) {
      return apiError('Le mot de passe doit contenir au moins 8 caractères', 'VALIDATION_ERROR', 400);
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return apiError('Un compte existe déjà avec cet email', 'EMAIL_ALREADY_EXISTS', 409);
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: { email, passwordHash, firstName, lastName },
    });

    const org = await prisma.organization.create({
      data: {
        name: `${firstName} ${lastName}`,
        ownerId: user.id,
        planExpiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    });

    await prisma.role.create({
      data: { organizationId: org.id, name: 'owner', isSystem: true },
    });

    const accessToken = signAccessToken({ sub: user.id, email, organizationId: org.id });
    const refreshToken = signRefreshToken({ sub: user.id, email, organizationId: org.id });
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
        avatarUrl: null,
        organizationId: org.id,
        organizationName: org.name,
        plan: org.plan,
      },
    }, 201);

    response.headers.set('Set-Cookie',
      `refresh_token=${refreshToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${7 * 24 * 60 * 60}`
    );

    return response;
  } catch (error) {
    console.error('Register error:', error);
    return apiError('Erreur serveur', 'INTERNAL_ERROR', 500);
  }
}
