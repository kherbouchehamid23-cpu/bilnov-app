import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const members = await prisma.projectMember.findMany({
      where: { projectId: params.id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatarUrl: true,
          },
        },
        role: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return apiSuccess({ members });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : 'Erreur',
      'INTERNAL_ERROR',
      500
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const body = await req.json() as {
      email?: string;
      canView?: boolean;
      canUpload?: boolean;
      canDownload?: boolean;
      canShare?: boolean;
    };

    const { email, canView, canUpload, canDownload, canShare } = body;

    if (!email) {
      return apiError('Email requis', 'VALIDATION_ERROR', 400);
    }

    // Trouver l'utilisateur par email
    const invitedUser = await prisma.user.findUnique({ where: { email } });
    if (!invitedUser) {
      return apiError(
        'Aucun compte trouvé avec cet email. L\'utilisateur doit d\'abord créer un compte.',
        'USER_NOT_FOUND',
        404
      );
    }

    // Vérifier qu'il n'est pas déjà membre
    const existing = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: params.id, userId: invitedUser.id } },
    });
    if (existing) {
      return apiError('Cet utilisateur est déjà membre du projet', 'ALREADY_MEMBER', 409);
    }

    // Trouver ou créer le rôle "member" pour l'organisation
    let role = await prisma.role.findFirst({
      where: { organizationId: user.organizationId, name: 'member' },
    });

    if (!role) {
      role = await prisma.role.create({
        data: { organizationId: user.organizationId, name: 'member' },
      });
    }

    const member = await prisma.projectMember.create({
      data: {
        projectId: params.id,
        userId: invitedUser.id,
        roleId: role.id,
        canView: canView ?? true,
        canUpload: canUpload ?? false,
        canDownload: canDownload ?? true,
        canShare: canShare ?? false,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatarUrl: true,
          },
        },
        role: { select: { id: true, name: true } },
      },
    });

    return apiSuccess(member, 201);
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : 'Erreur',
      'INTERNAL_ERROR',
      500
    );
  }
}
