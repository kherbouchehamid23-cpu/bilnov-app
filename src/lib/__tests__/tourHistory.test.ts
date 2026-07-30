// src/lib/__tests__/tourHistory.test.ts
import { describe, it, expect } from 'vitest';
import {
  emptyHistory,
  pushAction,
  canUndo,
  canRedo,
  peekUndo,
  peekRedo,
  commitUndo,
  commitRedo,
  invertAction,
  remapHotspotId,
  recreatePayload,
  type HotspotSnapshot,
  type HotspotAction,
} from '../tourHistory';

const snap = (id: string, extra: Partial<HotspotSnapshot> = {}): HotspotSnapshot => ({
  id,
  sceneId: 's1',
  type: 'LINK',
  positionYaw: 10,
  positionPitch: -5,
  targetSceneId: null,
  content: {},
  ...extra,
});
const create = (id: string): HotspotAction => ({ kind: 'create', hotspot: snap(id) });
const del = (id: string): HotspotAction => ({ kind: 'delete', hotspot: snap(id) });

describe('emptyHistory', () => {
  it('démarre vide, limite ≥ 1', () => {
    const h = emptyHistory();
    expect(h.past).toEqual([]);
    expect(h.future).toEqual([]);
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
    expect(emptyHistory(0).limit).toBe(1);
  });
});

describe('pushAction', () => {
  it('empile dans past et vide future', () => {
    let h = emptyHistory();
    h = pushAction(h, create('a'));
    h = commitUndo(h); // 'a' passe en future
    expect(canRedo(h)).toBe(true);
    h = pushAction(h, create('b')); // nouvelle branche -> future vidé
    expect(h.future).toEqual([]);
    expect(h.past.map((a) => a.hotspot.id)).toEqual(['b']);
  });
  it('borne l’historique à limit (jette les plus anciens)', () => {
    let h = emptyHistory(2);
    h = pushAction(h, create('a'));
    h = pushAction(h, create('b'));
    h = pushAction(h, create('c'));
    expect(h.past.map((a) => a.hotspot.id)).toEqual(['b', 'c']);
  });
});

describe('peek / commit undo & redo', () => {
  it('undo puis redo reviennent au même état', () => {
    let h = emptyHistory();
    h = pushAction(h, create('a'));
    h = pushAction(h, del('b'));
    expect(peekUndo(h)?.hotspot.id).toBe('b');
    h = commitUndo(h);
    expect(peekRedo(h)?.hotspot.id).toBe('b');
    expect(peekUndo(h)?.hotspot.id).toBe('a');
    h = commitRedo(h);
    expect(peekUndo(h)?.hotspot.id).toBe('b');
    expect(canRedo(h)).toBe(false);
  });
  it('commit sans rien à faire est neutre', () => {
    const h = emptyHistory();
    expect(commitUndo(h)).toEqual(h);
    expect(commitRedo(h)).toEqual(h);
    expect(peekUndo(h)).toBeNull();
    expect(peekRedo(h)).toBeNull();
  });
});

describe('invertAction', () => {
  it('inverse create <-> delete en gardant le hotspot', () => {
    expect(invertAction(create('a'))).toEqual({ kind: 'delete', hotspot: snap('a') });
    expect(invertAction(del('a'))).toEqual({ kind: 'create', hotspot: snap('a') });
  });
});

describe('remapHotspotId', () => {
  it('met à jour past ET future de oldId vers newId', () => {
    let h = emptyHistory();
    h = pushAction(h, del('old'));
    h = commitUndo(h); // 'old' en future
    h = pushAction(h, create('old')); // aussi une réf 'old' en past
    const h2 = remapHotspotId(h, 'old', 'new');
    expect(h2.past.every((a) => a.hotspot.id === 'new')).toBe(true);
    expect(h2.future.every((a) => a.hotspot.id === 'new')).toBe(true);
  });
  it('no-op si ids identiques ou vides', () => {
    const h = pushAction(emptyHistory(), create('a'));
    expect(remapHotspotId(h, 'a', 'a')).toEqual(h);
    expect(remapHotspotId(h, '', 'x')).toEqual(h);
  });
});

describe('recreatePayload', () => {
  it('extrait les champs nécessaires au POST', () => {
    const s = snap('a', { type: 'IMAGE', targetSceneId: 's2', content: { url: 'x' } });
    expect(recreatePayload(s)).toEqual({
      type: 'IMAGE',
      positionYaw: 10,
      positionPitch: -5,
      targetSceneId: 's2',
      content: { url: 'x' },
    });
  });
});
