import { NextRequest } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { krpanoClient, krpanoBucket } from '@/lib/krpano';
import { randomUUID } from 'crypto';

// Renvoie une URL pré-signée pour uploader directement le ZIP du tour vers R2.
// On passe par le presign car l'archive peut dépasser la limite de body Vercel.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const body = (await req.json()) as { filename?: string };
    const filename = body.filename ?? 'tour.zip';
    if (!filename.toLowerCase().endsWith('.zip')) {
      return apiError('Le fichier doit être une archive .zip', 'VALIDATION_ERROR', 400);
    }

    // ZIP stocké dans un dossier de staging propre au projet
    const zipKey = `${user.organizationId}/${params.id}/krpano-zips/${randomUUID()}.zip`;

    const command = new PutObjectCommand({
      Bucket: krpanoBucket(),
      Key: zipKey,
      ContentType: 'application/zip',
    });
    const uploadUrl = await getSignedUrl(krpanoClient(), command, { expiresIn: 3600 });

    return apiSuccess({ uploadUrl, zipKey });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : 'Erreur',
      'INTERNAL_ERROR',
      500,
    );
  }
}
