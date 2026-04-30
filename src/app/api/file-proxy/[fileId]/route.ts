import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken, apiError } from '@/lib/auth';
import { getSignedFileUrl } from '@/lib/storage';

export async function GET(
  req: NextRequest,
  { params }: { params: { fileId: string } }
) {
  try {
    const authHeader = req.headers.get('authorization');
    const queryToken = req.nextUrl.searchParams.get('token');
    const token = authHeader?.replace('Bearer ', '') ?? queryToken ?? '';

    const user = verifyToken(token);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const file = await prisma.file.findUnique({ where: { id: params.fileId } });
    if (!file) return apiError('Fichier introuvable', 'NOT_FOUND', 404);

    const { url } = await getSignedFileUrl(file.storageKey, 'view', file.name);
    const r2Res = await fetch(url);
    if (!r2Res.ok) return apiError('Erreur stockage', 'STORAGE_ERROR', 502);

    const contentType = r2Res.headers.get('content-type') ?? file.mimeType;
    const body = await r2Res.arrayBuffer();

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${file.name}"`,
        'Cache-Control': 'private, max-age=3600',
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
