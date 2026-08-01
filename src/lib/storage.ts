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

// Vague 2 — écrit un buffer à une clé STABLE explicite (dérivés versionnés/immuables).
export async function putObjectAtKey(
  key: string,
  buffer: Buffer,
  contentType: string,
  cacheControl?: string,
): Promise<void> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ...(cacheControl ? { CacheControl: cacheControl } : {}),
    }),
  );
}

// Vague 2 — télécharge un objet R2 dans un Buffer (entrée de sharp côté serveur).
export async function getObjectBuffer(storageKey: string): Promise<Buffer> {
  const res = await getClient().send(
    new GetObjectCommand({ Bucket: getBucket(), Key: storageKey }),
  );
  const body = res.Body as unknown as { transformToByteArray?: () => Promise<Uint8Array> };
  if (body?.transformToByteArray) {
    return Buffer.from(await body.transformToByteArray());
  }
  // Fallback flux Node.
  const stream = res.Body as unknown as AsyncIterable<Uint8Array>;
  const chunks: Uint8Array[] = [];
  for await (const c of stream) chunks.push(c);
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

export async function deleteFile(storageKey: string): Promise<void> {
  await getClient().send(
    new DeleteObjectCommand({
      Bucket: getBucket(),
      Key: storageKey,
    }),
  );
}
