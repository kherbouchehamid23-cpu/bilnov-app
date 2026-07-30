// src/lib/cadCursor.ts
// Viewer DWG mobile — décalage du curseur au-dessus du doigt (correction n°1).
// Fonction PURE : renvoie le décalage vertical (px CSS) pour que le réticule reste
// visible ≈1 cm au-dessus du point de contact, en tenant compte du devicePixelRatio.
// Le résultat est borné pour rester raisonnable sur tous les écrans.

const CSS_PX_PER_CM = 96 / 2.54; // ≈ 37.8 px CSS par cm (nominal navigateur)
const MIN_PX = 24;
const MAX_PX = 80;

/** Facteur de décalage selon le devicePixelRatio (dpr 1→1.0, 2→1.5, 3→1.75 borné). */
export function offsetFactor(dpr: number): number {
  const d = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  return Math.min(Math.max(d / 2 + 0.5, 0.75), 1.75);
}

/** Décalage vertical (px CSS) du curseur au-dessus du doigt. `cm` par défaut 1. */
export function cursorOffsetPx(dpr: number, cm = 1): number {
  const c = Number.isFinite(cm) && cm > 0 ? cm : 1;
  const raw = c * CSS_PX_PER_CM * offsetFactor(dpr);
  return Math.round(Math.min(Math.max(raw, MIN_PX), MAX_PX));
}
