import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { getSignedFileUrl } from '@/lib/storage';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const file = await prisma.file.findUnique({ where: { id: params.id } });
    if (!file) return apiError('Fichier introuvable', 'NOT_FOUND', 404);

    const purpose = req.nextUrl.searchParams.get('purpose') as 'view' | 'download' ?? 'view';
    const { url, expiresAt } = await getSignedFileUrl(file.storageKey, purpose, file.name);

    return apiSuccess({ url, expiresAt });
  } catch (error) {
    console.error('URL error:', error);
    return apiError('Erreur serveur', 'INTERNAL_ERROR', 500);
  }
}
