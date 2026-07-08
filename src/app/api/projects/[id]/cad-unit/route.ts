import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { getProjectAccess } from '@/lib/access';

const UNITS = ['mm', 'cm', 'm', 'in', 'ft'];

// PATCH : unité de mesure par défaut du projet (§2). Corps : { unit }.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const access = await getProjectAccess(user, params.id);
    if (!access || !access.canView) return apiError('Accès refusé', 'FORBIDDEN', 403);

    const body = await req.json() as { unit?: string };
    if (!body.unit || !UNITS.includes(body.unit)) return apiError('Unité invalide', 'VALIDATION_ERROR', 400);
    await prisma.project.update({ where: { id: params.id }, data: { cadUnit: body.unit } });
    return apiSuccess({ cadUnit: body.unit });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
