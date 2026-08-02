import { describe, it, expect } from 'vitest';
import { fieldsFor, arrivalTarget, normalizeArrival } from '../tourHotspots';

// §3 — l'aller-retour est désormais une OPTION du hotspot Direction (radio simple/aller-retour
// dans le panneau), plus un module séparé. Le champ legacy « returnLink » ne doit plus apparaître
// dans le formulaire Direction (il est remplacé par le choix simple/aller-retour + écran A/B).
describe('§3 — Direction : intégration aller-retour', () => {
  it('le formulaire Direction ne contient plus le champ returnLink', () => {
    const names = fieldsFor('DIRECTION').map((f) => f.name);
    expect(names).toContain('targetSceneId');
    expect(names).toContain('title');
    expect(names).not.toContain('returnLink');
  });

  it("l'orientation d'arrivée enregistrée par la paire est relue correctement (yaw/pitch/hfov)", () => {
    // Ce que savePair écrit dans content.arrival pour un sens donné.
    const contentAB = { kind: 'DIRECTION', arrival: { yaw: 181.5, pitch: -8.2, hfov: 100 } };
    const t = arrivalTarget(contentAB);
    expect(t.targetYaw).toBeCloseTo(181.5, 3);
    expect(t.targetPitch).toBeCloseTo(-8.2, 3);
    expect(t.targetHfov).toBeCloseTo(100, 3);
  });

  it('sans orientation enregistrée, le cap est conservé (sameAzimuth) — comportement inchangé', () => {
    const t = arrivalTarget({ kind: 'DIRECTION' });
    expect(t.targetYaw).toBe('sameAzimuth');
    expect(t.targetPitch).toBe(0);
  });

  it('normalizeArrival borne le pitch et enroule le yaw', () => {
    const a = normalizeArrival({ arrival: { yaw: 400, pitch: 200, hfov: 999 } });
    expect(a).not.toBeNull();
    expect(a!.yaw).toBeCloseTo(40, 3);   // 400 % 360
    expect(a!.pitch).toBe(85);           // borné à 85
    expect(a!.hfov).toBe(120);           // borné à 120
  });
});
