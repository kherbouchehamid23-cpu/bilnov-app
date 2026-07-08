'use client';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { toDxfObjectUrl } from '@/lib/cad';
import { SnapIndex } from '@/lib/snap';

interface LayerItem { name: string; displayName: string; color: number; visible: boolean; }
interface Annotation {
  id: string; x: number; y: number; text: string; color: string;
  author?: { firstName: string; lastName: string };
}
interface Props {
  fileId: string; fileName: string; token: string;
  canAnnotate?: boolean; onClose: () => void;
}

type Tool = 'pan' | 'measure' | 'annotate' | 'area';
type Pt = { x: number; y: number };

// Rayon d'accrochage à l'écran (px). Correspond à « poser un point à proximité
// d'un repère » : sous ce rayon, le point s'aligne exactement sur le repère.
const SNAP_PX = 14;

// Conversion d'unités (mm de référence) et mapping $INSUNITS -> unité.
const UNIT_MM: Record<string, number> = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 };
const INSUNITS_TO_UNIT: Record<number, string> = { 1: 'in', 2: 'ft', 4: 'mm', 5: 'cm', 6: 'm' };

export default function CadViewer({ fileId, fileName, token, canAnnotate = true, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const viewerRef = useRef<any>(null);
  const objectUrlRef = useRef<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const THREERef = useRef<any>(null);
  const snapIndexRef = useRef<SnapIndex | null>(null);

  const [phase, setPhase] = useState('Initialisation…');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [layers, setLayers] = useState<LayerItem[]>([]);
  const [showLayers, setShowLayers] = useState(false);

  const [tool, setTool] = useState<Tool>('pan');
  const toolRef = useRef<Tool>('pan');
  useEffect(() => { toolRef.current = tool; }, [tool]);

  // Mesure : points cliqués (coords monde), + résultat
  const [measurePts, setMeasurePts] = useState<Pt[]>([]);
  const measurePtsRef = useRef<Pt[]>([]);
  useEffect(() => { measurePtsRef.current = measurePts; }, [measurePts]);
  const [unit, setUnit] = useState('u');        // unité d'affichage
  const [baseUnit, setBaseUnit] = useState('u'); // unité native du dessin ($INSUNITS)

  // Superficie : sommets du polygone (coords monde) + état fermé
  const [areaPts, setAreaPts] = useState<Pt[]>([]);
  const areaPtsRef = useRef<Pt[]>([]);
  useEffect(() => { areaPtsRef.current = areaPts; }, [areaPts]);
  const [areaClosed, setAreaClosed] = useState(false);
  const areaClosedRef = useRef(false);
  useEffect(() => { areaClosedRef.current = areaClosed; }, [areaClosed]);

  // Accrochage : repère survolé (coords monde) pour l'indicateur visuel
  const [snapHover, setSnapHover] = useState<Pt | null>(null);

  // Annotations
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [draftPoint, setDraftPoint] = useState<Pt | null>(null);
  const [draftText, setDraftText] = useState('');

  // force le recalcul des overlays au zoom/pan
  const [, setTick] = useState(0);

  const cleanup = useCallback(() => {
    if (viewerRef.current) {
      try { viewerRef.current.Destroy(); } catch { /* ignore */ }
      viewerRef.current = null;
    }
    if (objectUrlRef.current) { URL.revokeObjectURL(objectUrlRef.current); objectUrlRef.current = null; }
    snapIndexRef.current = null;
  }, []);

  // Convertit une coord monde -> pixel dans l'overlay
  const worldToScreen = useCallback((x: number, y: number): { px: number; py: number } | null => {
    const v = viewerRef.current; const THREE = THREERef.current; const cont = containerRef.current;
    if (!v || !THREE || !cont) return null;
    try {
      const origin = v.GetOrigin();
      const cam = v.GetCamera();
      const p = new THREE.Vector3(x - origin.x, y - origin.y, 0).project(cam);
      const w = cont.clientWidth, h = cont.clientHeight;
      return { px: (p.x + 1) / 2 * w, py: (1 - p.y) / 2 * h };
    } catch { return null; }
  }, []);

  // Convertit un pixel (relatif au conteneur) -> coord monde
  const screenToWorld = useCallback((px: number, py: number): Pt | null => {
    const v = viewerRef.current; const THREE = THREERef.current; const cont = containerRef.current;
    if (!v || !THREE || !cont) return null;
    try {
      const origin = v.GetOrigin();
      const cam = v.GetCamera();
      const w = cont.clientWidth, h = cont.clientHeight;
      const ndcX = (px / w) * 2 - 1;
      const ndcY = -((py / h) * 2 - 1);
      const vec = new THREE.Vector3(ndcX, ndcY, 0).unproject(cam);
      return { x: vec.x + origin.x, y: vec.y + origin.y };
    } catch { return null; }
  }, []);

  // Unités dessin par pixel (dépend du zoom courant)
  const worldPerPixel = useCallback((): number | null => {
    const v = viewerRef.current; const cont = containerRef.current;
    if (!v || !cont) return null;
    try {
      const cam = v.GetCamera();
      const visW = Math.abs((cam.right - cam.left) / (cam.zoom || 1));
      const wpp = visW / cont.clientWidth;
      return Number.isFinite(wpp) && wpp > 0 ? wpp : null;
    } catch { return null; }
  }, []);

  // Accroche un point monde au repère le plus proche (si sous le seuil)
  const snapWorld = useCallback((p: Pt): Pt => {
    const idx = snapIndexRef.current; if (!idx) return p;
    const wpp = worldPerPixel(); if (!wpp) return p;
    const hit = idx.nearest(p.x, p.y, SNAP_PX * wpp);
    return hit ?? p;
  }, [worldPerPixel]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true); setError(null);
        setPhase('Téléchargement du fichier…');
        const res = await fetch(`/api/file-proxy/${fileId}?token=${encodeURIComponent(token)}`);
        if (!res.ok) throw new Error('Téléchargement impossible');
        const blob = await res.blob();
        if (cancelled) return;

        const isDwg = /\.dwg$/i.test(fileName);
        setPhase(isDwg ? 'Conversion du DWG (peut prendre un moment sur les gros fichiers)…' : 'Préparation du plan…');
        const { url, snapPoints, insUnits } = await toDxfObjectUrl(blob, fileName);
        if (cancelled) { URL.revokeObjectURL(url); return; }
        objectUrlRef.current = url;
        snapIndexRef.current = snapPoints.length > 0 ? new SnapIndex(snapPoints) : null;
        const detected = INSUNITS_TO_UNIT[insUnits] ?? 'u';
        setBaseUnit(detected); setUnit(detected);

        setPhase('Rendu du plan…');
        const [{ DxfViewer }, THREE] = await Promise.all([
          import('dxf-viewer'),
          import('three'),
        ]);
        THREERef.current = THREE;
        if (cancelled || !containerRef.current) return;

        const viewer = new DxfViewer(containerRef.current, {
          autoResize: true,
          antialias: false,          // perf gros fichiers
          colorCorrection: true,
          retainParsedDxf: false,    // libère la mémoire du DXF parsé
          sceneOptions: {
            suppressPaperSpace: true,      // n'affiche que le model space
            arcTessellationAngle: 15,      // moins de segments = plus léger
          },
        });
        viewerRef.current = viewer;

        await viewer.Load({ url, fonts: null });
        if (cancelled) return;

        const ls: LayerItem[] = [];
        for (const l of viewer.GetLayers()) {
          ls.push({ name: l.name, displayName: l.displayName ?? l.name, color: l.color, visible: true });
        }
        setLayers(ls);

        // écouter les clics (mesure / annotation / superficie) et les changements de vue
        viewer.Subscribe('pointerup', (ev: { detail?: { position?: { x: number; y: number } } }) => {
          const pos = ev?.detail?.position;
          if (!pos) return;
          const origin = viewer.GetOrigin();
          const world = snapWorld({ x: pos.x + origin.x, y: pos.y + origin.y });
          const t = toolRef.current;
          if (t === 'measure') {
            const cur = measurePtsRef.current;
            const next = cur.length >= 2 ? [world] : [...cur, world];
            setMeasurePts(next);
          } else if (t === 'annotate') {
            setDraftPoint(world);
            setDraftText('');
          } else if (t === 'area') {
            if (areaClosedRef.current) return;
            const cur = areaPtsRef.current;
            // clic visuellement sur le 1er sommet (<= 12 px écran) -> fermer le polygone
            if (cur.length >= 3) {
              const sFirst = worldToScreen(cur[0].x, cur[0].y);
              const sClick = worldToScreen(world.x, world.y);
              if (sFirst && sClick && Math.hypot(sFirst.px - sClick.px, sFirst.py - sClick.py) <= 12) {
                setAreaClosed(true); return;
              }
            }
            setAreaPts([...cur, world]);
          }
        });
        viewer.Subscribe('viewChanged', () => setTick(t => t + 1));

        // charger les annotations existantes
        try {
          const ar = await fetch(`/api/files/${fileId}/annotations`, { headers: { Authorization: `Bearer ${token}` } });
          const ad = await ar.json() as { data?: { annotations?: Annotation[] } };
          if (!cancelled) setAnnotations(ad.data?.annotations ?? []);
        } catch { /* ignore */ }

        setLoading(false); setPhase('');
      } catch (e) {
        if (!cancelled) { setError(e instanceof Error ? e.message : 'Erreur de lecture du plan'); setLoading(false); }
      }
    })();
    return () => { cancelled = true; cleanup(); };
  }, [fileId, fileName, token, cleanup, snapWorld, worldPerPixel, worldToScreen]);

  // Indicateur d'accrochage au survol (hors mode navigation)
  useEffect(() => {
    const cont = containerRef.current; if (!cont) return;
    let raf = 0; let lastX = 0; let lastY = 0;
    const process = () => {
      raf = 0;
      const t = toolRef.current;
      if (t === 'pan' || !snapIndexRef.current) { setSnapHover(prev => (prev ? null : prev)); return; }
      const rect = cont.getBoundingClientRect();
      const world = screenToWorld(lastX - rect.left, lastY - rect.top);
      if (!world) return;
      const wpp = worldPerPixel(); if (!wpp) return;
      const hit = snapIndexRef.current.nearest(world.x, world.y, SNAP_PX * wpp);
      setSnapHover(prev => {
        if (hit && prev && prev.x === hit.x && prev.y === hit.y) return prev;
        if (!hit && !prev) return prev;
        return hit;
      });
    };
    const onMove = (e: PointerEvent) => {
      lastX = e.clientX; lastY = e.clientY;
      if (!raf) raf = requestAnimationFrame(process);
    };
    const onLeave = () => setSnapHover(prev => (prev ? null : prev));
    cont.addEventListener('pointermove', onMove);
    cont.addEventListener('pointerleave', onLeave);
    return () => {
      cont.removeEventListener('pointermove', onMove);
      cont.removeEventListener('pointerleave', onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [screenToWorld, worldPerPixel]);

  function toggleLayer(name: string) {
    setLayers(prev => prev.map(l => {
      if (l.name === name && viewerRef.current) {
        const visible = !l.visible;
        try { viewerRef.current.ShowLayer(name, visible); } catch { /* ignore */ }
        return { ...l, visible };
      }
      return l;
    }));
  }

  function fitView() {
    const v = viewerRef.current; if (!v) return;
    const b = v.GetBounds(); if (b) v.FitView(b.minX, b.maxX, b.minY, b.maxY, 0.1);
  }

  function resetTools() { setMeasurePts([]); setDraftPoint(null); setAreaPts([]); setAreaClosed(false); }

  async function saveAnnotation() {
    if (!draftPoint || !draftText.trim()) return;
    try {
      const res = await fetch(`/api/files/${fileId}/annotations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: draftPoint.x, y: draftPoint.y, text: draftText.trim() }),
      });
      const d = await res.json() as { data?: Annotation };
      if (d.data) setAnnotations(prev => [...prev, d.data as Annotation]);
    } catch { /* ignore */ }
    setDraftPoint(null); setDraftText('');
  }

  async function deleteAnnotation(id: string) {
    try {
      await fetch(`/api/files/${fileId}/annotations/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      setAnnotations(prev => prev.filter(a => a.id !== id));
    } catch { /* ignore */ }
  }

  // distance mesurée (unités dessin)
  const measureDist = measurePts.length === 2
    ? Math.hypot(measurePts[1].x - measurePts[0].x, measurePts[1].y - measurePts[0].y)
    : null;

  // superficie (formule des trapèzes / shoelace) sur les sommets
  const areaValue = areaPts.length >= 3
    ? Math.abs(areaPts.reduce((acc, p, i) => {
      const q = areaPts[(i + 1) % areaPts.length];
      return acc + (p.x * q.y - q.x * p.y);
    }, 0)) / 2
    : null;
  const areaCentroid = areaPts.length > 0
    ? { x: areaPts.reduce((s, p) => s + p.x, 0) / areaPts.length, y: areaPts.reduce((s, p) => s + p.y, 0) / areaPts.length }
    : null;

  const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
  const canConvert = baseUnit !== 'u' && unit !== 'u' && (baseUnit in UNIT_MM) && (unit in UNIT_MM);
  const lenFactor = canConvert ? UNIT_MM[baseUnit] / UNIT_MM[unit] : 1;
  const unitLabel = unit === 'u' ? 'u' : unit;
  const dispDist = measureDist !== null ? measureDist * lenFactor : null;
  const dispArea = areaValue !== null ? areaValue * lenFactor * lenFactor : null;
  const btn = (active: boolean) =>
    `rounded-md px-3 py-1 text-sm ${active ? 'bg-white text-slate-900' : 'bg-white/10 text-white hover:bg-white/20'}`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900">
      {/* Barre d'outils */}
      <div className="flex items-center justify-between bg-slate-800 px-3 py-2 text-white">
        <span className="truncate text-sm font-medium max-w-[26%]">{fileName}</span>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button className={btn(tool === 'pan')} onClick={() => { setTool('pan'); resetTools(); }}>✋ Naviguer</button>
          <button className={btn(tool === 'measure')} onClick={() => { setTool('measure'); resetTools(); }}>📏 Mesurer</button>
          <button className={btn(tool === 'area')} onClick={() => { setTool('area'); resetTools(); }}>📐 Superficie</button>
          {canAnnotate && (
            <button className={btn(tool === 'annotate')} onClick={() => { setTool('annotate'); resetTools(); }}>📌 Annoter</button>
          )}
          <button className="rounded-md bg-white/10 px-3 py-1 text-sm hover:bg-white/20" onClick={fitView}>Ajuster</button>
          <button className="rounded-md bg-white/10 px-3 py-1 text-sm hover:bg-white/20" onClick={() => setShowLayers(s => !s)}>Calques</button>
          <button className="rounded-md bg-white/10 px-3 py-1 text-sm hover:bg-white/20" onClick={onClose}>Fermer</button>
        </div>
      </div>

      {/* Bandeau d'aide selon l'outil */}
      {tool === 'measure' && (
        <div className="bg-slate-700 px-3 py-1.5 text-xs text-white flex items-center gap-3 flex-wrap">
          <span>Cliquez 2 points pour mesurer — l&apos;accrochage aligne le point sur le repère le plus proche.</span>
          {measureDist !== null && (
            <>
              <span className="font-semibold">Distance : {fmt(dispDist ?? 0)} {unitLabel}</span>
              <select value={unit} onChange={e => setUnit(e.target.value)} className="bg-slate-600 rounded px-1 py-0.5 text-xs">
                <option value="u">unités</option>
                <option value="mm">mm</option>
                <option value="cm">cm</option>
                <option value="m">m</option>
                <option value="in">in</option>
                <option value="ft">ft</option>
              </select>
              <button className="underline" onClick={() => setMeasurePts([])}>Effacer</button>
            </>
          )}
        </div>
      )}
      {tool === 'area' && (
        <div className="bg-slate-700 px-3 py-1.5 text-xs text-white flex items-center gap-3 flex-wrap">
          <span>Cliquez autant de sommets que voulu (≥ 3), puis « Terminer » ou cliquez sur le 1er point pour fermer.</span>
          {areaValue !== null && (
            <>
              <span className="font-semibold">Superficie : {fmt(dispArea ?? 0)} {unitLabel}²</span>
              <select value={unit} onChange={e => setUnit(e.target.value)} className="bg-slate-600 rounded px-1 py-0.5 text-xs">
                <option value="u">unités</option>
                <option value="mm">mm</option>
                <option value="cm">cm</option>
                <option value="m">m</option>
                <option value="in">in</option>
                <option value="ft">ft</option>
              </select>
            </>
          )}
          {areaPts.length >= 3 && !areaClosed && (
            <button className="underline" onClick={() => setAreaClosed(true)}>Terminer</button>
          )}
          {areaPts.length > 0 && (
            <button className="underline" onClick={() => { setAreaPts([]); setAreaClosed(false); }}>Effacer</button>
          )}
        </div>
      )}
      {tool === 'annotate' && (
        <div className="bg-slate-700 px-3 py-1.5 text-xs text-white">Cliquez sur le plan pour poser une annotation (accrochage actif).</div>
      )}

      <div className="relative flex flex-1 overflow-hidden">
        <div ref={containerRef} className="flex-1 bg-white" />

        {/* Overlay mesure + superficie + annotations (positionné en pixels) */}
        <div ref={overlayRef} className="pointer-events-none absolute inset-0" style={{ right: showLayers ? 240 : 0 }}>
          {/* points + ligne de mesure */}
          {measurePts.map((p, i) => {
            const s = worldToScreen(p.x, p.y); if (!s) return null;
            return <div key={`m${i}`} className="absolute" style={{ left: s.px - 4, top: s.py - 4, width: 8, height: 8, borderRadius: 8, background: '#2563EB', border: '2px solid #fff' }} />;
          })}
          {measurePts.length === 2 && (() => {
            const a = worldToScreen(measurePts[0].x, measurePts[0].y);
            const b = worldToScreen(measurePts[1].x, measurePts[1].y);
            if (!a || !b) return null;
            const midX = (a.px + b.px) / 2, midY = (a.py + b.py) / 2;
            return (
              <>
                <svg className="absolute inset-0 w-full h-full">
                  <line x1={a.px} y1={a.py} x2={b.px} y2={b.py} stroke="#2563EB" strokeWidth={2} strokeDasharray="5 4" />
                </svg>
                {dispDist !== null && (
                  <div className="absolute -translate-x-1/2 -translate-y-1/2 rounded bg-blue-600 px-2 py-0.5 text-xs text-white font-semibold whitespace-nowrap"
                    style={{ left: midX, top: midY }}>
                    {fmt(dispDist)} {unitLabel}
                  </div>
                )}
              </>
            );
          })()}

          {/* polygone de superficie */}
          {areaPts.length > 0 && (() => {
            const scr = areaPts.map(p => worldToScreen(p.x, p.y));
            if (scr.some(s => !s)) return null;
            const pts = scr as { px: number; py: number }[];
            const poly = pts.map(s => `${s.px},${s.py}`).join(' ');
            const cen = areaCentroid ? worldToScreen(areaCentroid.x, areaCentroid.y) : null;
            return (
              <>
                <svg className="absolute inset-0 w-full h-full">
                  {(areaClosed || pts.length >= 3) && (
                    <polygon points={poly} fill="rgba(16,185,129,0.18)" stroke="#059669" strokeWidth={2}
                      strokeDasharray={areaClosed ? undefined : '5 4'} />
                  )}
                  {!areaClosed && pts.length === 2 && (
                    <polyline points={poly} fill="none" stroke="#059669" strokeWidth={2} strokeDasharray="5 4" />
                  )}
                </svg>
                {pts.map((s, i) => (
                  <div key={`a${i}`} className="absolute" style={{ left: s.px - 4, top: s.py - 4, width: 8, height: 8, borderRadius: 8, background: '#059669', border: '2px solid #fff' }} />
                ))}
                {dispArea !== null && cen && (
                  <div className="absolute -translate-x-1/2 -translate-y-1/2 rounded bg-emerald-600 px-2 py-0.5 text-xs text-white font-semibold whitespace-nowrap"
                    style={{ left: cen.px, top: cen.py }}>
                    {fmt(dispArea)} {unitLabel}&sup2;
                  </div>
                )}
              </>
            );
          })()}

          {/* indicateur d'accrochage */}
          {snapHover && tool !== 'pan' && (() => {
            const s = worldToScreen(snapHover.x, snapHover.y); if (!s) return null;
            return (
              <div className="absolute" style={{ left: s.px - 6, top: s.py - 6, width: 12, height: 12, border: '2px solid #F59E0B', background: 'rgba(245,158,11,0.25)', boxShadow: '0 0 0 1px #fff' }} />
            );
          })()}

          {/* annotations existantes */}
          {annotations.map(a => {
            const s = worldToScreen(a.x, a.y); if (!s) return null;
            return (
              <div key={a.id} className="absolute pointer-events-auto -translate-x-1/2 -translate-y-full group"
                style={{ left: s.px, top: s.py }}>
                <div className="flex flex-col items-center">
                  <div className="rounded-lg bg-white shadow-lg px-2 py-1 text-xs max-w-[200px]" style={{ borderLeft: `3px solid ${a.color}` }}>
                    <p className="text-slate-800">{a.text}</p>
                    {a.author && <p className="text-[10px] text-slate-400">{a.author.firstName} {a.author.lastName}</p>}
                    {canAnnotate && (
                      <button onClick={() => deleteAnnotation(a.id)} className="text-[10px] text-red-500 opacity-0 group-hover:opacity-100">supprimer</button>
                    )}
                  </div>
                  <span style={{ color: a.color, fontSize: 18, lineHeight: 1 }}>&#9660;</span>
                </div>
              </div>
            );
          })}

          {/* brouillon d'annotation */}
          {draftPoint && (() => {
            const s = worldToScreen(draftPoint.x, draftPoint.y); if (!s) return null;
            return (
              <div className="absolute pointer-events-auto -translate-x-1/2 -translate-y-full" style={{ left: s.px, top: s.py }}>
                <div className="rounded-lg bg-white shadow-xl p-2 w-56" style={{ borderLeft: '3px solid #EF4444' }}>
                  <textarea autoFocus value={draftText} onChange={e => setDraftText(e.target.value)}
                    placeholder="Votre note…" rows={2}
                    className="w-full text-xs border rounded p-1 mb-1 text-slate-800" style={{ borderColor: '#E7E5E4' }} />
                  <div className="flex gap-1">
                    <button onClick={() => { void saveAnnotation(); }} disabled={!draftText.trim()}
                      className="flex-1 rounded bg-violet-600 text-white text-xs py-1 disabled:opacity-50">Enregistrer</button>
                    <button onClick={() => { setDraftPoint(null); setDraftText(''); }}
                      className="rounded bg-slate-200 text-slate-700 text-xs px-2 py-1">Annuler</button>
                  </div>
                </div>
                <span style={{ color: '#EF4444', fontSize: 18 }}>&#9660;</span>
              </div>
            );
          })()}
        </div>

        {/* Panneau calques */}
        {showLayers && layers.length > 0 && (
          <div className="w-60 shrink-0 overflow-y-auto border-l border-slate-700 bg-slate-800 p-3 text-white">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Calques ({layers.length})</p>
            <ul className="space-y-1">
              {layers.map(l => (
                <li key={l.name}>
                  <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-white/5">
                    <input type="checkbox" checked={l.visible} onChange={() => toggleLayer(l.name)} />
                    <span className="inline-block h-3 w-3 shrink-0 rounded-sm"
                      style={{ backgroundColor: `#${(l.color >>> 0).toString(16).padStart(6, '0').slice(-6)}` }} />
                    <span className="truncate">{l.displayName}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(loading || error) && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 text-white">
            {error ? (
              <div className="max-w-md px-6 text-center">
                <p className="mb-2 text-red-400">Impossible d&apos;afficher le plan</p>
                <p className="text-sm text-slate-300">{error}</p>
                <button onClick={onClose} className="mt-4 rounded-md bg-white/10 px-4 py-1.5 text-sm hover:bg-white/20">Fermer</button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                <p className="text-sm">{phase}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
