// src/lib/__tests__/tourViewer.test.ts
import { describe, it, expect } from 'vitest';
import {
  orderedScenes,
  neighborSceneId,
  viewerKeyAction,
  panoramaUrl,
  preloadUrls,
  type SceneLite,
} from '../tourViewer';

const S = (id: string, position: number, extra: Partial<SceneLite> = {}): SceneLite => ({
  id,
  position,
  ...extra,
});

describe('orderedScenes', () => {
  it('trie par position croissante (copie, sans muter)', () => {
    const input = [S('c', 2), S('a', 0), S('b', 1)];
    const out = orderedScenes(input);
    expect(out.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(input.map((s) => s.id)).toEqual(['c', 'a', 'b']); // non muté
  });
  it('départage les positions égales par id', () => {
    expect(orderedScenes([S('y', 1), S('x', 1)]).map((s) => s.id)).toEqual(['x', 'y']);
  });
});

describe('neighborSceneId', () => {
  const scenes = [S('a', 0), S('b', 1), S('c', 2)];
  it('renvoie la scène suivante / précédente', () => {
    expect(neighborSceneId('a', scenes, 1)).toBe('b');
    expect(neighborSceneId('b', scenes, 1)).toBe('c');
    expect(neighborSceneId('b', scenes, -1)).toBe('a');
  });
  it('renvoie null aux extrémités (pas de bouclage)', () => {
    expect(neighborSceneId('c', scenes, 1)).toBeNull();
    expect(neighborSceneId('a', scenes, -1)).toBeNull();
  });
  it('currentId inconnu/null -> première (dir 1) ou dernière (dir -1)', () => {
    expect(neighborSceneId(null, scenes, 1)).toBe('a');
    expect(neighborSceneId(null, scenes, -1)).toBe('c');
    expect(neighborSceneId('zzz', scenes, 1)).toBe('a');
  });
  it('liste vide -> null', () => {
    expect(neighborSceneId('a', [], 1)).toBeNull();
  });
});

describe('viewerKeyAction', () => {
  it('mappe les flèches et pages', () => {
    expect(viewerKeyAction('ArrowRight')).toBe('next');
    expect(viewerKeyAction('PageDown')).toBe('next');
    expect(viewerKeyAction('ArrowLeft')).toBe('prev');
    expect(viewerKeyAction('PageUp')).toBe('prev');
  });
  it('Escape ferme la modale', () => {
    expect(viewerKeyAction('Escape')).toBe('closeModal');
  });
  it('f / g (insensible à la casse) -> plein écran / gyroscope', () => {
    expect(viewerKeyAction('f')).toBe('toggleFullscreen');
    expect(viewerKeyAction('F')).toBe('toggleFullscreen');
    expect(viewerKeyAction('g')).toBe('toggleGyro');
    expect(viewerKeyAction('G')).toBe('toggleGyro');
  });
  it('touche non gérée -> null', () => {
    expect(viewerKeyAction('a')).toBeNull();
    expect(viewerKeyAction('Enter')).toBeNull();
    expect(viewerKeyAction('')).toBeNull();
  });
});

describe('panoramaUrl', () => {
  it('utilise le proxy + token quand présent', () => {
    expect(panoramaUrl(S('a', 0, { panoramaProxy: '/api/pano/a', imageUrl: 'x' }), 'tok')).toBe(
      '/api/pano/a?token=tok',
    );
  });
  it('proxy sans token', () => {
    expect(panoramaUrl(S('a', 0, { panoramaProxy: '/api/pano/a' }))).toBe('/api/pano/a');
  });
  it('encode le token', () => {
    expect(panoramaUrl(S('a', 0, { panoramaProxy: '/p' }), 'a b/c')).toBe('/p?token=a%20b%2Fc');
  });
  it('retombe sur imageUrl sinon', () => {
    expect(panoramaUrl(S('a', 0, { imageUrl: 'https://img/a.jpg' }))).toBe('https://img/a.jpg');
    expect(panoramaUrl(S('a', 0))).toBeNull();
  });
});

describe('preloadUrls', () => {
  const scenes = [
    S('a', 0, { imageUrl: 'a.jpg' }),
    S('b', 1, { imageUrl: 'b.jpg' }),
    S('c', 2, { imageUrl: 'c.jpg' }),
    S('d', 3, { imageUrl: 'd.jpg' }),
  ];
  it('précharge voisines + cibles directes des hotspots, sans la courante', () => {
    const hs = { b: [{ type: 'DIRECTION', targetSceneId: 'd' }, { type: 'INFO', targetSceneId: null }] };
    const urls = preloadUrls('b', scenes, hs);
    expect(urls.sort()).toEqual(['a.jpg', 'c.jpg', 'd.jpg']); // a et c voisines, d cible
    expect(urls).not.toContain('b.jpg');
  });
  it('déduplique et plafonne à max', () => {
    const hs = { b: [{ type: 'DIRECTION', targetSceneId: 'a' }] }; // a est déjà la voisine
    const urls = preloadUrls('b', scenes, hs, { max: 1 });
    expect(urls.length).toBe(1);
  });
  it('scène courante inconnue -> première + dernière voisines calculées comme null aux bords', () => {
    // currentId null : voisines = première (a) via dir1 et dernière (d) via dir-1
    const urls = preloadUrls(null, scenes).sort();
    expect(urls).toEqual(['a.jpg', 'd.jpg']);
  });
  it('applique le token au proxy', () => {
    const sc = [S('a', 0, { panoramaProxy: '/p/a' }), S('b', 1, { panoramaProxy: '/p/b' })];
    expect(preloadUrls('a', sc, {}, { token: 'T' })).toEqual(['/p/b?token=T']);
  });
});
