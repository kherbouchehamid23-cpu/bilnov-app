import { NextRequest } from 'next/server';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

export async function GET(req: NextRequest) {
  try {
    const client = new S3Client({
      endpoint: process.env.STORAGE_ENDPOINT,
      region: process.env.STORAGE_REGION ?? 'auto',
      credentials: {
        accessKeyId: process.env.STORAGE_ACCESS_KEY ?? '',
        secretAccessKey: process.env.STORAGE_SECRET_KEY ?? '',
      },
      forcePathStyle: false,
    });

    const result = await client.send(new ListObjectsV2Command({
      Bucket: process.env.STORAGE_BUCKET,
      MaxKeys: 5,
    }));

    return Response.json({
      success: true,
      bucket: process.env.STORAGE_BUCKET,
      endpoint: process.env.STORAGE_ENDPOINT,
      objects: result.Contents?.map(o => o.Key) ?? [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue';
    return Response.json({ success: false, error: message });
  }
}
