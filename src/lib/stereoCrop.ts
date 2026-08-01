'use client';

// Affichage des panoramas STÉRÉOSCOPIQUES sur écran plat (téléphone, tablette, desktop) :
// une image stéréo contient deux vues (un œil au-dessus de l'autre = over/under « ou », ou
// côte à côte = side-by-side « sbs »). Sur un écran non-VR on ne peut pas rendre la 3D : on
// affiche donc UN SEUL œil, recadré et présenté comme un panorama équirectangulaire normal.
// Le recadrage se fait via <canvas> → compatible partout (aucune dépendance, aucun WebXR requis).
// Pour le vrai relief (deux yeux), le mode VR/casque du viewer PSV prend le relais.

export type Projection = 'mono' | 'ou' | 'sbs';

// Déduit la projection depuis les métadonnées de la scène (panoramaType / stereoLayout).
export function projectionFromScene(
  panoramaType?: string | null,
  stereoLayout?: string | null,
): Projection {
  const pt = (panoramaType || '').toUpperCase();
  if (pt === 'STEREO') {
    const lay = (stereoLayout || 'TB').toUpperCase();
    return lay === 'SBS' || lay === 'LR' ? 'sbs' : 'ou';
  }
  return 'mono';
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // R2 sert le CORS (Access-Control-Allow-Origin: *) → canvas non teinté
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('stereo-crop:image-load-failed'));
    img.src = src;
  });
}

// Renvoie une URL affichable par le viewer :
//  - mono  → l'URL d'origine, inchangée (aucun coût, zéro régression sur le mono) ;
//  - ou    → moitié HAUTE recadrée (un œil), en blob: URL ;
//  - sbs   → moitié GAUCHE recadrée (un œil), en blob: URL.
// L'appelant doit révoquer les blob: URLs créées (revokeCroppedUrl) après usage.
export async function oneEyePanoramaUrl(srcUrl: string, proj: Projection): Promise<string> {
  if (proj === 'mono') return srcUrl;
  const img = await loadImage(srcUrl);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return srcUrl;
  const cw = proj === 'sbs' ? Math.floor(w / 2) : w;
  const ch = proj === 'ou' ? Math.floor(h / 2) : h;
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) return srcUrl;
  // Région (0,0,cw,ch) = œil supérieur (ou) / gauche (sbs) → mappée en équirectangulaire plein.
  ctx.drawImage(img, 0, 0, cw, ch, 0, 0, cw, ch);
  return await new Promise<string>((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob ? URL.createObjectURL(blob) : srcUrl),
      'image/jpeg',
      0.92,
    );
  });
}

export function revokeCroppedUrl(url: string | undefined | null): void {
  if (url && url.startsWith('blob:')) {
    try { URL.revokeObjectURL(url); } catch { /* noop */ }
  }
}
