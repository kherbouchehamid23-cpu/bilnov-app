import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';

// GET : liste des tours krpano d'un projet (optionnellement filtrés par node)
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const nodeId = req.nextUrl.searchParams.get('nodeId');
    const where: { projectId: string; deletedAt: null; nodeId?: string } = {
      projectId: params.id,
      deletedAt: null,
    };
    if (nodeId) where.nodeId = nodeId;

    const tours = await prisma.krpanoTour.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return apiSuccess({ tours });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : 'Erreur serveur',
      'INTERNAL_ERROR',
      500,
    );
  }
}

// POST : enregistre un tour après upload du ZIP (status PROCESSING).
// Le traitement (extraction) est déclenché ensuite via .../[tourId]/process.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const body = (await req.json()) as {
      zipKey?: string;
      name?: string;
      nodeId?: string | null;
      description?: string;
    };
    if (!body.zipKey || !body.name?.trim()) {
      return apiError('zipKey et name requis', 'VALIDATION_ERROR', 400);
    }

    const id = crypto.randomUUID();
    const storagePrefix = `${user.organizationId}/${params.id}/krpano/${id}/`;

    const tour = await prisma.krpanoTour.create({
      data: {
        id,
        projectId: params.id,
        nodeId: body.nodeId ?? null,
        uploadedBy: user.sub,
        name: body.name.trim(),
        description: body.description ?? null,
        status: 'PROCESSING',
        storagePrefix,
        entryKey: 'tour.html',
        metadata: { zipKey: body.zipKey },
      },
    });

    const json = JSON.stringify({ success: true, data: tour }, (_k, v) =>
      typeof v === 'bigint' ? Number(v) : v,
    );
    return new Response(json, {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : 'Erreur',
      'INTERNAL_ERROR',
      500,
    );
  }
}
