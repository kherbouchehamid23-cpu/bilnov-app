// src/lib/__tests__/tourHotspots.test.ts
import { describe, it, expect } from 'vitest';
import {
  HOTSPOT_TYPES, HOTSPOT_KINDS, isHotspotKind, dbTypeForKind, kindFromContent,
  sanitizeText, isValidUrl, clampHfov, normalizeArrival, validateHotspot, buildContent,
  fieldsFor, buildHotspotPayload,
} from '../tourHotspots';

describe('registre des types', () => {
  it('contient les 12 types', () => {
    expect(HOTSPOT_KINDS).toHaveLength(12);
    expect(isHotspotKind('DIRECTION')).toBe(true);
    expect(isHotspotKind('NOPE')).toBe(false);
  });
  it('mappe chaque kind vers un type DB valide', () => {
    for (const k of HOTSPOT_KINDS) {
      expect(['LINK', 'TEXT', 'IMAGE', 'VIDEO']).toContain(dbTypeForKind(k));
      expect(HOTSPOT_TYPES[k].label.length).toBeGreaterThan(0);
    }
  });
});

describe('rétro-compatibilité kindFromContent', () => {
  it('lit content.kind en priorité', () => {
    expect(kindFromContent('TEXT', { kind: 'PDF' })).toBe('PDF');
  });
  it('déduit des anciens types DB sans kind', () => {
    expect(kindFromContent('LINK', {})).toBe('DIRECTION');
    expect(kindFromContent('TEXT', {})).toBe('DESCRIPTION');
    expect(kindFromContent('IMAGE', {})).toBe('IMAGE');
    expect(kindFromContent('VIDEO', {})).toBe('VIDEO');
  });
});

describe('sécurité', () => {
  it('échappe le HTML (anti-XSS)', () => {
    expect(sanitizeText('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(sanitizeText(`a"b'c&d`)).toBe('a&quot;b&#39;c&amp;d');
  });
  it('rejette les URLs dangereuses', () => {
    expect(isValidUrl('javascript:alert(1)')).toBe(false);
    expect(isValidUrl('data:text/html,x')).toBe(false);
    expect(isValidUrl('https://ex.com/a.pdf')).toBe(true);
    expect(isValidUrl('/uploads/a.pdf', { allowRelative: true })).toBe(true);
    expect(isValidUrl('/uploads/a.pdf')).toBe(false);
    expect(isValidUrl('')).toBe(false);
  });
});

describe('orientation arrivée', () => {
  it('borne hfov et pitch, enroule yaw', () => {
    expect(clampHfov(500)).toBe(120);
    expect(clampHfov(5)).toBe(30);
    const a = normalizeArrival({ arrival: { yaw: 400, pitch: 200, hfov: 999 } });
    expect(a).not.toBeNull();
    expect(a!.yaw).toBe(40);
    expect(a!.pitch).toBe(85);
    expect(a!.hfov).toBe(120);
  });
  it('renvoie null sans données', () => {
    expect(normalizeArrival({})).toBeNull();
    expect(normalizeArrival(null)).toBeNull();
  });
});

describe('validation', () => {
  it('Direction exige une cible', () => {
    expect(validateHotspot('DIRECTION', {}).ok).toBe(false);
    expect(validateHotspot('DIRECTION', { targetSceneId: 's1' }).ok).toBe(true);
  });
  it('Description exige un texte', () => {
    expect(validateHotspot('DESCRIPTION', { text: '' }).ok).toBe(false);
    expect(validateHotspot('DESCRIPTION', { text: 'ok' }).ok).toBe(true);
  });
  it('PDF/URL exigent une URL valide', () => {
    expect(validateHotspot('PDF', { url: 'javascript:x' }).ok).toBe(false);
    expect(validateHotspot('PDF', { url: 'https://x/a.pdf' }).ok).toBe(true);
  });
  it('Galerie exige au moins une image', () => {
    expect(validateHotspot('GALLERY', { images: [] }).ok).toBe(false);
    expect(validateHotspot('GALLERY', { images: ['/a.jpg'] }).ok).toBe(true);
  });
});

describe('buildContent', () => {
  it('injecte kind et borne les longueurs (texte brut, échappé au rendu)', () => {
    const c = buildContent('DESCRIPTION', { title: '  Titre  ', text: 'a<b' });
    expect(c.kind).toBe('DESCRIPTION');
    expect(c.title).toBe('Titre');
    expect(c.text).toBe('a<b');
    const long = buildContent('DESCRIPTION', { text: 'x'.repeat(6000) });
    expect((long.text as string).length).toBe(5000);
  });
});

describe('fieldsFor', () => {
  it('renvoie des champs connus pour chaque type', () => {
    for (const k of HOTSPOT_KINDS) {
      const f = fieldsFor(k);
      expect(Array.isArray(f)).toBe(true);
      f.forEach((fd) => expect(fd.label.length).toBeGreaterThan(0));
    }
    expect(fieldsFor('DIRECTION').some((f) => f.name === 'targetSceneId')).toBe(true);
    expect(fieldsFor('COMMENT').some((f) => f.control === 'select')).toBe(true);
  });
});

describe('buildHotspotPayload (non-régression du POST)', () => {
  const draft = { yaw: 12.5, pitch: -3 };
  it('refuse une position manquante', () => {
    const r = buildHotspotPayload('DESCRIPTION', { text: 'ok' }, null);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('Position');
  });
  it('Direction : cible -> colonne, type LINK', () => {
    const r = buildHotspotPayload('DIRECTION', { targetSceneId: 's2', title: 'Salon' }, draft);
    expect(r.ok).toBe(true);
    expect(r.payload!.type).toBe('LINK');
    expect(r.payload!.targetSceneId).toBe('s2');
    expect(r.payload!.content.kind).toBe('DIRECTION');
    expect(r.payload!.positionYaw).toBe(12.5);
  });
  it('Info non-direction : targetSceneId null', () => {
    const r = buildHotspotPayload('DESCRIPTION', { text: 'Bonjour', title: 'T' }, draft);
    expect(r.ok).toBe(true);
    expect(r.payload!.type).toBe('TEXT');
    expect(r.payload!.targetSceneId).toBeNull();
    expect(r.payload!.content.text).toBe('Bonjour');
  });
  it('PDF avec javascript: est rejeté', () => {
    const r = buildHotspotPayload('PDF', { url: 'javascript:alert(1)' }, draft);
    expect(r.ok).toBe(false);
  });
  it('intègre une orientation d arrivée bornée', () => {
    const r = buildHotspotPayload('DIRECTION', { targetSceneId: 's2', arrival: { yaw: 370, pitch: 0, hfov: 90 } }, draft);
    expect(r.ok).toBe(true);
    const arr = r.payload!.content.arrival as { yaw: number };
    expect(arr.yaw).toBe(10);
  });
});
