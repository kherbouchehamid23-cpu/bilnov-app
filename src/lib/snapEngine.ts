// M-mesure — Snap Engine (SFD outil de mesure §5-9, §23-B). Fonctions PURES.
// Travaille sur des SEGMENTS du plan (murs/lignes) → snap riche + guidage ortho.

export interface Pt { x: number; y: number }
export interface Seg { ax: number; ay: number; bx: number; by: number }
// §15 — cercle/arc : centre + rayon. `full` = cercle complet (accrochage « sur le cercle »
// en plus du centre) ; les arcs n'exposent que leur centre (`full=false`).
export interface Circle { cx: number; cy: number; r: number; full: boolean }
export type SnapType =
  | 'ENDPOINT' | 'MIDPOINT' | 'INTERSECTION' | 'CENTER'
  | 'PERPENDICULAR' | 'ON_SEGMENT' | 'NEAREST' | 'NONE';
export interface SnapResult { x: number; y: number; type: SnapType; dist: number }

// Priorité des types (plus grand = préféré à distance égale) — SFD §5/§16.
const PRIORITY: Record<SnapType, number> = {
  ENDPOINT: 7, INTERSECTION: 6, MIDPOINT: 5, CENTER: 5,
  PERPENDICULAR: 4, ON_SEGMENT: 3, NEAREST: 2, NONE: 0,
};

export function dist(a: Pt, b: Pt): number { return Math.hypot(a.x - b.x, a.y - b.y); }

/** Point le plus proche du segment s par rapport à p, avec paramètre t ∈ [0,1]. */
export function closestPointOnSegment(p: Pt, s: Seg): { x: number; y: number; t: number } {
  const dx = s.bx - s.ax, dy = s.by - s.ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { x: s.ax, y: s.ay, t: 0 };
  let t = ((p.x - s.ax) * dx + (p.y - s.ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return { x: s.ax + t * dx, y: s.ay + t * dy, t };
}

/** Intersection de deux segments (ou null si pas de croisement dans les bornes). */
export function segmentIntersection(s1: Seg, s2: Seg): Pt | null {
  const r_x = s1.bx - s1.ax, r_y = s1.by - s1.ay;
  const s_x = s2.bx - s2.ax, s_y = s2.by - s2.ay;
  const denom = r_x * s_y - r_y * s_x;
  if (Math.abs(denom) < 1e-9) return null;
  const qp_x = s2.ax - s1.ax, qp_y = s2.ay - s1.ay;
  const t = (qp_x * s_y - qp_y * s_x) / denom;
  const u = (qp_x * r_y - qp_y * r_x) / denom;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return { x: s1.ax + t * r_x, y: s1.ay + t * r_y };
}

/** Pied de la perpendiculaire depuis `from` vers le support du segment (projeté, borné). */
export function perpendicularFoot(from: Pt, s: Seg): { x: number; y: number } | null {
  const c = closestPointOnSegment(from, s);
  if (c.t <= 0 || c.t >= 1) return null; // hors du segment → pas une vraie perpendiculaire
  return { x: c.x, y: c.y };
}

/**
 * Meilleur accrochage du curseur parmi les segments fournis, sous tolérance `tol`
 * (en unités monde). `from` (1er point de mesure) active la perpendiculaire.
 */
export function snap(segments: Seg[], cursor: Pt, tol: number, opts?: { from?: Pt | null; circles?: Circle[] | null }): SnapResult {
  let best: SnapResult = { x: cursor.x, y: cursor.y, type: 'NONE', dist: Infinity };
  const consider = (x: number, y: number, type: SnapType) => {
    const d = Math.hypot(x - cursor.x, y - cursor.y);
    if (d > tol) return;
    const better = PRIORITY[type] > PRIORITY[best.type] || (PRIORITY[type] === PRIORITY[best.type] && d < best.dist);
    if (best.type === 'NONE' || better) best = { x, y, type, dist: d };
  };
  const near: Seg[] = [];
  for (const s of segments) {
    const c = closestPointOnSegment(cursor, s);
    if (Math.hypot(c.x - cursor.x, c.y - cursor.y) <= tol * 3) near.push(s);
    consider(s.ax, s.ay, 'ENDPOINT');
    consider(s.bx, s.by, 'ENDPOINT');
    consider((s.ax + s.bx) / 2, (s.ay + s.by) / 2, 'MIDPOINT');
    consider(c.x, c.y, 'ON_SEGMENT');
    if (opts?.from) { const pf = perpendicularFoot(opts.from, s); if (pf) consider(pf.x, pf.y, 'PERPENDICULAR'); }
  }
  for (let i = 0; i < near.length; i++)
    for (let j = i + 1; j < near.length; j++) {
      const ip = segmentIntersection(near[i], near[j]);
      if (ip) consider(ip.x, ip.y, 'INTERSECTION');
    }
  // §15 — accrochage cercles/arcs : centre (CENTER) + point sur le cercle (NEAREST).
  if (opts?.circles) {
    for (const c of opts.circles) {
      consider(c.cx, c.cy, 'CENTER');
      if (c.full && c.r > 0) {
        const dx = cursor.x - c.cx, dy = cursor.y - c.cy;
        const d = Math.hypot(dx, dy);
        if (d > 1e-9) consider(c.cx + (dx / d) * c.r, c.cy + (dy / d) * c.r, 'NEAREST');
      }
    }
  }
  return best;
}

/** Conversion Float32Array [cx,cy,r,full,...] → Circle[]. */
export function circlesFromFloat32(a: Float32Array): Circle[] {
  const out: Circle[] = [];
  for (let i = 0; i + 3 < a.length; i += 4) out.push({ cx: a[i], cy: a[i + 1], r: a[i + 2], full: a[i + 3] !== 0 });
  return out;
}

/**
 * Guidage orthogonal (SFD §8-9) : verrouille la direction from→cursor sur l'axe
 * horizontal/vertical le plus proche si l'écart angulaire est sous `tolDeg`.
 */
export function applyOrtho(from: Pt, cursor: Pt, tolDeg = 7): { x: number; y: number; locked: boolean; axis: 'H' | 'V' | null } {
  const dx = cursor.x - from.x, dy = cursor.y - from.y;
  if (dx === 0 && dy === 0) return { x: cursor.x, y: cursor.y, locked: false, axis: null };
  const ang = Math.atan2(dy, dx) * 180 / Math.PI; // -180..180
  const tol = tolDeg;
  const nearH = Math.abs(ang) <= tol || Math.abs(Math.abs(ang) - 180) <= tol;
  const nearV = Math.abs(Math.abs(ang) - 90) <= tol;
  if (nearH) return { x: cursor.x, y: from.y, locked: true, axis: 'H' };
  if (nearV) return { x: from.x, y: cursor.y, locked: true, axis: 'V' };
  return { x: cursor.x, y: cursor.y, locked: false, axis: null };
}

/** Conversion Float32Array [ax,ay,bx,by,...] → Seg[]. */
export function segmentsFromFloat32(a: Float32Array): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i + 3 < a.length; i += 4) out.push({ ax: a[i], ay: a[i + 1], bx: a[i + 2], by: a[i + 3] });
  return out;
}

