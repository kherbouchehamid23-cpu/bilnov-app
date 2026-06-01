import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') ?? '1');
    const limit = parseInt(searchParams.get('limit') ?? '20');

    const where = { organizationId: user.organizationId, deletedAt: null };

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

    const { name, description, structureType, sector } = await req.json();

    if (!name) return apiError('Le nom est requis', 'VALIDATION_ERROR', 400);

    const project = await prisma.project.create({
      data: {
        name,
        description,
        structureType: structureType ?? 'BUILDING',
        sector,
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
