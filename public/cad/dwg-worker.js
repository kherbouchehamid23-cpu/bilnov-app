// Web Worker : conversion DWG -> DXF hors du thread principal (évite le gel UI
// sur gros fichiers). Charge LibreDWG (WASM) depuis /cad/.
// Message entrant : { buffer: ArrayBuffer, isDwg: boolean }
// Message sortant  : { ok: true, dxf: string } | { ok: false, error: string }

let libPromise = null;

async function getLib() {
  if (!libPromise) {
    libPromise = (async () => {
      const mod = await import('/cad/libredwg-web.js');
      return await mod.LibreDwg.create('/cad/');
    })();
  }
  return libPromise;
}

self.onmessage = async (e) => {
  const { id, buffer, isDwg } = e.data;
  try {
    if (!isDwg) {
      // DXF déjà : renvoyer tel quel (décodé)
      const dxf = new TextDecoder('utf-8').decode(new Uint8Array(buffer));
      self.postMessage({ id, ok: true, dxf });
      return;
    }
    const lib = await getLib();
    const bytes = lib.dwg_write_dxf(buffer);
    if (!bytes) {
      self.postMessage({ id, ok: false, error: 'Conversion DWG impossible (fichier corrompu ou version non supportee).' });
      return;
    }
    const dxf = new TextDecoder('utf-8').decode(bytes);
    self.postMessage({ id, ok: true, dxf });
  } catch (err) {
    self.postMessage({ id, ok: false, error: (err && err.message) ? String(err.message) : 'Erreur de conversion' });
  }
};
