import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError } from '@/lib/auth';
import { getProjectAccess } from '@/lib/access';
import { isUploadAllowed, uploadHint, type UploadRulesConfig } from '@/lib/uploadRules';
import { assertStorageAllowed } from '@/lib/storageQuota';
import { formatBytes } from '@/lib/packs';

function detectFileType(mimeType: string, filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (mimeType.startsWith('image/') || ['jpg','jpeg','png','webp','gif'].includes(ext)) return 'IMAGE';
  if (ext === 'pdf') return 'PDF';
  if (mimeType.startsWith('video/')) return 'VIDEO';
  if (ext === 'glb') return 'GLB';
  if (ext === 'gltf') return 'GLTF';
  if (ext === 'obj') return 'OBJ';
  if (ext === 'dwg') return 'DWG';
  if (ext === 'dxf') return 'DXF';
  if (ext === 'ifc') return 'IFC';
  return 'OTHER';
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const access = await getProjectAccess(user, params.id);
    if (!access || !access.canUpload) return apiError('Vous n\'avez pas le droit d\'ajouter des fichiers', 'FORBIDDEN', 403);

    const body = await req.json() as { storageKey?: string; filename?: string; mimeType?: string; sizeBytes?: number; nodeId?: string | null };
    const { storageKey, filename, mimeType, sizeBytes, nodeId } = body;
    if (!storageKey || !filename || !mimeType || sizeBytes === undefined) return apiError('Champs requis manquants', 'VALIDATION_ERROR', 400);

    const detectedType = detectFileType(mimeType, filename);

    // Règle d'upload selon le niveau d'arborescence cible
    const project = await prisma.project.findUnique({
      where: { id: params.id },
      select: { uploadRules: true },
    });
    let nodeType: string | null = null;
    if (nodeId) {
      const node = await prisma.projectStructureNode.findUnique({
        where: { id: nodeId },
        select: { nodeType: true },
      });
      nodeType = node?.nodeType ?? null;
    }
    const rules = (project?.uploadRules ?? null) as UploadRulesConfig | null;
    if (!isUploadAllowed(detectedType, nodeType, rules)) {
      return apiError(uploadHint(nodeType, rules), 'FILE_TYPE_NOT_ALLOWED', 415);
    }

    // Module PACKS §13 — enforcement du quota de stockage (no-op tant qu'aucun pack plafonné
    // n'est souscrit, donc sans impact sur les organisations existantes).
    const org = await prisma.organization.findUnique({ where: { id: user.organizationId }, select: { storageUsedBytes: true } });
    const usedBytes = org ? Number(org.storageUsedBytes) : 0;
    const quota = await assertStorageAllowed(user.organizationId, usedBytes, Number(sizeBytes));
    if (!quota.ok) {
      return apiError(`Capacité de stockage atteinte (${formatBytes(quota.limitBytes)}). Augmentez votre capacité pour ajouter ce fichier.`, 'STORAGE_LIMIT_REACHED', 402);
    }

    const file = await prisma.file.create({
      data: { projectId: params.id, nodeId: nodeId ?? null, uploaderId: user.sub, name: filename, fileType: detectedType as any, mimeType, storageKey, sizeBytes, status: 'ACTIVE' },
    });
    await prisma.organization.update({ where: { id: user.organizationId }, data: { storageUsedBytes: { increment: sizeBytes } } });
    const json = JSON.stringify({ success: true, data: file }, (_k, v) => typeof v === 'bigint' ? Number(v) : v);
    return new Response(json, { status: 201, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
