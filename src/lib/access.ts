import { prisma } from '@/lib/prisma';
import type { JwtPayload } from '@/lib/auth';

// Niveau d'accès d'un utilisateur à un projet donné.
// Deux chemins :
//  - OWNER : l'utilisateur appartient à l'organisation propriétaire du projet
//            (créateur / membre de l'org). Tous droits.
//  - MEMBER : l'utilisateur est ProjectMember (intervenant invité, d'une autre
//             org). Droits = ses booléens canView/canUpload/... + expiration.
//  - null : aucun accès.
export interface ProjectAccess {
  role: 'owner' | 'member';
  canView: boolean;
  canUpload: boolean;
  canDownload: boolean;
  canShare: boolean;
  // owner : peut gérer (inviter, supprimer espaces, créer codes). member : non.
  canManage: boolean;
}

/**
 * Détermine l'accès d'un user (depuis le JWT) à un projet.
 * Renvoie null si le projet n'existe pas / est supprimé / l'utilisateur n'y a
 * aucun droit.
 */
export async function getProjectAccess(
  user: JwtPayload,
  projectId: string,
): Promise<ProjectAccess | null> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true, organizationId: true },
  });
  if (!project) return null;

  // Chemin OWNER : même organisation que le projet
  if (user.organizationId && project.organizationId === user.organizationId) {
    return {
      role: 'owner',
      canView: true,
      canUpload: true,
      canDownload: true,
      canShare: true,
      canManage: true,
    };
  }

  // Chemin MEMBER : intervenant invité
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: user.sub } },
    select: {
      canView: true,
      canUpload: true,
      canDownload: true,
      canShare: true,
      expiresAt: true,
    },
  });
  if (!member) return null;

  // Expiration éventuelle de l'invitation
  if (member.expiresAt && new Date(member.expiresAt) < new Date()) return null;
  if (!member.canView) return null; // sans canView, aucun accès utile

  return {
    role: 'member',
    canView: member.canView,
    canUpload: member.canUpload,
    canDownload: member.canDownload,
    canShare: member.canShare,
    canManage: false,
  };
}

/**
 * Liste les IDs de projets accessibles à un user : ceux de son organisation
 * + ceux où il est invité (membre non expiré).
 */
export async function accessibleProjectIds(user: JwtPayload): Promise<{
  ownProjectsOrgId: string;
  memberProjectIds: string[];
}> {
  const memberships = await prisma.projectMember.findMany({
    where: {
      userId: user.sub,
      canView: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { projectId: true },
  });
  return {
    ownProjectsOrgId: user.organizationId,
    memberProjectIds: memberships.map((m: { projectId: string }) => m.projectId),
  };
}
