'use client';

// Conversion DWG/DXF côté client via un Web Worker (public/cad/dwg-worker.js) :
// conversion LibreDWG hors thread + extraction des repères d'accrochage et de
// l'unité native du dessin.

export interface CadLoadResult {
  url: string;              // URL blob: du DXF (à révoquer après usage)
  snapPoints: Float32Array; // [x0,y0,x1,y1,...] repères d'accrochage (coords dessin)
  insUnits: number;         // $INSUNITS : 0=inconnu, 4=mm, 5=cm, 6=m, 1=in, 2=ft...
}

let _worker: Worker | null = null;
let _seq = 0;
const _pending = new Map<
  number,
  { resolve: (r: { dxf: string; snap: Float32Array; insunits: number }) => void; reject: (e: Error) => void }
>();

function getWorker(): Worker {
  if (!_worker) {
    _worker = new Worker('/cad/dwg-worker.js', { type: 'module' });
    _worker.onmessage = (e: MessageEvent) => {
      const { id, ok, dxf, snap, insunits, error } = e.data as {
        id: number; ok: boolean; dxf?: string; snap?: ArrayBuffer; insunits?: number; error?: string;
      };
      const p = _pending.get(id);
      if (!p) return;
      _pending.delete(id);
      if (ok && typeof dxf === 'string') {
        p.resolve({ dxf, snap: snap ? new Float32Array(snap) : new Float32Array(0), insunits: insunits ?? 0 });
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
): Promise<{ dxf: string; snap: Float32Array; insunits: number }> {
  const w = getWorker();
  const id = ++_seq;
  return new Promise((resolve, reject) => {
    _pending.set(id, { resolve, reject });
    w.postMessage({ id, buffer, isDwg }, [buffer]);
  });
}

/**
 * Prend un Blob CAO (DWG ou DXF) et renvoie une URL blob: vers du DXF
 * affichable par dxf-viewer, plus les repères d'accrochage et l'unité native.
 * L'appelant doit révoquer l'URL ensuite.
 */
export async function toDxfObjectUrl(
  blob: Blob,
  fileName: string,
): Promise<CadLoadResult> {
  const isDwg = /\.dwg$/i.test(fileName);
  const buf = await blob.arrayBuffer();
  const { dxf, snap, insunits } = await convertInWorker(buf, isDwg);
  const dxfBlob = new Blob([dxf], { type: 'application/dxf' });
  return { url: URL.createObjectURL(dxfBlob), snapPoints: snap, insUnits: insunits };
}

export function isCadFile(name: string, fileType?: string): boolean {
  if (fileType === 'DWG' || fileType === 'DXF') return true;
  return /\.(dwg|dxf)$/i.test(name);
}
