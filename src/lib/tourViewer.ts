// src/lib/tourViewer.ts
// Bilnov 360 — V6b : helpers PURS pour le confort de visionnage
// (navigation clavier, préchargement des scènes voisines). AUCUNE dépendance DOM,
// pour être testable et partagé entre /view (interne) et /public/[token].

export interface SceneLite {
  id: string;
  position: number;
  imageUrl?: string;
  panoramaProxy?: string | null;
}

export interface HotspotLite {
  type: string;
  targetSceneId?: string | null;
}

export type ViewerKeyAction =
  | 'next'
  | 'prev'
  | 'closeModal'
  | 'toggleFullscreen'
  | 'toggleGyro'
  | null;

// Scènes triées par position (ordre stable, copie ; départage par id).
export function orderedScenes<T extends SceneLite>(scenes: T[]): T[] {
  return scenes.slice().sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}

// Scène voisine dans l'ordre des positions (dir = +1 suivant, -1 précédent).
// Pas de bouclage : renvoie null aux extrémités. Si currentId est inconnu/null,
// renvoie la première (dir 1) ou la dernière (dir -1) scène.
export function neighborSceneId(
  currentId: string | null,
  scenes: SceneLite[],
  dir: 1 | -1,
): string | null {
  const ord = orderedScenes(scenes);
  if (ord.length === 0) return null;
  const idx = ord.findIndex((s) => s.id === currentId);
  if (idx === -1) return dir === 1 ? ord[0].id : ord[ord.length - 1].id;
  const next = idx + dir;
  if (next < 0 || next >= ord.length) return null;
  return ord[next].id;
}

// Mappe une touche clavier (KeyboardEvent.key) vers une action de visionnage,
// ou null si la touche n'est pas gérée. Les lettres sont insensibles à la casse.
export function viewerKeyAction(key: string): ViewerKeyAction {
  switch (key) {
    case 'ArrowRight':
    case 'PageDown':
      return 'next';
    case 'ArrowLeft':
    case 'PageUp':
      return 'prev';
    case 'Escape':
      return 'closeModal';
  }
  const k = (key || '').toLowerCase();
  if (k === 'f') return 'toggleFullscreen';
  if (k === 'g') return 'toggleGyro';
  return null;
}

// URL panorama effective d'une scène (proxy signé + token si présent, sinon imageUrl).
export function panoramaUrl(s: SceneLite, token?: string): string | null {
  if (s.panoramaProxy) {
    return token ? `${s.panoramaProxy}?token=${encodeURIComponent(token)}` : s.panoramaProxy;
  }
  return s.imageUrl ?? null;
}

// URLs de panoramas à précharger depuis la scène courante :
//  - la scène suivante et la précédente (ordre des positions) ;
//  - les cibles directes des hotspots de direction de la scène courante.
// Dédupliquées, sans la scène courante, plafonnées à `max` (défaut 4).
export function preloadUrls(
  currentId: string | null,
  scenes: SceneLite[],
  hotspotsByScene: Record<string, HotspotLite[]> = {},
  opts: { max?: number; token?: string } = {},
): string[] {
  const max = opts.max ?? 4;
  const byId = new Map(scenes.map((s) => [s.id, s]));
  const targets = new Set<string>();

  const nx = neighborSceneId(currentId, scenes, 1);
  const pv = neighborSceneId(currentId, scenes, -1);
  if (nx) targets.add(nx);
  if (pv) targets.add(pv);

  const hs = currentId ? hotspotsByScene[currentId] ?? [] : [];
  for (const h of hs) {
    if (h.targetSceneId && byId.has(h.targetSceneId)) targets.add(h.targetSceneId);
  }

  if (currentId) targets.delete(currentId);

  const urls: string[] = [];
  const seen = new Set<string>();
  for (const sid of targets) {
    const s = byId.get(sid);
    if (!s) continue;
    const u = panoramaUrl(s, opts.token);
    if (u && !seen.has(u)) {
      seen.add(u);
      urls.push(u);
    }
    if (urls.length >= max) break;
  }
  return urls;
}
