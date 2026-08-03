import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { getProjectAccess } from '@/lib/access';
import { deleteFile } from '@/lib/storage';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const access = await getProjectAccess(user, params.id);
    if (!access) return apiError('Projet introuvable', 'NOT_FOUND', 404);

    const project = await prisma.project.findFirst({
      where: { id: params.id, deletedAt: null },
      include: { _count: { select: { files: true, tours: true, members: true } } },
    });
    if (!project) return apiError('Projet introuvable', 'NOT_FOUND', 404);
    // On expose l'acces (role + droits) pour que le front adapte l'UI
    return apiSuccess({ ...project, access });
  } catch {
    return apiError('Erreur serveur', 'INTERNAL_ERROR', 500);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const body = await req.json();
    const project = await prisma.project.updateMany({
      where: { id: params.id, organizationId: user.organizationId },
      data: { name: body.name, description: body.description, sector: body.sector, status: body.status, deletedAt: body.status === 'ACTIVE' ? null : undefined },
    });

    return apiSuccess(project);
  } catch {
    return apiError('Erreur serveur', 'INTERNAL_ERROR', 500);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const permanent = new URL(req.url).searchParams.get('permanent') === 'true';

    // --- Corbeille (soft delete) : reversible, comportement par defaut ---
    if (!permanent) {
      await prisma.project.updateMany({
        where: { id: params.id, organizationId: user.organizationId },
        data: { deletedAt: new Date(), status: 'DELETED' },
      });
      return apiSuccess({ message: 'Projet supprimé' });
    }

    // --- Suppression DEFINITIVE : proprietaire uniquement, et seulement si le
    //     projet est deja dans la corbeille (garde-fou de suppression en 2 temps). ---
    const project = await prisma.project.findFirst({
      where: { id: params.id, organizationId: user.organizationId },
      select: { id: true, deletedAt: true },
    });
    if (!project) return apiError('Projet introuvable', 'NOT_FOUND', 404);
    if (!project.deletedAt) {
      return apiError('Le projet doit d\'abord être placé dans la corbeille', 'VALIDATION_ERROR', 400);
    }

    // Cles R2 + octets a decrementer (seuls les fichiers encore ACTIVE comptent
    // dans le stockage ; les DELETED ont deja ete decrementes a leur suppression).
    const files = await prisma.file.findMany({
      where: { projectId: params.id },
      select: { storageKey: true, sizeBytes: true, status: true },
    });
    const activeBytes = files
      .filter(f => f.status === 'ACTIVE')
      .reduce((sum, f) => sum + (f.sizeBytes as bigint), 0n);

    // Suppression en base, ordre des cles etrangeres (enfants d'abord). Cascade
    // automatique du schema : nodes, krpanoTours, comments (+ leurs enfants).
    await prisma.$transaction(async (tx) => {
      const codes = await tx.accessCode.findMany({
        where: { projectId: params.id }, select: { id: true },
      });
      const codeIds = codes.map(c => c.id);
      if (codeIds.length > 0) {
        await tx.accessLog.deleteMany({ where: { accessCodeId: { in: codeIds } } });
      }
      await tx.accessCode.deleteMany({ where: { projectId: params.id } });
      await tx.file.deleteMany({ where: { projectId: params.id } });
      await tx.virtualTour.deleteMany({ where: { projectId: params.id } });
      await tx.projectMember.deleteMany({ where: { projectId: params.id } });
      await tx.notification.deleteMany({ where: { projectId: params.id } });
      await tx.project.delete({ where: { id: params.id } });
      if (activeBytes > 0n) {
        await tx.organization.update({
          where: { id: user.organizationId },
          data: { storageUsedBytes: { decrement: activeBytes } },
        });
      }
    });

    // Nettoyage R2 best-effort (hors transaction) : ne bloque pas la reponse.
    await Promise.allSettled(files.map(f => deleteFile(f.storageKey)));

    return apiSuccess({ message: 'Projet supprimé définitivement' });
  } catch {
    return apiError('Erreur serveur', 'INTERNAL_ERROR', 500);
  }
}
