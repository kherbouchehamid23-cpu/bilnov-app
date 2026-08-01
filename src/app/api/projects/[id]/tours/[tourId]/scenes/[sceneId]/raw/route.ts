import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken, apiError } from '@/lib/auth';
import { getSignedFileUrl } from '@/lib/storage';
import { getProjectAccess } from '@/lib/access';

// Accès à l'image 360° d'une scène. Auth via header Authorization ou ?token= (les <img>/
// textures ne peuvent pas envoyer d'en-tête Authorization). Après contrôle des droits, on
// REDIRIGE (302) vers l'URL R2 signée : les octets ne transitent plus par la fonction
// serverless — ni la limite de 4,5 Mo (qui faisait échouer le proxy bufferisé), ni les
// soucis de streaming (502). R2 sert le CORS, le viewer public charge déjà des URLs R2
// signées comme textures WebGL, donc la redirection fonctionne pour Pannellum/three.js.
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
    // Redirection vers R2 (aucun octet dans la fonction → plus de 502 ni de limite de taille).
    return new Response(null, {
      status: 302,
      headers: { Location: url, 'Cache-Control': 'private, max-age=300' },
    });
  } catch (e) {
    return apiError(e instanceof Error ? e.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
