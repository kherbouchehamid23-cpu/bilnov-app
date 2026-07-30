// src/lib/tourQuality.ts
// -----------------------------------------------------------------------------
// Bilnov 360 — V5 : génération assistée (propositions de liens par proximité)
// et contrôle qualité de la visite (éditeur global).
//
// Module PUR (aucune dépendance React/DOM/Prisma) -> testé par vitest.
// -----------------------------------------------------------------------------

export interface SceneNode {
  id: string;
  name: string;
  isInitial: boolean;
  levelId?: string | null;
  mapX?: number | null;
  mapY?: number | null;
}

/** Lien de Direction A -> B (dérivé des hotspots type LINK avec cible). */
export interface DirectionLink {
  fromSceneId: string;
  toSceneId: string;
}

export interface LevelRef {
  id: string;
  name: string;
  planImageUrl?: string | null;
}

function placed(s: Pick<SceneNode, 'mapX' | 'mapY'>): boolean {
  return typeof s.mapX === 'number' && isFinite(s.mapX)
      && typeof s.mapY === 'number' && isFinite(s.mapY);
}

/** Clé non ordonnée d'une paire de scènes (A-B === B-A). */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export interface LinkProposal {
  fromSceneId: string;
  toSceneId: string;
  fromName: string;
  toName: string;
  distance: number;
}

/**
 * Propose des liens de Direction entre scènes PROCHES sur le plan d'un même
 * niveau, non encore reliées (dans un sens OU l'autre). Pour chaque scène
 * placée, on relie ses `maxPerScene` plus proches voisines du même niveau.
 * Les propositions sont dédupliquées (paire non ordonnée) et triées par
 * distance croissante. Fonction PURE.
 */
