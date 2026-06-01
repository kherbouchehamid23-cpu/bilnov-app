import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
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

function getBucket(): string {
  return process.env.STORAGE_BUCKET ?? 'bilnov';
}

export async function uploadFile(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  organizationId: string,
  projectId: string,
): Promise<{ storageKey: string; sizeBytes: number }> {
  const ext = path.extname(originalName).toLowerCase();
  const storageKey = `${organizationId}/${projectId}/${randomUUID()}${ext}`;

  await getClient().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: storageKey,
      Body: buffer,
      ContentType: mimeType,
    }),
  );

  return { storageKey, sizeBytes: buffer.length };
}

export async function getSignedFileUrl(
  storageKey: string,
  purpose: 'view' | 'download',
  filename?: string,
): Promise<{ url: string; expiresAt: Date }> {
  const ttl = purpose === 'view' ? 3600 : 300;

  const command = new GetObjectCommand({
    Bucket: getBucket(),
    Key: storageKey,
    ...(purpose === 'download' && filename
      ? {
          ResponseContentDisposition: `attachment; filename="${filename}"`,
        }
      : {}),
  });

  const url = await getSignedUrl(getClient(), command, { expiresIn: ttl });

  return {
    url,
    expiresAt: new Date(Date.now() + ttl * 1000),
  };
}

export async function deleteFile(storageKey: string): Promise<void> {
  await getClient().send(
    new DeleteObjectCommand({
      Bucket: getBucket(),
      Key: storageKey,
    }),
  );
}
