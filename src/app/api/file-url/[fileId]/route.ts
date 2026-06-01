import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { getSignedFileUrl } from '@/lib/storage';

export async function GET(
  req: NextRequest,
  { params }: { params: { fileId: string } }
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const file = await prisma.file.findUnique({
      where: { id: params.fileId },
    });

    if (!file) return apiError('Fichier introuvable', 'NOT_FOUND', 404);

    const purpose = (req.nextUrl.searchParams.get('purpose') ?? 'view') as 'view' | 'download';
    const { url, expiresAt } = await getSignedFileUrl(file.storageKey, purpose, file.name);

    return apiSuccess({ url, expiresAt, fileType: file.fileType, name: file.name });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue';
    return apiError(`Erreur: ${message}`, 'INTERNAL_ERROR', 500);
  }
}
