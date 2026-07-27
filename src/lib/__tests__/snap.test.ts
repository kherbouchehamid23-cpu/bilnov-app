import { describe, it, expect } from 'vitest';
import { SnapIndex } from '../snap';

function arr(pairs: [number, number][]): Float32Array {
  const f = new Float32Array(pairs.length * 2);
  pairs.forEach(([x, y], i) => { f[i * 2] = x; f[i * 2 + 1] = y; });
  return f;
}

describe('SnapIndex (accrochage OSNAP)', () => {
  it('compte les repères', () => {
    expect(new SnapIndex(arr([[0, 0], [10, 10], [20, 5]])).count).toBe(3);
  });
  it('accroche le repère le plus proche sous le seuil', () => {
    const idx = new SnapIndex(arr([[0, 0], [100, 0], [100, 100]]));
    const hit = idx.nearest(98, 2, 10);
    expect(hit).toEqual({ x: 100, y: 0 });
  });
  it('renvoie null au-delà du seuil', () => {
    const idx = new SnapIndex(arr([[0, 0], [100, 0]]));
    expect(idx.nearest(50, 50, 5)).toBeNull();
  });
  it('renvoie null si aucun repère', () => {
    expect(new SnapIndex(arr([])).nearest(0, 0, 10)).toBeNull();
  });
  it('renvoie null pour un seuil nul ou négatif', () => {
    const idx = new SnapIndex(arr([[0, 0]]));
    expect(idx.nearest(0, 0, 0)).toBeNull();
    expect(idx.nearest(0, 0, -1)).toBeNull();
  });
  it('reste correct sur un nuage dense (grille)', () => {
    const pairs: [number, number][] = [];
    for (let x = 0; x < 50; x++) for (let y = 0; y < 50; y++) pairs.push([x, y]);
    const idx = new SnapIndex(arr(pairs));
    expect(idx.count).toBe(2500);
    expect(idx.nearest(25.2, 25.1, 1)).toEqual({ x: 25, y: 25 });
  });
});
