'use client';

// Conversion DWG/DXF côté client.
//  - Un Web Worker (public/cad/dwg-worker.js) fait la conversion DWG->DXF
//    (LibreDWG WASM) HORS du thread UI : plus de gel sur gros fichiers.
//  - DXF : renvoyé tel quel.
//  - Le worker renvoie aussi les points d'accrochage (OSNAP) du dessin.

export interface CadLoadResult {
  url: string;            // URL blob: du DXF (à révoquer après usage)
  snapPoints: Float32Array; // [x0,y0,x1,y1,...] repères d'accrochage (coords dessin)
}

let _worker: Worker | null = null;
let _seq = 0;
const _pending = new Map<
  number,
  { resolve: (r: { dxf: string; snap: Float32Array }) => void; reject: (e: Error) => void }
>();

function getWorker(): Worker {
  if (!_worker) {
    _worker = new Worker('/cad/dwg-worker.js', { type: 'module' });
    _worker.onmessage = (e: MessageEvent) => {
      const { id, ok, dxf, snap, error } = e.data as {
        id: number; ok: boolean; dxf?: string; snap?: ArrayBuffer; error?: string;
      };
      const p = _pending.get(id);
      if (!p) return;
      _pending.delete(id);
      if (ok && typeof dxf === 'string') {
        p.resolve({ dxf, snap: snap ? new Float32Array(snap) : new Float32Array(0) });
      } else {
        p.reject(new Error(error ?? 'Erreur de conversion'));
      }
    };
    _worker.onerror = () => {
      for (const p of _pending.values()) p.reject(new Error('Worker de conversion indisponible'));
      _pending.clear();
    };
  }
  return _worker;
}

function convertInWorker(
  buffer: ArrayBuffer,
  isDwg: boolean,
): Promise<{ dxf: string; snap: Float32Array }> {
  const w = getWorker();
  const id = ++_seq;
  return new Promise((resolve, reject) => {
    _pending.set(id, { resolve, reject });
    // transfert du buffer (zéro-copie)
    w.postMessage({ id, buffer, isDwg }, [buffer]);
  });
}

/**
 * Prend un Blob CAO (DWG ou DXF) et renvoie une URL blob: vers du DXF
 * affichable par dxf-viewer, plus les points d'accrochage.
 * L'appelant doit révoquer l'URL ensuite.
 */
export async function toDxfObjectUrl(
  blob: Blob,
  fileName: string,
): Promise<CadLoadResult> {
  const isDwg = /\.dwg$/i.test(fileName);
  const buf = await blob.arrayBuffer();
  const { dxf, snap } = await convertInWorker(buf, isDwg);
  const dxfBlob = new Blob([dxf], { type: 'application/dxf' });
  return { url: URL.createObjectURL(dxfBlob), snapPoints: snap };
}

export function isCadFile(name: string, fileType?: string): boolean {
  if (fileType === 'DWG' || fileType === 'DXF') return true;
  return /\.(dwg|dxf)$/i.test(name);
}
