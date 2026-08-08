import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken, apiError } from '@/lib/auth';
import { getObjectBuffer } from '@/lib/storage';
import { getProjectAccess } from '@/lib/access';
import { resolveScope, fileInScope } from '@/lib/scope';
import AdmZip from 'adm-zip';

// Téléchargement multi-sélection : construit un ZIP des fichiers demandés.
// force-dynamic + maxDuration relevé car l'archive est assemblée en mémoire.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Garde-fous anti-OOM/timeout (l'archive est bâtie en mémoire par adm-zip).
// Au-delà, on invite l'utilisateur à faire plusieurs lots — plutôt qu'un échec opaque.
const MAX_FILES = 50;
const MAX_TOTAL_BYTES = 300 * 1024 * 1024; // 300 Mo

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '') ?? req.nextUrl.searchParams.get('token') ?? '';
    const user = verifyToken(token);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const access = await getProjectAccess(user, params.id);
    if (!access || !access.canView) return apiError('Accès refusé', 'FORBIDDEN', 403);
    if (!access.canDownload) return apiError('Vous n\'avez pas le droit de télécharger ces fichiers', 'FORBIDDEN', 403);

    const body = await req.json() as { fileIds?: unknown };
    const ids = Array.isArray(body.fileIds)
      ? Array.from(new Set(body.fileIds.filter((x): x is string => typeof x === 'string')))
      : [];
    if (!ids.length) return apiError('Aucun fichier sélectionné', 'VALIDATION_ERROR', 400);
    if (ids.length > MAX_FILES) return apiError(`Trop de fichiers sélectionnés (max ${MAX_FILES}). Faites plusieurs lots.`, 'TOO_MANY', 413);

    const files = await prisma.file.findMany({
      where: { id: { in: ids }, projectId: params.id, status: 'ACTIVE', deletedAt: null },
      select: { id: true, name: true, storageKey: true, nodeId: true, sizeBytes: true },
    });
    if (!files.length) return apiError('Fichiers introuvables', 'NOT_FOUND', 404);

    // Respect strict du périmètre (espaces/fichiers) accordé à l'utilisateur.
    const scope = await resolveScope(params.id, access.allowedNodeIds, access.allowedFileIds);
    const allowed = files.filter((f) => fileInScope(f.nodeId, f.id, scope));
    if (!allowed.length) return apiError('Accès refusé aux fichiers sélectionnés', 'FORBIDDEN', 403);

    const totalBytes = allowed.reduce((s, f) => s + Number(f.sizeBytes), 0);
    if (totalBytes > MAX_TOTAL_BYTES) {
      return apiError(`Sélection trop volumineuse (${Math.round(totalBytes / 1024 / 1024)} Mo, max ${Math.round(MAX_TOTAL_BYTES / 1024 / 1024)} Mo). Faites plusieurs lots.`, 'TOO_LARGE', 413);
    }

    const zip = new AdmZip();
    const seen: Record<string, number> = {};
    for (const f of allowed) {
      let name = f.name && f.name.trim() ? f.name : f.id;
      // Désambiguïse les noms identiques : « plan.pdf », « plan (1).pdf »…
      if (seen[name] !== undefined) {
        const n = ++seen[name];
        const dot = name.lastIndexOf('.');
        name = dot > 0 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`;
      } else {
        seen[name] = 0;
      }
      const buf = await getObjectBuffer(f.storageKey);
      zip.addFile(name, buf);
    }
    const out = zip.toBuffer();

    return new Response(out, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="bilnov-fichiers.zip"',
        'Content-Length': String(out.length),
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
