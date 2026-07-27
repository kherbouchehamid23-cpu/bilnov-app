// M3 — Localisations multi-supports (SFD §9-16). Helpers PURS (testables).
export interface CommentLocationLike {
  locationType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
}
export interface NavTarget { label: string; href: string | null; support: string }

// Cible de navigation « Voir dans … » selon le type de localisation (SFD §14).
export function navigationTarget(projectId: string, loc: CommentLocationLike): NavTarget {
  const meta = loc.metadata ?? {};
  const asStr = (v: unknown): string | null => (typeof v === 'string' ? v : null);
  switch (loc.locationType) {
    case 'DWG': {
      const fid = loc.resourceId ?? asStr(meta['drawing_id']);
      return { support: 'DWG', label: 'Voir sur le plan DWG', href: fid ? `/projects/${projectId}?file=${fid}` : null };
    }
    case 'PDF': {
      const fid = loc.resourceId ?? asStr(meta['file_id']);
      return { support: 'PDF', label: 'Voir le PDF', href: fid ? `/projects/${projectId}?file=${fid}` : null };
    }
    case 'PANORAMA_360':
      return { support: '360', label: 'Voir la visite 360°', href: `/projects/${projectId}?tab=tours` };
    case 'BIM_IFC': {
      const fid = loc.resourceId ?? asStr(meta['bim_model_id']);
      const eid = meta['express_id'];
      const q = fid ? `?file=${fid}${typeof eid === 'number' ? `&bimExpress=${eid}` : ''}` : '';
      return { support: 'BIM', label: 'Voir dans la maquette BIM', href: fid ? `/projects/${projectId}${q}` : null };
    }
    case 'PHOTO': {
      const fid = loc.resourceId ?? asStr(meta['file_id']);
      return { support: 'PHOTO', label: 'Voir la photo', href: fid ? `/projects/${projectId}?file=${fid}` : null };
    }
    default:
      return { support: loc.locationType, label: `Voir (${loc.locationType})`, href: null };
  }
}

// Validation minimale des métadonnées selon le support (SFD §29-31).
export function validateLocationMetadata(type: string, meta: Record<string, unknown> | null | undefined): boolean {
  const m = meta ?? {};
  switch (type) {
    case 'DWG': return typeof m['x'] === 'number' && typeof m['y'] === 'number';
    case 'PANORAMA_360': return typeof m['yaw'] === 'number' && typeof m['pitch'] === 'number';
    case 'BIM_IFC': return typeof m['global_id'] === 'string' || typeof m['express_id'] === 'number';
    default: return true; // les autres supports n'exigent pas de géométrie
  }
}

// Mapping des annotations CAO existantes vers le modèle central (pont additif).
export function mapCadStatus(s: string): string {
  const M: Record<string, string> = { OPEN: 'NEW', IN_PROGRESS: 'IN_PROGRESS', RESOLVED: 'RESOLVED', VALIDATED: 'VALIDATED', CLOSED: 'ARCHIVED', ARCHIVED: 'ARCHIVED' };
  return M[s] ?? 'NEW';
}
export function mapCadPriority(p: string): string {
  const P: Record<string, string> = { LOW: 'LOW', NORMAL: 'NORMAL', HIGH: 'HIGH', URGENT: 'URGENT' };
  return P[p] ?? 'NORMAL';
}
