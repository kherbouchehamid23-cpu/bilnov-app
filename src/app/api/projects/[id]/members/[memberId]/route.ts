import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';

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

    const body = await req.json() as {
      canView?: boolean;
      canUpload?: boolean;
      canDownload?: boolean;
      canShare?: boolean;
    };

    const member = await prisma.projectMember.update({
      where: { id: params.memberId },
      data: {
        canView: body.canView,
        canUpload: body.canUpload,
        canDownload: body.canDownload,
        canShare: body.canShare,
      },
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
