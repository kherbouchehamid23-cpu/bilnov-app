import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { accessibleProjectIds } from '@/lib/access';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { writeAllowed } from '@/lib/subscription';
import { Prisma } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') ?? '1');
    const limit = parseInt(searchParams.get('limit') ?? '20');

    const view = searchParams.get('view') ?? 'active';
    const statusFilter: Prisma.ProjectWhereInput =
      view === 'archived'
        ? { status: 'ARCHIVED', deletedAt: null }
        : view === 'trash'
          ? { deletedAt: { not: null } }
          : { status: 'ACTIVE', deletedAt: null };

    const { ownProjectsOrgId, memberProjectIds } = await accessibleProjectIds(user);
    const where = {
      ...statusFilter,
      OR: [
        { organizationId: ownProjectsOrgId },
        ...(memberProjectIds.length ? [{ id: { in: memberProjectIds } }] : []),
      ],
    };

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { files: true, tours: true, members: true } },
        },
      }),
      prisma.project.count({ where }),
    ]);

    return apiSuccess({ projects, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('GET projects error:', error);
    return apiError('Erreur serveur', 'INTERNAL_ERROR', 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const org = await prisma.organization.findUnique({ where: { id: user.organizationId }, select: { plan: true, planExpiresAt: true, ownerId: true } });
    // §1 — seul le titulaire de l'abonnement (abonné) peut créer un projet ; les
    // clients/intervenants (membres) en sont exclus, même si leur organisation est active.
    if (!org || org.ownerId !== user.sub) return apiError('Seul le titulaire de l\'abonnement peut créer un projet.', 'FORBIDDEN', 403);
    if (!writeAllowed(org)) return apiError('Abonnement expiré : renouvelez pour créer un projet.', 'FORBIDDEN', 403);

    const { name, description, structureType, sector, location, clientName } = await req.json();

    if (!name) return apiError('Le nom est requis', 'VALIDATION_ERROR', 400);

    const project = await prisma.project.create({
      data: {
        name,
        description,
        structureType: structureType ?? 'BUILDING',
        sector,
        location: location ?? null,
        clientName: clientName ?? null,
        organizationId: user.organizationId,
        createdById: user.sub,
      },
    });

    return apiSuccess(project, 201);
  } catch (error) {
    console.error('POST projects error:', error);
    return apiError('Erreur serveur', 'INTERNAL_ERROR', 500);
  }
}
