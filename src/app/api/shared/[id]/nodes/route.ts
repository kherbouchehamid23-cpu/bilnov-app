import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError, apiSuccess } from '@/lib/auth';

async function validateCode(code: string, projectId: string) {
  const accessCode = await prisma.accessCode.findUnique({ where: { code }, include: { shareRule: true } });
  if (!accessCode || !accessCode.isActive || accessCode.projectId !== projectId) return null;
  if (accessCode.expiresAt && accessCode.expiresAt < new Date()) return null;
  return accessCode;
}

// Structure (espaces) du projet pour l'interface partagée : noms des noeuds pour filtrer par espace.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const code = req.nextUrl.searchParams.get('code') ?? '';
    if (!code) return apiError('Code requis', 'VALIDATION_ERROR', 400);
    const accessCode = await validateCode(code, params.id);
    if (!accessCode) return apiError('Code invalide ou expiré', 'INVALID_CODE', 403);
    if (!accessCode.shareRule?.canView) return apiError('Accès non autorisé', 'FORBIDDEN', 403);
    const nodes = await prisma.projectStructureNode.findMany({
      where: { projectId: params.id },
      orderBy: { position: 'asc' },
      select: { id: true, name: true, nodeType: true, parentId: true },
    });
    return apiSuccess({ nodes });
  } catch (e) {
    return apiError(e instanceof Error ? e.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
