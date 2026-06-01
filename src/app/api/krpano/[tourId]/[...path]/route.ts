import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { getObjectBuffer, contentTypeFor } from '@/lib/krpano';

// Sert les fichiers d'un tour krpano extrait sur R2, à travers une URL stable :
//   /api/krpano/<tourId>/tour.html        -> point d'entrée (chargé dans l'iframe)
//   /api/krpano/<tourId>/skin/...         -> ressources relatives résolues ici
//   /api/krpano/<tourId>/panos/...        -> tuiles cube
//
// Auth : l'iframe est ouverte avec ?t=<accessToken>. À la 1ère requête, on dépose
// un cookie httpOnly limité au chemin du tour ; les requêtes relatives suivantes
// (xml, js, images) le renvoient automatiquement (même origine).
export async function GET(
  req: NextRequest,
  { params }: { params: { tourId: string; path?: string[] } },
) {
  try {
    const cookieName = `kp_${params.tourId}`;
    const queryToken = req.nextUrl.searchParams.get('t');
    const cookieToken = req.cookies.get(cookieName)?.value;
    const token = queryToken ?? cookieToken ?? '';

    const user = verifyToken(token);
    if (!user) {
      return new Response('Non authentifié', { status: 401 });
    }

    const tour = await prisma.krpanoTour.findUnique({
      where: { id: params.tourId },
      include: { project: { select: { organizationId: true } } },
    });
    if (!tour || tour.deletedAt) {
      return new Response('Tour introuvable', { status: 404 });
    }
    // Contrôle d'appartenance à l'organisation (RBAC minimal — règle R5)
    if (tour.project.organizationId !== user.organizationId) {
      return new Response('Accès refusé', { status: 403 });
    }

    // Chemin demandé (vide => point d'entrée du tour)
    const segments = (params.path ?? []).filter(Boolean);
    const relative = segments.length > 0 ? segments.join('/') : tour.entryKey;

    // Sécurité : pas de traversée de répertoire
    if (relative.includes('..')) {
      return new Response('Chemin invalide', { status: 400 });
    }

    const key = tour.storagePrefix + relative;

    let buffer: Buffer;
    try {
      buffer = await getObjectBuffer(key);
    } catch {
      return new Response('Fichier introuvable', { status: 404 });
    }

    const headers = new Headers({
      'Content-Type': contentTypeFor(relative),
      // Les tuiles/skin sont immuables -> cache agressif ; le HTML reste court
      'Cache-Control': /\.html?$/i.test(relative)
        ? 'private, max-age=0, must-revalidate'
        : 'private, max-age=86400',
    });

    // Déposer le cookie d'accès au tour si fourni via la query (1ère requête)
    if (queryToken) {
      headers.append(
        'Set-Cookie',
        `${cookieName}=${queryToken}; Path=/api/krpano/${params.tourId}; HttpOnly; SameSite=Lax; Max-Age=900`,
      );
    }

    return new Response(new Uint8Array(buffer), { status: 200, headers });
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : 'Erreur',
      { status: 500 },
    );
  }
}
