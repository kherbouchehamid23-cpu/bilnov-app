// src/lib/tourHistory.ts
// Bilnov 360 — V6c : moteur PUR d'annulation / rétablissement (undo/redo) des
// hotspots de l'éditeur. Aucune dépendance DOM ni réseau : le composant applique
// les opérations inverses via les API existantes (POST créer / DELETE supprimer).
// Le remap d'id gère le fait qu'une recréation serveur renvoie un NOUVEL id.

export interface HotspotSnapshot {
  id: string;
  sceneId: string;
  type: string;
  positionYaw: number;
  positionPitch: number;
  targetSceneId: string | null;
  content: Record<string, unknown>;
}

export type HotspotAction =
  | { kind: 'create'; hotspot: HotspotSnapshot }
  | { kind: 'delete'; hotspot: HotspotSnapshot };

export interface History {
  past: HotspotAction[];
  future: HotspotAction[];
  limit: number;
}

export function emptyHistory(limit = 50): History {
  return { past: [], future: [], limit: Math.max(1, Math.floor(limit)) };
}

// Enregistre une nouvelle action utilisateur : empile dans `past`, VIDE `future`
// (une nouvelle branche annule les rétablissements en attente) et borne à `limit`.
export function pushAction(h: History, a: HotspotAction): History {
  const past = [...h.past, a];
  const overflow = past.length - h.limit;
  return { past: overflow > 0 ? past.slice(overflow) : past, future: [], limit: h.limit };
}

export function canUndo(h: History): boolean {
  return h.past.length > 0;
}
export function canRedo(h: History): boolean {
  return h.future.length > 0;
}

// L'action qui serait annulée / rétablie (sans muter l'historique).
export function peekUndo(h: History): HotspotAction | null {
  return h.past.length ? h.past[h.past.length - 1] : null;
}
export function peekRedo(h: History): HotspotAction | null {
  return h.future.length ? h.future[h.future.length - 1] : null;
}

// Déplace la dernière action past -> future. À appeler APRÈS avoir appliqué l'inverse.
export function commitUndo(h: History): History {
  if (!h.past.length) return h;
  const moved = h.past[h.past.length - 1];
  return { past: h.past.slice(0, -1), future: [...h.future, moved], limit: h.limit };
}
// Déplace la dernière action future -> past. À appeler APRÈS avoir ré-appliqué l'action.
export function commitRedo(h: History): History {
  if (!h.future.length) return h;
  const moved = h.future[h.future.length - 1];
  return { past: [...h.past, moved], future: h.future.slice(0, -1), limit: h.limit };
}

// Inverse d'une action : créer <-> supprimer, sur le même hotspot.
export function invertAction(a: HotspotAction): HotspotAction {
  return a.kind === 'create'
    ? { kind: 'delete', hotspot: a.hotspot }
    : { kind: 'create', hotspot: a.hotspot };
}

// Après une recréation serveur (nouvel id), met à jour toutes les références
// (past + future) de oldId vers newId pour garder l'historique cohérent.
export function remapHotspotId(h: History, oldId: string, newId: string): History {
  if (!oldId || !newId || oldId === newId) return h;
  const fix = (list: HotspotAction[]): HotspotAction[] =>
    list.map((a) =>
      a.hotspot.id === oldId ? { kind: a.kind, hotspot: { ...a.hotspot, id: newId } } : a,
    );
  return { past: fix(h.past), future: fix(h.future), limit: h.limit };
}

// Payload POST pour recréer un hotspot à partir de son instantané.
export function recreatePayload(s: HotspotSnapshot): {
  type: string;
  positionYaw: number;
  positionPitch: number;
  targetSceneId: string | null;
  content: Record<string, unknown>;
} {
  return {
    type: s.type,
    positionYaw: s.positionYaw,
    positionPitch: s.positionPitch,
    targetSceneId: s.targetSceneId,
    content: s.content,
  };
}
