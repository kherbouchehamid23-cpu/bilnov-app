import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { randomInt } from 'crypto';

function generateCode(): string {
  // Génère un code à 6 chiffres facile à lire
  return String(randomInt(100000, 999999));
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const codes = await prisma.accessCode.findMany({
      where: { projectId: params.id },
      include: {
        shareRule: true,
        _count: { select: { accessLogs: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return apiSuccess({ codes });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : 'Erreur',
      'INTERNAL_ERROR',
      500
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const body = await req.json() as {
      canView?: boolean;
      canDownload?: boolean;
      canUpload?: boolean;
      canShare?: boolean;
      expiresInDays?: number | null;
    };

    const {
      canView = true,
      canDownload = false,
      canUpload = false,
      canShare = false,
      expiresInDays,
    } = body;

    // Générer un code unique
    let displayCode = generateCode();
    let exists = await prisma.accessCode.findUnique({ where: { code: displayCode } });
    while (exists) {
      displayCode = generateCode();
      exists = await prisma.accessCode.findUnique({ where: { code: displayCode } });
    }

    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const accessCode = await prisma.accessCode.create({
      data: {
        projectId: params.id,
        code: displayCode,
        displayCode,
        createdById: user.sub,
        expiresAt,
        isActive: true,
        shareRule: {
          create: {
            canView,
            canDownload,
            canUpload,
            canShare,
          },
        },
      },
      include: {
        shareRule: true,
        _count: { select: { accessLogs: true } },
      },
    });

    return apiSuccess(accessCode, 201);
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : 'Erreur',
      'INTERNAL_ERROR',
      500
    );
  }
}
