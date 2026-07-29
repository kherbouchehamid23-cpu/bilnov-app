import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken, apiError } from '@/lib/auth';
import { getSignedFileUrl } from '@/lib/storage';
import { getProjectAccess } from '@/lib/access';

// Proxy same-origin de l'image 360 d'une scène : evite le blocage CORS de Pannellum
// (texture WebGL). Auth via header Authorization ou ?token= (les <img>/textures ne
// peuvent pas envoyer d'en-tete Authorization).
export async function GET(req: NextRequest, { params }: { params: { id: string; tourId: string; sceneId: string } }) {
  try {
    const authHeader = req.headers.get('authorization');
    const queryToken = req.nextUrl.searchParams.get('token');
    const token = authHeader?.replace('Bearer ', '') ?? queryToken ?? '';
    const user = verifyToken(token);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const scene = await prisma.tourScene.findFirst({
      where: { id: params.sceneId, tourId: params.tourId, tour: { projectId: params.id } },
      select: { imageUrl: true },
    });
    if (!scene) return apiError('Scène introuvable', 'NOT_FOUND', 404);

    const access = await getProjectAccess(user, params.id);
    if (!access || !access.canView) return apiError('Accès refusé', 'FORBIDDEN', 403);

    const { url } = await getSignedFileUrl(scene.imageUrl, 'view');
    const r2 = await fetch(url);
    if (!r2.ok) return apiError('Erreur stockage', 'STORAGE_ERROR', 502);
    const body = await r2.arrayBuffer();
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': r2.headers.get('content-type') ?? 'image/jpeg',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (e) {
    return apiError(e instanceof Error ? e.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
