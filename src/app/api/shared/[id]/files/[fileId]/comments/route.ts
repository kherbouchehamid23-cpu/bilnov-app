import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError, apiSuccess } from '@/lib/auth';

// GET : commentaires d'un plan partagé, filtrés selon la règle de partage (§14).
// modes : NONE (aucun) | ALL | OPEN (ouverts) | UNRESOLVED (non résolus) | BY_USER.
export async function GET(req: NextRequest, { params }: { params: { id: string; fileId: string } }) {
  try {
    const accessCode = await prisma.accessCode.findFirst({
      where: { code: params.id, isActive: true },
      include: { shareRule: true },
    });
    if (!accessCode || !accessCode.shareRule?.canView) return apiError('Accès non autorisé', 'FORBIDDEN', 403);
    if (accessCode.expiresAt && new Date(accessCode.expiresAt) < new Date()) return apiError('Lien expiré', 'FORBIDDEN', 403);

    const mode = accessCode.shareRule.commentShareMode ?? 'NONE';
    if (mode === 'NONE') return apiSuccess({ comments: [] });

    const file = await prisma.file.findFirst({
      where: { id: params.fileId, projectId: accessCode.projectId, deletedAt: null },
      select: { id: true },
    });
    if (!file) return apiError('Fichier introuvable', 'NOT_FOUND', 404);

    const where: Record<string, unknown> = { fileId: params.fileId };
    if (mode === 'OPEN') where.status = 'OPEN';
    else if (mode === 'UNRESOLVED') where.status = { in: ['OPEN', 'IN_PROGRESS'] };
    else if (mode === 'BY_USER' && accessCode.shareRule.commentAuthorId) where.authorId = accessCode.shareRule.commentAuthorId;

    const comments = await prisma.cadAnnotation.findMany({
      where,
      orderBy: { number: 'asc' },
      include: {
        author: { select: { id: true, firstName: true, lastName: true } },
        assignee: { select: { id: true, firstName: true, lastName: true } },
        replies: { include: { author: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { createdAt: 'asc' } },
        attachments: { orderBy: { createdAt: 'asc' } },
      },
    });
    return apiSuccess({ comments });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
