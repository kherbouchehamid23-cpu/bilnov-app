import { describe, it, expect } from 'vitest';
import {
  UNIT_MM, INSUNITS_TO_UNIT, unitFromInsUnits, canConvert, lengthFactor,
  distance, polygonArea, polygonPerimeter, centroid, nearestVertexIndex, formatMeasure, measurementValues,
} from '../cadMeasure';

describe('unités & conversion', () => {
  it('mappe $INSUNITS vers les unités attendues', () => {
    expect(unitFromInsUnits(4)).toBe('mm');
    expect(unitFromInsUnits(5)).toBe('cm');
    expect(unitFromInsUnits(6)).toBe('m');
    expect(unitFromInsUnits(1)).toBe('in');
    expect(unitFromInsUnits(2)).toBe('ft');
  });
  it("renvoie 'u' pour un code inconnu (0, 3, 99)", () => {
    expect(unitFromInsUnits(0)).toBe('u');
    expect(unitFromInsUnits(3)).toBe('u');
    expect(unitFromInsUnits(99)).toBe('u');
  });
  it('table de conversion en mm cohérente', () => {
    expect(UNIT_MM).toMatchObject({ mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 });
    expect(INSUNITS_TO_UNIT[4]).toBe('mm');
  });
  it('canConvert exige deux unités connues (≠ u)', () => {
    expect(canConvert('cm', 'm')).toBe(true);
    expect(canConvert('u', 'm')).toBe(false);
    expect(canConvert('cm', 'u')).toBe(false);
    expect(canConvert('cm', 'yd')).toBe(false);
  });
  it('lengthFactor : cm→m = 0.01, m→cm = 100, mm→mm = 1', () => {
    expect(lengthFactor('cm', 'm')).toBeCloseTo(0.01, 12);
    expect(lengthFactor('m', 'cm')).toBeCloseTo(100, 12);
    expect(lengthFactor('mm', 'mm')).toBe(1);
  });
  it('lengthFactor = 1 (neutre) si conversion impossible', () => {
    expect(lengthFactor('u', 'm')).toBe(1);
    expect(lengthFactor('cm', 'u')).toBe(1);
  });
});

describe('distance', () => {
  it('triangle 3-4-5', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
  it('distance nulle pour un point identique', () => {
    expect(distance({ x: 2, y: 2 }, { x: 2, y: 2 })).toBe(0);
  });
  it('symétrique', () => {
    const a = { x: -1, y: 7 }, b = { x: 5, y: -2 };
    expect(distance(a, b)).toBeCloseTo(distance(b, a), 12);
  });
});

describe('polygonArea (shoelace)', () => {
  it('carré 10×10 = 100', () => {
    expect(polygonArea([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }])).toBe(100);
  });
  it('triangle base 4 hauteur 3 = 6', () => {
    expect(polygonArea([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 3 }])).toBe(6);
  });
  it('positif quel que soit le sens (horaire vs anti-horaire)', () => {
    const cw = [{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 0 }];
    expect(polygonArea(cw)).toBe(100);
  });
  it('0 pour moins de 3 points', () => {
    expect(polygonArea([])).toBe(0);
    expect(polygonArea([{ x: 0, y: 0 }])).toBe(0);
    expect(polygonArea([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(0);
  });
});

describe('polygonPerimeter', () => {
  const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  it('ouvert = somme des segments sans fermeture (30)', () => {
    expect(polygonPerimeter(square, false)).toBe(30);
  });
  it('fermé = tour complet (40)', () => {
    expect(polygonPerimeter(square, true)).toBe(40);
  });
  it('0 pour moins de 2 points', () => {
    expect(polygonPerimeter([{ x: 0, y: 0 }], true)).toBe(0);
  });
});

describe('centroid', () => {
  it('centre du carré', () => {
    expect(centroid([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }])).toEqual({ x: 5, y: 5 });
  });
  it('null si vide', () => {
    expect(centroid([])).toBeNull();
  });
});

describe('nearestVertexIndex (édition des points)', () => {
  const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
  it('trouve le sommet sous tolérance', () => {
    expect(nearestVertexIndex(pts, { x: 98, y: 3 }, 10)).toBe(1);
  });
  it('renvoie -1 si rien sous la tolérance', () => {
    expect(nearestVertexIndex(pts, { x: 50, y: 50 }, 5)).toBe(-1);
  });
  it('choisit le plus proche en cas d’ambiguïté', () => {
    expect(nearestVertexIndex([{ x: 0, y: 0 }, { x: 4, y: 0 }], { x: 1, y: 0 }, 10)).toBe(0);
  });
  it('liste vide → -1', () => {
    expect(nearestVertexIndex([], { x: 0, y: 0 }, 10)).toBe(-1);
  });
});

describe('formatMeasure', () => {
  it('2 décimales max', () => {
    expect(formatMeasure(3.14159, 'en-US')).toBe('3.14');
    expect(formatMeasure(1000, 'en-US')).toBe('1,000');
    expect(formatMeasure(5, 'en-US')).toBe('5');
  });
});

describe('measurementValues (édition)', () => {
  it('DISTANCE : distance seule', () => {
    expect(measurementValues('DISTANCE', [{ x: 0, y: 0 }, { x: 3, y: 4 }])).toEqual({ distance: 5, area: null, perimeter: null });
  });
  it('DISTANCE incomplète → null', () => {
    expect(measurementValues('DISTANCE', [{ x: 0, y: 0 }])).toEqual({ distance: null, area: null, perimeter: null });
  });
  it('AREA : aire + périmètre fermé', () => {
    const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(measurementValues('AREA', sq)).toEqual({ distance: null, area: 100, perimeter: 40 });
  });
  it('AREA < 3 points → aire null', () => {
    expect(measurementValues('AREA', [{ x: 0, y: 0 }, { x: 1, y: 1 }])).toMatchObject({ area: null });
  });
});
