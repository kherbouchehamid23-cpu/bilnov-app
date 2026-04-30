import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError } from '@/lib/auth';

function detectFileType(mimeType: string, filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (mimeType.startsWith('image/') || ['jpg','jpeg','png','webp','gif'].includes(ext)) return 'IMAGE';
  if (ext === 'pdf') return 'PDF';
  if (mimeType.startsWith('video/')) return 'VIDEO';
  if (ext === 'glb') return 'GLB';
  if (ext === 'gltf') return 'GLTF';
  if (ext === 'obj') return 'OBJ';
  return 'OTHER';
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const body = await req.json() as { storageKey?: string; filename?: string; mimeType?: string; sizeBytes?: number; nodeId?: string | null };
    const { storageKey, filename, mimeType, sizeBytes, nodeId } = body;
    if (!storageKey || !filename || !mimeType || sizeBytes === undefined) return apiError('Champs requis manquants', 'VALIDATION_ERROR', 400);
    const file = await prisma.file.create({
      data: { projectId: params.id, nodeId: nodeId ?? null, uploaderId: user.sub, name: filename, fileType: detectFileType(mimeType, filename) as any, mimeType, storageKey, sizeBytes, status: 'ACTIVE' },
    });
    await prisma.organization.update({ where: { id: user.organizationId }, data: { storageUsedBytes: { increment: sizeBytes } } });
    const json = JSON.stringify({ success: true, data: file }, (_k, v) => typeof v === 'bigint' ? Number(v) : v);
    return new Response(json, { status: 201, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
