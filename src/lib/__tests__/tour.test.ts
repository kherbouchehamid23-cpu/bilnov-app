import { describe, it, expect } from 'vitest';
import { kindToType, typeToKind, isDirection, yawPitchToVector3, vector3ToYawPitch, yawPitchToUV, validateHotspotContent, hotspotLabel, deg2rad } from '../tour';

describe('mapping type hotspot', () => {
  it('kind <-> type', () => {
    expect(kindToType('DIRECTION')).toBe('LINK');
    expect(kindToType('INFO_TEXT')).toBe('TEXT');
    expect(typeToKind('LINK')).toBe('DIRECTION');
    expect(typeToKind('VIDEO')).toBe('INFO_VIDEO');
    expect(isDirection('LINK')).toBe(true);
    expect(isDirection('TEXT')).toBe(false);
  });
});

describe('géométrie sphère', () => {
  it('yaw=0,pitch=0 -> devant (-Z)', () => {
    const v = yawPitchToVector3(0, 0);
    expect(v.x).toBeCloseTo(0, 6); expect(v.y).toBeCloseTo(0, 6); expect(v.z).toBeCloseTo(-1, 6);
  });
  it('yaw=90° -> +X', () => {
    const v = yawPitchToVector3(deg2rad(90), 0);
    expect(v.x).toBeCloseTo(1, 6); expect(v.z).toBeCloseTo(0, 6);
  });
  it('pitch=90° -> +Y (haut)', () => {
    const v = yawPitchToVector3(0, deg2rad(90));
    expect(v.y).toBeCloseTo(1, 6);
  });
  it('aller-retour vector<->yawpitch', () => {
    const yp = { yaw: deg2rad(37), pitch: deg2rad(-12) };
    const v = yawPitchToVector3(yp.yaw, yp.pitch);
    const back = vector3ToYawPitch(v);
    expect(back.yaw).toBeCloseTo(yp.yaw, 5);
    expect(back.pitch).toBeCloseTo(yp.pitch, 5);
  });
  it('UV équirectangulaire', () => {
    expect(yawPitchToUV(0, 0)).toEqual({ u: 0.5, v: 0.5 });
    expect(yawPitchToUV(deg2rad(90), 0).u).toBeCloseTo(0.75, 6);
    expect(yawPitchToUV(0, deg2rad(90)).v).toBeCloseTo(0, 6);
  });
});

describe('contenu & libellés', () => {
  it('validation par type', () => {
    expect(validateHotspotContent('LINK', {})).toBe(true);
    expect(validateHotspotContent('TEXT', { text: 'Salle technique' })).toBe(true);
    expect(validateHotspotContent('TEXT', { text: '' })).toBe(false);
    expect(validateHotspotContent('IMAGE', { url: 'https://x/y.jpg' })).toBe(true);
    expect(validateHotspotContent('IMAGE', {})).toBe(false);
  });
  it('libellés', () => {
    expect(hotspotLabel('LINK', {}, 'Cuisine')).toBe('→ Cuisine');
    expect(hotspotLabel('TEXT', { title: 'Note' })).toBe('Note');
    expect(hotspotLabel('VIDEO', {})).toBe('Vidéo');
  });
});
