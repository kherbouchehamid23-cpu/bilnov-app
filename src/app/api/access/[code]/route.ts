import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError, apiSuccess } from '@/lib/auth';

export async function GET(
  req: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    const code = await prisma.accessCode.findUnique({
      where: { code: params.code },
      include: {
        shareRule: true,
        project: {
          select: {
            id: true,
            name: true,
            sector: true,
          },
        },
      },
    });

    if (!code) {
      return apiError('Code invalide', 'INVALID_CODE', 404);
    }

    if (!code.isActive) {
      return apiError('Ce code a été désactivé', 'CODE_INACTIVE', 403);
    }

    if (code.expiresAt && code.expiresAt < new Date()) {
      return apiError('Ce code a expiré', 'CODE_EXPIRED', 403);
    }

    // Enregistrer l'accès
    const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? null;
    await prisma.accessLog.create({
      data: { accessCodeId: code.id, ipAddress: ip },
    });

    return apiSuccess({
      project: code.project,
      permissions: {
        canView: code.shareRule?.canView ?? true,
        canDownload: code.shareRule?.canDownload ?? false,
        canUpload: code.shareRule?.canUpload ?? false,
        canShare: code.shareRule?.canShare ?? false,
      },
    });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : 'Erreur',
      'INTERNAL_ERROR',
      500
    );
  }
}
