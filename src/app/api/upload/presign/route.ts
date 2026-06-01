import { NextRequest } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { randomUUID } from 'crypto';
import path from 'path';

function getClient(): S3Client {
  return new S3Client({
    endpoint: process.env.STORAGE_ENDPOINT,
    region: process.env.STORAGE_REGION ?? 'auto',
    credentials: {
      accessKeyId: process.env.STORAGE_ACCESS_KEY ?? '',
      secretAccessKey: process.env.STORAGE_SECRET_KEY ?? '',
    },
    forcePathStyle: true,
  });
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const body = await req.json() as { filename?: string; mimeType?: string; projectId?: string };
    const { filename, mimeType, projectId } = body;
    if (!filename || !mimeType || !projectId) return apiError('filename, mimeType et projectId requis', 'VALIDATION_ERROR', 400);
    const ext = path.extname(filename).toLowerCase();
    const storageKey = `${user.organizationId}/${projectId}/${randomUUID()}${ext}`;
    const bucket = process.env.STORAGE_BUCKET ?? 'bilnov';
    const command = new PutObjectCommand({ Bucket: bucket, Key: storageKey, ContentType: mimeType });
    const uploadUrl = await getSignedUrl(getClient(), command, { expiresIn: 3600 });
    return apiSuccess({ uploadUrl, storageKey });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
