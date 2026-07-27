// Géométrie et conversion d'unités pour les outils de mesure / superficie du viewer DWG.
// Fonctions PURES (sans dépendance UI/prisma) → entièrement testables et réutilisables.
// Extrait de CadViewer.tsx sans changement de comportement (verrou anti-régression).

export type Pt = { x: number; y: number };

// Conversion d'unités (référence mm) et mapping $INSUNITS.
export const UNIT_MM: Record<string, number> = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 };
export const INSUNITS_TO_UNIT: Record<number, string> = { 1: 'in', 2: 'ft', 4: 'mm', 5: 'cm', 6: 'm' };

/** Unité native déduite du code $INSUNITS du dessin ('u' si inconnu). */
export function unitFromInsUnits(insUnits: number): string {
  return INSUNITS_TO_UNIT[insUnits] ?? 'u';
}

/** true si l'on peut convertir entre baseUnit et unit (toutes deux connues). */
export function canConvert(baseUnit: string, unit: string): boolean {
  return baseUnit !== 'u' && unit !== 'u' && baseUnit in UNIT_MM && unit in UNIT_MM;
}

/** Facteur d'échelle longueur base→affichage ; 1 si conversion impossible. */
export function lengthFactor(baseUnit: string, unit: string): number {
  return canConvert(baseUnit, unit) ? UNIT_MM[baseUnit] / UNIT_MM[unit] : 1;
}

/** Distance euclidienne entre deux points (coordonnées dessin). */
export function distance(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Aire d'un polygone (formule du lacet / shoelace), toujours positive. */
export function polygonArea(pts: Pt[]): number {
  if (pts.length < 3) return 0;
  const n = pts.length;
  return Math.abs(pts.reduce((acc, p, i) => {
    const q = pts[(i + 1) % n];
    return acc + (p.x * q.y - q.x * p.y);
  }, 0)) / 2;
}

/** Périmètre d'une polyligne ; closed=true ajoute le segment de fermeture. */
export function polygonPerimeter(pts: Pt[], closed: boolean): number {
  if (pts.length < 2) return 0;
  const n = pts.length;
  let s = 0;
  for (let i = 0; i < n - (closed ? 0 : 1); i++) {
    const q = pts[(i + 1) % n];
    s += Math.hypot(q.x - pts[i].x, q.y - pts[i].y);
  }
  return s;
}

/** Barycentre des sommets ; null si aucun point. */
export function centroid(pts: Pt[]): Pt | null {
  if (pts.length === 0) return null;
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  };
}

/**
 * Index du sommet le plus proche de `target` sous la tolérance `tol` (coords dessin),
 * pour l'édition d'un point déjà posé ; -1 si aucun sommet assez proche.
 */
export function nearestVertexIndex(pts: Pt[], target: Pt, tol: number): number {
  let best = -1;
  let bestD = tol * tol;
  for (let i = 0; i < pts.length; i++) {
    const dx = pts[i].x - target.x;
    const dy = pts[i].y - target.y;
    const d = dx * dx + dy * dy;
    if (d <= bestD) { bestD = d; best = i; }
  }
  return best;
}

/** Formatage FR d'une mesure (2 décimales max), identique à l'affichage du viewer. */
export function formatMeasure(n: number, locale = 'fr-FR'): string {
  return n.toLocaleString(locale, { maximumFractionDigits: 2 });
}

/** Recalcule les grandeurs d'une mesure à partir de ses points (édition serveur/ client). */
export function measurementValues(
  kind: 'DISTANCE' | 'AREA',
  points: Pt[],
): { distance: number | null; area: number | null; perimeter: number | null } {
  if (kind === 'DISTANCE') {
    return {
      distance: points.length === 2 ? distance(points[0], points[1]) : null,
      area: null,
      perimeter: null,
    };
  }
  return {
    distance: null,
    area: points.length >= 3 ? polygonArea(points) : null,
    perimeter: points.length >= 2 ? polygonPerimeter(points, true) : null,
  };
}
