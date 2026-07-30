// src/lib/__tests__/tourQuality.test.ts
import { describe, it, expect } from 'vitest';
import {
  proximityProposals, reachableFrom, qualityReport,
  type SceneNode, type DirectionLink, type LevelRef,
} from '../tourQuality';

const S = (id: string, opts: Partial<SceneNode> = {}): SceneNode =>
  ({ id, name: id, isInitial: false, levelId: null, mapX: null, mapY: null, ...opts });

describe('proximityProposals', () => {
  it('propose les voisines proches du même niveau, non déjà reliées', () => {
    const scenes = [
      S('a', { levelId: 'rdc', mapX: 0.1, mapY: 0.1 }),
      S('b', { levelId: 'rdc', mapX: 0.15, mapY: 0.1 }),  // proche de a
      S('c', { levelId: 'rdc', mapX: 0.9, mapY: 0.9 }),    // loin
      S('d', { levelId: 'r1', mapX: 0.11, mapY: 0.1 }),    // autre niveau
    ];
    const props = proximityProposals(scenes, [], { maxPerScene: 1, maxDistance: 0.5 });
    // a-b proches et même niveau ; d autre niveau ; c trop loin
    expect(props.some((p) => (p.fromSceneId === 'a' && p.toSceneId === 'b') || (p.fromSceneId === 'b' && p.toSceneId === 'a'))).toBe(true);
    expect(props.some((p) => p.toSceneId === 'd' || p.fromSceneId === 'd')).toBe(false);
  });
  it('exclut les paires déjà reliées et dé-duplique', () => {
    const scenes = [
      S('a', { levelId: 'rdc', mapX: 0.1, mapY: 0.1 }),
      S('b', { levelId: 'rdc', mapX: 0.12, mapY: 0.1 }),
    ];
    const links: DirectionLink[] = [{ fromSceneId: 'a', toSceneId: 'b' }];
    expect(proximityProposals(scenes, links)).toHaveLength(0);
  });
  it('ignore les scènes non placées ou sans niveau', () => {
    const scenes = [S('a', { levelId: 'rdc', mapX: 0.1, mapY: 0.1 }), S('b', { levelId: 'rdc' }), S('c', { mapX: 0.1, mapY: 0.1 })];
    expect(proximityProposals(scenes, [])).toHaveLength(0);
  });
});

describe('reachableFrom', () => {
  it('BFS depuis le départ', () => {
    const scenes = [S('a'), S('b'), S('c'), S('d')];
    const links: DirectionLink[] = [{ fromSceneId: 'a', toSceneId: 'b' }, { fromSceneId: 'b', toSceneId: 'c' }];
    const r = reachableFrom('a', scenes, links);
    expect([...r].sort()).toEqual(['a', 'b', 'c']);
    expect(r.has('d')).toBe(false);
  });
  it('vide si départ inconnu', () => {
    expect(reachableFrom('x', [S('a')], []).size).toBe(0);
    expect(reachableFrom(null, [S('a')], []).size).toBe(0);
  });
});

describe('qualityReport', () => {
  const levels: LevelRef[] = [{ id: 'rdc', name: 'RDC', planImageUrl: 'k' }];
  it('signale absence de scène initiale', () => {
    const r = qualityReport([S('a'), S('b', { isInitial: false })], [], []);
    expect(r.issues.some((i) => i.code === 'NO_INITIAL')).toBe(true);
  });
  it('détecte les scènes inatteignables + culs-de-sac', () => {
    const scenes = [S('a', { isInitial: true }), S('b'), S('c')];
    const links: DirectionLink[] = [{ fromSceneId: 'a', toSceneId: 'b' }];
    const r = qualityReport(scenes, links, []);
    const unreach = r.issues.find((i) => i.code === 'UNREACHABLE');
    expect(unreach?.sceneIds).toContain('c');
    expect(r.issues.some((i) => i.code === 'DEAD_END')).toBe(true); // b et c sans sortie
  });
  it('détecte le sens unique', () => {
    const scenes = [S('a', { isInitial: true }), S('b')];
    const r = qualityReport(scenes, [{ fromSceneId: 'a', toSceneId: 'b' }], []);
    expect(r.issues.some((i) => i.code === 'ONE_WAY')).toBe(true);
  });
  it('signale scènes non placées quand le niveau a un plan', () => {
    const scenes = [S('a', { isInitial: true, levelId: 'rdc' }), S('b', { levelId: 'rdc' })];
    const r = qualityReport(scenes, [{ fromSceneId: 'a', toSceneId: 'b' }, { fromSceneId: 'b', toSceneId: 'a' }], levels);
    expect(r.issues.some((i) => i.code === 'NOT_PLACED')).toBe(true);
  });
  it('score parfait pour une visite saine', () => {
    const scenes = [S('a', { isInitial: true, levelId: 'rdc', mapX: 0.1, mapY: 0.1 }), S('b', { levelId: 'rdc', mapX: 0.2, mapY: 0.2 })];
    const links: DirectionLink[] = [{ fromSceneId: 'a', toSceneId: 'b' }, { fromSceneId: 'b', toSceneId: 'a' }];
    const r = qualityReport(scenes, links, levels);
    expect(r.score).toBe(100);
    expect(r.issues).toHaveLength(0);
  });
});
