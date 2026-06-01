import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; codeId: string } }
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

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
