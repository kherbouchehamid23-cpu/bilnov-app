'use client';

// Conversion DWG/DXF côté client.
//  - Un Web Worker (public/cad/dwg-worker.js) fait la conversion DWG->DXF
//    (LibreDWG WASM) HORS du thread UI : plus de gel sur gros fichiers.
//  - DXF : renvoyé tel quel.

let _worker: Worker | null = null;
let _seq = 0;
const _pending = new Map<number, { resolve: (dxf: string) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!_worker) {
    _worker = new Worker('/cad/dwg-worker.js', { type: 'module' });
    _worker.onmessage = (e: MessageEvent) => {
      const { id, ok, dxf, error } = e.data as { id: number; ok: boolean; dxf?: string; error?: string };
      const p = _pending.get(id);
      if (!p) return;
      _pending.delete(id);
      if (ok && typeof dxf === 'string') p.resolve(dxf);
      else p.reject(new Error(error ?? 'Erreur de conversion'));
    };
    _worker.onerror = () => {
      for (const p of _pending.values()) p.reject(new Error('Worker de conversion indisponible'));
      _pending.clear();
    };
  }
  return _worker;
}

function convertInWorker(buffer: ArrayBuffer, isDwg: boolean): Promise<string> {
  const w = getWorker();
  const id = ++_seq;
  return new Promise<string>((resolve, reject) => {
    _pending.set(id, { resolve, reject });
    // transfert du buffer (zéro-copie)
    w.postMessage({ id, buffer, isDwg }, [buffer]);
  });
}

/**
 * Prend un Blob CAO (DWG ou DXF) et renvoie une URL blob: vers du DXF
 * affichable par dxf-viewer. L'appelant doit révoquer l'URL ensuite.
 */
export async function toDxfObjectUrl(
  blob: Blob,
  fileName: string,
): Promise<string> {
  const isDwg = /\.dwg$/i.test(fileName);
  const buf = await blob.arrayBuffer();
  const dxf = await convertInWorker(buf, isDwg);
  const dxfBlob = new Blob([dxf], { type: 'application/dxf' });
  return URL.createObjectURL(dxfBlob);
}

export function isCadFile(name: string, fileType?: string): boolean {
  if (fileType === 'DWG' || fileType === 'DXF') return true;
  return /\.(dwg|dxf)$/i.test(name);
}
