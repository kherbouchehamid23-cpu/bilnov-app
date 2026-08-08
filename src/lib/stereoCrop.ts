'use client';

// Moteur de séparation des vues STÉRÉOSCOPIQUES (écran plat).
// Une image stéréo 360° contient DEUX panoramas équirectangulaires (un par œil), disposés :
//   TB (top/bottom)      — œil gauche EN HAUT,  œil droit EN BAS
//   BT (bottom/top)      — œil gauche EN BAS,   œil droit EN HAUT   (relief inversé de TB)
//   LR (left/right)      — œil gauche À GAUCHE, œil droit À DROITE
//   RL (right/left)      — œil gauche À DROITE, œil droit À GAUCHE  (relief inversé de LR)
// Sur un écran non-VR on ne peut PAS rendre le relief : on affiche UN SEUL œil, recadré et
// présenté comme un panorama équirectangulaire normal (jamais les deux moitiés ensemble).
// Le vrai relief (une texture par œil) est produit par le moteur three.js/WebXR (VR/casque).
//
// Le recadrage se fait via <canvas> → aucune dépendance, compatible partout. R2 sert le CORS
// (Access-Control-Allow-Origin: *) donc le canvas n'est pas « teinté » (crossOrigin=anonymous).

export type StereoLayout = 'MONO' | 'TB' | 'BT' | 'LR' | 'RL';
export type Eye = 'left' | 'right';

// Ancien type conservé pour compatibilité des appelants existants.
export type Projection = 'mono' | 'ou' | 'sbs';

// Normalise les métadonnées de scène (panoramaType + stereoLayout) → disposition stéréo.
// Accepte les libellés courts (TB/BT/LR/RL, SBS, OU) et longs (TOP_BOTTOM, LEFT_RIGHT…).
export function layoutFromScene(panoramaType?: string | null, stereoLayout?: string | null): StereoLayout {
  if ((panoramaType || '').toUpperCase() !== 'STEREO') return 'MONO';
  const l = (stereoLayout || 'TB').toUpperCase();
  if (l === 'BT' || l === 'BOTTOM_TOP') return 'BT';
  if (l === 'LR' || l === 'SBS' || l === 'LEFT_RIGHT') return 'LR';
  if (l === 'RL' || l === 'RIGHT_LEFT') return 'RL';
  return 'TB'; // TB / OU / TOP_BOTTOM / défaut
}

// Détection robuste par ratio d'image (corrige des métadonnées erronées / distorsion) :
// équirectangulaire mono ≈ 2:1 ; stéréo empilé (TB/BT) ≈ 1:1 ; stéréo côte-à-côte (LR/RL) ≈ 4:1.
export function detectLayoutFromRatio(width: number, height: number, metaLayout?: StereoLayout): StereoLayout {
  if (!width || !height) return metaLayout ?? 'MONO';
  const r = width / height;
  if (r >= 3) return metaLayout === 'RL' ? 'RL' : 'LR';
  if (r <= 1.4) return metaLayout === 'BT' ? 'BT' : 'TB';
  return 'MONO';
}

// Rectangle (en pixels) de la moitié du fichier source appartenant à un œil donné.
// Renvoie null pour MONO (l'image entière est utilisée telle quelle).
export function eyeRect(layout: StereoLayout, eye: Eye, w: number, h: number): { x: number; y: number; cw: number; ch: number } | null {
  if (layout === 'MONO') return null;
  const halfW = Math.floor(w / 2), halfH = Math.floor(h / 2);
  switch (layout) {
    case 'TB': return eye === 'left' ? { x: 0, y: 0, cw: w, ch: halfH } : { x: 0, y: halfH, cw: w, ch: halfH };
    case 'BT': return eye === 'left' ? { x: 0, y: halfH, cw: w, ch: halfH } : { x: 0, y: 0, cw: w, ch: halfH };
    case 'LR': return eye === 'left' ? { x: 0, y: 0, cw: halfW, ch: h } : { x: halfW, y: 0, cw: halfW, ch: h };
    case 'RL': return eye === 'left' ? { x: halfW, y: 0, cw: halfW, ch: h } : { x: 0, y: 0, cw: halfW, ch: h };
    default: return null;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('stereo-crop:image-load-failed'));
    img.src = src;
  });
}

// Recadre l'œil demandé et renvoie une blob: URL équirectangulaire plein-cadre.
// MONO → renvoie l'URL d'origine (aucun coût, zéro régression). L'appelant doit révoquer les
// blob: URLs (revokeCroppedUrl) après usage.
export async function oneEyeUrl(srcUrl: string, layout: StereoLayout, eye: Eye = 'left'): Promise<string> {
  if (layout === 'MONO') return srcUrl;
  const img = await loadImage(srcUrl);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return srcUrl;
  const r = eyeRect(layout, eye, w, h);
  if (!r) return srcUrl;
  const canvas = document.createElement('canvas');
  canvas.width = r.cw; canvas.height = r.ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) return srcUrl;
  ctx.drawImage(img, r.x, r.y, r.cw, r.ch, 0, 0, r.cw, r.ch);
  return await new Promise<string>((resolve) => {
    canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : srcUrl), 'image/jpeg', 0.92);
  });
}

export function revokeCroppedUrl(url: string | undefined | null): void {
  if (url && url.startsWith('blob:')) {
    try { URL.revokeObjectURL(url); } catch { /* noop */ }
  }
}

// ---- Compatibilité rétro (appelants existants) --------------------------------------------
// projectionFromScene / oneEyePanoramaUrl restent disponibles ; ils s'appuient sur le nouveau
// modèle (œil GAUCHE par défaut). 'ou' == TB, 'sbs' == LR.
export function projectionFromScene(panoramaType?: string | null, stereoLayout?: string | null): Projection {
  const lay = layoutFromScene(panoramaType, stereoLayout);
  if (lay === 'MONO') return 'mono';
  return lay === 'LR' || lay === 'RL' ? 'sbs' : 'ou';
}

export async function oneEyePanoramaUrl(srcUrl: string, proj: Projection): Promise<string> {
  const layout: StereoLayout = proj === 'mono' ? 'MONO' : proj === 'sbs' ? 'LR' : 'TB';
  return oneEyeUrl(srcUrl, layout, 'left');
}
