// Web Worker : conversion DWG -> DXF hors du thread principal (évite le gel UI
// sur gros fichiers). Charge LibreDWG (WASM) depuis /cad/.
// Message entrant : { id, buffer: ArrayBuffer, isDwg: boolean }
// Message sortant  : { id, ok: true, dxf: string, snap: ArrayBuffer } | { id, ok: false, error }
//
// `snap` est un Float32Array [x0,y0,x1,y1,...] des points de repère du dessin
// (coins, extrémités, sommets de polylignes, points d'insertion) servant à
// l'accrochage des outils de mesure / superficie côté viewer.

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

// --- Extraction des points d'accrochage depuis le texte DXF ---------------
// On parcourt la section ENTITIES et on relève les coordonnées (codes 10-13
// suivis de 20-23). Cela capture les extrémités de LINE, les sommets de
// LWPOLYLINE/POLYLINE, les centres de CIRCLE/ARC, les points d'insertion
// d'INSERT et les contours de HATCH — soit tous les repères géométriques utiles.
function extractSnapPoints(dxf) {
  const lines = dxf.split(/\r\n|\r|\n/);
  const out = [];
  const seen = new Set();
  let inEntities = false;
  let sectionNameNext = false;
  let pendingX = null;
  let pendingAxis = -1;

  const push = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const kx = Math.round(x * 1e4) / 1e4;
    const ky = Math.round(y * 1e4) / 1e4;
    const key = kx + ',' + ky;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(kx, ky);
  };

  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i], 10);
    if (Number.isNaN(code)) continue; // ligne mal alignée -> on ignore la paire
    const raw = lines[i + 1];
    const val = raw === undefined ? '' : raw.trim();

    if (code === 0) {
      const up = val.toUpperCase();
      if (up === 'SECTION') sectionNameNext = true;
      else if (up === 'ENDSEC') { inEntities = false; sectionNameNext = false; }
      pendingX = null; pendingAxis = -1;
      continue;
    }
    if (code === 2 && sectionNameNext) {
      inEntities = val.toUpperCase() === 'ENTITIES';
      sectionNameNext = false;
      continue;
    }
    if (!inEntities) continue;

    if (code >= 10 && code <= 13) {
      pendingX = parseFloat(val);
      pendingAxis = code;
    } else if (code >= 20 && code <= 23 && pendingAxis === code - 10 && pendingX !== null) {
      push(pendingX, parseFloat(val));
      pendingX = null; pendingAxis = -1;
    }
  }
  return new Float32Array(out);
}

self.onmessage = async (e) => {
  const { id, buffer, isDwg } = e.data;
  try {
    let dxf;
    if (!isDwg) {
      dxf = new TextDecoder('utf-8').decode(new Uint8Array(buffer));
    } else {
      const lib = await getLib();
      const bytes = lib.dwg_write_dxf(buffer);
      if (!bytes) {
        self.postMessage({ id, ok: false, error: 'Conversion DWG impossible (fichier corrompu ou version non supportee).' });
        return;
      }
      dxf = new TextDecoder('utf-8').decode(bytes);
    }
    let snap;
    try { snap = extractSnapPoints(dxf); } catch (_) { snap = new Float32Array(0); }
    self.postMessage({ id, ok: true, dxf, snap: snap.buffer }, [snap.buffer]);
  } catch (err) {
    self.postMessage({ id, ok: false, error: (err && err.message) ? String(err.message) : 'Erreur de conversion' });
  }
};
