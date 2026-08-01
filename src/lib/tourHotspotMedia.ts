import { getSignedFileUrl } from './storage';

// Vague 3 (§12/§13) — les hotspots Image/PDF dont le fichier a été importé stockent
// une CLÉ STABLE (content.fileKey) et non une URL signée. On résout la clé en URL de
// lecture fraîche au moment du GET (jamais persistée). Les hotspots à URL externe
// (sourceType EXTERNAL_URL) ou legacy sont renvoyés inchangés.
export async function signHotspotMedia<T extends { content: unknown }>(hotspots: T[]): Promise<T[]> {
  return Promise.all(hotspots.map(async (h) => {
    const raw = (h.content && typeof h.content === 'object') ? (h.content as Record<string, unknown>) : null;
    if (raw && raw.sourceType === 'UPLOAD' && typeof raw.fileKey === 'string' && raw.fileKey) {
      const c = { ...raw };
      try { c.url = (await getSignedFileUrl(raw.fileKey, 'view')).url; } catch { /* garde la clé, sans url */ }
      return { ...h, content: c };
    }
    return h;
  }));
}
