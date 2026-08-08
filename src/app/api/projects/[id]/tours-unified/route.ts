import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getProjectAccess } from '@/lib/access';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';
import { getSignedFileUrl } from '@/lib/storage';

// Vue 360° unifiee : agrege les visites natives, les imports krpano et les
// panoramiques bruts (fichiers IMAGE_360), filtres optionnellement par espaces.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifie', 'UNAUTHORIZED', 401);
    const access = await getProjectAccess(user, params.id);
    if (!access || !access.canView) return apiError('Acces refuse', 'FORBIDDEN', 403);

    const nodeIdsParam = req.nextUrl.searchParams.get('nodeIds');
    const ids = nodeIdsParam
      ? nodeIdsParam.split(',').map((v) => v.trim()).filter(Boolean)
      : [];

    const wt: { projectId: string; nodeId?: { in: string[] } } = { projectId: params.id };
    const wk: { projectId: string; deletedAt: null; nodeId?: { in: string[] } } = { projectId: params.id, deletedAt: null };
    const wf: { projectId: string; status: 'ACTIVE'; deletedAt: null; fileType: 'IMAGE_360'; nodeId?: { in: string[] } } = { projectId: params.id, status: 'ACTIVE', deletedAt: null, fileType: 'IMAGE_360' };
    if (ids.length) { wt.nodeId = { in: ids }; wk.nodeId = { in: ids }; wf.nodeId = { in: ids }; }

    const [native, krpano, pano] = await Promise.all([
      prisma.virtualTour.findMany({ where: wt, select: { id: true, name: true, status: true, nodeId: true }, orderBy: { createdAt: 'desc' } }),
      prisma.krpanoTour.findMany({ where: wk, select: { id: true, name: true, status: true, nodeId: true }, orderBy: { createdAt: 'desc' } }),
      prisma.file.findMany({ where: wf, select: { id: true, name: true, nodeId: true, storageKey: true }, orderBy: { createdAt: 'desc' } }),
    ]);

    // Aperçu signé pour chaque panorama brut (image équirectangulaire servie en couverture de carte).
    const panoItems = await Promise.all(pano.map(async (f) => {
      let coverUrl: string | null = null;
      try { coverUrl = (await getSignedFileUrl(f.storageKey, 'view')).url; } catch { coverUrl = null; }
      return { id: f.id, name: f.name, status: 'PANO', nodeId: f.nodeId, kind: 'pano', coverUrl };
    }));

    const items = [
      ...native.map((t) => ({ id: t.id, name: t.name, status: String(t.status), nodeId: t.nodeId, kind: 'tour' })),
      ...krpano.map((t) => ({ id: t.id, name: t.name, status: String(t.status), nodeId: t.nodeId, kind: 'krpano' })),
      ...panoItems,
    ];

    return apiSuccess({ items, counts: { tours: native.length, krpano: krpano.length, pano: pano.length } });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
