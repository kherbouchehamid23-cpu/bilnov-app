// src/lib/tourMap.ts
// -----------------------------------------------------------------------------
// Bilnov 360 — V4 : plans 2D, niveaux, carte, connexions verticales.
//
// Module PUR (aucune dépendance React/DOM/Prisma) -> testé par vitest.
// Le rendu (éditeur + visiteur) et les routes API s'appuient dessus.
// -----------------------------------------------------------------------------

export interface LevelLite {
  id: string;
  name: string;
  position: number;
  planImageUrl?: string | null;
}

export interface SceneMapLite {
  id: string;
  name: string;
  position: number;
  levelId?: string | null;
  mapX?: number | null;
  mapY?: number | null;
}

/** Borne une coordonnée de carte normalisée dans [0, 1]. */
export function clampMapCoord(n: unknown): number {
  const v = typeof n === 'number' && isFinite(n) ? n : 0;
  return Math.min(1, Math.max(0, v));
}

/** Vrai si la scène est positionnée sur un plan (les deux coordonnées présentes). */
export function isPlaced(s: Pick<SceneMapLite, 'mapX' | 'mapY'>): boolean {
  return typeof s.mapX === 'number' && isFinite(s.mapX)
      && typeof s.mapY === 'number' && isFinite(s.mapY);
}

/**
 * Convertit une position cliquée (pixel relatif au plan) en coordonnée
 * normalisée 0..1, bornée et arrondie à 4 décimales (stable en base).
 */
export function toNormalized(px: number, size: number): number {
  if (!isFinite(px) || !isFinite(size) || size <= 0) return 0;
  return Math.round(clampMapCoord(px / size) * 10000) / 10000;
}

export interface LevelGroup {
  level: LevelLite | null;
  scenes: SceneMapLite[];
}

/**
 * Regroupe les scènes par niveau (niveaux triés par position). Les scènes sans
 * niveau — ou rattachées à un niveau supprimé — tombent dans un groupe final
 * `level: null` (« Sans niveau »).
 */
export function groupScenesByLevel(levels: LevelLite[], scenes: SceneMapLite[]): LevelGroup[] {
  const sortedLevels = [...levels].sort((a, b) => a.position - b.position);
  const known = new Set(sortedLevels.map((l) => l.id));
  const byLevel = new Map<string, SceneMapLite[]>();
  const orphans: SceneMapLite[] = [];
  for (const s of [...scenes].sort((a, b) => a.position - b.position)) {
    if (s.levelId && known.has(s.levelId)) {
      const arr = byLevel.get(s.levelId) ?? [];
      arr.push(s);
      byLevel.set(s.levelId, arr);
    } else {
      orphans.push(s);
    }
  }
  const groups: LevelGroup[] = sortedLevels.map((l) => ({ level: l, scenes: byLevel.get(l.id) ?? [] }));
  if (orphans.length) groups.push({ level: null, scenes: orphans });
  return groups;
}

/** Niveau à afficher pour la scène courante (sinon 1er niveau, sinon null). */
export function levelForScene(levels: LevelLite[], scene: SceneMapLite | null | undefined): LevelLite | null {
  const sorted = [...levels].sort((a, b) => a.position - b.position);
  if (scene?.levelId) {
    const l = sorted.find((x) => x.id === scene.levelId);
    if (l) return l;
  }
  return sorted[0] ?? null;
}

export interface PlanMarker {
  id: string;
  name: string;
  x: number;      // 0..1
  y: number;      // 0..1
  isCurrent: boolean;
}

/** Marqueurs à dessiner sur le plan d'un niveau : scènes placées de CE niveau. */
export function markersForLevel(
  levelId: string | null,
  scenes: SceneMapLite[],
  currentSceneId?: string | null,
): PlanMarker[] {
  return scenes
    .filter((s) => (s.levelId ?? null) === levelId && isPlaced(s))
    .map((s) => ({
      id: s.id,
      name: s.name,
      x: clampMapCoord(s.mapX),
      y: clampMapCoord(s.mapY),
      isCurrent: s.id === currentSceneId,
    }));
}

/**
 * Connexion verticale : lien Direction reliant deux scènes de niveaux
 * DIFFÉRENTS (escalier/ascenseur). On compare les niveaux source/cible.
 */
export function isVerticalConnection(
  sourceLevelId: string | null | undefined,
  targetLevelId: string | null | undefined,
): boolean {
  return Boolean(sourceLevelId && targetLevelId && sourceLevelId !== targetLevelId);
}

/** Prochain indice de position pour un nouveau niveau (max+1, ou 0). */
export function nextLevelPosition(levels: Pick<LevelLite, 'position'>[]): number {
  return levels.reduce((max, l) => Math.max(max, l.position + 1), 0);
}
