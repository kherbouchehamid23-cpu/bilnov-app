'use client';

// Index spatial pour l'accrochage (OSNAP) des outils de mesure / superficie.
// Reçoit un Float32Array de points [x0,y0,x1,y1,...] en coordonnées dessin et
// permet de trouver le repère le plus proche d'un point, sous un seuil donné.
// Une grille uniforme rend la recherche rapide même sur les gros plans.

export interface SnapHit { x: number; y: number; }

export class SnapIndex {
  private pts: Float32Array;
  private cell: number;
  private minX = Infinity;
  private minY = Infinity;
  private grid: Map<number, number[]> = new Map();

  constructor(pts: Float32Array) {
    this.pts = pts;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i];
      const y = pts[i + 1];
      if (x < this.minX) this.minX = x;
      if (y < this.minY) this.minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    const n = pts.length / 2;
    const w = Math.max(maxX - this.minX, 1e-6);
    const h = Math.max(maxY - this.minY, 1e-6);
    const perAxis = Math.min(512, Math.max(1, Math.floor(Math.sqrt(n))));
    this.cell = Math.max(w, h) / perAxis;
    if (!Number.isFinite(this.cell) || this.cell <= 0) this.cell = 1;

    for (let i = 0; i < pts.length; i += 2) {
      const key = this.keyOf(pts[i], pts[i + 1]);
      let arr = this.grid.get(key);
      if (!arr) { arr = []; this.grid.set(key, arr); }
      arr.push(i);
    }
  }

  private keyOf(x: number, y: number): number {
    const cx = Math.floor((x - this.minX) / this.cell);
    const cy = Math.floor((y - this.minY) / this.cell);
    return cy * 1_000_003 + cx;
  }

  /** Point de repère le plus proche de (x,y) à distance <= maxDist, sinon null. */
  nearest(x: number, y: number, maxDist: number): SnapHit | null {
    if (this.pts.length === 0 || !(maxDist > 0)) return null;
    const range = Math.min(4, Math.max(1, Math.ceil(maxDist / this.cell)));
    const cx = Math.floor((x - this.minX) / this.cell);
    const cy = Math.floor((y - this.minY) / this.cell);
    let best = -1;
    let bestD = maxDist * maxDist;
    for (let gy = cy - range; gy <= cy + range; gy++) {
      for (let gx = cx - range; gx <= cx + range; gx++) {
        const arr = this.grid.get(gy * 1_000_003 + gx);
        if (!arr) continue;
        for (const idx of arr) {
          const dx = this.pts[idx] - x;
          const dy = this.pts[idx + 1] - y;
          const d = dx * dx + dy * dy;
          if (d < bestD) { bestD = d; best = idx; }
        }
      }
    }
    if (best < 0) return null;
    return { x: this.pts[best], y: this.pts[best + 1] };
  }

  get count(): number { return this.pts.length / 2; }
}
