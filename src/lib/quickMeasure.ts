// M-mesure — Quick Measurement Engine (SFD §10-13, §18, §23-D). Fonctions PURES.
// Lance des rayons horizontaux/verticaux depuis le curseur vers les murs/lignes.
import type { Pt, Seg } from './snapEngine';
import { closestPointOnSegment } from './snapEngine';

export type Dir = 'left' | 'right' | 'up' | 'down';

/** Premier mur rencontré par un rayon axial depuis `origin` ; null si aucun. */
export function raycastAxis(segments: Seg[], origin: Pt, dir: Dir): { point: Pt; dist: number } | null {
  let best: { point: Pt; dist: number } | null = null;
  const horizontal = dir === 'left' || dir === 'right';
  for (const s of segments) {
    if (horizontal) {
      const y = origin.y;
      const lo = Math.min(s.ay, s.by), hi = Math.max(s.ay, s.by);
      if (y < lo - 1e-9 || y > hi + 1e-9) continue;
      if (Math.abs(s.by - s.ay) < 1e-9) continue; // segment horizontal : pas de croisement franc
      const x = s.ax + (s.bx - s.ax) * (y - s.ay) / (s.by - s.ay);
      if (dir === 'left' && x > origin.x - 1e-9) continue;
      if (dir === 'right' && x < origin.x + 1e-9) continue;
      const d = Math.abs(x - origin.x);
      if (!best || d < best.dist) best = { point: { x, y }, dist: d };
    } else {
      const x = origin.x;
      const lo = Math.min(s.ax, s.bx), hi = Math.max(s.ax, s.bx);
      if (x < lo - 1e-9 || x > hi + 1e-9) continue;
      if (Math.abs(s.bx - s.ax) < 1e-9) continue; // segment vertical : pas de croisement franc
      const y = s.ay + (s.by - s.ay) * (x - s.ax) / (s.bx - s.ax);
      if (dir === 'up' && y < origin.y + 1e-9) continue;
      if (dir === 'down' && y > origin.y - 1e-9) continue;
      const d = Math.abs(y - origin.y);
      if (!best || d < best.dist) best = { point: { x, y }, dist: d };
    }
  }
  return best;
}

export interface QuickResult {
  left: number | null; right: number | null; up: number | null; down: number | null;
  width: number | null; length: number | null;
  points: { left?: Pt; right?: Pt; up?: Pt; down?: Pt };
}

/** Distances automatiques autour du curseur (gauche/droite/haut/bas + totaux). SFD §12. */
export function quickMeasure(segments: Seg[], cursor: Pt): QuickResult {
  const l = raycastAxis(segments, cursor, 'left');
  const r = raycastAxis(segments, cursor, 'right');
  const u = raycastAxis(segments, cursor, 'up');
  const d = raycastAxis(segments, cursor, 'down');
  return {
    left: l?.dist ?? null, right: r?.dist ?? null, up: u?.dist ?? null, down: d?.dist ?? null,
    width: l && r ? l.dist + r.dist : null,
    length: u && d ? u.dist + d.dist : null,
    points: { left: l?.point, right: r?.point, up: u?.point, down: d?.point },
  };
}

/** Mur le plus proche (perpendiculaire) — SFD §18. */
export function nearestWall(segments: Seg[], cursor: Pt): { point: Pt; dist: number } | null {
  let best: { point: Pt; dist: number } | null = null;
  for (const s of segments) {
    const c = closestPointOnSegment(cursor, s);
    const dd = Math.hypot(c.x - cursor.x, c.y - cursor.y);
    if (!best || dd < best.dist) best = { point: { x: c.x, y: c.y }, dist: dd };
  }
  return best;
}
