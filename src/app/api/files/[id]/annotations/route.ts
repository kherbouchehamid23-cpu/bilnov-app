import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { getProjectAccess } from '@/lib/access';

// GET : annotations d'un fichier (accès projet requis)
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const file = await prisma.file.findUnique({ where: { id: params.id }, select: { projectId: true } });
    if (!file) return apiError('Fichier introuvable', 'NOT_FOUND', 404);
    const access = await getProjectAccess(user, file.projectId);
    if (!access || !access.canView) return apiError('Accès refusé', 'FORBIDDEN', 403);

    const annotations = await prisma.cadAnnotation.findMany({
      where: { fileId: params.id },
      orderBy: { createdAt: 'asc' },
      include: { author: { select: { firstName: true, lastName: true } } },
    });
    return apiSuccess({ annotations });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}

// POST : créer une annotation (accès projet requis)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const file = await prisma.file.findUnique({ where: { id: params.id }, select: { projectId: true } });
    if (!file) return apiError('Fichier introuvable', 'NOT_FOUND', 404);
    const access = await getProjectAccess(user, file.projectId);
    if (!access || !access.canView) return apiError('Accès refusé', 'FORBIDDEN', 403);

    const body = await req.json() as { x?: number; y?: number; text?: string; color?: string; type?: string };
    if (typeof body.x !== 'number' || typeof body.y !== 'number' || !body.text?.trim()) {
      return apiError('x, y et text requis', 'VALIDATION_ERROR', 400);
    }
    const ann = await prisma.cadAnnotation.create({
      data: {
        fileId: params.id,
        authorId: user.sub,
        type: body.type ?? 'marker',
        x: body.x,
        y: body.y,
        text: body.text.trim(),
        color: body.color ?? '#EF4444',
      },
      include: { author: { select: { firstName: true, lastName: true } } },
    });
    return apiSuccess(ann, 201);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
