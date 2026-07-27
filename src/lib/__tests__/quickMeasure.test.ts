import { describe, it, expect } from 'vitest';
import { raycastAxis, quickMeasure, nearestWall } from '../quickMeasure';
import type { Seg } from '../snapEngine';

// Pièce rectangulaire 4 (largeur) x 3 (hauteur), coin bas-gauche en (0,0).
const ROOM: Seg[] = [
  { ax: 0, ay: 0, bx: 4, by: 0 }, // bas
  { ax: 4, ay: 0, bx: 4, by: 3 }, // droite
  { ax: 4, ay: 3, bx: 0, by: 3 }, // haut
  { ax: 0, ay: 3, bx: 0, by: 0 }, // gauche
];
const C = { x: 1.8, y: 1.5 };

describe('raycastAxis', () => {
  it('gauche/droite', () => {
    expect(raycastAxis(ROOM, C, 'left')).toMatchObject({ dist: 1.8, point: { x: 0, y: 1.5 } });
    expect(raycastAxis(ROOM, C, 'right')?.dist).toBeCloseTo(2.2, 6);
  });
  it('haut/bas (monde, y vers le haut)', () => {
    expect(raycastAxis(ROOM, C, 'up')).toMatchObject({ point: { x: 1.8, y: 3 } });
    expect(raycastAxis(ROOM, C, 'down')).toMatchObject({ point: { x: 1.8, y: 0 } });
  });
  it('aucun mur → null', () => {
    expect(raycastAxis([], C, 'left')).toBeNull();
  });
});

describe('quickMeasure', () => {
  it('distances + totaux d’une pièce', () => {
    const q = quickMeasure(ROOM, C);
    expect(q.left).toBeCloseTo(1.8, 6);
    expect(q.right).toBeCloseTo(2.2, 6);
    expect(q.width).toBeCloseTo(4.0, 6);
    expect(q.up).toBeCloseTo(1.5, 6);
    expect(q.down).toBeCloseTo(1.5, 6);
    expect(q.length).toBeCloseTo(3.0, 6);
  });
});

describe('nearestWall', () => {
  it('mur le plus proche', () => {
    const n = nearestWall(ROOM, { x: 0.3, y: 1.5 });
    expect(n?.point).toEqual({ x: 0, y: 1.5 });
    expect(n?.dist).toBeCloseTo(0.3, 6);
  });
});
