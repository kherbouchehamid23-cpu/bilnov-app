// Module Visites 360° — helpers PURS (géométrie sphère, hotspots). Testables.
export interface Vec3 { x: number; y: number; z: number }

// Type "métier" de hotspot exposé à l'UI, mappé sur l'enum HotspotType du schéma.
export type HotspotKind = 'DIRECTION' | 'INFO_TEXT' | 'INFO_IMAGE' | 'INFO_VIDEO';
export const KIND_TO_TYPE: Record<HotspotKind, string> = {
  DIRECTION: 'LINK', INFO_TEXT: 'TEXT', INFO_IMAGE: 'IMAGE', INFO_VIDEO: 'VIDEO',
};
export const TYPE_TO_KIND: Record<string, HotspotKind> = {
  LINK: 'DIRECTION', TEXT: 'INFO_TEXT', IMAGE: 'INFO_IMAGE', VIDEO: 'INFO_VIDEO',
};
export function kindToType(k: HotspotKind): string { return KIND_TO_TYPE[k] ?? 'TEXT'; }
export function typeToKind(t: string): HotspotKind { return TYPE_TO_KIND[t] ?? 'INFO_TEXT'; }
export function isDirection(t: string): boolean { return t === 'LINK'; }

/**
 * Direction 3D (sur une sphère de rayon 1) pour un yaw/pitch en radians.
 * yaw = azimut (0 = -Z), pitch = élévation. Convention équirectangulaire.
 */
export function yawPitchToVector3(yaw: number, pitch: number, radius = 1): Vec3 {
  const cp = Math.cos(pitch);
  return { x: radius * cp * Math.sin(yaw), y: radius * Math.sin(pitch), z: -radius * cp * Math.cos(yaw) };
}

/** Inverse : yaw/pitch (radians) d'une direction 3D. */
export function vector3ToYawPitch(v: Vec3): { yaw: number; pitch: number } {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  const pitch = Math.asin(Math.max(-1, Math.min(1, v.y / len)));
  const yaw = Math.atan2(v.x, -v.z);
  return { yaw, pitch };
}

/** Coordonnées UV (0..1) d'un yaw/pitch sur la texture équirectangulaire. */
export function yawPitchToUV(yaw: number, pitch: number): { u: number; v: number } {
  let u = 0.5 + yaw / (2 * Math.PI);
  u = ((u % 1) + 1) % 1;
  const v = 0.5 - pitch / Math.PI;
  return { u, v };
}

export const deg2rad = (d: number) => (d * Math.PI) / 180;
export const rad2deg = (r: number) => (r * 180) / Math.PI;

/** Valide le contenu d'un hotspot selon son type (schéma content Json). */
export function validateHotspotContent(type: string, content: unknown): boolean {
  const c = (content ?? {}) as Record<string, unknown>;
  switch (type) {
    case 'LINK': return true; // la cible est portée par targetSceneId
    case 'TEXT': return typeof c.text === 'string' && c.text.trim().length > 0;
    case 'IMAGE': return typeof c.url === 'string' && c.url.length > 0;
    case 'VIDEO': return typeof c.url === 'string' && c.url.length > 0;
    default: return false;
  }
}

/** Titre lisible d'un hotspot pour l'UI. */
export function hotspotLabel(type: string, content: unknown, targetName?: string | null): string {
  const c = (content ?? {}) as Record<string, unknown>;
  if (type === 'LINK') return targetName ? `→ ${targetName}` : 'Direction';
  if (type === 'TEXT') return typeof c.title === 'string' && c.title ? c.title : (typeof c.text === 'string' ? c.text.slice(0, 30) : 'Info');
  if (type === 'IMAGE') return typeof c.title === 'string' && c.title ? c.title : 'Image';
  if (type === 'VIDEO') return typeof c.title === 'string' && c.title ? c.title : 'Vidéo';
  return 'Hotspot';
}
