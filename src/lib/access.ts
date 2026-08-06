import { prisma } from '@/lib/prisma';
import type { JwtPayload } from '@/lib/auth';
import { writeAllowed } from '@/lib/subscription';

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
  // Droits collaboratifs fins (§17). Owner = tout ; member = ses booléens.
  canMeasure: boolean;
  canComment: boolean;
  canReply: boolean;
  canValidate: boolean;
  // Droits fichiers fins (§4). Owner = tout ; member = ses booléens.
  canModify: boolean;
  canDelete: boolean;
  canAnnotate: boolean;
  canCreateVersion: boolean;
  canArchive: boolean;
  canReject: boolean;
  // owner : peut gérer (inviter, supprimer espaces, créer codes). member : non.
  canManage: boolean;
  // null = accès à tout le projet ; sinon liste des nœuds autorisés (member).
  allowedNodeIds: string[] | null;
  allowedFileIds: string[] | null;
}

// Abonnement expire (au-dela de la grace) => consultation seule : on neutralise
// toutes les capacites d'ecriture, on garde la lecture et le telechargement.
function applyBilling(a: ProjectAccess, writable: boolean): ProjectAccess {
  if (writable) return a;
  return {
    ...a,
    canUpload: false, canShare: false, canMeasure: false, canComment: false,
    canReply: false, canValidate: false, canModify: false, canDelete: false,
    canAnnotate: false, canCreateVersion: false, canArchive: false, canReject: false,
    canManage: false,
  };
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
    select: { id: true, organizationId: true, organization: { select: { plan: true, planExpiresAt: true } } },
  });
  if (!project) return null;
  const wr = writeAllowed(project.organization);

  // Chemin OWNER : même organisation que le projet
  if (user.organizationId && project.organizationId === user.organizationId) {
    return applyBilling({
      role: 'owner',
      canView: true,
      canUpload: true,
      canDownload: true,
      canShare: true,
      canMeasure: true,
      canComment: true,
      canReply: true,
      canValidate: true,
      canModify: true,
      canDelete: true,
      canAnnotate: true,
      canCreateVersion: true,
      canArchive: true,
      canReject: true,
      canManage: true,
      allowedNodeIds: null,
      allowedFileIds: null,
    }, wr);
  }

  // Chemin MEMBER : intervenant invité
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: user.sub } },
    select: {
      canView: true,
      canUpload: true,
      canDownload: true,
      canShare: true,
      canMeasure: true,
      canComment: true,
      canReply: true,
      canValidate: true,
      canModify: true,
      canDelete: true,
      canAnnotate: true,
      canCreateVersion: true,
      canArchive: true,
      canReject: true,
      expiresAt: true,
      allowedNodeIds: true,
      allowedFileIds: true,
    },
  });
  if (!member) return null;

  // Expiration éventuelle de l'invitation
  if (member.expiresAt && new Date(member.expiresAt) < new Date()) return null;
  if (!member.canView) return null; // sans canView, aucun accès utile

  return applyBilling({
    role: 'member',
    canView: member.canView,
    canUpload: member.canUpload,
    canDownload: member.canDownload,
    canShare: member.canShare,
    canMeasure: member.canMeasure,
    canComment: member.canComment,
    canReply: member.canReply,
    canValidate: member.canValidate,
    canModify: member.canModify,
    canDelete: member.canDelete,
    canAnnotate: member.canAnnotate,
    canCreateVersion: member.canCreateVersion,
    canArchive: member.canArchive,
    canReject: member.canReject,
    canManage: false,
    allowedNodeIds: (member.allowedNodeIds && member.allowedNodeIds.length > 0)
      ? member.allowedNodeIds
      : null,
    allowedFileIds: (member.allowedFileIds && member.allowedFileIds.length > 0)
      ? member.allowedFileIds
      : null,
  }, wr);
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
