import sharp from 'sharp';
import { putObjectAtKey } from './storage';

// Vague 2 — génération des dérivés d'un panorama équirectangulaire :
//  - miniature 640×320 (liste des scènes) ;
//  - aperçu léger (panorama réellement servi au viewer, à la place de l'original 12–30 Mo).
// Les clés sont STABLES et versionnées → Cache-Control immuable.
const IMMUTABLE = 'public, max-age=31536000, immutable';

export function thumbnailKeyFor(projectId: string, sceneId: string): string {
  return `projects/${projectId}/panoramas/${sceneId}/thumbnail/640.webp`;
}
export function previewKeyFor(projectId: string, sceneId: string): string {
  return `projects/${projectId}/panoramas/${sceneId}/preview/4096.webp`;
}

export interface DerivativeResult { thumbnailKey: string; previewKey: string }

export async function generateSceneDerivatives(
  source: Buffer,
  projectId: string,
  sceneId: string,
): Promise<DerivativeResult> {
  const thumbnailKey = thumbnailKeyFor(projectId, sceneId);
  const previewKey = previewKeyFor(projectId, sceneId);

  // .rotate() sans argument applique l'orientation EXIF puis la supprime des métadonnées.
  // Miniature : recadrage 2:1 accepté (usage vignette).
  const thumb = await sharp(source, { failOn: 'none', limitInputPixels: false })
    .rotate()
    .resize(640, 320, { fit: 'cover' })
    .webp({ quality: 72 })
    .toBuffer();

  // Aperçu : on PRÉSERVE le ratio (pas de recadrage/distorsion — c'est le panorama servi),
  // largeur plafonnée à 4096 px, sans agrandissement.
  const preview = await sharp(source, { failOn: 'none', limitInputPixels: false })
    .rotate()
    .resize({ width: 4096, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();

  await putObjectAtKey(thumbnailKey, thumb, 'image/webp', IMMUTABLE);
  await putObjectAtKey(previewKey, preview, 'image/webp', IMMUTABLE);
  return { thumbnailKey, previewKey };
}
