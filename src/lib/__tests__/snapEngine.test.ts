import { describe, it, expect } from 'vitest';
import { closestPointOnSegment, segmentIntersection, perpendicularFoot, snap, applyOrtho, circlesFromFloat32, type Seg } from '../snapEngine';

const H: Seg = { ax: 0, ay: 0, bx: 10, by: 0 };
const V: Seg = { ax: 5, ay: -5, bx: 5, by: 5 };

describe('géométrie de base', () => {
  it('closestPointOnSegment', () => {
    expect(closestPointOnSegment({ x: 5, y: 5 }, H)).toMatchObject({ x: 5, y: 0, t: 0.5 });
    expect(closestPointOnSegment({ x: -3, y: 1 }, H)).toMatchObject({ x: 0, y: 0, t: 0 });
  });
  it('segmentIntersection', () => {
    expect(segmentIntersection(H, V)).toEqual({ x: 5, y: 0 });
    expect(segmentIntersection(H, { ax: 0, ay: 2, bx: 10, by: 2 })).toBeNull();
  });
  it('perpendicularFoot (borné)', () => {
    expect(perpendicularFoot({ x: 5, y: 5 }, H)).toEqual({ x: 5, y: 0 });
    expect(perpendicularFoot({ x: 20, y: 5 }, H)).toBeNull();
  });
});

describe('snap', () => {
  it('accroche une extrémité', () => {
    const r = snap([H], { x: 0.1, y: 0.1 }, 1);
    expect(r.type).toBe('ENDPOINT'); expect(r).toMatchObject({ x: 0, y: 0 });
  });
  it('accroche le milieu', () => {
    const r = snap([{ ax: 0, ay: 0, bx: 4, by: 0 }], { x: 2, y: 0.2 }, 1);
    expect(r.type).toBe('MIDPOINT'); expect(r).toMatchObject({ x: 2, y: 0 });
  });
  it('accroche un point sur la ligne', () => {
    const r = snap([H], { x: 2.5, y: 0.1 }, 1);
    expect(r.type).toBe('ON_SEGMENT'); expect(r.x).toBeCloseTo(2.5, 6);
  });
  it('préfère l’intersection', () => {
    const r = snap([H, V], { x: 5.1, y: 0.1 }, 1);
    expect(r.type).toBe('INTERSECTION'); expect(r).toMatchObject({ x: 5, y: 0 });
  });
  it('perpendiculaire quand from est fourni', () => {
    const r = snap([H], { x: 3, y: 0.3 }, 1, { from: { x: 3, y: 5 } });
    expect(r.type).toBe('PERPENDICULAR'); expect(r).toMatchObject({ x: 3, y: 0 });
  });
  it('rien sous la tolérance → NONE', () => {
    expect(snap([H], { x: 3, y: 9 }, 1).type).toBe('NONE');
  });
});

describe('applyOrtho', () => {
  it('verrouille horizontal', () => {
    expect(applyOrtho({ x: 0, y: 0 }, { x: 5, y: 0.1 })).toEqual({ x: 5, y: 0, locked: true, axis: 'H' });
  });
  it('verrouille vertical', () => {
    expect(applyOrtho({ x: 0, y: 0 }, { x: 0.1, y: 5 })).toEqual({ x: 0, y: 5, locked: true, axis: 'V' });
  });
  it('laisse libre en diagonale', () => {
    expect(applyOrtho({ x: 0, y: 0 }, { x: 5, y: 5 })).toMatchObject({ locked: false, axis: null });
  });
});

import { SegmentIndex, segmentsFromFloat32 } from '../snapEngine';
describe('SegmentIndex', () => {
  const room: Seg[] = [
    { ax: 0, ay: 0, bx: 4, by: 0 }, { ax: 4, ay: 0, bx: 4, by: 3 },
    { ax: 4, ay: 3, bx: 0, by: 3 }, { ax: 0, ay: 3, bx: 0, by: 0 },
  ];
  it('retrouve des segments proches du curseur', () => {
    const idx = new SegmentIndex(room);
    expect(idx.count).toBe(4);
    const near = idx.query(0.1, 1.5, 0.5);
    expect(near.length).toBeGreaterThan(0);
    // le mur gauche (0,0)-(0,3) doit être candidat
    expect(near.some((s) => s.ax === 0 && s.bx === 0)).toBe(true);
  });
  it('segmentsFromFloat32', () => {
    const segs = segmentsFromFloat32(new Float32Array([0, 0, 1, 1, 2, 2, 3, 3]));
    expect(segs).toEqual([{ ax: 0, ay: 0, bx: 1, by: 1 }, { ax: 2, ay: 2, bx: 3, by: 3 }]);
  });
});

describe('snap cercles/arcs (§15)', () => {
  it('accroche le CENTRE d\'un cercle', () => {
    const r = snap([], { x: 5.2, y: 5.1 }, 1, { circles: [{ cx: 5, cy: 5, r: 3, full: true }] });
    expect(r.type).toBe('CENTER');
    expect(r).toMatchObject({ x: 5, y: 5 });
  });
  it('accroche un point SUR le cercle (NEAREST) quand loin du centre', () => {
    // cercle rayon 3 centré en (0,0) ; curseur à (3.2, 0) → point sur cercle (3,0).
    const r = snap([], { x: 3.2, y: 0 }, 1, { circles: [{ cx: 0, cy: 0, r: 3, full: true }] });
    expect(r.type).toBe('NEAREST');
    expect(r.x).toBeCloseTo(3, 5);
    expect(r.y).toBeCloseTo(0, 5);
  });
  it('un arc (full=false) n\'expose que son centre', () => {
    const r = snap([], { x: 3.2, y: 0 }, 1, { circles: [{ cx: 0, cy: 0, r: 3, full: false }] });
    expect(r.type).toBe('NONE'); // pas de point sur le cercle pour un arc, et le centre est loin
  });
  it('un ENDPOINT reste prioritaire sur un CENTER à distance comparable', () => {
    const r = snap([{ ax: 5, ay: 5, bx: 9, by: 5 }], { x: 5.1, y: 5.05 }, 1, { circles: [{ cx: 5, cy: 5, r: 2, full: true }] });
    expect(r.type).toBe('ENDPOINT');
  });
  it('circlesFromFloat32', () => {
    const c = circlesFromFloat32(new Float32Array([1, 2, 3, 1, 4, 5, 6, 0]));
    expect(c).toEqual([{ cx: 1, cy: 2, r: 3, full: true }, { cx: 4, cy: 5, r: 6, full: false }]);
  });
});