/** Index spatial (grille) des segments pour un snap fluide sur gros plans. */
export class SegmentIndex {
  private segs: Seg[]; private cell: number; private minX = Infinity; private minY = Infinity;
  private grid: Map<number, number[]> = new Map();
  constructor(segs: Seg[]) {
    this.segs = segs;
    let maxX = -Infinity, maxY = -Infinity;
    for (const s of segs) {
      this.minX = Math.min(this.minX, s.ax, s.bx); this.minY = Math.min(this.minY, s.ay, s.by);
      maxX = Math.max(maxX, s.ax, s.bx); maxY = Math.max(maxY, s.ay, s.by);
    }
    const w = Math.max(maxX - this.minX, 1e-6), h = Math.max(maxY - this.minY, 1e-6);
    const perAxis = Math.min(256, Math.max(1, Math.floor(Math.sqrt(segs.length) || 1)));
    this.cell = Math.max(w, h) / perAxis;
    if (!(this.cell > 0) || !Number.isFinite(this.cell)) this.cell = 1;
    segs.forEach((s, i) => this.insert(i, s));
  }
  private key(cx: number, cy: number): number { return cy * 1_000_003 + cx; }
  private add(cx: number, cy: number, i: number): void { const k = this.key(cx, cy); let a = this.grid.get(k); if (!a) { a = []; this.grid.set(k, a); } a.push(i); }
  private insert(i: number, s: Seg): void {
    const x0 = Math.floor((Math.min(s.ax, s.bx) - this.minX) / this.cell), x1 = Math.floor((Math.max(s.ax, s.bx) - this.minX) / this.cell);
    const y0 = Math.floor((Math.min(s.ay, s.by) - this.minY) / this.cell), y1 = Math.floor((Math.max(s.ay, s.by) - this.minY) / this.cell);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 64) {
      for (const p of [[s.ax, s.ay], [s.bx, s.by], [(s.ax + s.bx) / 2, (s.ay + s.by) / 2]]) {
        this.add(Math.floor((p[0] - this.minX) / this.cell), Math.floor((p[1] - this.minY) / this.cell), i);
      }
      return;
    }
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) this.add(cx, cy, i);
  }
  query(x: number, y: number, radius: number): Seg[] {
    const r = Math.max(1, Math.ceil(radius / this.cell));
    const cx = Math.floor((x - this.minX) / this.cell), cy = Math.floor((y - this.minY) / this.cell);
    const seen = new Set<number>(); const out: Seg[] = [];
    for (let gy = cy - r; gy <= cy + r; gy++) for (let gx = cx - r; gx <= cx + r; gx++) {
      const a = this.grid.get(this.key(gx, gy)); if (!a) continue;
      for (const i of a) if (!seen.has(i)) { seen.add(i); out.push(this.segs[i]); }
    }
    return out;
  }
  get count(): number { return this.segs.length; }
}
