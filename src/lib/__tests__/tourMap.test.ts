// src/lib/__tests__/tourMap.test.ts
import { describe, it, expect } from 'vitest';
import {
  clampMapCoord, isPlaced, toNormalized, groupScenesByLevel,
  levelForScene, markersForLevel, isVerticalConnection, nextLevelPosition,
  type LevelLite, type SceneMapLite,
} from '../tourMap';

const L = (id: string, position: number): LevelLite => ({ id, name: id, position });
const S = (id: string, position: number, levelId?: string | null, mapX?: number | null, mapY?: number | null): SceneMapLite =>
  ({ id, name: id, position, levelId, mapX, mapY });

describe('coordonnées de carte', () => {
  it('borne dans [0,1] et gère le non-numérique', () => {
    expect(clampMapCoord(1.5)).toBe(1);
    expect(clampMapCoord(-0.2)).toBe(0);
    expect(clampMapCoord(0.42)).toBe(0.42);
    expect(clampMapCoord('x')).toBe(0);
    expect(clampMapCoord(NaN)).toBe(0);
  });
  it('normalise un clic pixel -> 0..1 arrondi', () => {
    expect(toNormalized(50, 200)).toBe(0.25);
    expect(toNormalized(300, 200)).toBe(1);     // borné
    expect(toNormalized(-10, 200)).toBe(0);      // borné
    expect(toNormalized(10, 0)).toBe(0);         // taille invalide
  });
  it('isPlaced exige les deux coordonnées', () => {
    expect(isPlaced({ mapX: 0.1, mapY: 0.2 })).toBe(true);
    expect(isPlaced({ mapX: 0.1, mapY: null })).toBe(false);
    expect(isPlaced({ mapX: null, mapY: null })).toBe(false);
  });
});

describe('groupScenesByLevel', () => {
  it('regroupe par niveau trié + orphelins en dernier', () => {
    const levels = [L('rdc', 0), L('r1', 1)];
    const scenes = [S('a', 0, 'r1'), S('b', 1, 'rdc'), S('c', 2, null), S('d', 3, 'supprime')];
    const g = groupScenesByLevel(levels, scenes);
    expect(g.map((x) => x.level?.id ?? 'null')).toEqual(['rdc', 'r1', 'null']);
    expect(g[0].scenes.map((s) => s.id)).toEqual(['b']);
    expect(g[1].scenes.map((s) => s.id)).toEqual(['a']);
    // c (sans niveau) et d (niveau supprimé) -> orphelins
    expect(g[2].scenes.map((s) => s.id)).toEqual(['c', 'd']);
  });
  it('aucun groupe orphelin si tout est rattaché', () => {
    const g = groupScenesByLevel([L('rdc', 0)], [S('a', 0, 'rdc')]);
    expect(g).toHaveLength(1);
  });
});

describe('levelForScene', () => {
  const levels = [L('r1', 1), L('rdc', 0)];
  it('renvoie le niveau de la scène', () => {
    expect(levelForScene(levels, S('a', 0, 'r1'))?.id).toBe('r1');
  });
  it('fallback = 1er niveau trié quand pas/plus de niveau', () => {
    expect(levelForScene(levels, S('a', 0, null))?.id).toBe('rdc');
    expect(levelForScene(levels, S('a', 0, 'inconnu'))?.id).toBe('rdc');
    expect(levelForScene([], S('a', 0, 'x'))).toBeNull();
  });
});

describe('markersForLevel', () => {
  it('ne garde que les scènes placées du niveau, marque la courante', () => {
    const scenes = [
      S('a', 0, 'rdc', 0.2, 0.3),
      S('b', 1, 'rdc', null, null),   // non placée -> exclue
      S('c', 2, 'r1', 0.5, 0.5),       // autre niveau -> exclue
    ];
    const m = markersForLevel('rdc', scenes, 'a');
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ id: 'a', x: 0.2, y: 0.3, isCurrent: true });
  });
  it('borne les coordonnées hors limites', () => {
    const m = markersForLevel('rdc', [S('a', 0, 'rdc', 1.4, -0.1)], null);
    expect(m[0].x).toBe(1);
    expect(m[0].y).toBe(0);
  });
});

describe('connexion verticale', () => {
  it('vraie seulement entre niveaux différents', () => {
    expect(isVerticalConnection('rdc', 'r1')).toBe(true);
    expect(isVerticalConnection('rdc', 'rdc')).toBe(false);
    expect(isVerticalConnection('rdc', null)).toBe(false);
    expect(isVerticalConnection(null, 'r1')).toBe(false);
  });
});

describe('nextLevelPosition', () => {
  it('max+1 ou 0', () => {
    expect(nextLevelPosition([])).toBe(0);
    expect(nextLevelPosition([{ position: 0 }, { position: 3 }])).toBe(4);
  });
});
