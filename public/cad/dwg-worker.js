// Web Worker : conversion DWG -> DXF hors du thread principal (évite le gel UI
// sur gros fichiers). Charge LibreDWG (WASM) depuis /cad/.
// Message entrant : { id, buffer: ArrayBuffer, isDwg: boolean }
// Message sortant  : { id, ok: true, dxf, snap: ArrayBuffer, insunits } | { id, ok: false, error }
//
// `snap`     : Float32Array [x0,y0,x1,y1,...] des repères d'accrochage du dessin.
// `insunits` : code $INSUNITS du DXF (unité native : 4=mm, 5=cm, 6=m, 1=in, 2=ft...).

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

// Points d'accrochage : coordonnées (codes 10-13 / 20-23) de la section ENTITIES.
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
    if (Number.isNaN(code)) continue;
    const val = (lines[i + 1] === undefined ? '' : lines[i + 1]).trim();

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

// Unité native du dessin : variable HEADER $INSUNITS (code 9 = nom, code 70 = valeur).
function extractInsUnits(dxf) {
  const lines = dxf.split(/\r\n|\r|\n/);
  for (let i = 0; i + 1 < lines.length; i++) {
    if (lines[i].trim() === '9' && (lines[i + 1] || '').trim() === '$INSUNITS') {
      for (let j = i + 2; j + 1 < lines.length; j += 2) {
        const c = parseInt(lines[j], 10);
        if (Number.isNaN(c) || c === 9) break;
        if (c === 70) return parseInt((lines[j + 1] || '').trim(), 10) || 0;
      }
      return 0;
    }
  }
  return 0;
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
    let snap; try { snap = extractSnapPoints(dxf); } catch (_) { snap = new Float32Array(0); }
    let insunits; try { insunits = extractInsUnits(dxf); } catch (_) { insunits = 0; }
    self.postMessage({ id, ok: true, dxf, snap: snap.buffer, insunits }, [snap.buffer]);
  } catch (err) {
    self.postMessage({ id, ok: false, error: (err && err.message) ? String(err.message) : 'Erreur de conversion' });
  }
};
