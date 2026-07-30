// src/lib/__tests__/cadCursor.test.ts
import { describe, it, expect } from 'vitest';
import { offsetFactor, cursorOffsetPx } from '../cadCursor';

describe('offsetFactor', () => {
  it('croît avec le dpr puis est plafonné', () => {
    expect(offsetFactor(1)).toBeCloseTo(1.0);
    expect(offsetFactor(2)).toBeCloseTo(1.5);
    expect(offsetFactor(3)).toBeCloseTo(1.75);
    expect(offsetFactor(10)).toBeCloseTo(1.75);
  });
  it('plancher et valeurs invalides', () => {
    expect(offsetFactor(0.1)).toBe(0.75);
    expect(offsetFactor(0)).toBe(1.0);
    expect(offsetFactor(NaN)).toBe(1.0);
    expect(offsetFactor(-2)).toBe(1.0);
  });
});

describe('cursorOffsetPx', () => {
  it('≈1 cm à dpr 1, borné 24..80', () => {
    const o = cursorOffsetPx(1);
    expect(o).toBeGreaterThanOrEqual(24);
    expect(o).toBeLessThanOrEqual(80);
    expect(o).toBe(38);
  });
  it('augmente avec le dpr', () => {
    expect(cursorOffsetPx(2)).toBeGreaterThan(cursorOffsetPx(1));
    expect(cursorOffsetPx(3)).toBeGreaterThan(cursorOffsetPx(2));
  });
  it('augmente avec cm, reste borné', () => {
    expect(cursorOffsetPx(1, 2)).toBeGreaterThan(cursorOffsetPx(1, 1));
    expect(cursorOffsetPx(3, 10)).toBeLessThanOrEqual(80);
    expect(cursorOffsetPx(1, 0)).toBe(38);
  });
  it('dpr invalide → comportement dpr 1', () => {
    expect(cursorOffsetPx(0)).toBe(38);
    expect(cursorOffsetPx(NaN)).toBe(38);
  });
});
