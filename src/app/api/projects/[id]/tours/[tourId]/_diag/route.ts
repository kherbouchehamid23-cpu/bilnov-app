import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken, apiError, apiSuccess } from '@/lib/auth';
import { getProjectAccess } from '@/lib/access';
import { S3Client, HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

// DIAGNOSTIC TEMPORAIRE — vérifie, depuis la fonction Vercel (qui atteint R2), si les
// objets image des scènes existent réellement dans le bucket, et liste un échantillon
// des clés présentes sous le préfixe du projet. À retirer une fois le diagnostic fait.
export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: { id: string; tourId: string } }) {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '') ?? req.nextUrl.searchParams.get('token') ?? '';
    const user = verifyToken(token);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const access = await getProjectAccess(user, params.id);
    if (!access || !access.canManage) return apiError('Accès refusé', 'FORBIDDEN', 403);

    const s3 = new S3Client({
      endpoint: process.env.STORAGE_ENDPOINT,
      region: process.env.STORAGE_REGION ?? 'auto',
      credentials: { accessKeyId: process.env.STORAGE_ACCESS_KEY ?? '', secretAccessKey: process.env.STORAGE_SECRET_KEY ?? '' },
      forcePathStyle: true,
    });
    const bucket = process.env.STORAGE_BUCKET ?? 'bilnov';

    const scenes = await prisma.tourScene.findMany({
      where: { tourId: params.tourId },
      select: { id: true, name: true, imageUrl: true, thumbnailKey: true, previewKey: true, derivStatus: true },
    });

    const sceneDiag = [];
    for (const sc of scenes) {
      let head = '?';
      try {
        const h = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: sc.imageUrl }));
        head = `EXISTS ${h.ContentLength}o ${h.ContentType ?? ''}`;
      } catch (e) {
        const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
        head = `${err.name ?? 'Err'} ${err.$metadata?.httpStatusCode ?? ''}`;
      }
      sceneDiag.push({ name: sc.name, imageUrl: sc.imageUrl, derivStatus: sc.derivStatus, head });
    }

    // Échantillon des clés réellement présentes sous org/projet (pour comparer le format).
    let prefixKeyCount: number | null = null;
    let sample: unknown[] = [];
    const prefix = `${user.organizationId}/${params.id}/`;
    try {
      const l = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: 25 }));
      prefixKeyCount = l.KeyCount ?? 0;
      sample = (l.Contents ?? []).map((o) => ({ key: o.Key, size: o.Size }));
    } catch (e) {
      const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
      sample = [{ listError: `${err.name ?? 'Err'} ${err.$metadata?.httpStatusCode ?? ''}` }];
    }

    return apiSuccess({
      envEndpoint: process.env.STORAGE_ENDPOINT ?? null,
      envBucket: bucket,
      hasAccessKey: !!process.env.STORAGE_ACCESS_KEY,
      hasSecretKey: !!process.env.STORAGE_SECRET_KEY,
      org: user.organizationId,
      project: params.id,
      prefix,
      prefixKeyCount,
      scenes: sceneDiag,
      sample,
    });
  } catch (e) {
    return apiError(e instanceof Error ? e.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
