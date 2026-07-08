// Web Worker : conversion DWG -> DXF hors du thread principal (évite le gel UI
// sur gros fichiers). Charge LibreDWG (WASM) depuis /cad/.
// Message entrant : { id, buffer: ArrayBuffer, isDwg: boolean }
// Message sortant  : { id, ok: true, dxf, snap: ArrayBuffer, insunits } | { id, ok: false, error }
//
// `snap`     : Float32Array [x0,y0,...] repères d'accrochage.
// `insunits` : code $INSUNITS (unité native : 4=mm, 5=cm, 6=m, 1=in, 2=ft...).
// Les hachures PLEINES (SOLID) sont retirées du DXF rendu : dxf-viewer les
// dessine en aplats opaques par-dessus le trait, ce qui masque les murs.

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
  const out = []; const seen = new Set();
  let inEntities = false, sectionNameNext = false, pendingX = null, pendingAxis = -1;
  const push = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const kx = Math.round(x * 1e4) / 1e4, ky = Math.round(y * 1e4) / 1e4, key = kx + ',' + ky;
    if (seen.has(key)) return; seen.add(key); out.push(kx, ky);
  };
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i], 10);
    if (Number.isNaN(code)) continue;
    const val = (lines[i + 1] === undefined ? '' : lines[i + 1]).trim();
    if (code === 0) {
      const up = val.toUpperCase();
      if (up === 'SECTION') sectionNameNext = true;
      else if (up === 'ENDSEC') { inEntities = false; sectionNameNext = false; }
      pendingX = null; pendingAxis = -1; continue;
    }
    if (code === 2 && sectionNameNext) { inEntities = val.toUpperCase() === 'ENTITIES'; sectionNameNext = false; continue; }
    if (!inEntities) continue;
    if (code >= 10 && code <= 13) { pendingX = parseFloat(val); pendingAxis = code; }
    else if (code >= 20 && code <= 23 && pendingAxis === code - 10 && pendingX !== null) { push(pendingX, parseFloat(val)); pendingX = null; pendingAxis = -1; }
  }
  return new Float32Array(out);
}

// $INSUNITS (HEADER) : code 9 = nom de variable, code 70 = valeur.
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

// Retire les entités HATCH à remplissage PLEIN (code 70 = 1, ou motif "SOLID").
// On met en tampon chaque bloc HATCH puis on l'émet seulement s'il n'est pas plein.
function stripSolidHatches(dxf) {
  const lines = dxf.split(/\r\n|\r|\n/);
  const out = [];
  let i = 0; const N = lines.length;
  let removed = 0;
  while (i + 1 < N) {
    const code = lines[i].trim();
    const val = lines[i + 1];
    if (code === '0' && (val || '').trim().toUpperCase() === 'HATCH') {
      // bufferiser tout le bloc HATCH jusqu'au prochain code 0
      const block = [lines[i], lines[i + 1]];
      let j = i + 2; let solid = false; let sawFill = false;
      while (j + 1 < N) {
        const c = lines[j].trim();
        if (c === '0') break; // début de l'entité suivante
        const v = (lines[j + 1] || '').trim();
        if (c === '70') { sawFill = true; if (v === '1') solid = true; }
        else if (c === '2' && v.toUpperCase() === 'SOLID') solid = true;
        block.push(lines[j], lines[j + 1]);
        j += 2;
      }
      if (solid || !sawFill) { removed++; }      // plein (ou indéterminé) -> on jette
      else { for (const l of block) out.push(l); } // motif -> on garde
      i = j;
      continue;
    }
    out.push(lines[i], lines[i + 1]);
    i += 2;
  }
  if (i < N) out.push(lines[i]);
  return { dxf: out.join('\n'), removed };
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
      if (!bytes) { self.postMessage({ id, ok: false, error: 'Conversion DWG impossible (fichier corrompu ou version non supportee).' }); return; }
      dxf = new TextDecoder('utf-8').decode(bytes);
    }
    // Accrochage calculé sur le dessin complet (avant retrait des hachures).
    let snap; try { snap = extractSnapPoints(dxf); } catch (_) { snap = new Float32Array(0); }
    let insunits; try { insunits = extractInsUnits(dxf); } catch (_) { insunits = 0; }
    try { const r = stripSolidHatches(dxf); dxf = r.dxf; } catch (_) { /* garde le dxf tel quel */ }
    self.postMessage({ id, ok: true, dxf, snap: snap.buffer, insunits }, [snap.buffer]);
  } catch (err) {
    self.postMessage({ id, ok: false, error: (err && err.message) ? String(err.message) : 'Erreur de conversion' });
  }
};
