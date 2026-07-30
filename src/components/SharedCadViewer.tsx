'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Hand, Ruler, Square, Layers } from 'lucide-react';
import { toDxfObjectUrl } from '@/lib/cad';
import { SnapIndex } from '@/lib/snap';
import { UNIT_MM, unitFromInsUnits, lengthFactor, distance as segLen, polygonArea, polygonPerimeter, centroid as polyCentroid, formatMeasure } from '@/lib/cadMeasure';
import { STATUS_META, statusColor, statusLabel, type CadStatus, type CadPriority } from '@/lib/cadStatus';

interface Person { id: string; firstName: string; lastName: string }
interface Reply { id: string; body: string; createdAt: string; author: Person }
interface Comment {
  id: string; number: number; x: number; y: number; title: string | null; text: string;
  priority: CadPriority; status: CadStatus; createdAt: string;
  author: Person; assignee: Person | null; replies: Reply[]; attachments: { id: string; name: string; kind: string }[];
}
type Pt = { x: number; y: number };
type Tool = 'pan' | 'measure' | 'area';

interface Props { shareId: string; code: string; fileId: string; fileName: string; canMeasure?: boolean; onClose: () => void }

// Viewer CAO de la vue partagée publique (§14). Lecture seule des commentaires ;
// la prise de mesure/superficie est activée UNIQUEMENT si le code de partage
// accorde `canMeasure` (note 6 : ex. devis). Les mesures sont éphémères (non persistées).
export default function SharedCadViewer({ shareId, code, fileId, fileName, canMeasure = false, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const THREERef = useRef<any>(null);
  const objectUrlRef = useRef<string | null>(null);
  const snapIndexRef = useRef<SnapIndex | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState('Chargement…');
  const [, setTick] = useState(0);
  const [comments, setComments] = useState<Comment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showPanel, setShowPanel] = useState(true);

  // Outils de mesure (éphémères, activés par canMeasure)
  const [tool, setTool] = useState<Tool>('pan');
  const toolRef = useRef<Tool>('pan');
  useEffect(() => { toolRef.current = tool; }, [tool]);
  const [unit, setUnit] = useState('u');
  const [baseUnit, setBaseUnit] = useState('u');
  const [measurePts, setMeasurePts] = useState<Pt[]>([]);
  const measurePtsRef = useRef<Pt[]>([]);
  useEffect(() => { measurePtsRef.current = measurePts; }, [measurePts]);
  const [areaPts, setAreaPts] = useState<Pt[]>([]);
  const areaPtsRef = useRef<Pt[]>([]);
  useEffect(() => { areaPtsRef.current = areaPts; }, [areaPts]);
  const [areaClosed, setAreaClosed] = useState(false);
  const areaClosedRef = useRef(false);
  useEffect(() => { areaClosedRef.current = areaClosed; }, [areaClosed]);
  const [snapHover, setSnapHover] = useState<Pt | null>(null);
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(max-width: 767px)');
    const mqT = window.matchMedia('(pointer: coarse)');
    const upd = () => { if (mq.matches) setShowPanel(false); setIsTouch(mqT.matches); };
    upd();
    mq.addEventListener('change', upd); mqT.addEventListener('change', upd);
    return () => { mq.removeEventListener('change', upd); mqT.removeEventListener('change', upd); };
  }, []);

  const worldToScreen = useCallback((x: number, y: number): { px: number; py: number } | null => {
    const v = viewerRef.current; const THREE = THREERef.current; const cont = containerRef.current;
    if (!v || !THREE || !cont) return null;
    try {
      const origin = v.GetOrigin(); const cam = v.GetCamera();
      const p = new THREE.Vector3(x - origin.x, y - origin.y, 0).project(cam);
      return { px: (p.x * 0.5 + 0.5) * cont.clientWidth, py: (-p.y * 0.5 + 0.5) * cont.clientHeight };
    } catch { return null; }
  }, []);

  const screenToWorld = useCallback((px: number, py: number): Pt | null => {
    const v = viewerRef.current; const THREE = THREERef.current; const cont = containerRef.current;
    if (!v || !THREE || !cont) return null;
    try {
      const origin = v.GetOrigin(); const cam = v.GetCamera();
      const ndcX = (px / cont.clientWidth) * 2 - 1; const ndcY = -((py / cont.clientHeight) * 2 - 1);
      const vec = new THREE.Vector3(ndcX, ndcY, 0).unproject(cam);
      return { x: vec.x + origin.x, y: vec.y + origin.y };
    } catch { return null; }
  }, []);

  const worldPerPixel = useCallback((): number | null => {
    const v = viewerRef.current; const THREE = THREERef.current; const cont = containerRef.current;
    if (!v || !THREE || !cont) return null;
    try {
      const cam = v.GetCamera();
      const a = new THREE.Vector3(-1, 0, 0).unproject(cam);
      const b = new THREE.Vector3(1, 0, 0).unproject(cam);
      return Math.abs(b.x - a.x) / cont.clientWidth;
    } catch { return null; }
  }, []);

  const snapWorld = useCallback((p: Pt): Pt => {
    if (!snapIndexRef.current) return p;
    const wpp = worldPerPixel(); if (!wpp) return p;
    const hit = snapIndexRef.current.nearest(p.x, p.y, 14 * wpp);
    return hit ? { x: hit.x, y: hit.y } : p;
  }, [worldPerPixel]);

  const centerOn = useCallback((x: number, y: number) => {
    const v = viewerRef.current; const THREE = THREERef.current; const cont = containerRef.current;
    if (!v || !THREE || !cont) return;
    try {
      const cam = v.GetCamera();
      const a = new THREE.Vector3(-1, 0, 0).unproject(cam);
      const b = new THREE.Vector3(1, 0, 0).unproject(cam);
      const wpp = Math.abs(b.x - a.x) / cont.clientWidth;
      const hw = (wpp * cont.clientWidth) / 2, hh = (wpp * cont.clientHeight) / 2;
      v.FitView(x - hw, x + hw, y - hh, y + hh, 0);
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true); setError(null); setPhase('Téléchargement du plan…');
        const res = await fetch(`/api/shared/${shareId}/files/${fileId}/raw?code=${encodeURIComponent(code)}`);
        if (!res.ok) throw new Error('Téléchargement impossible');
        const blob = await res.blob();
        setPhase('Conversion DWG…');
        const { url, snapPoints, insUnits } = await toDxfObjectUrl(blob, fileName);
        if (cancelled) { URL.revokeObjectURL(url); return; }
        objectUrlRef.current = url;
        snapIndexRef.current = snapPoints.length > 0 ? new SnapIndex(snapPoints) : null;
        const detected = unitFromInsUnits(insUnits);
        setBaseUnit(detected); setUnit(detected);
        setPhase('Rendu du plan…');
        const [{ DxfViewer }, THREE] = await Promise.all([import('dxf-viewer'), import('three')]);
        THREERef.current = THREE;
        if (cancelled || !containerRef.current) return;
        const viewer = new DxfViewer(containerRef.current, {
          autoResize: true, antialias: false, colorCorrection: true, retainParsedDxf: false,
          sceneOptions: { suppressPaperSpace: true, arcTessellationAngle: 15 },
        });
        viewerRef.current = viewer;
        await viewer.Load({ url, fonts: ['/cad/DejaVuSans.ttf'] });
        if (cancelled) return;

        // Placement des points de mesure (uniquement si le droit est accordé).
        let downX = 0, downY = 0, downOk = false;
        viewer.Subscribe('pointerdown', (ev: { detail?: { domEvent?: { clientX: number; clientY: number } } }) => {
          const d = ev?.detail?.domEvent;
          if (d) { downX = d.clientX; downY = d.clientY; downOk = true; } else { downOk = false; }
        });
        viewer.Subscribe('pointerup', (ev: { detail?: { position?: { x: number; y: number }; domEvent?: { clientX: number; clientY: number } } }) => {
          if (!canMeasure) return;
          const pos = ev?.detail?.position; if (!pos) return;
          const d = ev?.detail?.domEvent;
          if (downOk && d && Math.hypot(d.clientX - downX, d.clientY - downY) > 8) return;
          const origin = viewer.GetOrigin();
          const world = snapWorld({ x: pos.x + origin.x, y: pos.y + origin.y });
          const t = toolRef.current;
          if (t === 'measure') {
            const cur = measurePtsRef.current;
            setMeasurePts(cur.length >= 2 ? [world] : [...cur, world]);
          } else if (t === 'area') {
            if (areaClosedRef.current) return;
            const cur = areaPtsRef.current;
            if (cur.length >= 3) {
              const sFirst = worldToScreen(cur[0].x, cur[0].y);
              const sClick = worldToScreen(world.x, world.y);
              if (sFirst && sClick && Math.hypot(sFirst.px - sClick.px, sFirst.py - sClick.py) <= 12) { setAreaClosed(true); return; }
            }
            setAreaPts([...cur, world]);
          }
        });
        viewer.Subscribe('viewChanged', () => setTick((t) => t + 1));
        try {
          const cr = await fetch(`/api/shared/${shareId}/files/${fileId}/comments?code=${encodeURIComponent(code)}`);
          const cd = await cr.json() as { data?: { comments?: Comment[] } };
          if (!cancelled) setComments(cd.data?.comments ?? []);
        } catch { /* commentaires optionnels */ }
        setLoading(false); setPhase('');
      } catch (e) {
        if (!cancelled) { setError(e instanceof Error ? e.message : 'Erreur de lecture'); setLoading(false); }
      }
    })();
    return () => {
      cancelled = true;
      try { viewerRef.current?.Destroy?.(); } catch { /* noop */ }
      viewerRef.current = null;
      if (objectUrlRef.current) { URL.revokeObjectURL(objectUrlRef.current); objectUrlRef.current = null; }
    };
  }, [shareId, code, fileId, fileName, canMeasure, snapWorld, worldToScreen]);

  // Accrochage au survol (desktop)
  useEffect(() => {
    const cont = containerRef.current; if (!cont || !canMeasure) return;
    let raf = 0; let lastX = 0; let lastY = 0;
    const process = () => {
      raf = 0;
      if (toolRef.current === 'pan' || !snapIndexRef.current) { setSnapHover((prev) => (prev ? null : prev)); return; }
      const rect = cont.getBoundingClientRect();
      const world = screenToWorld(lastX - rect.left, lastY - rect.top); if (!world) return;
      const wpp = worldPerPixel(); if (!wpp) return;
      const hit = snapIndexRef.current.nearest(world.x, world.y, 14 * wpp);
      setSnapHover(hit ? { x: hit.x, y: hit.y } : null);
    };
    const onMove = (e: MouseEvent) => { lastX = e.clientX; lastY = e.clientY; if (!raf) raf = requestAnimationFrame(process); };
    cont.addEventListener('mousemove', onMove);
    return () => { cont.removeEventListener('mousemove', onMove); if (raf) cancelAnimationFrame(raf); };
  }, [canMeasure, screenToWorld, worldPerPixel]);

  function fitView() { const v = viewerRef.current; if (!v) return; const b = v.GetBounds(); if (b) v.FitView(b.minX, b.maxX, b.minY, b.maxY, 0.1); }
  function resetTools() { setMeasurePts([]); setAreaPts([]); setAreaClosed(false); setSnapHover(null); }
  function centerWorld(): Pt | null {
    const cont = containerRef.current; if (!cont) return null;
    const c = screenToWorld(cont.clientWidth / 2, cont.clientHeight / 2);
    return c ? snapWorld(c) : null;
  }
  function placeCenterPoint() {
    const p = centerWorld(); if (!p) return;
    if (tool === 'measure') setMeasurePts((cur) => (cur.length >= 2 ? [p] : [...cur, p]));
    else if (tool === 'area') { if (!areaClosed) setAreaPts((cur) => [...cur, p]); }
  }

  // Édition (drag) des points de la mesure éphémère en cours
  const dragRef = useRef<{ kind: 'measure' | 'area'; index: number } | null>(null);
  const moveVertex = useCallback((clientX: number, clientY: number) => {
    const d = dragRef.current; const cont = containerRef.current; if (!d || !cont) return;
    const rect = cont.getBoundingClientRect();
    const w = screenToWorld(clientX - rect.left, clientY - rect.top); if (!w) return;
    const snapped = snapWorld(w);
    if (d.kind === 'measure') setMeasurePts((cur) => cur.map((p, i) => (i === d.index ? snapped : p)));
    else setAreaPts((cur) => cur.map((p, i) => (i === d.index ? snapped : p)));
  }, [screenToWorld, snapWorld]);
  function vertexHandlers(kind: 'measure' | 'area', index: number) {
    return {
      onPointerDown: (e: ReactPointerEvent) => { e.stopPropagation(); try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ } dragRef.current = { kind, index }; },
      onPointerMove: (e: ReactPointerEvent) => { if (dragRef.current) { e.stopPropagation(); moveVertex(e.clientX, e.clientY); } },
      onPointerUp: (e: ReactPointerEvent) => { e.stopPropagation(); dragRef.current = null; },
    };
  }

  const lenFactor = lengthFactor(baseUnit, unit);
  const unitLabel = unit === 'u' ? 'u' : unit;
  const fmt = (n: number) => formatMeasure(n);
  const measureDist = measurePts.length === 2 ? segLen(measurePts[0], measurePts[1]) : null;
  const dispDist = measureDist !== null ? measureDist * lenFactor : null;
  const areaValue = areaPts.length >= 3 ? polygonArea(areaPts) : null;
  const dispArea = areaValue !== null ? areaValue * lenFactor * lenFactor : null;
  const areaPerim = areaPts.length >= 2 ? polygonPerimeter(areaPts, areaClosed) : null;
  const dispPerim = areaPerim !== null ? areaPerim * lenFactor : null;
  const areaCentroid = polyCentroid(areaPts);

  const selected = comments.find((c) => c.id === selectedId) ?? null;
  const btn = (active: boolean) => `rounded-md px-3 py-1 text-sm ${active ? 'bg-violet-600 text-white' : 'bg-white/10 hover:bg-white/20'}`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900">
      <div className="flex items-center justify-between bg-slate-800 px-3 py-2 text-white">
        <span className="truncate text-sm font-medium max-w-[34%]">{fileName}</span>
        <div className="flex items-center gap-1.5 flex-wrap">
          {canMeasure ? (
            <>
              <button className={btn(tool === 'pan')} onClick={() => { setTool('pan'); resetTools(); }}><Hand size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} />Naviguer</button>
              <button className={btn(tool === 'measure')} onClick={() => { setTool('measure'); resetTools(); }}><Ruler size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} />Mesurer</button>
              <button className={btn(tool === 'area')} onClick={() => { setTool('area'); resetTools(); }}><Square size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} />Superficie</button>
              <label className="ml-1 flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-sm" title="Unité de mesure">
                <span className="opacity-70">Unité</span>
                <select value={unit} onChange={(e) => setUnit(e.target.value)} className="bg-slate-700 rounded px-1 py-0.5 text-sm">
                  <option value="u">u</option><option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option><option value="in">in</option><option value="ft">ft</option>
                </select>
              </label>
            </>
          ) : (
            <span className="text-xs text-slate-300">Lecture seule</span>
          )}
          <button className="rounded-md bg-white/10 px-3 py-1 text-sm hover:bg-white/20" onClick={() => setShowPanel((s) => !s)}><Layers size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} />Commentaires ({comments.length})</button>
          <button className="rounded-md bg-white/10 px-3 py-1 text-sm hover:bg-white/20" onClick={fitView}>Ajuster</button>
          <button className="rounded-md bg-white/10 px-3 py-1 text-sm hover:bg-white/20" onClick={onClose}>Fermer</button>
        </div>
      </div>

      {canMeasure && tool === 'measure' && (
        <div className="bg-slate-700 px-3 py-1.5 text-xs text-white flex items-center gap-3 flex-wrap">
          <span>Cliquez 2 points (accrochage actif). Glissez un point pour l&apos;ajuster.</span>
          {dispDist !== null && <span className="font-semibold">Distance : {fmt(dispDist)} {unitLabel}</span>}
        </div>
      )}
      {canMeasure && tool === 'area' && (
        <div className="bg-slate-700 px-3 py-1.5 text-xs text-white flex items-center gap-3 flex-wrap">
          <span>Cliquez les sommets (≥ 3), puis « Terminer » ou cliquez le 1er point.</span>
          {dispArea !== null && <span className="font-semibold">Surface : {fmt(dispArea)} {unitLabel}²</span>}
          {dispPerim !== null && <span>Périmètre : {fmt(dispPerim)} {unitLabel}</span>}
          {areaPts.length >= 3 && !areaClosed && <button className="underline" onClick={() => setAreaClosed(true)}>Terminer</button>}
          {areaPts.length > 0 && <button className="underline" onClick={() => { setAreaPts([]); setAreaClosed(false); }}>Effacer</button>}
        </div>
      )}

      <div className="relative flex flex-1 overflow-hidden">
        <div ref={containerRef} className="flex-1 bg-white" style={{ cursor: canMeasure && tool !== 'pan' ? 'crosshair' : 'default' }} />

        <div className="pointer-events-none absolute inset-0" style={{ right: showPanel ? 340 : 0 }}>
          {comments.map((c) => {
            const s = worldToScreen(c.x, c.y); if (!s) return null;
            const col = statusColor(c.status); const active = c.id === selectedId;
            return (
              <button key={c.id} className="absolute pointer-events-auto -translate-x-1/2 -translate-y-full" style={{ left: s.px, top: s.py }} onClick={() => setSelectedId(c.id)}>
                <div className="flex flex-col items-center">
                  <div className="flex items-center justify-center rounded-full text-white text-xs font-bold shadow-lg" style={{ width: 26, height: 26, background: col, border: active ? '3px solid #fff' : '2px solid #fff' }}>{c.number}</div>
                  <span style={{ color: col, fontSize: 16, lineHeight: 1, marginTop: -2 }}>&#9660;</span>
                </div>
              </button>
            );
          })}

          {canMeasure && measurePts.length === 2 && (() => {
            const a = worldToScreen(measurePts[0].x, measurePts[0].y); const b = worldToScreen(measurePts[1].x, measurePts[1].y);
            if (!a || !b) return null; const midX = (a.px + b.px) / 2, midY = (a.py + b.py) / 2;
            return (<>
              <svg className="absolute inset-0 w-full h-full pointer-events-none"><line x1={a.px} y1={a.py} x2={b.px} y2={b.py} stroke="#2563EB" strokeWidth={2} strokeDasharray="5 4" /></svg>
              {dispDist !== null && <div className="absolute -translate-x-1/2 -translate-y-1/2 rounded bg-blue-600 px-2 py-0.5 text-xs text-white font-semibold whitespace-nowrap" style={{ left: midX, top: midY }}>{fmt(dispDist)} {unitLabel}</div>}
            </>);
          })()}
          {canMeasure && measurePts.map((p, i) => { const s = worldToScreen(p.x, p.y); if (!s) return null; return <div key={`m${i}`} {...vertexHandlers('measure', i)} className="absolute pointer-events-auto" style={{ left: s.px - 8, top: s.py - 8, width: 16, height: 16, borderRadius: 16, background: '#2563EB', border: '2px solid #fff', cursor: 'grab', touchAction: 'none' }} title="Glisser pour déplacer" />; })}

          {canMeasure && areaPts.length > 0 && (() => {
            const scr = areaPts.map((p) => worldToScreen(p.x, p.y)); if (scr.some((s) => !s)) return null;
            const pts = scr as { px: number; py: number }[]; const poly = pts.map((s) => `${s.px},${s.py}`).join(' ');
            const cen = areaCentroid ? worldToScreen(areaCentroid.x, areaCentroid.y) : null;
            return (<>
              <svg className="absolute inset-0 w-full h-full pointer-events-none">
                {(areaClosed || pts.length >= 3) && <polygon points={poly} fill="rgba(16,185,129,0.18)" stroke="#059669" strokeWidth={2} strokeDasharray={areaClosed ? undefined : '5 4'} />}
                {!areaClosed && pts.length === 2 && <polyline points={poly} fill="none" stroke="#059669" strokeWidth={2} strokeDasharray="5 4" />}
              </svg>
              {pts.map((s, i) => <div key={`a${i}`} {...vertexHandlers('area', i)} className="absolute pointer-events-auto" style={{ left: s.px - 8, top: s.py - 8, width: 16, height: 16, borderRadius: 16, background: '#059669', border: '2px solid #fff', cursor: 'grab', touchAction: 'none' }} title="Glisser pour déplacer" />)}
              {dispArea !== null && cen && <div className="absolute -translate-x-1/2 -translate-y-1/2 rounded bg-emerald-600 px-2 py-0.5 text-xs text-white font-semibold whitespace-nowrap" style={{ left: cen.px, top: cen.py }}>{fmt(dispArea)} {unitLabel}&sup2;</div>}
            </>);
          })()}

          {canMeasure && snapHover && tool !== 'pan' && (() => { const s = worldToScreen(snapHover.x, snapHover.y); if (!s) return null; return (
            <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden>
              <g stroke="#16A34A" strokeWidth={1.5}>
                <line x1={s.px - 22} y1={s.py} x2={s.px + 22} y2={s.py} />
                <line x1={s.px} y1={s.py - 22} x2={s.px} y2={s.py + 22} />
                <rect x={s.px - 6} y={s.py - 6} width={12} height={12} fill="rgba(22,163,74,0.20)" />
              </g>
            </svg>
          ); })()}
        </div>

        {/* Réticule tactile central + confirmation (mobile) */}
        {canMeasure && isTouch && tool !== 'pan' && (
          <>
            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <svg width="52" height="52" viewBox="0 0 52 52"><g stroke="#7C3AED" strokeWidth="1.5" fill="none" opacity="0.85"><line x1="26" y1="6" x2="26" y2="20" /><line x1="26" y1="32" x2="26" y2="46" /><line x1="6" y1="26" x2="20" y2="26" /><line x1="32" y1="26" x2="46" y2="26" /><circle cx="26" cy="26" r="3" /></g></svg>
            </div>
            <div className="absolute inset-x-0 bottom-3 z-30 flex items-center justify-center gap-2 px-3">
              {tool === 'measure' && <button onClick={placeCenterPoint} disabled={measurePts.length >= 2} className="rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-40" style={{ minHeight: 44 }}>＋ Point ({measurePts.length}/2)</button>}
              {tool === 'area' && !areaClosed && <button onClick={placeCenterPoint} className="rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white" style={{ minHeight: 44 }}>＋ Point ({areaPts.length})</button>}
              {tool === 'area' && areaPts.length >= 3 && !areaClosed && <button onClick={() => setAreaClosed(true)} className="rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white" style={{ minHeight: 44 }}>Fermer</button>}
            </div>
          </>
        )}

        {showPanel && (
          <div className="absolute inset-0 z-40 overflow-y-auto bg-slate-50 md:static md:inset-auto md:z-auto md:w-[340px] md:shrink-0 md:border-l md:border-slate-700">
            {selected ? (
              <div className="p-3">
                <button className="text-xs text-slate-500 hover:underline mb-2" onClick={() => setSelectedId(null)}>← Liste</button>
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center rounded-full text-white text-[11px] font-bold" style={{ width: 20, height: 20, background: statusColor(selected.status) }}>{selected.number}</span>
                  <h3 className="text-sm font-semibold text-slate-800">{selected.title || 'Commentaire'}</h3>
                </div>
                <p className="mt-1 text-xs text-slate-600 whitespace-pre-wrap">{selected.text}</p>
                <div className="mt-2 flex items-center gap-2 text-[11px]">
                  <span className="px-1.5 py-0.5 rounded text-white" style={{ background: statusColor(selected.status) }}>{statusLabel(selected.status)}</span>
                  <span className="text-slate-400">par {selected.author.firstName} {selected.author.lastName}</span>
                </div>
                <button className="mt-2 text-xs text-violet-600 hover:underline" onClick={() => centerOn(selected.x, selected.y)}>Centrer sur le plan</button>
                <div className="mt-3">
                  <p className="text-[10px] uppercase text-slate-400 mb-1">Discussion ({selected.replies.length})</p>
                  {selected.replies.length === 0 && <p className="text-xs text-slate-400">Aucune réponse.</p>}
                  <div className="space-y-1.5">
                    {selected.replies.map((r) => (
                      <div key={r.id} className="rounded bg-white shadow-sm p-2">
                        <p className="text-xs text-slate-700 whitespace-pre-wrap">{r.body}</p>
                        <p className="text-[10px] text-slate-400 mt-1">{r.author.firstName} {r.author.lastName} · {new Date(r.createdAt).toLocaleString('fr-FR')}</p>
                      </div>
                    ))}
                  </div>
                  {selected.attachments.length > 0 && (
                    <p className="mt-2 text-[11px] text-slate-500">{selected.attachments.length} pièce(s) jointe(s)</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-3">
                <p className="text-sm font-semibold text-slate-700 mb-2">Commentaires ({comments.length})</p>
                {comments.length === 0 && <p className="text-xs text-slate-400 mt-4 text-center">Aucun commentaire partagé.</p>}
                <ul className="space-y-1.5">
                  {comments.map((c) => (
                    <li key={c.id}>
                      <button className="w-full text-left rounded-lg bg-white shadow-sm p-2 hover:ring-2 hover:ring-violet-200" onClick={() => { setSelectedId(c.id); centerOn(c.x, c.y); }}>
                        <div className="flex items-center gap-2">
                          <span className="flex items-center justify-center rounded-full text-white text-[10px] font-bold shrink-0" style={{ width: 18, height: 18, background: statusColor(c.status) }}>{c.number}</span>
                          <span className="text-xs font-medium text-slate-800 truncate flex-1">{c.title || c.text}</span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-400">
                          <span>{STATUS_META[c.status].label}</span>
                          <span>· {c.author.firstName} {c.author.lastName}</span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
