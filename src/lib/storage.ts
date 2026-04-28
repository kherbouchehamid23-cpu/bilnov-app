import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import path from 'path';

function getS3Client() {
  return new S3Client({
    endpoint: process.env.STORAGE_ENDPOINT,
    region: process.env.STORAGE_REGION ?? 'auto',
    credentials: {
      accessKeyId: process.env.STORAGE_ACCESS_KEY ?? '',
      secretAccessKey: process.env.STORAGE_SECRET_KEY ?? '',
    },
    forcePathStyle: false,
  });
}

const BUCKET = process.env.STORAGE_BUCKET ?? 'bilnov-files';

export async function uploadFile(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  organizationId: string,
  projectId: string,
): Promise<{ storageKey: string; sizeBytes: number }> {
  const ext = path.extname(originalName).toLowerCase();
  const storageKey = `${organizationId}/${projectId}/${randomUUID()}${ext}`;

  await getS3Client().send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
    Body: buffer,
    ContentType: mimeType,
  }));

  return { storageKey, sizeBytes: buffer.length };
}

export async function getSignedFileUrl(
  storageKey: string,
  purpose: 'view' | 'download',
  filename?: string,
): Promise<{ url: string; expiresAt: Date }> {
  const ttl = purpose === 'view' ? 3600 : 300;
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
    ...(purpose === 'download' && filename
      ? { ResponseContentDisposition: `attachment; filename="${filename}"` }
      : {}),
  });

  const url = await getSignedUrl(getS3Client(), command, { expiresIn: ttl });
  return { url, expiresAt: new Date(Date.now() + ttl * 1000) };
}

export async function deleteFile(storageKey: string): Promise<void> {
  await getS3Client().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: storageKey }));
}
