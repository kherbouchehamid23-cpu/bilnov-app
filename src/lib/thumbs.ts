'use client';

// Génération de vignettes (aperçus) côté client, à la demande.
//  - PDF : 1re page rendue via pdf.js (chargé dynamiquement, hors bundle).
//  - DWG : aperçu bitmap intégré au fichier (dwg_bmp de LibreDWG) si présent.
// Résultats mis en cache pour la session (Map en mémoire).

const cache = new Map<string, string>(); // fileId -> dataURL

export function getCachedThumb(fileId: string): string | undefined {
  return cache.get(fileId);
}

// --- PDF : pdf.js chargé hors bundler (depuis /cad/, comme libredwg) ---
let _pdfjsPromise: Promise<{
  getDocument: (src: { data: ArrayBuffer }) => { promise: Promise<PdfDoc> };
  GlobalWorkerOptions: { workerSrc: string };
}> | null = null;

interface PdfDoc {
  getPage: (n: number) => Promise<PdfPage>;
}
interface PdfPage {
  getViewport: (o: { scale: number }) => { width: number; height: number };
  render: (o: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }) => { promise: Promise<void> };
}

async function getPdfjs() {
  if (!_pdfjsPromise) {
    _pdfjsPromise = (async () => {
      const url = '/cad/pdf.min.mjs';
      const dynamicImport = new Function('u', 'return import(u)') as (
        u: string,
      ) => Promise<{
        getDocument: (src: { data: ArrayBuffer }) => { promise: Promise<PdfDoc> };
        GlobalWorkerOptions: { workerSrc: string };
      }>;
      const pdfjs = await dynamicImport(url);
      pdfjs.GlobalWorkerOptions.workerSrc = '/cad/pdf.worker.min.mjs';
      return pdfjs;
    })();
  }
  return _pdfjsPromise;
}

async function pdfThumb(buf: ArrayBuffer, maxW = 320): Promise<string> {
  const pdfjs = await getPdfjs();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const page = await doc.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const scale = maxW / base.width;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas indisponible');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL('image/jpeg', 0.7);
}

// --- DWG : aperçu bitmap intégré ---
interface LibreDwgThumb {
  dwg_read_data: (c: ArrayBuffer, t: number) => number | undefined;
  dwg_bmp: (d: number) => { data?: Uint8Array; imageType?: number } | null;
  dwg_free: (d: number) => void;
}
let _libreThumb: Promise<LibreDwgThumb> | null = null;
async function getLibre(): Promise<LibreDwgThumb> {
  if (!_libreThumb) {
    _libreThumb = (async () => {
      const dynamicImport = new Function('u', 'return import(u)') as (
        u: string,
      ) => Promise<{ LibreDwg: { create: (d: string) => Promise<unknown> } }>;
      const mod = await dynamicImport('/cad/libredwg-web.js');
      return (await mod.LibreDwg.create('/cad/')) as unknown as LibreDwgThumb;
    })();
  }
  return _libreThumb;
}

async function dwgThumb(buf: ArrayBuffer): Promise<string | null> {
  const lib = await getLibre();
  const ptr = lib.dwg_read_data(buf, 0); // 0 = DWG
  if (!ptr) return null;
  try {
    const bmp = lib.dwg_bmp(ptr);
    if (!bmp || !bmp.data || bmp.data.length === 0) return null;
    // imageType 6 = PNG, sinon on tente BMP brut via blob
    const mime = bmp.imageType === 6 ? 'image/png' : 'image/bmp';
    const bytes = new Uint8Array(bmp.data); // copie -> ArrayBuffer propre
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: mime });
    return await blobToDataUrl(blob);
  } finally {
    lib.dwg_free(ptr);
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}

/**
 * Génère (et met en cache) une vignette pour un fichier PDF ou DWG.
 * `fetchBlob` télécharge le fichier (proxy authentifié). Renvoie une dataURL
 * ou null si pas d'aperçu possible (on retombe alors sur l'icône).
 */
export async function makeThumb(
  fileId: string,
  fileName: string,
  fetchBlob: () => Promise<Blob>,
): Promise<string | null> {
  const hit = cache.get(fileId);
  if (hit) return hit;
  try {
    const isPdf = /\.pdf$/i.test(fileName);
    const isDwg = /\.dwg$/i.test(fileName);
    if (!isPdf && !isDwg) return null;
    const buf = await (await fetchBlob()).arrayBuffer();
    const url = isPdf ? await pdfThumb(buf) : await dwgThumb(buf);
    if (url) cache.set(fileId, url);
    return url;
  } catch {
    return null;
  }
}
