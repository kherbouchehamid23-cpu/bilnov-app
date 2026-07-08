import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { getProjectAccess } from '@/lib/access';
import { CadMeasurementKind, Prisma } from '@prisma/client';

// GET : mesures persistées d'un fichier (§16).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const file = await prisma.file.findUnique({ where: { id: params.id }, select: { projectId: true } });
    if (!file) return apiError('Fichier introuvable', 'NOT_FOUND', 404);
    const access = await getProjectAccess(user, file.projectId);
    if (!access || !access.canView) return apiError('Accès refusé', 'FORBIDDEN', 403);

    const measurements = await prisma.cadMeasurement.findMany({
      where: { fileId: params.id },
      orderBy: { createdAt: 'asc' },
      include: { author: { select: { id: true, firstName: true, lastName: true } } },
    });
    return apiSuccess({ measurements });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}

// POST : enregistrer une mesure. points = [{x,y},…] en coordonnées modèle.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const file = await prisma.file.findUnique({ where: { id: params.id }, select: { projectId: true } });
    if (!file) return apiError('Fichier introuvable', 'NOT_FOUND', 404);
    const access = await getProjectAccess(user, file.projectId);
    if (!access || !access.canView) return apiError('Accès refusé', 'FORBIDDEN', 403);

    if (!access.canMeasure) return apiError('Droit de mesurer requis', 'FORBIDDEN', 403);
    const body = await req.json() as {
      kind?: string; points?: { x: number; y: number }[]; unit?: string;
      distance?: number; area?: number; perimeter?: number; label?: string;
    };
    const kind = body.kind === 'AREA' ? CadMeasurementKind.AREA
      : body.kind === 'DISTANCE' ? CadMeasurementKind.DISTANCE : null;
    if (!kind) return apiError('kind invalide (DISTANCE|AREA)', 'VALIDATION_ERROR', 400);
    if (!Array.isArray(body.points) || body.points.length < 2) return apiError('points requis (≥ 2)', 'VALIDATION_ERROR', 400);

    const created = await prisma.cadMeasurement.create({
      data: {
        fileId: params.id,
        authorId: user.sub,
        kind,
        points: body.points as unknown as Prisma.InputJsonValue,
        unit: body.unit ?? 'cm',
        distance: body.distance ?? null,
        area: body.area ?? null,
        perimeter: body.perimeter ?? null,
        label: body.label ?? null,
      },
      include: { author: { select: { id: true, firstName: true, lastName: true } } },
    });
    return apiSuccess(created, 201);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
