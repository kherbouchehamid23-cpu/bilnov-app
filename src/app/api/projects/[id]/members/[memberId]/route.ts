import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { getProjectAccess } from '@/lib/access';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; memberId: string } }
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    await prisma.projectMember.delete({
      where: { id: params.memberId },
    });

    return apiSuccess({ message: 'Membre retiré' });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : 'Erreur',
      'INTERNAL_ERROR',
      500
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; memberId: string } }
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const access = await getProjectAccess(user, params.id);
    if (!access || !access.canManage) return apiError('Réservé au propriétaire du projet', 'FORBIDDEN', 403);

    const existing = await prisma.projectMember.findUnique({ where: { id: params.memberId } });
    if (!existing || existing.projectId !== params.id) return apiError('Intervenant introuvable', 'NOT_FOUND', 404);

    const body = await req.json() as {
      canView?: boolean;
      canUpload?: boolean;
      canDownload?: boolean;
      canShare?: boolean;
      allowedNodeIds?: string[] | null;
      allowedFileIds?: string[] | null;
    };

    const data: Record<string, unknown> = {};
    if (body.canView !== undefined) data.canView = body.canView;
    if (body.canUpload !== undefined) data.canUpload = body.canUpload;
    if (body.canDownload !== undefined) data.canDownload = body.canDownload;
    if (body.canShare !== undefined) data.canShare = body.canShare;
    if (body.allowedNodeIds !== undefined) data.allowedNodeIds = body.allowedNodeIds ?? [];
    if (body.allowedFileIds !== undefined) data.allowedFileIds = body.allowedFileIds ?? [];

    const member = await prisma.projectMember.update({
      where: { id: params.memberId },
      data,
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });

    return apiSuccess(member);
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : 'Erreur',
      'INTERNAL_ERROR',
      500
    );
  }
}
