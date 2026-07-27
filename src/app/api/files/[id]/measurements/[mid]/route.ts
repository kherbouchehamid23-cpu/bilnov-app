import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { getProjectAccess } from '@/lib/access';
import { measurementValues } from '@/lib/cadMeasure';
import { Prisma } from '@prisma/client';

// DELETE : supprimer une mesure (auteur ou gestionnaire).
export async function DELETE(req: NextRequest, { params }: { params: { id: string; mid: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const m = await prisma.cadMeasurement.findUnique({
      where: { id: params.mid },
      include: { file: { select: { projectId: true } } },
    });
    if (!m || m.fileId !== params.id) return apiError('Mesure introuvable', 'NOT_FOUND', 404);
    const access = await getProjectAccess(user, m.file.projectId);
    const isAuthor = m.authorId === user.sub;
    if (!access || (!isAuthor && !access.canManage)) return apiError('Suppression non autorisée', 'FORBIDDEN', 403);

    await prisma.cadMeasurement.delete({ where: { id: params.mid } });
    return apiSuccess({ id: params.mid });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}

// PATCH : éditer les points d'une mesure existante (§ note 1 — points déjà accrochés).
// Le serveur recalcule distance/aire/périmètre à partir des points (intégrité).
export async function PATCH(req: NextRequest, { params }: { params: { id: string; mid: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const m = await prisma.cadMeasurement.findUnique({
      where: { id: params.mid },
      include: { file: { select: { projectId: true } } },
    });
    if (!m || m.fileId !== params.id) return apiError('Mesure introuvable', 'NOT_FOUND', 404);
    const access = await getProjectAccess(user, m.file.projectId);
    const isAuthor = m.authorId === user.sub;
    if (!access || !access.canMeasure) return apiError('Droit de mesurer requis', 'FORBIDDEN', 403);
    if (!isAuthor && !access.canManage) return apiError('Édition non autorisée', 'FORBIDDEN', 403);

    const body = await req.json() as { points?: { x: number; y: number }[]; unit?: string; label?: string };
    if (!Array.isArray(body.points) || body.points.length < 2) return apiError('points requis (≥ 2)', 'VALIDATION_ERROR', 400);
    const kind = m.kind === 'AREA' ? 'AREA' : 'DISTANCE';
    if (kind === 'AREA' && body.points.length < 3) return apiError('surface : ≥ 3 points', 'VALIDATION_ERROR', 400);
    const v = measurementValues(kind, body.points);

    const updated = await prisma.cadMeasurement.update({
      where: { id: params.mid },
      data: {
        points: body.points as unknown as Prisma.InputJsonValue,
        distance: v.distance,
        area: v.area,
        perimeter: v.perimeter,
        ...(body.unit ? { unit: body.unit } : {}),
        ...(body.label !== undefined ? { label: body.label } : {}),
      },
      include: { author: { select: { id: true, firstName: true, lastName: true } } },
    });
    return apiSuccess(updated);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
