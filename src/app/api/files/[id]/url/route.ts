import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { uploadFile } from '@/lib/storage';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const files = await prisma.file.findMany({
      where: {
        projectId: params.id,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    return apiSuccess({ files });
  } catch (error) {
    console.error('GET files error:', error);
    const message = error instanceof Error ? error.message : 'Erreur inconnue';
    return apiError(`Erreur serveur: ${message}`, 'INTERNAL_ERROR', 500);
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const nodeId = formData.get('nodeId') as string | null;

    if (!file) return apiError('Aucun fichier fourni', 'VALIDATION_ERROR', 400);

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

    let fileType = 'OTHER';
    if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) fileType = 'IMAGE';
    else if (ext === 'pdf') fileType = 'PDF';
    else if (['mp4', 'webm', 'mov'].includes(ext)) fileType = 'VIDEO';
    else if (ext === 'glb') fileType = 'GLB';
    else if (ext === 'gltf') fileType = 'GLTF';
    else if (ext === 'obj') fileType = 'OBJ';
    else if (ext === 'ifc') fileType = 'IFC';
    else if (ext === 'dwg') fileType = 'DWG';
    else if (ext === 'dxf') fileType = 'DXF';

    const { storageKey, sizeBytes } = await uploadFile(
      buffer,
      file.name,
      file.type || 'application/octet-stream',
      user.organizationId,
      params.id,
    );

    const fileRecord = await prisma.file.create({
      data: {
        projectId: params.id,
        nodeId: nodeId || null,
        uploaderId: user.sub,
        name: file.name,
        fileType: fileType as any,
        mimeType: file.type || 'application/octet-stream',
        storageKey,
        sizeBytes,
        status: 'ACTIVE',
      },
    });

    await prisma.organization.update({
      where: { id: user.organizationId },
      data: { storageUsedBytes: { increment: sizeBytes } },
    });

    return apiSuccess(fileRecord, 201);
  } catch (error) {
    console.error('POST files error:', error);
    const message = error instanceof Error ? error.message : 'Erreur inconnue';
    return apiError(`Erreur upload: ${message}`, 'INTERNAL_ERROR', 500);
  }
}
