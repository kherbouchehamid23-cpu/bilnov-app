import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/auth';
import { getSignedFileUrl } from '@/lib/storage';
import { resolveScope, fileInScope } from '@/lib/scope';

// Proxy même-origine d'un fichier partagé (par code d'accès) — évite les
// problèmes CORS pour le rendu du DWG dans le viewer partagé.
export async function GET(req: NextRequest, { params }: { params: { id: string; fileId: string } }) {
  try {
    const code = req.nextUrl.searchParams.get('code') ?? '';
    if (!code) return apiError('Code requis', 'VALIDATION_ERROR', 400);
    const accessCode = await prisma.accessCode.findUnique({ where: { code }, include: { shareRule: true } });
    if (!accessCode || !accessCode.isActive || accessCode.projectId !== params.id) return apiError('Code invalide', 'INVALID_CODE', 403);
    if (accessCode.expiresAt && accessCode.expiresAt < new Date()) return apiError('Lien expiré', 'FORBIDDEN', 403);
    if (!accessCode.shareRule?.canView) return apiError('Accès non autorisé', 'FORBIDDEN', 403);

    const file = await prisma.file.findUnique({ where: { id: params.fileId } });
    if (!file || file.projectId !== params.id) return apiError('Fichier introuvable', 'NOT_FOUND', 404);
    const scope = await resolveScope(params.id, accessCode.shareRule?.allowedNodeIds ?? null, accessCode.shareRule?.allowedFileIds ?? null);
    if (!fileInScope(file.nodeId, file.id, scope)) return apiError('Accès refusé', 'FORBIDDEN', 403);

    const { url } = await getSignedFileUrl(file.storageKey, 'view', file.name);
    const r2Res = await fetch(url);
    if (!r2Res.ok) return apiError('Erreur stockage', 'STORAGE_ERROR', 502);
    const body = await r2Res.arrayBuffer();
    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': r2Res.headers.get('content-type') ?? file.mimeType, 'Cache-Control': 'private, max-age=3600' },
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
