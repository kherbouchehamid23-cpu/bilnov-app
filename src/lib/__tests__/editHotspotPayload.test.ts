import { describe, it, expect } from 'vitest';
import { buildHotspotPayload } from '../tourHotspots';

// §2 — contrat de données de l'édition d'un hotspot Direction :
// l'orientation d'arrivée saisie via « Régler la vue d'arrivée » (form.arrival) doit se
// retrouver dans content.arrival, et le réglage d'UI `pairMode` NE doit PAS polluer le content
// (l'éditeur le retire avant buildHotspotPayload — ce test verrouille le comportement attendu).
describe('§2 — édition Direction : arrivée + nettoyage pairMode', () => {
  const pos = { yaw: 12, pitch: -3 };

  it("l'orientation d'arrivée du formulaire est persistée dans content.arrival", () => {
    const form = { kind: 'DIRECTION', targetSceneId: 'scene-b', title: 'Salon', arrival: { yaw: 90, pitch: 5, hfov: 100 } };
    const res = buildHotspotPayload('DIRECTION', form, pos);
    expect(res.ok).toBe(true);
    const arrival = (res.payload!.content as Record<string, any>).arrival;
    expect(arrival.yaw).toBeCloseTo(90, 3);
    expect(arrival.pitch).toBeCloseTo(5, 3);
    expect(arrival.hfov).toBeCloseTo(100, 3);
  });

  it('après retrait de pairMode (comme le fait l’éditeur), content ne contient pas pairMode', () => {
    const form: Record<string, unknown> = { kind: 'DIRECTION', targetSceneId: 'scene-b', title: 'X', pairMode: 'simple' };
    delete form.pairMode; // l'éditeur nettoie ce réglage d'UI avant l'envoi
    const res = buildHotspotPayload('DIRECTION', form, pos);
    expect(res.ok).toBe(true);
    expect((res.payload!.content as Record<string, unknown>).pairMode).toBeUndefined();
  });

  it('la cible (targetSceneId) est séparée du content (colonne dédiée)', () => {
    const res = buildHotspotPayload('DIRECTION', { kind: 'DIRECTION', targetSceneId: 'scene-b' }, pos);
    expect(res.ok).toBe(true);
    expect(res.payload!.targetSceneId).toBe('scene-b');
    expect((res.payload!.content as Record<string, unknown>).targetSceneId).toBeUndefined();
  });
});
