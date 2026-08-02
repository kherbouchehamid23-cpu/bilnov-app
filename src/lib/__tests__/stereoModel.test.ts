import { describe, it, expect } from 'vitest';
import { layoutFromScene, eyeRect } from '../stereoCrop';

// Séparation des vues stéréo : chaque œil reçoit la BONNE moitié du fichier source.
describe('layoutFromScene', () => {
  it('mono si non stéréo', () => {
    expect(layoutFromScene(null, null)).toBe('MONO');
    expect(layoutFromScene('MONO', 'TB')).toBe('MONO');
    expect(layoutFromScene('FLAT', null)).toBe('MONO');
  });
  it('reconnaît TB/BT/LR/RL (courts et longs)', () => {
    expect(layoutFromScene('STEREO', 'TB')).toBe('TB');
    expect(layoutFromScene('STEREO', 'TOP_BOTTOM')).toBe('TB');
    expect(layoutFromScene('STEREO', null)).toBe('TB'); // défaut
    expect(layoutFromScene('STEREO', 'BT')).toBe('BT');
    expect(layoutFromScene('STEREO', 'BOTTOM_TOP')).toBe('BT');
    expect(layoutFromScene('STEREO', 'LR')).toBe('LR');
    expect(layoutFromScene('STEREO', 'SBS')).toBe('LR');
    expect(layoutFromScene('STEREO', 'LEFT_RIGHT')).toBe('LR');
    expect(layoutFromScene('STEREO', 'RL')).toBe('RL');
    expect(layoutFromScene('STEREO', 'RIGHT_LEFT')).toBe('RL');
  });
});

describe('eyeRect — moitié source par œil', () => {
  const W = 8192, H = 8192, HW = 4096, HH = 4096;
  it('MONO → null (image entière)', () => {
    expect(eyeRect('MONO', 'left', W, H)).toBeNull();
  });
  it('TB : gauche=haut, droit=bas', () => {
    expect(eyeRect('TB', 'left', W, H)).toEqual({ x: 0, y: 0, cw: W, ch: HH });
    expect(eyeRect('TB', 'right', W, H)).toEqual({ x: 0, y: HH, cw: W, ch: HH });
  });
  it('BT : gauche=bas, droit=haut (inverse de TB)', () => {
    expect(eyeRect('BT', 'left', W, H)).toEqual({ x: 0, y: HH, cw: W, ch: HH });
    expect(eyeRect('BT', 'right', W, H)).toEqual({ x: 0, y: 0, cw: W, ch: HH });
  });
  it('LR : gauche=gauche, droit=droite', () => {
    const w = 16384, hw = 8192, h = 4096;
    expect(eyeRect('LR', 'left', w, h)).toEqual({ x: 0, y: 0, cw: hw, ch: h });
    expect(eyeRect('LR', 'right', w, h)).toEqual({ x: hw, y: 0, cw: hw, ch: h });
  });
  it('RL : gauche=droite, droit=gauche (inverse de LR)', () => {
    expect(eyeRect('RL', 'left', W, H)).toEqual({ x: HW, y: 0, cw: HW, ch: H });
    expect(eyeRect('RL', 'right', W, H)).toEqual({ x: 0, y: 0, cw: HW, ch: H });
  });
  it("les deux yeux ne partagent JAMAIS la même région (pas de même moitié aux 2 yeux)", () => {
    for (const layout of ['TB', 'BT', 'LR', 'RL'] as const) {
      const l = eyeRect(layout, 'left', W, H)!;
      const r = eyeRect(layout, 'right', W, H)!;
      expect(`${l.x},${l.y}`).not.toBe(`${r.x},${r.y}`);
    }
  });
});
