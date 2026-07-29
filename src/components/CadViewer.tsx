'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { toDxfObjectUrl } from '@/lib/cad';
import { SnapIndex } from '@/lib/snap';
import { SegmentIndex, segmentsFromFloat32, snap as snapSegments, applyOrtho, type SnapType } from '@/lib/snapEngine';
import { quickMeasure, type QuickResult } from '@/lib/quickMeasure';
import {
  UNIT_MM, unitFromInsUnits, lengthFactor, distance as segLen,
  polygonArea, polygonPerimeter, centroid as polyCentroid, formatMeasure,
} from '@/lib/cadMeasure';
import {
  STATUS_META, STATUS_ORDER, PRIORITY_META, PRIORITY_ORDER,
  statusColor, statusLabel, eventLabel,
  type CadStatus, type CadPriority,
} from '@/lib/cadStatus';

interface Person { id: string; firstName: string; lastName: string }
interface Reply { id: string; body: string; createdAt: string; author: Person }
interface CadEvent { id: string; type: string; meta: unknown; createdAt: string; actor: Person }
interface Attachment { id: string; kind: 'PHOTO' | 'PDF'; name: string; mimeType: string; sizeBytes: number; createdAt: string }
interface Comment {
  id: string; number: number; x: number; y: number;
  title: string | null; text: string; priority: CadPriority; status: CadStatus; color: string;
  assigneeId: string | null; dueDate: string | null; createdAt: string; updatedAt: string;
  author: Person; assignee: Person | null;
  replies: Reply[]; events: CadEvent[]; attachments: Attachment[];
}
interface Measurement {
  id: string; kind: 'DISTANCE' | 'AREA'; points: { x: number; y: number }[];
  unit: string; distance: number | null; area: number | null; perimeter: number | null;
  label: string | null; author: Person; createdAt: string;
}

interface LayerItem { name: string; displayName: string; color: number; visible: boolean }
type Tool = 'pan' | 'measure' | 'annotate' | 'area' | 'quick';
type Pt = { x: number; y: number };

// Conversion d'unités & géométrie : fonctions pures testées dans '@/lib/cadMeasure'.

interface Props {
  fileId: string; fileName: string; token: string;
  canAnnotate?: boolean; onClose: () => void;
}

