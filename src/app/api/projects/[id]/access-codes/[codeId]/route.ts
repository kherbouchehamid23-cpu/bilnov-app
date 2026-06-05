import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { getProjectAccess } from '@/lib/access';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; codeId: string } }
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const access = await getProjectAccess(user, params.id);
    if (!access || !access.canManage) return apiError('Réservé au propriétaire du projet', 'FORBIDDEN', 403);

    const existing = await prisma.accessCode.findUnique({ where: { id: params.codeId } });
    if (!existing || existing.projectId !== params.id) return apiError('Code introuvable', 'NOT_FOUND', 404);

    await prisma.accessCode.update({
      where: { id: params.codeId },
      data: { isActive: false },
    });

    return apiSuccess({ message: 'Code désactivé' });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : 'Erreur',
      'INTERNAL_ERROR',
      500
    );
  }
}

// Modifier un partage par code : permissions, portée (espaces/fichiers),
// expiration, réactivation. Réservé au propriétaire du projet.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; codeId: string } }
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const access = await getProjectAccess(user, params.id);
    if (!access || !access.canManage) return apiError('Réservé au propriétaire du projet', 'FORBIDDEN', 403);

    const existing = await prisma.accessCode.findUnique({
      where: { id: params.codeId },
      include: { shareRule: true },
    });
    if (!existing || existing.projectId !== params.id) return apiError('Code introuvable', 'NOT_FOUND', 404);

    const body = await req.json() as {
      canView?: boolean;
      canDownload?: boolean;
      canUpload?: boolean;
      canShare?: boolean;
      allowedNodeIds?: string[] | null;
      allowedFileIds?: string[] | null;
      expiresInDays?: number | null; // null = jamais ; undefined = inchangé
      isActive?: boolean;
    };

    const codeData: Record<string, unknown> = {};
    if (body.isActive !== undefined) codeData.isActive = body.isActive;
    if (body.expiresInDays !== undefined) {
      codeData.expiresAt = body.expiresInDays
        ? new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000)
        : null;
    }

    const ruleData: Record<string, unknown> = {};
    if (body.canView !== undefined) ruleData.canView = body.canView;
    if (body.canDownload !== undefined) ruleData.canDownload = body.canDownload;
    if (body.canUpload !== undefined) ruleData.canUpload = body.canUpload;
    if (body.canShare !== undefined) ruleData.canShare = body.canShare;
    if (body.allowedNodeIds !== undefined) ruleData.allowedNodeIds = body.allowedNodeIds ?? [];
    if (body.allowedFileIds !== undefined) ruleData.allowedFileIds = body.allowedFileIds ?? [];

    const updated = await prisma.accessCode.update({
      where: { id: params.codeId },
      data: {
        ...codeData,
        ...(Object.keys(ruleData).length > 0
          ? { shareRule: { update: ruleData } }
          : {}),
      },
      include: { shareRule: true, _count: { select: { accessLogs: true } } },
    });

    return apiSuccess(updated);
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : 'Erreur',
      'INTERNAL_ERROR',
      500
    );
  }
}
