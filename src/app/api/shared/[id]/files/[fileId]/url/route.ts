import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError, apiSuccess } from '@/lib/auth';
import { getSignedFileUrl } from '@/lib/storage';

async function validateCode(code: string, projectId: string) {
  const accessCode = await prisma.accessCode.findUnique({
    where: { code },
    include: { shareRule: true },
  });

  if (!accessCode) return null;
  if (!accessCode.isActive) return null;
  if (accessCode.projectId !== projectId) return null;
  if (accessCode.expiresAt && accessCode.expiresAt < new Date()) return null;

  return accessCode;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; fileId: string } }
) {
  try {
    const code = req.nextUrl.searchParams.get('code') ?? '';
    if (!code) return apiError('Code requis', 'VALIDATION_ERROR', 400);

    const accessCode = await validateCode(code, params.id);
    if (!accessCode) return apiError('Code invalide ou expiré', 'INVALID_CODE', 403);
    if (!accessCode.shareRule?.canView) return apiError('Accès non autorisé', 'FORBIDDEN', 403);

    const file = await prisma.file.findUnique({ where: { id: params.fileId } });
    if (!file) return apiError('Fichier introuvable', 'NOT_FOUND', 404);

    const purpose = accessCode.shareRule?.canDownload ? 'download' : 'view';
    const { url, expiresAt } = await getSignedFileUrl(file.storageKey, purpose, file.name);

    return apiSuccess({ url, expiresAt });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : 'Erreur',
      'INTERNAL_ERROR',
      500
    );
  }
}