export function proximityProposals(
  scenes: SceneNode[],
  links: DirectionLink[],
  opts: { maxPerScene?: number; maxDistance?: number } = {},
): LinkProposal[] {
  const maxPerScene = opts.maxPerScene ?? 2;
  const maxDistance = opts.maxDistance ?? 0.5;
  const linked = new Set(links.map((l) => pairKey(l.fromSceneId, l.toSceneId)));
  const byId = new Map(scenes.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const out: LinkProposal[] = [];

  const placedScenes = scenes.filter((s) => placed(s) && s.levelId);
  for (const s of placedScenes) {
    const neighbors = placedScenes
      .filter((o) => o.id !== s.id && o.levelId === s.levelId)
      .map((o) => ({ o, d: Math.hypot((o.mapX as number) - (s.mapX as number), (o.mapY as number) - (s.mapY as number)) }))
      .filter((n) => n.d <= maxDistance)
      .sort((a, b) => a.d - b.d)
      .slice(0, maxPerScene);
    for (const { o, d } of neighbors) {
      const key = pairKey(s.id, o.id);
      if (linked.has(key) || seen.has(key)) continue;
      seen.add(key);
      out.push({
        fromSceneId: s.id, toSceneId: o.id,
        fromName: byId.get(s.id)?.name ?? s.id,
        toName: byId.get(o.id)?.name ?? o.id,
        distance: Math.round(d * 10000) / 10000,
      });
    }
  }
  return out.sort((a, b) => a.distance - b.distance);
}

export type IssueLevel = 'error' | 'warning' | 'info';

export interface QualityIssue {
  code: string;
  level: IssueLevel;
  message: string;
  sceneIds: string[];
}

export interface QualityReport {
  issues: QualityIssue[];
  reachable: string[];
  score: number; // 0..100
}

/** Ensemble des scènes atteignables depuis la scène initiale (BFS des liens). */
export function reachableFrom(startId: string | null, scenes: SceneNode[], links: DirectionLink[]): Set<string> {
  const out = new Set<string>();
  if (!startId || !scenes.some((s) => s.id === startId)) return out;
  const adj = new Map<string, string[]>();
  for (const l of links) {
    const arr = adj.get(l.fromSceneId) ?? [];
    arr.push(l.toSceneId);
    adj.set(l.fromSceneId, arr);
  }
  const queue = [startId];
  out.add(startId);
  while (queue.length) {
    const cur = queue.shift() as string;
    for (const next of adj.get(cur) ?? []) {
      if (!out.has(next)) { out.add(next); queue.push(next); }
    }
  }
  return out;
}

/**
 * Contrôle qualité de la visite. Détecte : absence/multiplicité de scène
 * initiale, scènes inatteignables, culs-de-sac, liens à sens unique, scènes
 * sans niveau, scènes non placées sur le plan. Fonction PURE.
 */
export function qualityReport(
  scenes: SceneNode[],
  links: DirectionLink[],
  levels: LevelRef[],
): QualityReport {
  const issues: QualityIssue[] = [];
  const n = scenes.length;
  const initial = scenes.filter((s) => s.isInitial);
  const start = initial[0]?.id ?? scenes[0]?.id ?? null;
  const reachable = reachableFrom(start, scenes, links);

  if (n === 0) {
    return { issues: [{ code: 'NO_SCENE', level: 'info', message: 'La visite ne contient aucune scène.', sceneIds: [] }], reachable: [], score: 0 };
  }
  if (initial.length === 0) {
    issues.push({ code: 'NO_INITIAL', level: 'error', message: 'Aucune scène de départ définie.', sceneIds: [] });
  } else if (initial.length > 1) {
    issues.push({ code: 'MULTI_INITIAL', level: 'warning', message: `${initial.length} scènes marquées « initiale » — une seule sera utilisée.`, sceneIds: initial.map((s) => s.id) });
  }

  if (n > 1) {
    const unreachable = scenes.filter((s) => !reachable.has(s.id));
    if (unreachable.length) {
      issues.push({ code: 'UNREACHABLE', level: 'error', message: `${unreachable.length} scène(s) inatteignable(s) depuis le départ.`, sceneIds: unreachable.map((s) => s.id) });
    }
    const outSet = new Set(links.map((l) => l.fromSceneId));
    const deadEnds = scenes.filter((s) => !outSet.has(s.id));
    if (deadEnds.length) {
      issues.push({ code: 'DEAD_END', level: 'warning', message: `${deadEnds.length} scène(s) sans lien sortant (cul-de-sac).`, sceneIds: deadEnds.map((s) => s.id) });
    }
    // Liens à sens unique.
    const linkSet = new Set(links.map((l) => `${l.fromSceneId}>${l.toSceneId}`));
    const oneWayPairs = new Set<string>();
    for (const l of links) {
      if (!linkSet.has(`${l.toSceneId}>${l.fromSceneId}`)) oneWayPairs.add(pairKey(l.fromSceneId, l.toSceneId));
    }
    if (oneWayPairs.size) {
      issues.push({ code: 'ONE_WAY', level: 'info', message: `${oneWayPairs.size} lien(s) à sens unique (pas de retour).`, sceneIds: [] });
    }
  }

  if (levels.length > 0) {
    const noLevel = scenes.filter((s) => !s.levelId);
    if (noLevel.length) {
      issues.push({ code: 'NO_LEVEL', level: 'info', message: `${noLevel.length} scène(s) non rattachée(s) à un niveau.`, sceneIds: noLevel.map((s) => s.id) });
    }
    const planLevels = new Set(levels.filter((l) => l.planImageUrl).map((l) => l.id));
    const notPlaced = scenes.filter((s) => s.levelId && planLevels.has(s.levelId) && !placed(s));
    if (notPlaced.length) {
      issues.push({ code: 'NOT_PLACED', level: 'info', message: `${notPlaced.length} scène(s) non positionnée(s) sur le plan de leur niveau.`, sceneIds: notPlaced.map((s) => s.id) });
    }
  }

  // Score : 100 - pénalités (error 20, warning 8, info 3), borné à [0,100].
  const penalty = issues.reduce((p, i) => p + (i.level === 'error' ? 20 : i.level === 'warning' ? 8 : 3), 0);
  const score = Math.max(0, Math.min(100, 100 - penalty));
  return { issues, reachable: [...reachable], score };
}
