import { describe, it, expect } from 'vitest';
import {
  TOUR_ICONS, TOUR_ICONS_BY_ID, iconsForFamily, defaultIconFor,
  iconSvg, familiesForKind,
} from '../tourIcons';

describe('bibliothèque d\'icônes (§10)', () => {
  it('expose des icônes uniques avec un corps SVG non vide', () => {
    expect(TOUR_ICONS.length).toBeGreaterThanOrEqual(20);
    const ids = new Set(TOUR_ICONS.map((i) => i.id));
    expect(ids.size).toBe(TOUR_ICONS.length); // pas de doublon d'id
    for (const ic of TOUR_ICONS) {
      expect(ic.body.length).toBeGreaterThan(0);
      expect(['direction', 'contenu']).toContain(ic.family);
      expect(TOUR_ICONS_BY_ID[ic.id]).toBe(ic);
    }
  });

  it('filtre par famille', () => {
    const dir = iconsForFamily('direction');
    const cont = iconsForFamily('contenu');
    expect(dir.length).toBeGreaterThan(0);
    expect(cont.length).toBeGreaterThan(0);
    expect(dir.every((i) => i.family === 'direction')).toBe(true);
    expect(dir.length + cont.length).toBe(TOUR_ICONS.length);
  });

  it('donne une icône par défaut cohérente selon le type de hotspot', () => {
    expect(defaultIconFor('DIRECTION')).toBe('arrow-forward');
    expect(defaultIconFor('PDF')).toBe('pdf');
    expect(defaultIconFor('AUDIO')).toBe('audio');
    expect(defaultIconFor('COMMENT')).toBe('comment');
    // type inconnu -> fallback défini
    expect(TOUR_ICONS_BY_ID[defaultIconFor('???')]).toBeTruthy();
  });

  it('familiesForKind priorise la bonne famille', () => {
    expect(familiesForKind('DIRECTION')[0]).toBe('direction');
    expect(familiesForKind('IMAGE')[0]).toBe('contenu');
    expect(familiesForKind('DIRECTION')).toContain('contenu');
  });

  it('iconSvg produit un SVG valide avec couleur/taille/opacité', () => {
    const svg = iconSvg('arrow-forward', { color: '#ff0000', size: 40, opacity: 0.5 });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('width="40"');
    expect(svg).toContain('height="40"');
    expect(svg).toContain('stroke="#ff0000"');
    expect(svg).toContain('opacity:0.5');
    expect(svg.trim().endsWith('</svg>')).toBe(true);
  });

  it('iconSvg borne l\'opacité et retombe sur info pour un id inconnu', () => {
    expect(iconSvg('does-not-exist')).toContain(TOUR_ICONS_BY_ID['info'].body);
    expect(iconSvg('info', { opacity: 5 })).toContain('opacity:1');
    expect(iconSvg('info', { opacity: -2 })).toContain('opacity:0');
    // taille invalide -> défaut 24
    expect(iconSvg('info', { size: 0 })).toContain('width="24"');
  });
});