export default function CadViewer({ fileId, fileName, token, canAnnotate = true, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const THREERef = useRef<any>(null);
  const snapIndexRef = useRef<SnapIndex | null>(null);
  const segIndexRef = useRef<SegmentIndex | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState('Chargement…');
  const [tool, setTool] = useState<Tool>('pan');
  const toolRef = useRef<Tool>('pan');
  useEffect(() => { toolRef.current = tool; }, [tool]);
  const [isTouch, setIsTouch] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);
  const isTouchRef = useRef(false);
  useEffect(() => { isTouchRef.current = isTouch; }, [isTouch]);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mqT = window.matchMedia('(pointer: coarse)');
    const mqN = window.matchMedia('(max-width: 767px)');
    const upd = () => { setIsTouch(mqT.matches); setIsNarrow(mqN.matches); };
    upd();
    mqT.addEventListener('change', upd); mqN.addEventListener('change', upd);
    return () => { mqT.removeEventListener('change', upd); mqN.removeEventListener('change', upd); };
  }, []);
  const [, setTick] = useState(0);
  const [showLayers, setShowLayers] = useState(false);
  const [layers, setLayers] = useState<LayerItem[]>([]);

  // Mesure en cours
  const [measurePts, setMeasurePts] = useState<Pt[]>([]);
  const measurePtsRef = useRef<Pt[]>([]);
  useEffect(() => { measurePtsRef.current = measurePts; }, [measurePts]);
  const [unit, setUnit] = useState('u');
  const [baseUnit, setBaseUnit] = useState('u');

  // Superficie en cours
  const [areaPts, setAreaPts] = useState<Pt[]>([]);
  const areaPtsRef = useRef<Pt[]>([]);
  useEffect(() => { areaPtsRef.current = areaPts; }, [areaPts]);
  const [areaClosed, setAreaClosed] = useState(false);
  const areaClosedRef = useRef(false);
  useEffect(() => { areaClosedRef.current = areaClosed; }, [areaClosed]);

  // Mesures persistées (§16)
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Accrochage
  const [snapHover, setSnapHover] = useState<{ x: number; y: number; type: SnapType } | null>(null);
  const [measureCursor, setMeasureCursor] = useState<Pt | null>(null);
  const [quickResult, setQuickResult] = useState<{ res: QuickResult; cursor: Pt } | null>(null);

  // Collaboration : commentaires-fiches
  const [comments, setComments] = useState<Comment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showPanel, setShowPanel] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'ALL' | CadStatus>('ALL');
  const [members, setMembers] = useState<Person[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [attUrls, setAttUrls] = useState<Record<string, string>>({});

  // Brouillon de commentaire (formulaire)
  const [draft, setDraft] = useState<{ x: number; y: number } | null>(null);
  const [dTitle, setDTitle] = useState('');
  const [dText, setDText] = useState('');
  const [dPriority, setDPriority] = useState<CadPriority>('NORMAL');
  const [dAssignee, setDAssignee] = useState('');
  const [dDue, setDDue] = useState('');
  const [busy, setBusy] = useState(false);

  const authHeaders = useCallback(
    (json = false): HeadersInit => ({
      Authorization: `Bearer ${token}`,
      ...(json ? { 'Content-Type': 'application/json' } : {}),
    }),
    [token],
  );

  const cleanup = useCallback(() => {
    try { viewerRef.current?.Destroy?.(); } catch { /* noop */ }
    viewerRef.current = null;
    if (objectUrlRef.current) { URL.revokeObjectURL(objectUrlRef.current); objectUrlRef.current = null; }
  }, []);

  // Coord monde -> pixel dans l'overlay
  const worldToScreen = useCallback((x: number, y: number): { px: number; py: number } | null => {
    const v = viewerRef.current; const THREE = THREERef.current; const cont = containerRef.current;
    if (!v || !THREE || !cont) return null;
    try {
      const origin = v.GetOrigin();
      const cam = v.GetCamera();
      const p = new THREE.Vector3(x - origin.x, y - origin.y, 0).project(cam);
      return { px: (p.x * 0.5 + 0.5) * cont.clientWidth, py: (-p.y * 0.5 + 0.5) * cont.clientHeight };
    } catch { return null; }
  }, []);

  // Pixel -> coord monde
  const screenToWorld = useCallback((px: number, py: number): Pt | null => {
    const v = viewerRef.current; const THREE = THREERef.current; const cont = containerRef.current;
    if (!v || !THREE || !cont) return null;
    try {
      const origin = v.GetOrigin();
      const cam = v.GetCamera();
      const ndcX = (px / cont.clientWidth) * 2 - 1;
      const ndcY = -((py / cont.clientHeight) * 2 - 1);
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

  const snapResolve = useCallback((p: Pt): { x: number; y: number; type: SnapType } => {
    const wpp = worldPerPixel();
    const tol = (wpp ?? 1) * 14;
    if (segIndexRef.current) {
      const cand = segIndexRef.current.query(p.x, p.y, tol);
      if (cand.length > 0) { const r = snapSegments(cand, p, tol); if (r.type !== 'NONE') return { x: r.x, y: r.y, type: r.type }; }
    }
    if (snapIndexRef.current && wpp) { const hit = snapIndexRef.current.nearest(p.x, p.y, tol); if (hit) return { x: hit.x, y: hit.y, type: 'ENDPOINT' }; }
    return { x: p.x, y: p.y, type: 'NONE' };
  }, [worldPerPixel]);
  const snapWorld = useCallback((p: Pt): Pt => {
    const r = snapResolve(p);
    if (r.type !== 'NONE') return { x: r.x, y: r.y };
    const t = toolRef.current;
    const mp = measurePtsRef.current, ap = areaPtsRef.current;
    const from = t === 'measure' && mp.length === 1 ? mp[0] : (t === 'area' && ap.length >= 1 && !areaClosedRef.current ? ap[ap.length - 1] : null);
    if (from) { const o = applyOrtho(from, p); if (o.locked) return { x: o.x, y: o.y }; }
    return p;
  }, [snapResolve]);

  // Recentre la vue sur un point monde en conservant le zoom courant.
  const centerOn = useCallback((x: number, y: number) => {
    const v = viewerRef.current; const cont = containerRef.current;
    const wpp = worldPerPixel();
    if (!v || !cont || !wpp) return;
    const hw = (wpp * cont.clientWidth) / 2;
    const hh = (wpp * cont.clientHeight) / 2;
    try { v.FitView(x - hw, x + hw, y - hh, y + hh, 0); } catch { /* noop */ }
  }, [worldPerPixel]);

  // Chargement du plan + données collaboratives
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true); setError(null); setPhase('Téléchargement du plan…');
        const res = await fetch(`/api/file-proxy/${fileId}?token=${encodeURIComponent(token)}`);
        if (!res.ok) throw new Error('Téléchargement du fichier impossible');
        const blob = await res.blob();

        setPhase('Conversion DWG…');
        const { url, snapPoints, segments, insUnits } = await toDxfObjectUrl(blob, fileName);
        if (cancelled) { URL.revokeObjectURL(url); return; }
        objectUrlRef.current = url;
        snapIndexRef.current = snapPoints.length > 0 ? new SnapIndex(snapPoints) : null;
        segIndexRef.current = segments.length > 0 ? new SegmentIndex(segmentsFromFloat32(segments)) : null;
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
        // §mobile : le navigateur ne doit jamais gerer le pinch/pan en meme temps qu'OrbitControls
        try { const cv = viewer.GetCanvas?.(); if (cv) cv.style.touchAction = 'none'; } catch { /* noop */ }
        await viewer.Load({ url, fonts: ['/cad/DejaVuSans.ttf'] });
        if (cancelled) return;

        const ls: LayerItem[] = [];
        for (const l of viewer.GetLayers()) ls.push({ name: l.name, displayName: l.displayName ?? l.name, color: l.color, visible: true });
        setLayers(ls);

        viewer.Subscribe('pointerup', (ev: { detail?: { position?: { x: number; y: number } } }) => {
          const pos = ev?.detail?.position;
          if (!pos) return;
          const origin = viewer.GetOrigin();
          const world = snapWorld({ x: pos.x + origin.x, y: pos.y + origin.y });
          const t = toolRef.current;
          if (isTouchRef.current) return; // tactile : placement via réticule + bouton (pas au tap, pour ne pas gêner le pan)
          if (t === 'measure') {
            const cur = measurePtsRef.current;
            setMeasurePts(cur.length >= 2 ? [world] : [...cur, world]);
          } else if (t === 'annotate') {
            setDraft(world); setDTitle(''); setDText(''); setDPriority('NORMAL'); setDAssignee(''); setDDue('');
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

        // Données collaboratives
        try {
          const cr = await fetch(`/api/files/${fileId}/comments`, { headers: authHeaders() });
          const cd = await cr.json() as { data?: { comments?: Comment[]; projectId?: string; cadUnit?: string; canManage?: boolean } };
          if (!cancelled && cd.data) {
            setComments(cd.data.comments ?? []);
            setProjectId(cd.data.projectId ?? null);
            setCanManage(!!cd.data.canManage);
            if (cd.data.cadUnit && detected === 'u') { setBaseUnit(cd.data.cadUnit); setUnit(cd.data.cadUnit); }
            else if (cd.data.cadUnit) setUnit(cd.data.cadUnit);
            if (cd.data.projectId) {
              try {
                const mr = await fetch(`/api/projects/${cd.data.projectId}/members`, { headers: authHeaders() });
                const md = await mr.json() as { data?: { members?: { user: Person }[] } };
                if (!cancelled) setMembers((md.data?.members ?? []).map((m) => m.user));
              } catch { /* membres optionnels */ }
            }
          }
        } catch { /* commentaires optionnels */ }
        try {
          const mr = await fetch(`/api/files/${fileId}/measurements`, { headers: authHeaders() });
          const md = await mr.json() as { data?: { measurements?: Measurement[] } };
          if (!cancelled) setMeasurements(md.data?.measurements ?? []);
        } catch { /* mesures optionnelles */ }

        setLoading(false); setPhase('');
      } catch (e) {
        if (!cancelled) { setError(e instanceof Error ? e.message : 'Erreur de lecture du plan'); setLoading(false); }
      }
    })();
    return () => { cancelled = true; cleanup(); };
  }, [fileId, fileName, token, cleanup, snapWorld, worldToScreen, authHeaders]);

  // Indicateur d'accrochage au survol
  useEffect(() => {
    const cont = containerRef.current; if (!cont) return;
    let raf = 0; let lastX = 0; let lastY = 0;
    const process = () => {
      raf = 0;
      const t = toolRef.current;
      if (t === 'pan') { setSnapHover((prev) => (prev ? null : prev)); setMeasureCursor(null); return; }
      const rect = cont.getBoundingClientRect();
      const world = screenToWorld(lastX - rect.left, lastY - rect.top);
      if (!world) return;
      const typed = snapResolve(world);
      const placed = snapWorld(world);
      setSnapHover({ x: placed.x, y: placed.y, type: typed.type });
      const mp = measurePtsRef.current;
      setMeasureCursor(t === 'measure' && mp.length === 1 ? placed : null);
      if (t === 'quick' && segIndexRef.current) {
        const rad = (worldPerPixel() ?? 1) * Math.max(cont.clientWidth, cont.clientHeight);
        setQuickResult({ res: quickMeasure(segIndexRef.current.query(world.x, world.y, rad), world), cursor: world });
      } else { setQuickResult((prev) => (prev ? null : prev)); }
    };
    const onMove = (e: MouseEvent) => { lastX = e.clientX; lastY = e.clientY; if (!raf) raf = requestAnimationFrame(process); };
    cont.addEventListener('mousemove', onMove);
    return () => { cont.removeEventListener('mousemove', onMove); if (raf) cancelAnimationFrame(raf); };
  }, [screenToWorld, worldPerPixel]);

  function toggleLayer(name: string) {
    const v = viewerRef.current; if (!v) return;
    setLayers((prev) => prev.map((l) => {
      if (l.name !== name) return l;
      const visible = !l.visible;
      try { v.ShowLayer(name, visible); } catch { /* noop */ }
      return { ...l, visible };
    }));
  }
  function fitView() { const v = viewerRef.current; if (!v) return; const b = v.GetBounds(); if (b) v.FitView(b.minX, b.maxX, b.minY, b.maxY, 0.1); }
  function resetTools() { setMeasurePts([]); setDraft(null); setAreaPts([]); setAreaClosed(false); setEditingId(null); setQuickResult(null); }
  async function saveQuick(from: Pt, to: Pt) {
    const dworld = segLen(from, to);
    try {
      const res = await fetch(`/api/files/${fileId}/measurements`, {
        method: 'POST', headers: authHeaders(true),
        body: JSON.stringify({ kind: 'DISTANCE', points: [from, to], unit, distance: dworld, label: `${fmt(dworld * lenFactor)} ${unitLabel}` }),
      });
      const d = await res.json() as { data?: Measurement };
      if (d.data) setMeasurements((prev) => [...prev, d.data as Measurement]);
    } catch { /* noop */ }
  }

  // Point au centre du viewport (avec accrochage) — pour le placement tactile.
  // --- Tactile/pointeur : 1 pointeur = CURSEUR (plan fixe) ; >=2 = navigation NATIVE. §mobile ---
  useEffect(() => {
    const cont = containerRef.current; if (!cont) return;
    const active = new Map<number, { x: number; y: number }>();
    let single: { x: number; y: number; moved: boolean } | null = null;
    let multi = false; // vrai des >=2 pointeurs, jusqu'a 0 (WAITING_FOR_ALL_TOUCHES_RELEASED)
    const placement = () => { const t = toolRef.current; return t === 'measure' || t === 'area' || t === 'quick' || (t === 'annotate' && canAnnotate); };
    const resolve = (cx: number, cy: number): { placed: Pt; type: SnapType } | null => {
      const r = cont.getBoundingClientRect(); const w = screenToWorld(cx - r.left, cy - r.top); if (!w) return null;
      return { placed: snapWorld(w), type: snapResolve(w).type };
    };
    const moveCursor = (cx: number, cy: number) => { const r = resolve(cx, cy); if (!r) return; setSnapHover({ x: r.placed.x, y: r.placed.y, type: r.type }); setMeasureCursor(toolRef.current === 'measure' && measurePtsRef.current.length === 1 ? r.placed : null); };
    const commit = (cx: number, cy: number) => {
      const r = resolve(cx, cy); if (!r) return; const w = r.placed; const t = toolRef.current;
      if (t === 'measure') setMeasurePts((c) => (c.length >= 2 ? [w] : [...c, w]));
      else if (t === 'area') { if (areaClosedRef.current) return; const c = areaPtsRef.current; if (c.length >= 3) { const sF = worldToScreen(c[0].x, c[0].y); const sC = worldToScreen(w.x, w.y); if (sF && sC && Math.hypot(sF.px - sC.px, sF.py - sC.py) <= 16) { setAreaClosed(true); return; } } setAreaPts([...c, w]); }
      else if (t === 'annotate') { setDraft(w); setDTitle(''); setDText(''); setDPriority('NORMAL'); setDAssignee(''); setDDue(''); }
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      active.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (active.size >= 2) { multi = true; single = null; return; }            // 2e doigt : navigation native, tap annule
      if (!placement()) return;
      single = { x: e.clientX, y: e.clientY, moved: false }; moveCursor(e.clientX, e.clientY);
    };
    const mv = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      if (active.has(e.pointerId)) active.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (active.size >= 2 || multi) return;                                     // navigation : curseur suspendu
      if (!single || !placement()) return;
      e.stopPropagation(); if (e.cancelable) e.preventDefault();                 // 1 doigt en mesure : on bloque le pan du plan
      if (Math.hypot(e.clientX - single.x, e.clientY - single.y) > 8) single.moved = true;
      moveCursor(e.clientX, e.clientY);
    };
    const up = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      const wasSingle = !!single && !multi && active.size === 1;
      active.delete(e.pointerId);
      if (wasSingle && single && !single.moved && placement()) commit(single.x, single.y);
      single = null;
      if (active.size === 0) multi = false;                                      // reset uniquement quand TOUT est relache
    };
    const cancel = (e: PointerEvent) => { active.delete(e.pointerId); single = null; if (active.size === 0) multi = false; };
    const cap = { capture: true } as AddEventListenerOptions;
    cont.addEventListener('pointerdown', down, cap);
    cont.addEventListener('pointermove', mv, cap);
    cont.addEventListener('pointerup', up, cap);
    cont.addEventListener('pointercancel', cancel, cap);
    // §mobile : OrbitControls (dxf-viewer) panne le plan via les evenements TOUCH,
    // pas via pointer -> on bloque le tactile a 1 doigt en mode placement.
    const capNP = { capture: true, passive: false } as AddEventListenerOptions;
    const touchGuard = (e: TouchEvent) => {
      if (!placement() || e.touches.length >= 2) return;   // >=2 doigts : navigation native
      e.stopPropagation(); if (e.cancelable) e.preventDefault();
    };
    cont.addEventListener('touchstart', touchGuard, capNP);
    cont.addEventListener('touchmove', touchGuard, capNP);
    return () => { cont.removeEventListener('pointerdown', down, cap); cont.removeEventListener('pointermove', mv, cap); cont.removeEventListener('pointerup', up, cap); cont.removeEventListener('pointercancel', cancel, cap); cont.removeEventListener('touchstart', touchGuard, capNP); cont.removeEventListener('touchmove', touchGuard, capNP); };
  }, [screenToWorld, snapWorld, snapResolve, worldToScreen, canAnnotate]);

  function centerWorld(): Pt | null {
    if (snapHover) return { x: snapHover.x, y: snapHover.y };
    const cont = containerRef.current; if (!cont) return null;
    const c = screenToWorld(cont.clientWidth / 2, cont.clientHeight / 2);
    return c ? snapWorld(c) : null;
  }
  function placeCenterPoint() {
    const p = centerWorld(); if (!p) return;
    if (tool === 'measure') setMeasurePts((cur) => (cur.length >= 2 ? [p] : [...cur, p]));
    else if (tool === 'area') { if (!areaClosed) setAreaPts((cur) => [...cur, p]); }
    else if (tool === 'annotate') { setDraft(p); setDTitle(''); setDText(''); setDPriority('NORMAL'); setDAssignee(''); setDDue(''); }
  }

  // Édition des points déjà posés : glisser un sommet le déplace (avec ré-accrochage OSNAP).
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

  // ---- Unité ----
  const lenFactor = lengthFactor(baseUnit, unit);
  const unitLabel = unit === 'u' ? 'u' : unit;
  const fmt = (n: number) => formatMeasure(n);

  async function changeUnit(u: string) {
    setUnit(u);
    if (projectId && u in UNIT_MM) {
      try { await fetch(`/api/projects/${projectId}/cad-unit`, { method: 'PATCH', headers: authHeaders(true), body: JSON.stringify({ unit: u }) }); } catch { /* noop */ }
    }
  }

  // ---- Mesures : calculs live ----
  const measureDist = measurePts.length === 2 ? segLen(measurePts[0], measurePts[1]) : null;
  const dispDist = measureDist !== null ? measureDist * lenFactor : null;
  const areaValue = areaPts.length >= 3 ? polygonArea(areaPts) : null;
  const dispArea = areaValue !== null ? areaValue * lenFactor * lenFactor : null;
  const areaCentroid = polyCentroid(areaPts);

  async function saveDistance() {
    if (measurePts.length !== 2 || measureDist === null) return;
    try {
      if (editingId) {
        const res = await fetch(`/api/files/${fileId}/measurements/${editingId}`, {
          method: 'PATCH', headers: authHeaders(true),
          body: JSON.stringify({ points: measurePts, unit, label: `${fmt(dispDist ?? 0)} ${unitLabel}` }),
        });
        const d = await res.json() as { data?: Measurement };
        if (d.data) { setMeasurements((prev) => prev.map((m) => (m.id === editingId ? d.data as Measurement : m))); setMeasurePts([]); setEditingId(null); }
        return;
      }
      const res = await fetch(`/api/files/${fileId}/measurements`, {
        method: 'POST', headers: authHeaders(true),
        body: JSON.stringify({ kind: 'DISTANCE', points: measurePts, unit, distance: measureDist, label: `${fmt(dispDist ?? 0)} ${unitLabel}` }),
      });
      const d = await res.json() as { data?: Measurement };
      if (d.data) { setMeasurements((prev) => [...prev, d.data as Measurement]); setMeasurePts([]); }
    } catch { /* noop */ }
  }
  async function saveArea() {
    if (areaValue === null) return;
    try {
      if (editingId) {
        const res = await fetch(`/api/files/${fileId}/measurements/${editingId}`, {
          method: 'PATCH', headers: authHeaders(true),
          body: JSON.stringify({ points: areaPts, unit, label: `${fmt(dispArea ?? 0)} ${unitLabel}²` }),
        });
        const d = await res.json() as { data?: Measurement };
        if (d.data) { setMeasurements((prev) => prev.map((m) => (m.id === editingId ? d.data as Measurement : m))); setAreaPts([]); setAreaClosed(false); setEditingId(null); }
        return;
      }
      const res = await fetch(`/api/files/${fileId}/measurements`, {
        method: 'POST', headers: authHeaders(true),
        body: JSON.stringify({ kind: 'AREA', points: areaPts, unit, area: areaValue, perimeter: polygonPerimeter(areaPts, true), label: `${fmt(dispArea ?? 0)} ${unitLabel}²` }),
      });
      const d = await res.json() as { data?: Measurement };
      if (d.data) { setMeasurements((prev) => [...prev, d.data as Measurement]); setAreaPts([]); setAreaClosed(false); }
    } catch { /* noop */ }
  }
  async function deleteMeasurement(id: string) {
    try { await fetch(`/api/files/${fileId}/measurements/${id}`, { method: 'DELETE', headers: authHeaders() }); setMeasurements((p) => p.filter((m) => m.id !== id)); } catch { /* noop */ }
  }

  // ---- Commentaires ----
  const selected = comments.find((c) => c.id === selectedId) ?? null;

  async function createComment() {
    if (!draft || !dText.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/files/${fileId}/comments`, {
        method: 'POST', headers: authHeaders(true),
        body: JSON.stringify({ x: draft.x, y: draft.y, title: dTitle.trim() || undefined, text: dText.trim(), priority: dPriority, assigneeId: dAssignee || undefined, dueDate: dDue || undefined }),
      });
      const d = await res.json() as { data?: Comment };
      if (d.data) { setComments((prev) => [...prev, d.data as Comment]); setSelectedId(d.data.id); setDraft(null); }
    } catch { /* noop */ } finally { setBusy(false); }
  }

  async function patchComment(id: string, body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/files/${fileId}/comments/${id}`, { method: 'PATCH', headers: authHeaders(true), body: JSON.stringify(body) });
      const d = await res.json() as { data?: Comment };
      if (d.data) setComments((prev) => prev.map((c) => (c.id === id ? { ...c, ...(d.data as Comment) } : c)));
    } catch { /* noop */ } finally { setBusy(false); }
  }

  async function reloadComment(id: string) {
    try {
      const res = await fetch(`/api/files/${fileId}/comments/${id}`, { headers: authHeaders() });
      const d = await res.json() as { data?: Comment };
      if (d.data) setComments((prev) => prev.map((c) => (c.id === id ? (d.data as Comment) : c)));
    } catch { /* noop */ }
  }

  async function addReply(id: string, text: string) {
    if (!text.trim()) return;
    try {
      await fetch(`/api/files/${fileId}/comments/${id}/replies`, { method: 'POST', headers: authHeaders(true), body: JSON.stringify({ body: text.trim() }) });
      await reloadComment(id);
    } catch { /* noop */ }
  }

  async function uploadAttachment(id: string, file: File) {
    setBusy(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      await fetch(`/api/files/${fileId}/comments/${id}/attachments`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      await reloadComment(id);
    } catch { /* noop */ } finally { setBusy(false); }
  }
  async function deleteAttachment(id: string, attId: string) {
    try { await fetch(`/api/files/${fileId}/comments/${id}/attachments/${attId}`, { method: 'DELETE', headers: authHeaders() }); await reloadComment(id); } catch { /* noop */ }
  }
  async function loadAttUrl(id: string, att: Attachment) {
    if (attUrls[att.id]) return;
    try {
      const res = await fetch(`/api/files/${fileId}/comments/${id}/attachments/${att.id}`, { headers: authHeaders() });
      const d = await res.json() as { data?: { url?: string } };
      if (d.data?.url) setAttUrls((prev) => ({ ...prev, [att.id]: d.data!.url as string }));
    } catch { /* noop */ }
  }
  async function deleteComment(id: string) {
    if (!confirm('Supprimer ce commentaire et tout son historique ?')) return;
    try { await fetch(`/api/files/${fileId}/comments/${id}`, { method: 'DELETE', headers: authHeaders() }); setComments((p) => p.filter((c) => c.id !== id)); if (selectedId === id) setSelectedId(null); } catch { /* noop */ }
  }

  // Rapport de suivi (§15) : document imprimable / exportable en PDF.
  function genReport() {
    const total = comments.length;
    const by = (st: CadStatus) => comments.filter((c) => c.status === st).length;
    const esc = (t: string) => t.replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m] as string));
    const rows = comments.map((c) => `<tr>
      <td>#${c.number}</td>
      <td>${esc(c.title || '')}<div class="d">${esc(c.text)}</div></td>
      <td><span class="b" style="background:${statusColor(c.status)}">${statusLabel(c.status)}</span></td>
      <td>${PRIORITY_META[c.priority].label}</td>
      <td>${esc(c.author.firstName + ' ' + c.author.lastName)}</td>
      <td>${c.assignee ? esc(c.assignee.firstName + ' ' + c.assignee.lastName) : '—'}</td>
      <td>${c.dueDate ? new Date(c.dueDate).toLocaleDateString('fr-FR') : '—'}</td>
      <td>${c.replies.length} rép. · ${c.attachments.length} PJ</td>
    </tr>`).join('');
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Rapport de suivi — ${esc(fileName)}</title>
      <style>
        body{font-family:system-ui,Arial,sans-serif;color:#1e293b;margin:32px}
        h1{font-size:20px;margin:0 0 4px} .sub{color:#64748b;font-size:12px;margin-bottom:16px}
        .stats{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px}
        .card{border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;font-size:12px}
        .card b{display:block;font-size:20px}
        table{width:100%;border-collapse:collapse;font-size:11px}
        th,td{border:1px solid #e2e8f0;padding:6px;text-align:left;vertical-align:top}
        th{background:#f8fafc} .d{color:#64748b;margin-top:2px} .b{color:#fff;padding:1px 6px;border-radius:4px;font-size:10px}
        @media print{body{margin:0}}
      </style></head><body>
      <h1>Rapport de suivi des commentaires</h1>
      <div class="sub">Plan : ${esc(fileName)} — généré le ${new Date().toLocaleString('fr-FR')}</div>
      <div class="stats">
        <div class="card"><b>${total}</b>Total</div>
        <div class="card"><b>${by('OPEN')}</b>Ouverts</div>
        <div class="card"><b>${by('IN_PROGRESS')}</b>En cours</div>
        <div class="card"><b>${by('RESOLVED') + by('VALIDATED')}</b>Résolus</div>
        <div class="card"><b>${by('CLOSED') + by('ARCHIVED')}</b>Clôturés</div>
      </div>
      <table><thead><tr><th>N°</th><th>Titre / description</th><th>Statut</th><th>Priorité</th><th>Auteur</th><th>Responsable</th><th>Échéance</th><th>Suivi</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="8">Aucun commentaire.</td></tr>'}</tbody></table>
      <script>window.onload=function(){setTimeout(function(){window.print()},300)}</script>
      </body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  }

  const placementTool = tool === 'measure' || tool === 'area' || tool === 'annotate';
  const btn = (active: boolean) => `rounded-md px-3 ${isTouch ? 'py-2' : 'py-1'} text-sm ${active ? 'bg-white text-slate-900' : 'bg-white/10 text-white hover:bg-white/20'}`;
  const visibleComments = comments.filter((c) => statusFilter === 'ALL' || c.status === statusFilter);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900">
      {/* Barre d'outils */}
      <div className="flex items-center justify-between bg-slate-800 px-3 py-2 text-white">
        <span className="truncate text-sm font-medium max-w-[22%]">{fileName}</span>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button className={btn(tool === 'pan')} onClick={() => { setTool('pan'); resetTools(); }}>✋ Naviguer</button>
          <button className={btn(tool === 'measure')} onClick={() => { setTool('measure'); resetTools(); }}>📏 Mesurer</button>
          <button className={btn(tool === 'area')} onClick={() => { setTool('area'); resetTools(); }}>📐 Superficie</button>
          <button className={btn(tool === 'quick')} onClick={() => { setTool('quick'); resetTools(); }}>⚡ Mesure rapide</button>
          {canAnnotate && <button className={btn(tool === 'annotate')} onClick={() => { setTool('annotate'); resetTools(); }}>💬 Commenter</button>}
          <label className="ml-1 flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-sm" title="Unité de mesure — modifiable à tout moment">
            <span className="opacity-70">Unité</span>
            <select value={unit} onChange={(e) => void changeUnit(e.target.value)} className="bg-slate-700 rounded px-1 py-0.5 text-sm">
              <option value="u">u</option><option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option><option value="in">in</option><option value="ft">ft</option>
            </select>
          </label>
          <button className="rounded-md bg-white/10 px-3 py-1 text-sm hover:bg-white/20" onClick={() => setShowPanel((s) => !s)}>🗂️ Commentaires ({comments.length})</button>
          <button className="rounded-md bg-white/10 px-3 py-1 text-sm hover:bg-white/20" onClick={genReport}>📄 Rapport</button>
          <button className="rounded-md bg-white/10 px-3 py-1 text-sm hover:bg-white/20" onClick={fitView}>Ajuster</button>
          <button className="rounded-md bg-white/10 px-3 py-1 text-sm hover:bg-white/20" onClick={() => setShowLayers((s) => !s)}>Calques</button>
          <button className="rounded-md bg-white/10 px-3 py-1 text-sm hover:bg-white/20" onClick={onClose}>Fermer</button>
        </div>
      </div>

      {/* Bandeaux d'aide / mesures */}
      {tool === 'measure' && (
        <div className="bg-slate-700 px-3 py-1.5 text-xs text-white flex items-center gap-3 flex-wrap">
          <span>Cliquez 2 points — l&apos;accrochage aligne sur le repère le plus proche.</span>
          {measureDist !== null && (
            <>
              <span className="font-semibold">Distance : {fmt(dispDist ?? 0)} {unitLabel}</span>
              <select value={unit} onChange={(e) => changeUnit(e.target.value)} className="bg-slate-600 rounded px-1 py-0.5 text-xs">
                <option value="u">unités</option><option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option><option value="in">in</option><option value="ft">ft</option>
              </select>
              <button className="rounded bg-emerald-600 px-2 py-0.5" onClick={() => void saveDistance()}>Enregistrer</button>
              <button className="underline" onClick={() => setMeasurePts([])}>Effacer</button>
            </>
          )}
        </div>
      )}
      {tool === 'area' && (
        <div className="bg-slate-700 px-3 py-1.5 text-xs text-white flex items-center gap-3 flex-wrap">
          <span>Cliquez les sommets (≥ 3), puis « Terminer » ou cliquez le 1er point pour fermer.</span>
          {areaValue !== null && (
            <>
              <span className="font-semibold">Surface : {fmt(dispArea ?? 0)} {unitLabel}²</span>
              <select value={unit} onChange={(e) => changeUnit(e.target.value)} className="bg-slate-600 rounded px-1 py-0.5 text-xs">
                <option value="u">unités</option><option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option><option value="in">in</option><option value="ft">ft</option>
              </select>
              {areaClosed && <button className="rounded bg-emerald-600 px-2 py-0.5" onClick={() => void saveArea()}>Enregistrer</button>}
            </>
          )}
          {areaPts.length >= 3 && !areaClosed && <button className="underline" onClick={() => setAreaClosed(true)}>Terminer</button>}
          {areaPts.length > 0 && <button className="underline" onClick={() => { setAreaPts([]); setAreaClosed(false); }}>Effacer</button>}
        </div>
      )}
      {tool === 'annotate' && <div className="bg-slate-700 px-3 py-1.5 text-xs text-white">Cliquez sur le plan pour poser un commentaire (accrochage actif).</div>}
      {tool === 'quick' && <div className="bg-slate-700 px-3 py-1.5 text-xs text-white">Déplacez le curseur : les distances avec les murs s&apos;affichent automatiquement. Cliquez une distance pour l&apos;enregistrer.</div>}

      <div className="relative flex flex-1 overflow-hidden">
        <div ref={containerRef} className="flex-1 bg-white" style={{ cursor: tool === 'pan' ? 'default' : 'crosshair', touchAction: 'none' }} />

        {/* Overlay */}
        <div ref={overlayRef} className="pointer-events-none absolute inset-0" style={{ right: showPanel && !isNarrow ? 340 : (showLayers && !isNarrow ? 240 : 0) }}>
          {/* Réticule de visée tactile (§ placement mobile) */}
          {isTouch && placementTool && !draft && (() => {
            const p = centerWorld(); const s = p ? worldToScreen(p.x, p.y) : null;
            return (
              <>
                {!snapHover && (
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                    <svg width="52" height="52" viewBox="0 0 52 52"><g stroke="#7C3AED" strokeWidth="1.5" fill="none" opacity="0.85"><line x1="26" y1="6" x2="26" y2="20" /><line x1="26" y1="32" x2="26" y2="46" /><line x1="6" y1="26" x2="20" y2="26" /><line x1="32" y1="26" x2="46" y2="26" /><circle cx="26" cy="26" r="3" /></g></svg>
                  </div>
                )}
                {s && <div className="absolute" style={{ left: s.px - 7, top: s.py - 7, width: 14, height: 14, borderRadius: 14, border: '3px solid #F59E0B', background: 'rgba(245,158,11,0.3)' }} />}
              </>
            );
          })()}
          {/* Mesures persistées */}
          {measurements.map((m) => {
            const scr = m.points.map((p) => worldToScreen(p.x, p.y));
            if (scr.some((s) => !s)) return null;
            const pts = scr as { px: number; py: number }[];
            if (m.kind === 'DISTANCE' && pts.length === 2) {
              const midX = (pts[0].px + pts[1].px) / 2, midY = (pts[0].py + pts[1].py) / 2;
              return (
                <div key={m.id}>
                  <svg className="absolute inset-0 w-full h-full pointer-events-none"><line x1={pts[0].px} y1={pts[0].py} x2={pts[1].px} y2={pts[1].py} stroke="#2563EB" strokeWidth={2} /></svg>
                  <div className="absolute -translate-x-1/2 -translate-y-1/2 rounded bg-blue-600 px-2 py-0.5 text-xs text-white font-semibold whitespace-nowrap pointer-events-auto group" style={{ left: midX, top: midY }}>
                    {m.label ?? fmt((m.distance ?? 0) * lenFactor)}
                    {canManage && <button className="ml-1 opacity-0 group-hover:opacity-100" title="Éditer les points" onClick={() => { setTool('measure'); setMeasurePts(m.points); setEditingId(m.id); }}>✎</button>}
                    <button className="ml-1 opacity-0 group-hover:opacity-100" onClick={() => void deleteMeasurement(m.id)}>✕</button>
                  </div>
                </div>
              );
            }
            if (m.kind === 'AREA' && pts.length >= 3) {
              const poly = pts.map((s) => `${s.px},${s.py}`).join(' ');
              const cx = pts.reduce((s, p) => s + p.px, 0) / pts.length, cy = pts.reduce((s, p) => s + p.py, 0) / pts.length;
              return (
                <div key={m.id}>
                  <svg className="absolute inset-0 w-full h-full pointer-events-none"><polygon points={poly} fill="rgba(16,185,129,0.15)" stroke="#059669" strokeWidth={2} /></svg>
                  <div className="absolute -translate-x-1/2 -translate-y-1/2 rounded bg-emerald-600 px-2 py-0.5 text-xs text-white font-semibold whitespace-nowrap pointer-events-auto group" style={{ left: cx, top: cy }}>
                    {m.label ?? fmt((m.area ?? 0) * lenFactor * lenFactor)}
                    {canManage && <button className="ml-1 opacity-0 group-hover:opacity-100" title="Éditer les points" onClick={() => { setTool('area'); setAreaPts(m.points); setAreaClosed(true); setEditingId(m.id); }}>✎</button>}
                    <button className="ml-1 opacity-0 group-hover:opacity-100" onClick={() => void deleteMeasurement(m.id)}>✕</button>
                  </div>
                </div>
              );
            }
            return null;
          })}

          {/* Mesure live */}
          {measurePts.map((p, i) => { const s = worldToScreen(p.x, p.y); if (!s) return null; return <div key={`m${i}`} {...vertexHandlers('measure', i)} className="absolute pointer-events-auto" style={{ left: s.px - 8, top: s.py - 8, width: 16, height: 16, borderRadius: 16, background: '#2563EB', border: '2px solid #fff', cursor: 'grab', touchAction: 'none' }} title="Glisser pour déplacer ce point" />; })}
          {tool === 'measure' && measurePts.length === 1 && measureCursor && (() => {
            const a = worldToScreen(measurePts[0].x, measurePts[0].y); const b = worldToScreen(measureCursor.x, measureCursor.y);
            if (!a || !b) return null; const midX = (a.px + b.px) / 2, midY = (a.py + b.py) / 2;
            const dprev = segLen(measurePts[0], measureCursor) * lenFactor;
            return (<>
              <svg className="absolute inset-0 w-full h-full pointer-events-none"><line x1={a.px} y1={a.py} x2={b.px} y2={b.py} stroke="#2563EB" strokeWidth={1.5} strokeDasharray="4 3" /></svg>
              <div className="absolute -translate-x-1/2 -translate-y-1/2 rounded bg-blue-600 px-1.5 py-0.5 text-[11px] text-white font-semibold whitespace-nowrap pointer-events-none" style={{ left: midX, top: midY - 14 }}>{fmt(dprev)} {unitLabel}</div>
            </>);
          })()}
          {measurePts.length === 2 && (() => {
            const a = worldToScreen(measurePts[0].x, measurePts[0].y); const b = worldToScreen(measurePts[1].x, measurePts[1].y);
            if (!a || !b) return null; const midX = (a.px + b.px) / 2, midY = (a.py + b.py) / 2;
            return (<>
              <svg className="absolute inset-0 w-full h-full"><line x1={a.px} y1={a.py} x2={b.px} y2={b.py} stroke="#2563EB" strokeWidth={2} strokeDasharray="5 4" /></svg>
              {dispDist !== null && <div className="absolute -translate-x-1/2 -translate-y-1/2 rounded bg-blue-600 px-2 py-0.5 text-xs text-white font-semibold whitespace-nowrap pointer-events-auto group" style={{ left: midX, top: midY }}>{fmt(dispDist)} {unitLabel}</div>}
            </>);
          })()}

          {/* Superficie live */}
          {areaPts.length > 0 && (() => {
            const scr = areaPts.map((p) => worldToScreen(p.x, p.y)); if (scr.some((s) => !s)) return null;
            const pts = scr as { px: number; py: number }[]; const poly = pts.map((s) => `${s.px},${s.py}`).join(' ');
            const cen = areaCentroid ? worldToScreen(areaCentroid.x, areaCentroid.y) : null;
            return (<>
              <svg className="absolute inset-0 w-full h-full">
                {(areaClosed || pts.length >= 3) && <polygon points={poly} fill="rgba(16,185,129,0.18)" stroke="#059669" strokeWidth={2} strokeDasharray={areaClosed ? undefined : '5 4'} />}
                {!areaClosed && pts.length === 2 && <polyline points={poly} fill="none" stroke="#059669" strokeWidth={2} strokeDasharray="5 4" />}
              </svg>
              {pts.map((s, i) => <div key={`a${i}`} {...vertexHandlers('area', i)} className="absolute pointer-events-auto" style={{ left: s.px - 8, top: s.py - 8, width: 16, height: 16, borderRadius: 16, background: '#059669', border: '2px solid #fff', cursor: 'grab', touchAction: 'none' }} title="Glisser pour déplacer ce sommet" />)}
              {dispArea !== null && cen && <div className="absolute -translate-x-1/2 -translate-y-1/2 rounded bg-emerald-600 px-2 py-0.5 text-xs text-white font-semibold whitespace-nowrap" style={{ left: cen.px, top: cen.py }}>{fmt(dispArea)} {unitLabel}&sup2;</div>}
            </>);
          })()}

          {/* Accrochage */}
          {tool === 'quick' && quickResult && (() => {
            const c = worldToScreen(quickResult.cursor.x, quickResult.cursor.y); if (!c) return null;
            const q = quickResult.res;
            const seg = (hit: { x: number; y: number } | undefined, val: number | null) => {
              if (!hit || val == null) return null;
              const h = worldToScreen(hit.x, hit.y); if (!h) return null;
              const mx = (c.px + h.px) / 2, my = (c.py + h.py) / 2;
              return (<g key={`${hit.x.toFixed(2)},${hit.y.toFixed(2)}`}>
                <line x1={c.px} y1={c.py} x2={h.px} y2={h.py} stroke="#0EA5E9" strokeWidth={1.5} strokeDasharray="4 3" />
                <foreignObject x={mx - 34} y={my - 10} width={68} height={20} style={{ pointerEvents: 'auto' }}>
                  <button onClick={() => void saveQuick(quickResult.cursor, hit)} className="w-full rounded bg-sky-600 px-1 text-[10px] text-white hover:bg-sky-700" style={{ height: 18 }}>{fmt(val * lenFactor)} {unitLabel}</button>
                </foreignObject>
              </g>);
            };
            return (<svg className="absolute inset-0 w-full h-full pointer-events-none">
              {seg(q.points.left, q.left)}
              {seg(q.points.right, q.right)}
              {seg(q.points.up, q.up)}
              {seg(q.points.down, q.down)}
            </svg>);
          })()}
          {snapHover && tool !== 'pan' && (() => {
            const s = worldToScreen(snapHover.x, snapHover.y); if (!s) return null;
            const ty = snapHover.type;
            const col = ty === 'NONE' ? '#94A3B8' : '#16A34A';
            const label: Record<string, string> = { ENDPOINT: 'Extremite', MIDPOINT: 'Milieu', INTERSECTION: 'Intersection', CENTER: 'Centre', PERPENDICULAR: 'Perpendiculaire', ON_SEGMENT: 'Sur la ligne', NEAREST: 'Proche', NONE: '' };
            return (<>
              <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden>
                <g stroke={col} strokeWidth={1.5} fill="none">
                  <line x1={s.px - 22} y1={s.py} x2={s.px + 22} y2={s.py} /><line x1={s.px} y1={s.py - 22} x2={s.px} y2={s.py + 22} />
                  {ty === 'ENDPOINT' && <rect x={s.px - 6} y={s.py - 6} width={12} height={12} />}
                  {ty === 'MIDPOINT' && <polygon points={`${s.px},${s.py - 7} ${s.px - 7},${s.py + 6} ${s.px + 7},${s.py + 6}`} />}
                  {ty === 'INTERSECTION' && <g><line x1={s.px - 7} y1={s.py - 7} x2={s.px + 7} y2={s.py + 7} /><line x1={s.px - 7} y1={s.py + 7} x2={s.px + 7} y2={s.py - 7} /></g>}
                  {(ty === 'CENTER' || ty === 'NEAREST') && <circle cx={s.px} cy={s.py} r={7} />}
                  {ty === 'PERPENDICULAR' && <path d={`M ${s.px - 7} ${s.py} L ${s.px} ${s.py} L ${s.px} ${s.py + 7} M ${s.px - 7} ${s.py + 7} L ${s.px + 7} ${s.py + 7}`} />}
                  {ty === 'ON_SEGMENT' && <rect x={s.px - 5} y={s.py - 5} width={10} height={10} transform={`rotate(45 ${s.px} ${s.py})`} />}
                </g>
              </svg>
              {ty !== 'NONE' && <div className="absolute rounded bg-emerald-700 px-1 py-0.5 text-[10px] text-white pointer-events-none" style={{ left: s.px + 14, top: s.py + 14 }}>{label[ty]}</div>}
            </>);
          })()}

          {/* Marqueurs de commentaires (§11) */}
          {comments.map((c) => {
            const s = worldToScreen(c.x, c.y); if (!s) return null;
            const col = statusColor(c.status);
            const active = c.id === selectedId;
            return (
              <button key={c.id} className="absolute pointer-events-auto -translate-x-1/2 -translate-y-full" style={{ left: s.px, top: s.py }}
                onClick={() => setSelectedId(c.id)}>
                <div className="flex flex-col items-center">
                  <div className="flex items-center justify-center rounded-full text-white text-xs font-bold shadow-lg"
                    style={{ width: 26, height: 26, background: col, border: active ? '3px solid #fff' : '2px solid #fff', outline: active ? `2px solid ${col}` : 'none' }}>
                    {c.number}
                  </div>
                  <span style={{ color: col, fontSize: 16, lineHeight: 1, marginTop: -2 }}>&#9660;</span>
                </div>
              </button>
            );
          })}

          {/* Brouillon de commentaire */}
          {draft && (() => {
            const s = worldToScreen(draft.x, draft.y); if (!s) return null;
            return (
              <div className="absolute pointer-events-auto -translate-x-1/2 -translate-y-full" style={{ left: s.px, top: s.py }}>
                <div className="rounded-lg bg-white shadow-xl p-3 w-72 text-slate-800" style={{ borderTop: '3px solid #EF4444' }}>
                  <p className="text-xs font-semibold mb-1">Nouveau commentaire</p>
                  <input value={dTitle} onChange={(e) => setDTitle(e.target.value)} placeholder="Titre (optionnel)" className="w-full text-xs border rounded p-1 mb-1" />
                  <textarea autoFocus value={dText} onChange={(e) => setDText(e.target.value)} placeholder="Décrivez l'action à réaliser…" rows={3} className="w-full text-xs border rounded p-1 mb-1" />
                  <div className="flex gap-1 mb-1">
                    <select value={dPriority} onChange={(e) => setDPriority(e.target.value as CadPriority)} className="flex-1 text-xs border rounded p-1">
                      {PRIORITY_ORDER.map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
                    </select>
                    <input type="date" value={dDue} onChange={(e) => setDDue(e.target.value)} className="flex-1 text-xs border rounded p-1" />
                  </div>
                  {members.length > 0 && (
                    <select value={dAssignee} onChange={(e) => setDAssignee(e.target.value)} className="w-full text-xs border rounded p-1 mb-1">
                      <option value="">Responsable (optionnel)</option>
                      {members.map((m) => <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>)}
                    </select>
                  )}
                  <div className="flex gap-1">
                    <button onClick={() => void createComment()} disabled={!dText.trim() || busy} className="flex-1 rounded bg-violet-600 text-white text-xs py-1 disabled:opacity-50">Créer la fiche</button>
                    <button onClick={() => setDraft(null)} className="rounded bg-slate-200 text-slate-700 text-xs px-2 py-1">Annuler</button>
                  </div>
                </div>
                <span style={{ color: '#EF4444', fontSize: 18 }}>&#9660;</span>
              </div>
            );
          })()}
        </div>

        {/* Barre d'action de placement tactile (zone du pouce, cibles >=44px) */}
        {isTouch && placementTool && !draft && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-2xl bg-slate-800/95 px-3 py-2 shadow-2xl">
            {tool === 'measure' && (<>
              <button onClick={placeCenterPoint} disabled={measurePts.length >= 2} className="rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-40" style={{ minHeight: 44 }}>＋ Point ({measurePts.length}/2)</button>
              {measureDist !== null && <button onClick={() => void saveDistance()} className="rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white" style={{ minHeight: 44 }}>Enregistrer</button>}
              {measurePts.length > 0 && <button onClick={() => setMeasurePts([])} className="rounded-xl bg-white/10 px-3 text-sm text-white" style={{ minHeight: 44 }}>Effacer</button>}
            </>)}
            {tool === 'area' && (<>
              {!areaClosed && <button onClick={placeCenterPoint} className="rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white" style={{ minHeight: 44 }}>＋ Point ({areaPts.length})</button>}
              {areaPts.length >= 3 && !areaClosed && <button onClick={() => setAreaClosed(true)} className="rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white" style={{ minHeight: 44 }}>Fermer</button>}
              {areaClosed && <button onClick={() => void saveArea()} className="rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white" style={{ minHeight: 44 }}>Enregistrer</button>}
              {areaPts.length > 0 && <button onClick={() => { setAreaPts([]); setAreaClosed(false); }} className="rounded-xl bg-white/10 px-3 text-sm text-white" style={{ minHeight: 44 }}>Effacer</button>}
            </>)}
            {tool === 'annotate' && (
              <button onClick={placeCenterPoint} className="rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white" style={{ minHeight: 44 }}>＋ Placer le commentaire ici</button>
            )}
          </div>
        )}

        {/* Panneau latéral commentaires (§12) */}
        {showPanel && (
          <div className="absolute inset-0 z-40 overflow-y-auto bg-slate-50 md:static md:inset-auto md:z-auto md:w-[340px] md:shrink-0 md:border-l md:border-slate-700">
            {selected ? (
              <CommentDetail
                c={selected} members={members} canManage={canManage} busy={busy} attUrls={attUrls}
                onBack={() => setSelectedId(null)}
                onCenter={() => centerOn(selected.x, selected.y)}
                onStatus={(st) => void patchComment(selected.id, { status: st })}
                onAssign={(aid) => void patchComment(selected.id, { assigneeId: aid || null })}
                onReply={(t) => void addReply(selected.id, t)}
                onUpload={(f) => void uploadAttachment(selected.id, f)}
                onDeleteAtt={(attId) => void deleteAttachment(selected.id, attId)}
                onLoadAttUrl={(att) => void loadAttUrl(selected.id, att)}
                onDelete={() => void deleteComment(selected.id)}
              />
            ) : (
              <div className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-slate-700">Commentaires ({visibleComments.length})</p>
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'ALL' | CadStatus)} className="text-xs border rounded p-1 bg-white">
                    <option value="ALL">Tous</option>
                    {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                  </select>
                </div>
                {visibleComments.length === 0 && <p className="text-xs text-slate-400 mt-4 text-center">Aucun commentaire. Utilisez « 💬 Commenter » pour en créer.</p>}
                <ul className="space-y-1.5">
                  {visibleComments.map((c) => (
                    <li key={c.id}>
                      <button className="w-full text-left rounded-lg bg-white shadow-sm p-2 hover:ring-2 hover:ring-violet-200" onClick={() => { setSelectedId(c.id); centerOn(c.x, c.y); }}>
                        <div className="flex items-center gap-2">
                          <span className="flex items-center justify-center rounded-full text-white text-[10px] font-bold shrink-0" style={{ width: 18, height: 18, background: statusColor(c.status) }}>{c.number}</span>
                          <span className="text-xs font-medium text-slate-800 truncate flex-1">{c.title || c.text}</span>
                          <span className="text-[10px]" style={{ color: PRIORITY_META[c.priority].color }}>●</span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-400">
                          <span>{STATUS_META[c.status].label}</span>
                          <span>· {c.author.firstName} {c.author.lastName}</span>
                          <span>· {new Date(c.createdAt).toLocaleDateString('fr-FR')}</span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Panneau calques */}
        {showLayers && !showPanel && layers.length > 0 && (
          <div className="w-60 shrink-0 overflow-y-auto border-l border-slate-700 bg-slate-800 p-3 text-white">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Calques ({layers.length})</p>
            <ul className="space-y-1">
              {layers.map((l) => (
                <li key={l.name}>
                  <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-white/5">
                    <input type="checkbox" checked={l.visible} onChange={() => toggleLayer(l.name)} />
                    <span className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: `#${(l.color >>> 0).toString(16).padStart(6, '0').slice(-6)}` }} />
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

// ---- Volet détail d'un commentaire-fiche (discussion, historique, PJ) ----
function CommentDetail(props: {
  c: Comment; members: Person[]; canManage: boolean; busy: boolean; attUrls: Record<string, string>;
  onBack: () => void; onCenter: () => void; onStatus: (s: CadStatus) => void; onAssign: (id: string) => void;
  onReply: (t: string) => void; onUpload: (f: File) => void; onDeleteAtt: (attId: string) => void;
  onLoadAttUrl: (att: Attachment) => void; onDelete: () => void;
}) {
  const { c, members, attUrls } = props;
  const [tab, setTab] = useState<'discussion' | 'historique' | 'pj'>('discussion');
  const [reply, setReply] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => { if (tab === 'pj') c.attachments.forEach((a) => { if (a.kind === 'PHOTO') props.onLoadAttUrl(a); }); }, [tab, c.attachments, props]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b bg-white sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <button className="text-xs text-slate-500 hover:underline" onClick={props.onBack}>← Liste</button>
          <button className="text-xs text-violet-600 hover:underline" onClick={props.onCenter}>Centrer sur le plan</button>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="flex items-center justify-center rounded-full text-white text-[11px] font-bold" style={{ width: 20, height: 20, background: statusColor(c.status) }}>{c.number}</span>
          <h3 className="text-sm font-semibold text-slate-800 flex-1">{c.title || 'Commentaire'}</h3>
        </div>
        <p className="mt-1 text-xs text-slate-600 whitespace-pre-wrap">{c.text}</p>
        <div className="mt-2 flex items-center gap-2 flex-wrap text-[11px]">
          <span className="px-1.5 py-0.5 rounded" style={{ background: PRIORITY_META[c.priority].color + '22', color: PRIORITY_META[c.priority].color }}>Priorité {PRIORITY_META[c.priority].label}</span>
          {c.dueDate && <span className="text-slate-500">Échéance {new Date(c.dueDate).toLocaleDateString('fr-FR')}</span>}
          <span className="text-slate-400">par {c.author.firstName} {c.author.lastName}</span>
        </div>
        {/* Workflow statut (§7) */}
        <div className="mt-2">
          <p className="text-[10px] uppercase text-slate-400 mb-1">Statut</p>
          <div className="flex flex-wrap gap-1">
            {STATUS_ORDER.map((s) => (
              <button key={s} onClick={() => props.onStatus(s)} disabled={props.busy}
                className="text-[11px] px-2 py-0.5 rounded border"
                style={c.status === s ? { background: statusColor(s), color: '#fff', borderColor: statusColor(s) } : { color: statusColor(s), borderColor: statusColor(s) + '66' }}>
                {STATUS_META[s].label}
              </button>
            ))}
          </div>
        </div>
        {/* Responsable */}
        <div className="mt-2">
          <p className="text-[10px] uppercase text-slate-400 mb-1">Responsable</p>
          <select value={c.assigneeId ?? ''} onChange={(e) => props.onAssign(e.target.value)} className="w-full text-xs border rounded p-1 bg-white">
            <option value="">Non assigné</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>)}
          </select>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex border-b bg-slate-100 text-xs">
        {(['discussion', 'historique', 'pj'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 py-1.5 ${tab === t ? 'bg-white font-semibold text-slate-800 border-b-2 border-violet-500' : 'text-slate-500'}`}>
            {t === 'discussion' ? `Discussion (${c.replies.length})` : t === 'historique' ? 'Historique' : `Pièces jointes (${c.attachments.length})`}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {tab === 'discussion' && (<>
          {c.replies.length === 0 && <p className="text-xs text-slate-400">Aucune réponse pour l&apos;instant.</p>}
          {c.replies.map((r) => (
            <div key={r.id} className="rounded bg-white shadow-sm p-2">
              <p className="text-xs text-slate-700 whitespace-pre-wrap">{r.body}</p>
              <p className="text-[10px] text-slate-400 mt-1">{r.author.firstName} {r.author.lastName} · {new Date(r.createdAt).toLocaleString('fr-FR')}</p>
            </div>
          ))}
          <div className="flex gap-1 pt-1">
            <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Répondre…" className="flex-1 text-xs border rounded p-1"
              onKeyDown={(e) => { if (e.key === 'Enter' && reply.trim()) { props.onReply(reply); setReply(''); } }} />
            <button className="rounded bg-violet-600 text-white text-xs px-2" onClick={() => { if (reply.trim()) { props.onReply(reply); setReply(''); } }}>Envoyer</button>
          </div>
        </>)}

        {tab === 'historique' && (<>
          {c.events.length === 0 && <p className="text-xs text-slate-400">Aucun événement.</p>}
          <ul className="space-y-1.5">
            {c.events.map((e) => (
              <li key={e.id} className="text-xs text-slate-600 flex gap-2">
                <span className="text-slate-400 shrink-0">{new Date(e.createdAt).toLocaleDateString('fr-FR')}</span>
                <span>{eventLabel(e.type, e.meta)} <span className="text-slate-400">— {e.actor.firstName} {e.actor.lastName}</span></span>
              </li>
            ))}
          </ul>
        </>)}

        {tab === 'pj' && (<>
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) props.onUpload(f); e.currentTarget.value = ''; }} />
          <button className="w-full rounded border-2 border-dashed border-slate-300 py-3 text-xs text-slate-500 hover:bg-slate-100" onClick={() => fileInput.current?.click()} disabled={props.busy}>
            + Ajouter une photo ou un PDF
          </button>
          <div className="grid grid-cols-2 gap-2">
            {c.attachments.map((a) => (
              <div key={a.id} className="rounded border bg-white p-1 text-[10px] relative group">
                {a.kind === 'PHOTO' && attUrls[a.id]
                  ? <img src={attUrls[a.id]} alt={a.name} className="w-full h-20 object-cover rounded" />
                  : <div className="w-full h-20 flex items-center justify-center bg-slate-100 rounded text-2xl">{a.kind === 'PDF' ? '📄' : '🖼️'}</div>}
                <p className="truncate mt-0.5">{a.name}</p>
                <p className="text-slate-400">{(a.sizeBytes / 1024).toFixed(0)} Ko</p>
                <div className="flex gap-1 mt-0.5">
                  {attUrls[a.id] && <a href={attUrls[a.id]} target="_blank" rel="noreferrer" className="text-violet-600">Ouvrir</a>}
                  {!attUrls[a.id] && <button className="text-violet-600" onClick={() => props.onLoadAttUrl(a)}>Voir</button>}
                  <button className="text-red-500 ml-auto opacity-0 group-hover:opacity-100" onClick={() => props.onDeleteAtt(a.id)}>Suppr.</button>
                </div>
              </div>
            ))}
          </div>
        </>)}
      </div>

      <div className="p-2 border-t bg-white">
        <button className="w-full text-xs text-red-500 hover:underline" onClick={props.onDelete}>Supprimer ce commentaire</button>
      </div>
    </div>
  );
}
