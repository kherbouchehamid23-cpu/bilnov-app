import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { getProjectAccess } from '@/lib/access';
import { mapCadStatus, mapCadPriority } from '@/lib/locations';
import { CommentStatus, CommentPriority, CommentType, CommentLocationType, Prisma } from '@prisma/client';

// POST : pont additif — convertit les annotations CAO (CadAnnotation) existantes du
// projet en commentaires centraux + localisation DWG. Idempotent (ne recrée pas).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const access = await getProjectAccess(user, params.id);
    if (!access || !access.canManage) return apiError('Réservé au propriétaire du projet', 'FORBIDDEN', 403);

    const annotations = await prisma.cadAnnotation.findMany({
      where: { file: { projectId: params.id } },
      include: { file: { select: { id: true } } },
    });
    if (annotations.length === 0) return apiSuccess({ created: 0, skipped: 0 });

    // Localisations DWG déjà pontées (metadata.annotationId)
    const existingLocs = await prisma.commentLocation.findMany({
      where: { locationType: CommentLocationType.DWG, comment: { projectId: params.id } },
      select: { metadata: true },
    });
    const done = new Set<string>();
    for (const l of existingLocs) {
      const meta = (l.metadata ?? {}) as Record<string, unknown>;
      if (typeof meta['annotationId'] === 'string') done.add(meta['annotationId']);
    }

    const last = await prisma.comment.findFirst({ where: { projectId: params.id }, orderBy: { number: 'desc' }, select: { number: true } });
    let number = (last?.number ?? 0);
    let created = 0, skipped = 0;

    for (const a of annotations) {
      if (done.has(a.id)) { skipped++; continue; }
      number++;
      await prisma.comment.create({
        data: {
          projectId: params.id, number,
          type: CommentType.OBSERVATION,
          title: a.title ?? null,
          description: a.text || '(annotation importée)',
          status: mapCadStatus(a.status) as CommentStatus,
          priority: mapCadPriority(a.priority) as CommentPriority,
          createdById: a.authorId,
          locations: {
            create: {
              locationType: CommentLocationType.DWG,
              resourceType: 'file', resourceId: a.fileId,
              title: 'Plan DWG',
              metadata: { annotationId: a.id, drawing_id: a.fileId, x: a.x, y: a.y } as Prisma.InputJsonValue,
              createdById: a.authorId,
            },
          },
        },
      });
      created++;
    }
    return apiSuccess({ created, skipped });
  } catch (e) {
    return apiError(e instanceof Error ? e.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
