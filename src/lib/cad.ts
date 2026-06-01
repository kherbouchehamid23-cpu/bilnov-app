'use client';

// Helpers cote client pour la lecture de fichiers AutoCAD (DWG / DXF).
//
// Strategie :
//  - DXF  -> charge directement par dxf-viewer (Three.js).
//  - DWG  -> converti en DXF dans le navigateur via LibreDWG (WebAssembly),
//            puis affiche par le meme dxf-viewer.
//
// Le moteur WASM de LibreDWG (~6 Mo) est servi statiquement depuis /cad/ et
// charge a la demande (uniquement a l'ouverture d'un plan), pas au boot.

interface LibreDwgLike {
  dwg_write_dxf: (content: ArrayBuffer) => Uint8Array | null;
}

let _librePromise: Promise<LibreDwgLike> | null = null;

async function getLibreDwg(): Promise<LibreDwgLike> {
  if (!_librePromise) {
    _librePromise = (async () => {
      // Chargement HORS bundler Webpack : le module embarque un gros WASM inline
      // (~8 Mo) qui casserait le build s'il etait bundle. On l'importe au
      // runtime depuis /cad/ (servi statiquement). L'URL passe par une variable
      // pour que TypeScript/Webpack ne tentent pas de resoudre le module.
      const moduleUrl = '/cad/libredwg-web.js';
      const dynamicImport = new Function('u', 'return import(u)') as (
        u: string,
      ) => Promise<{ LibreDwg: { create: (dir: string) => Promise<unknown> } }>;
      const mod = await dynamicImport(moduleUrl);
      const lib = await mod.LibreDwg.create('/cad/');
      return lib as LibreDwgLike;
    })();
  }
  return _librePromise;
}

/**
 * Convertit un buffer DWG en texte DXF (cote navigateur).
 */
export async function dwgToDxf(dwgBuffer: ArrayBuffer): Promise<string> {
  const lib = await getLibreDwg();
  const dxfBytes = lib.dwg_write_dxf(dwgBuffer);
  if (!dxfBytes) {
    throw new Error(
      'Conversion DWG impossible — fichier corrompu ou version non supportee.',
    );
  }
  return new TextDecoder('utf-8').decode(dxfBytes);
}

/**
 * Prend un Blob CAO (DWG ou DXF) et renvoie une URL blob: vers du DXF
 * affichable par dxf-viewer. L'appelant doit revoquer l'URL ensuite.
 */
export async function toDxfObjectUrl(
  blob: Blob,
  fileName: string,
): Promise<string> {
  const isDwg = /\.dwg$/i.test(fileName);
  if (!isDwg) {
    return URL.createObjectURL(blob);
  }
  const buf = await blob.arrayBuffer();
  const dxf = await dwgToDxf(buf);
  const dxfBlob = new Blob([dxf], { type: 'application/dxf' });
  return URL.createObjectURL(dxfBlob);
}

export function isCadFile(name: string, fileType?: string): boolean {
  if (fileType === 'DWG' || fileType === 'DXF') return true;
  return /\.(dwg|dxf)$/i.test(name);
}
