'use client';
import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { uploadFileDirect } from '@/lib/upload';
import { hotspotLabel, isDirection } from '@/lib/tour';
import { buildHotspotPayload, buildReturnPayload, kindFromContent, type HotspotKind, type HotspotPayload } from '@/lib/tourHotspots';
import { qualityReport, type DirectionLink } from '@/lib/tourQuality';
import { defaultIconFor } from '@/lib/tourIcons';
import { levelForScene, type LevelLite } from '@/lib/tourMap';
import { buildShareUrl, buildEmbedCode } from '@/lib/tourShare';
import {
  emptyHistory, pushAction, canUndo, canRedo, peekUndo, peekRedo,
  commitUndo, commitRedo, invertAction, remapHotspotId, recreatePayload,
  type History, type HotspotSnapshot, type HotspotAction,
} from '@/lib/tourHistory';
import TourHotspotPanel from '@/components/TourHotspotPanel';
import TourFloorPlan from '@/components/TourFloorPlan';

interface Tour { id: string; name: string; status: string; }
interface Scene { id: string; name: string; imageUrl: string; isInitial: boolean; position: number; panoramaProxy?: string; levelId?: string | null; mapX?: number | null; mapY?: number | null; panoramaType?: string | null; stereoLayout?: string | null; hidden?: boolean; thumbnailUrl?: string | null; previewUrl?: string | null; derivStatus?: string | null; }
interface Level extends LevelLite { planUrl?: string | null; }
interface Hotspot { id: string; type: string; positionYaw: number; positionPitch: number; targetSceneId: string | null; content: Record<string, unknown>; }
interface ApiResponse<T> { data: T; success: boolean; }

declare global {
  interface Window {
    pannellum: {
      viewer: (container: string | HTMLElement, config: object) => PannellumViewer;
    };
  }
}

interface PannellumViewer {
  destroy: () => void;
  loadScene: (sceneId: string) => void;
  on: (event: string, callback: () => void) => void;
  mouseEventToCoords: (e: MouseEvent) => [number, number];
}

// Rendu du contenu d'un hotspot info (modale) selon son type fin.
function embedUrl(u: string): string | null {
  const yt = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vm = u.match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return null;
}

// §17/§18.1 — plans PDF : pdf.js chargé via <script type="module"> (imports CDN en string →
// build Vercel toujours vert). On rastérise la 1re page en PNG pour garder TourFloorPlan (image) inchangé.
const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.min.mjs';
const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.worker.min.mjs';
function loadPdfjs(): Promise<any> {
  const w = window as unknown as { __pdfjs?: any; __pdfjsPromise?: Promise<any> };
  if (w.__pdfjs) return Promise.resolve(w.__pdfjs);
  if (w.__pdfjsPromise) return w.__pdfjsPromise;
  w.__pdfjsPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.type = 'module';
    s.textContent =
      `import * as pdfjs from '${PDFJS_URL}';\n` +
      `pdfjs.GlobalWorkerOptions.workerSrc = '${PDFJS_WORKER}';\n` +
      `window.__pdfjs = pdfjs;\n` +
      `window.dispatchEvent(new Event('pdfjs-ready'));`;
    window.addEventListener('pdfjs-ready', () => resolve(w.__pdfjs), { once: true });
    s.onerror = () => reject(new Error('pdfjs-load-failed'));
    document.head.appendChild(s);
    setTimeout(() => { if (!w.__pdfjs) reject(new Error('pdfjs-timeout')); }, 15000);
  });
  return w.__pdfjsPromise;
}
async function rasterizePdfFirstPage(file: File): Promise<File> {
  const pdfjs = await loadPdfjs();
  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;
  const page = await doc.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(3, Math.max(1, 1800 / base.width)); // vise ~1800px de large
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b as Blob), 'image/png'));
  return new File([blob], (file.name.replace(/\.pdf$/i, '') || 'plan') + '.png', { type: 'image/png' });
}

export default function TourEditorPage() {
  const params = useParams();
  const id = params.id as string;
  const tourId = params.tourId as string;

  const [tour, setTour] = useState<Tour | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [currentScene, setCurrentScene] = useState<Scene | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [importStatus, setImportStatus] = useState<{ current: number; total: number } | null>(null);
  const [published, setPublished] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const [pannellumLoaded, setPannellumLoaded] = useState(false);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [addMode, setAddMode] = useState(false);
  const [draft, setDraft] = useState<{ yaw: number; pitch: number } | null>(null);
  const [infoModal, setInfoModal] = useState<Hotspot | null>(null);
  // §11.4 — placement guidé de la flèche de retour (aller-retour) sur la scène cible.
  const [pendingReturn, setPendingReturn] = useState<{ forward: HotspotPayload; sourceSceneId: string; sourceSceneName: string; targetSceneId: string } | null>(null);

  // Panneau de création de hotspot (§9) — remplace l'ancienne modale/popup.
  const [hsOpen, setHsOpen] = useState(false);
  const [hsStep, setHsStep] = useState<'type' | 'place' | 'form'>('type');
  const [hsKind, setHsKind] = useState<HotspotKind | null>(null);
  const [hsForm, setHsForm] = useState<Record<string, unknown>>({});
  const [hsErrors, setHsErrors] = useState<string[]>([]);

  // V4b — niveaux & plans 2D.
  const [levels, setLevels] = useState<Level[]>([]);
  const [showLevels, setShowLevels] = useState(false);
  const [newLevelName, setNewLevelName] = useState('');
  const [placing, setPlacing] = useState(false);
  const [planBusy, setPlanBusy] = useState<string | null>(null);

  // V6 — partage public.
  const [showShare, setShowShare] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [shareExpiry, setShareExpiry] = useState('');   // §22 — date d'expiration (YYYY-MM-DD)
  const [shareCodeVal, setShareCodeVal] = useState(''); // §22 — code d'accès facultatif

  // V6c — historique annuler/rétablir (undo/redo) des hotspots.
  const [history, setHistory] = useState<History>(() => emptyHistory());
  const [histBusy, setHistBusy] = useState(false);
  const toSnapshot = (h: Hotspot, sceneId: string): HotspotSnapshot => ({
    id: h.id, sceneId, type: h.type, positionYaw: h.positionYaw, positionPitch: h.positionPitch,
    targetSceneId: h.targetSceneId, content: h.content,
  });

  const scenesRef = useRef<Scene[]>([]);
  const addModeRef = useRef(false);
  useEffect(() => { scenesRef.current = scenes; }, [scenes]);
  useEffect(() => { addModeRef.current = addMode; }, [addMode]);

  const viewerRef = useRef<HTMLDivElement>(null);
  const pannellumInstanceRef = useRef<PannellumViewer | null>(null);

  const getToken = (): string =>
    typeof window !== 'undefined' ? localStorage.getItem('bilnov_token') ?? '' : '';

  // Charger Pannellum dynamiquement
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.pannellum) { setPannellumLoaded(true); return; }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js';
    script.onload = () => setPannellumLoaded(true);
    document.head.appendChild(script);
  }, []);

  // Viewer + hotspots (rendu Pannellum) + mode ajout par clic
  useEffect(() => {
    if (!pannellumLoaded || !currentScene?.imageUrl || !viewerRef.current) return;
    if (pannellumInstanceRef.current) { try { pannellumInstanceRef.current.destroy(); } catch { /* ignore */ } pannellumInstanceRef.current = null; }
    const hs = hotspots.map((h) => ({
      id: h.id, pitch: h.positionPitch, yaw: h.positionYaw,
      cssClass: isDirection(h.type) ? 'pnlm-hotspot bilnov-dir' : 'pnlm-hotspot bilnov-info',
      text: hotspotLabel(h.type, h.content, scenesRef.current.find((s) => s.id === h.targetSceneId)?.name),
      clickHandlerFunc: () => { if (isDirection(h.type)) { const t = scenesRef.current.find((s) => s.id === h.targetSceneId); if (t) setCurrentScene(t); } else setInfoModal(h); },
    }));
    try {
      pannellumInstanceRef.current = window.pannellum.viewer(viewerRef.current, {
        type: 'equirectangular', panorama: currentScene.previewUrl ? currentScene.previewUrl : (currentScene.panoramaProxy ? `${currentScene.panoramaProxy}?token=${getToken()}` : currentScene.imageUrl), autoLoad: true, autoRotate: 0,
        compass: false, showControls: true, showFullscreenCtrl: true, showZoomCtrl: true, mouseZoom: true,
        hfov: 100, minHfov: 50, maxHfov: 120, pitch: 0, yaw: 0, hotSpots: hs,
      });
    } catch { /* viewer init failed */ }
    const el = viewerRef.current;
    const onClick = (e: MouseEvent) => {
      if (!addModeRef.current || !pannellumInstanceRef.current) return;
      try {
        const c = pannellumInstanceRef.current.mouseEventToCoords(e);
        setDraft({ pitch: c[0], yaw: c[1] });
        setAddMode(false);
        setHsStep('form');   // le point est placé -> formulaire du type choisi
      } catch { /* noop */ }
    };
    el.addEventListener('click', onClick);
    return () => { el.removeEventListener('click', onClick); if (pannellumInstanceRef.current) { try { pannellumInstanceRef.current.destroy(); } catch { /* ignore */ } pannellumInstanceRef.current = null; } };
  }, [pannellumLoaded, currentScene?.imageUrl, currentScene?.previewUrl, hotspots]);

  useEffect(() => {
    if (!currentScene) { setHotspots([]); return; }
    void (async () => {
      try {
        const r = await fetch(`/api/projects/${id}/tours/${tourId}/scenes/${currentScene.id}/hotspots`, { headers: { Authorization: `Bearer ${getToken()}` } });
        const d = await r.json() as ApiResponse<{ hotspots: Hotspot[] }>;
        setHotspots(d.data?.hotspots ?? []);
      } catch { setHotspots([]); }
    })();
  }, [currentScene, id, tourId]);

  // --- Panneau de création de hotspot ---
  const initialFormFor = (k: HotspotKind): Record<string, unknown> => {
    const f: Record<string, unknown> = {};
    if (k === 'COMMENT') { f.status = 'NEW'; f.priority = 'NORMAL'; }
    if (k === 'URL') f.openMode = 'newTab';
    f.iconId = defaultIconFor(k); // §10 — icône par défaut selon le type (personnalisable dans le panneau)
    return f;
  };
  const openHotspotPanel = (): void => {
    setHsOpen(true); setHsStep('type'); setHsKind(null); setHsForm({}); setHsErrors([]);
    setDraft(null); setAddMode(false);
  };
  const closeHotspotPanel = (): void => {
    setHsOpen(false); setHsStep('type'); setHsKind(null); setHsForm({}); setHsErrors([]);
    setDraft(null); setAddMode(false);
  };
  const pickKind = (k: HotspotKind): void => {
    setHsKind(k); setHsForm(initialFormFor(k)); setHsErrors([]); setHsStep('place'); setAddMode(true);
  };
  const backToTypes = (): void => {
    setHsStep('type'); setHsKind(null); setHsForm({}); setHsErrors([]); setDraft(null); setAddMode(false);
  };
  const submitHotspot = async (): Promise<void> => {
    if (!hsKind || !currentScene) return;
    const res = buildHotspotPayload(hsKind, hsForm, draft);
    if (!res.ok || !res.payload) { setHsErrors(res.errors); return; }
    // §10 — personnalisation d'icône transmise à part du contenu.
    const iconFields = {
      iconId: typeof hsForm.iconId === 'string' ? hsForm.iconId : undefined,
      iconColor: typeof hsForm.iconColor === 'string' ? hsForm.iconColor : undefined,
      iconScale: typeof hsForm.iconScale === 'number' ? hsForm.iconScale : undefined,
    };
    // §14 — le hotspot Commentaire crée un vrai commentaire dans le système transversal Bilnov
    // (CommentLocation PANORAMA_360 → scène ; metadata yaw/pitch). Le hotspot ne stocke que le lien.
    let linkedCommentId: string | undefined;
    if (hsKind === 'COMMENT') {
      try {
        const title = typeof hsForm.title === 'string' ? hsForm.title : '';
        const text = typeof hsForm.text === 'string' ? hsForm.text : '';
        const description = (text.trim() || title.trim() || 'Commentaire — visite 360°');
        const cRes = await fetch(`/api/projects/${id}/comments`, {
          method: 'POST', headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title || undefined, description,
            priority: typeof hsForm.priority === 'string' ? hsForm.priority : 'NORMAL',
            locations: [{ locationType: 'PANORAMA_360', resourceType: 'tour_scene', resourceId: currentScene.id, title: currentScene.name, metadata: { tourId, yaw: draft?.yaw, pitch: draft?.pitch } }],
          }),
        });
        const cData = await cRes.json() as ApiResponse<{ id: string }>;
        if (cData.data?.id) linkedCommentId = cData.data.id;
      } catch { /* le commentaire transversal est optionnel : on n'empêche pas la pose du hotspot */ }
    }
    try {
      const r = await fetch(`/api/projects/${id}/tours/${tourId}/scenes/${currentScene.id}/hotspots`, {
        method: 'POST', headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...res.payload, ...iconFields, commentId: linkedCommentId }),
      });
      const d = await r.json() as ApiResponse<Hotspot>;
      if (d.data) {
        const created = d.data;
        setHotspots((prev) => [...prev, created]);
        setHistory((h) => pushAction(h, { kind: 'create', hotspot: toSnapshot(created, currentScene.id) }));
      }
      if (hsForm.returnLink === true && res.payload.targetSceneId) {
        // §11.4 — au lieu d'auto-placer le retour, on bascule sur la scène cible pour le positionner séparément.
        const fwd = res.payload;
        const tgt = fwd.targetSceneId as string;
        const target = scenes.find((s) => s.id === tgt) ?? null;
        setPendingReturn({ forward: fwd, sourceSceneId: currentScene.id, sourceSceneName: currentScene.name, targetSceneId: tgt });
        closeHotspotPanel();
        if (target) setCurrentScene(target);
        setDraft(null); setAddMode(true);
        return;
      }
      closeHotspotPanel();
    } catch { setHsErrors(["Erreur lors de l'enregistrement, réessayez."]); }
  };

  // §11.4 — crée la flèche de retour à la position placée (ou par défaut opposée).
  const confirmReturn = async (useDefault: boolean): Promise<void> => {
    const pr = pendingReturn; if (!pr) return;
    const ret = buildReturnPayload(pr.forward, pr.sourceSceneId, pr.sourceSceneName);
    if (!ret) { setPendingReturn(null); setAddMode(false); setDraft(null); return; }
    if (!useDefault && draft) { ret.positionYaw = draft.yaw; ret.positionPitch = draft.pitch; }
    try {
      const r = await fetch(`/api/projects/${id}/tours/${tourId}/scenes/${pr.targetSceneId}/hotspots`, {
        method: 'POST', headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...ret, iconId: 'arrow-back' }),
      });
      const d = await r.json() as ApiResponse<Hotspot>;
      if (d.data && currentScene?.id === pr.targetSceneId) {
        const created = d.data;
        setHotspots((prev) => [...prev, created]);
        setHistory((h) => pushAction(h, { kind: 'create', hotspot: toSnapshot(created, pr.targetSceneId) }));
      }
    } catch { alert('Le lien retour a échoué.'); }
    setPendingReturn(null); setAddMode(false); setDraft(null);
  };
  const cancelReturn = (): void => { setPendingReturn(null); setAddMode(false); setDraft(null); };

  const deleteHotspot = async (hid: string): Promise<void> => {
    const snap = hotspots.find((h) => h.id === hid);
    const sceneId = currentScene?.id;
    try {
      await fetch(`/api/projects/${id}/tours/${tourId}/scenes/${sceneId}/hotspots/${hid}`, { method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` } });
      setHotspots((prev) => prev.filter((h) => h.id !== hid));
      if (snap && sceneId) setHistory((h) => pushAction(h, { kind: 'delete', hotspot: toSnapshot(snap, sceneId) }));
    } catch { /* noop */ }
  };

  // V6c — applique une action côté serveur ; renvoie le nouvel id si recréation.
  const applyAction = async (a: HotspotAction): Promise<string | null> => {
    const s = a.hotspot;
    if (a.kind === 'delete') {
      await fetch(`/api/projects/${id}/tours/${tourId}/scenes/${s.sceneId}/hotspots/${s.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` } });
      if (currentScene && s.sceneId === currentScene.id) setHotspots((prev) => prev.filter((h) => h.id !== s.id));
      return null;
    }
    const r = await fetch(`/api/projects/${id}/tours/${tourId}/scenes/${s.sceneId}/hotspots`, {
      method: 'POST', headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(recreatePayload(s)),
    });
    const d = await r.json() as ApiResponse<Hotspot>;
    const created = d.data;
    if (created && currentScene && s.sceneId === currentScene.id) setHotspots((prev) => [...prev, created]);
    return created?.id ?? null;
  };

  const doUndo = async (): Promise<void> => {
    const a = peekUndo(history);
    if (!a || histBusy) return;
    setHistBusy(true);
    try {
      const inv = invertAction(a);            // annuler = appliquer l'inverse
      const newId = await applyAction(inv);
      let h = commitUndo(history);
      if (inv.kind === 'create' && newId) h = remapHotspotId(h, a.hotspot.id, newId);
      setHistory(h);
    } catch { /* noop */ } finally { setHistBusy(false); }
  };

  const doRedo = async (): Promise<void> => {
    const a = peekRedo(history);
    if (!a || histBusy) return;
    setHistBusy(true);
    try {
      const newId = await applyAction(a);     // rétablir = ré-appliquer l'action
      let h = commitRedo(history);
      if (a.kind === 'create' && newId) h = remapHotspotId(h, a.hotspot.id, newId);
      setHistory(h);
    } catch { /* noop */ } finally { setHistBusy(false); }
  };

  // V6c — raccourcis clavier : Ctrl/Cmd+Z (annuler), Ctrl/Cmd+Shift+Z ou Ctrl+Y (rétablir).
  // Ignoré pendant la saisie dans un champ (formulaire hotspot).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); void doUndo(); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); void doRedo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, histBusy, currentScene]);

  const loadScenes = async (): Promise<void> => {
    const res = await fetch(`/api/projects/${id}/tours/${tourId}/scenes`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    const data = await res.json() as ApiResponse<{ scenes: Scene[] }>;
    const list = data.data?.scenes ?? [];
    setScenes(list);
    if (list.length > 0 && !currentScene) setCurrentScene(list[0]);
  };

  // --- V4b : niveaux & plans 2D ---
  const authJson = { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' };
  const loadLevels = async (): Promise<void> => {
    try {
      const r = await fetch(`/api/projects/${id}/tours/${tourId}/levels`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const d = await r.json() as ApiResponse<{ levels: Level[] }>;
      setLevels((d.data?.levels ?? []).slice().sort((a, b) => a.position - b.position));
    } catch { /* noop */ }
  };
  const createLevel = async (): Promise<void> => {
    const name = newLevelName.trim();
    if (!name) return;
    try {
      const r = await fetch(`/api/projects/${id}/tours/${tourId}/levels`, { method: 'POST', headers: authJson, body: JSON.stringify({ name }) });
      const d = await r.json() as ApiResponse<Level>;
      if (d.data) setLevels((prev) => [...prev, d.data]);
      setNewLevelName('');
    } catch { alert('Erreur création niveau'); }
  };
  const renameLevel = async (levelId: string, name: string): Promise<void> => {
    if (!name.trim()) return;
    setLevels((prev) => prev.map((l) => l.id === levelId ? { ...l, name } : l));
    try { await fetch(`/api/projects/${id}/tours/${tourId}/levels/${levelId}`, { method: 'PATCH', headers: authJson, body: JSON.stringify({ name }) }); } catch { /* noop */ }
  };
  const deleteLevel = async (levelId: string): Promise<void> => {
    if (!confirm('Supprimer ce niveau ? Les scènes rattachées seront détachées.')) return;
    try {
      await fetch(`/api/projects/${id}/tours/${tourId}/levels/${levelId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` } });
      setLevels((prev) => prev.filter((l) => l.id !== levelId));
      setScenes((prev) => prev.map((s) => s.levelId === levelId ? { ...s, levelId: null, mapX: null, mapY: null } : s));
    } catch { alert('Erreur suppression'); }
  };
  const uploadPlan = async (levelId: string, e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    let file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPlanBusy(levelId);
    try {
      // §17 — plan PDF : rastérisation de la 1re page en PNG (DWG = conversion serveur requise, non gérée ici).
      if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
        try { file = await rasterizePdfFirstPage(file); }
        catch { alert("Impossible de convertir ce PDF en plan. Importez une image (PNG/JPG)."); setPlanBusy(null); return; }
      }
      const { storageKey } = await uploadFileDirect(file, id, getToken(), null);
      const r = await fetch(`/api/projects/${id}/tours/${tourId}/levels/${levelId}`, { method: 'PATCH', headers: authJson, body: JSON.stringify({ planImageUrl: storageKey }) });
      const d = await r.json() as ApiResponse<Level>;
      if (d.data) setLevels((prev) => prev.map((l) => l.id === levelId ? { ...l, planImageUrl: d.data.planImageUrl, planUrl: d.data.planUrl } : l));
    } catch (err) { alert(err instanceof Error ? err.message : 'Erreur upload plan'); }
    finally { setPlanBusy(null); }
  };
  const assignSceneLevel = async (sceneId: string, levelId: string | null): Promise<void> => {
    setScenes((prev) => prev.map((s) => s.id === sceneId ? { ...s, levelId, mapX: null, mapY: null } : s));
    if (currentScene?.id === sceneId) setCurrentScene((prev) => prev ? { ...prev, levelId, mapX: null, mapY: null } : null);
    try { await fetch(`/api/projects/${id}/tours/${tourId}/scenes/${sceneId}`, { method: 'PATCH', headers: authJson, body: JSON.stringify({ levelId, mapX: null, mapY: null }) }); } catch { /* noop */ }
  };
  const placeCurrentScene = async (x: number, y: number): Promise<void> => {
    if (!currentScene) return;
    const sid = currentScene.id;
    setScenes((prev) => prev.map((s) => s.id === sid ? { ...s, mapX: x, mapY: y } : s));
    setCurrentScene((prev) => prev ? { ...prev, mapX: x, mapY: y } : null);
    setPlacing(false);
    try { await fetch(`/api/projects/${id}/tours/${tourId}/scenes/${sid}`, { method: 'PATCH', headers: authJson, body: JSON.stringify({ mapX: x, mapY: y }) }); } catch { /* noop */ }
  };
  // §7 — type de panorama (mono / stéréo haut-bas / stéréo côte-à-côte) persisté par scène.
  const setScenePanorama = async (panoramaType: string, stereoLayout: string | null): Promise<void> => {
    if (!currentScene) return;
    const sid = currentScene.id;
    setScenes((prev) => prev.map((s) => s.id === sid ? { ...s, panoramaType, stereoLayout } : s));
    setCurrentScene((prev) => prev ? { ...prev, panoramaType, stereoLayout } : null);
    try { await fetch(`/api/projects/${id}/tours/${tourId}/scenes/${sid}`, { method: 'PATCH', headers: authJson, body: JSON.stringify({ panoramaType, stereoLayout }) }); } catch { /* noop */ }
  };
  // §22.2 — masquer/afficher la scène pour les visites partagées (persisté).
  const toggleSceneHidden = async (): Promise<void> => {
    if (!currentScene) return;
    const sid = currentScene.id; const next = !currentScene.hidden;
    setScenes((prev) => prev.map((s) => s.id === sid ? { ...s, hidden: next } : s));
    setCurrentScene((prev) => prev ? { ...prev, hidden: next } : null);
    try { await fetch(`/api/projects/${id}/tours/${tourId}/scenes/${sid}`, { method: 'PATCH', headers: authJson, body: JSON.stringify({ hidden: next }) }); } catch { /* noop */ }
  };

  // --- V6 : partage public ---
  const loadShare = async (): Promise<void> => {
    try {
      const r = await fetch(`/api/projects/${id}/tours/${tourId}/share`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const d = await r.json() as ApiResponse<{ isPublic: boolean; token: string | null; expiresAt?: string | null; code?: string | null }>;
      setShareToken(d.data?.isPublic ? d.data.token : null);
      setShareExpiry(d.data?.expiresAt ? d.data.expiresAt.slice(0, 10) : '');
      setShareCodeVal(d.data?.code ?? '');
    } catch { /* noop */ }
  };
  // §22 — active OU met à jour le partage (expiration + code d'accès facultatifs).
  const enableShare = async (): Promise<void> => {
    setShareBusy(true);
    try {
      const expiresAt = shareExpiry ? new Date(`${shareExpiry}T23:59:59`).toISOString() : null;
      const code = shareCodeVal.trim() || null;
      const r = await fetch(`/api/projects/${id}/tours/${tourId}/share`, { method: 'POST', headers: authJson, body: JSON.stringify({ expiresAt, code }) });
      const d = await r.json() as ApiResponse<{ token: string | null; expiresAt?: string | null; code?: string | null }>;
      setShareToken(d.data?.token ?? null);
      setShareExpiry(d.data?.expiresAt ? d.data.expiresAt.slice(0, 10) : '');
      setShareCodeVal(d.data?.code ?? '');
    } catch { alert('Erreur lors de l’activation du partage.'); }
    finally { setShareBusy(false); }
  };
  const disableShare = async (): Promise<void> => {
    if (!confirm('Désactiver le partage ? Le lien public actuel cessera de fonctionner.')) return;
    setShareBusy(true);
    try {
      await fetch(`/api/projects/${id}/tours/${tourId}/share`, { method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` } });
      setShareToken(null);
    } catch { alert('Erreur.'); }
    finally { setShareBusy(false); }
  };
  const copyText = (label: string, text: string): void => {
    try { void navigator.clipboard.writeText(text); setCopied(label); setTimeout(() => setCopied(null), 1800); } catch { /* noop */ }
  };

  useEffect(() => {
    void (async () => {
      try {
        const [tourRes, scenesRes] = await Promise.all([
          fetch(`/api/projects/${id}/tours/${tourId}`, {
            headers: { Authorization: `Bearer ${getToken()}` },
          }),
          fetch(`/api/projects/${id}/tours/${tourId}/scenes`, {
            headers: { Authorization: `Bearer ${getToken()}` },
          }),
        ]);
        const tourData = await tourRes.json() as ApiResponse<Tour>;
        const scenesData = await scenesRes.json() as ApiResponse<{ scenes: Scene[] }>;
        setTour(tourData.data);
        setPublished(tourData.data?.status === 'PUBLISHED');
        const list = scenesData.data?.scenes ?? [];
        setScenes(list);
        if (list.length > 0) setCurrentScene(list[0]);
        void loadLevels();
        void loadShare();
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, tourId]);

  // Vague 2 — déclenche la génération miniature+aperçu puis rafraîchit les URLs signées.
  const processScene = async (sceneId: string): Promise<void> => {
    setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, derivStatus: 'PROCESSING' } : s));
    try {
      const r = await fetch(`/api/projects/${id}/tours/${tourId}/scenes/${sceneId}/process`, { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` } });
      if (!r.ok) { setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, derivStatus: 'FAILED' } : s)); return; }
      const sr = await fetch(`/api/projects/${id}/tours/${tourId}/scenes`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const sd = await sr.json() as ApiResponse<{ scenes: Scene[] }>;
      const fresh = (sd.data?.scenes ?? []).find(x => x.id === sceneId);
      if (fresh) {
        const patch = { thumbnailUrl: fresh.thumbnailUrl, previewUrl: fresh.previewUrl, derivStatus: fresh.derivStatus };
        setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, ...patch } : s));
        setCurrentScene(prev => prev && prev.id === sceneId ? { ...prev, ...patch } : prev);
      }
    } catch { setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, derivStatus: 'FAILED' } : s)); }
  };

  // Vague 2 — auto-optimisation des scènes existantes (créées avant le pipeline) : une passe,
  // séquentielle (pas de rafale), pour que les visites déjà réalisées bénéficient de l'aperçu léger.
  const autoHealedRef = useRef(false);
  useEffect(() => {
    if (autoHealedRef.current || loading || scenes.length === 0) return;
    autoHealedRef.current = true;
    const todo = scenes.filter(s => !s.previewUrl && s.derivStatus !== 'READY' && s.derivStatus !== 'PROCESSING');
    if (todo.length === 0) return;
    void (async () => { for (const s of todo) { await processScene(s.id); } })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, scenes.length]);

  const handleUpload360 = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);
    const created: Scene[] = [];
    const failed: string[] = [];
    // Import séquentiel : chaque fichier a sa progression ; une erreur n'interrompt pas les autres.
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setImportStatus({ current: i + 1, total: files.length });
      setUploadProgress(0);
      try {
        const { fileId } = await uploadFileDirect(
          file, id, getToken(), null,
          (p) => setUploadProgress(p),
        );
        const sceneRes = await fetch(`/api/projects/${id}/tours/${tourId}/scenes`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileId, name: file.name.replace(/\.[^.]+$/, '') }),
        });
        const sceneData = await sceneRes.json() as ApiResponse<Scene>;
        if (sceneData.data) { const sc = sceneData.data; created.push(sc); setScenes(prev => [...prev, sc]); void processScene(sc.id); }
        else failed.push(file.name);
      } catch { failed.push(file.name); }
    }
    if (created.length > 0) setCurrentScene((cur) => cur ?? created[0]);   // sélectionne la 1re nouvelle scène si aucune active
    setUploading(false);
    setUploadProgress(0);
    setImportStatus(null);
    e.target.value = '';
    if (failed.length > 0) alert(`${failed.length} fichier(s) non importé(s) : ${failed.join(', ')}`);
  };

  const handleDeleteScene = async (sceneId: string): Promise<void> => {
    if (!confirm('Supprimer cette scène ?')) return;
    setDeletingId(sceneId);
    try {
      await fetch(`/api/projects/${id}/tours/${tourId}/scenes/${sceneId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      setScenes(prev => {
        const next = prev.filter(s => s.id !== sceneId);
        if (currentScene?.id === sceneId) setCurrentScene(next[0] ?? null);
        return next;
      });
    } catch { alert('Erreur suppression'); }
    finally { setDeletingId(null); }
  };

  const startEditing = (scene: Scene): void => {
    setEditingSceneId(scene.id);
    setEditingName(scene.name);
  };

  const saveEditing = async (): Promise<void> => {
    if (!editingSceneId || !editingName.trim()) { setEditingSceneId(null); return; }
    try {
      await fetch(`/api/projects/${id}/tours/${tourId}/scenes/${editingSceneId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingName }),
      });
      setScenes(prev => prev.map(s => s.id === editingSceneId ? { ...s, name: editingName } : s));
      if (currentScene?.id === editingSceneId) {
        setCurrentScene(prev => prev ? { ...prev, name: editingName } : null);
      }
    } catch { alert('Erreur renommage'); }
    finally { setEditingSceneId(null); }
  };

  const setAsInitial = async (sceneId: string): Promise<void> => {
    try {
      await fetch(`/api/projects/${id}/tours/${tourId}/scenes/${sceneId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ isInitial: true }),
      });
      setScenes(prev => prev.map(s => ({ ...s, isInitial: s.id === sceneId })));
    } catch { alert('Erreur'); }
  };

  const moveScene = async (sceneId: string, dir: 'up' | 'down'): Promise<void> => {
    const idx = scenes.findIndex(s => s.id === sceneId);
    if (dir === 'up' && idx === 0) return;
    if (dir === 'down' && idx === scenes.length - 1) return;
    const reordered = [...scenes];
    const t = dir === 'up' ? idx - 1 : idx + 1;
    [reordered[idx], reordered[t]] = [reordered[t], reordered[idx]];
    const withPos = reordered.map((s, i) => ({ ...s, position: i }));
    setScenes(withPos);
    try {
      await fetch(`/api/projects/${id}/tours/${tourId}/scenes/reorder`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: withPos.map(s => s.id) }),
      });
    } catch { await loadScenes(); }
  };

  // §21.2 — récupère tous les liens Direction (hotspots de toutes les scènes) pour le contrôle.
  const collectAllLinks = async (): Promise<DirectionLink[]> => {
    const links: DirectionLink[] = [];
    await Promise.all(scenes.map(async (s) => {
      try {
        const r = await fetch(`/api/projects/${id}/tours/${tourId}/scenes/${s.id}/hotspots`, { headers: { Authorization: `Bearer ${getToken()}` } });
        const d = await r.json() as ApiResponse<{ hotspots: Hotspot[] }>;
        for (const h of d.data?.hotspots ?? []) {
          if (isDirection(h.type) && h.targetSceneId) links.push({ fromSceneId: s.id, toSceneId: h.targetSceneId });
        }
      } catch { /* noop */ }
    }));
    return links;
  };

  const handlePublish = async (): Promise<void> => {
    try {
      // §21.2 — vérification bloquante avant publication (scène de départ, liens cassés, scènes inatteignables).
      if (!published) {
        const links = await collectAllLinks();
        const nodes = scenes.map((s) => ({ id: s.id, name: s.name, isInitial: s.isInitial, levelId: s.levelId ?? null, mapX: s.mapX ?? null, mapY: s.mapY ?? null }));
        const report = qualityReport(nodes, links, levels.map((l) => ({ id: l.id, name: l.name, planImageUrl: l.planUrl ?? null })));
        const errors = report.issues.filter((i) => i.level === 'error');
        if (errors.length > 0) {
          const ok = window.confirm(
            `Publication — ${errors.length} problème(s) bloquant(s) détecté(s) :\n\n`
            + errors.map((e) => '• ' + e.message).join('\n')
            + `\n\nCorrigez-les depuis « ✓ Qualité ». Publier quand même ?`
          );
          if (!ok) return;
        }
      }
      await fetch(`/api/projects/${id}/tours/${tourId}/publish`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      setPublished(true);
      setTour(prev => prev ? { ...prev, status: 'PUBLISHED' } : null);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
    } catch { alert('Erreur, reessayez.'); }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0f0f0f' }}>
        <div className="text-sm text-stone-400">Chargement...</div>
      </div>
    );
  }

  const infoKind = infoModal ? kindFromContent(infoModal.type, infoModal.content) : null;
  const currentLevel = currentScene ? levelForScene(levels, currentScene) : null;
  const currentPlanUrl = (currentLevel && levels.find((l) => l.id === currentLevel.id)?.planUrl) || null;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0f0f0f' }}>
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-stone-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link href={`/projects/${id}`} className="text-stone-400 hover:text-white transition-colors text-sm">
            ← Retour
          </Link>
          <Link href={`/projects/${id}/tours/${tourId}/view`} className="text-stone-400 hover:text-white transition-colors text-sm">👁 Voir</Link>
          <Link href={`/projects/${id}/tours/${tourId}/overview`} className="text-stone-400 hover:text-white transition-colors text-sm">✓ Qualité</Link>
          <div className="w-px h-4 bg-stone-700" />
          <span className="font-bold text-white" style={{ fontFamily: 'Syne, sans-serif' }}>
            {tour?.name}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-stone-800 text-stone-400">
            {scenes.length} scène{scenes.length !== 1 ? 's' : ''}
          </span>
          {published && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#052e16', color: '#4ade80' }}>
              ● Publié
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <button onClick={() => void doUndo()} disabled={!canUndo(history) || histBusy}
              aria-label="Annuler la dernière action (Ctrl+Z)" title="Annuler (Ctrl+Z)"
              className={`px-2.5 py-2 rounded-lg text-sm transition-colors ${canUndo(history) && !histBusy ? 'bg-stone-800 hover:bg-stone-700 text-white' : 'bg-stone-900 text-stone-600 cursor-not-allowed'}`}>↶</button>
            <button onClick={() => void doRedo()} disabled={!canRedo(history) || histBusy}
              aria-label="Rétablir (Ctrl+Maj+Z)" title="Rétablir (Ctrl+Maj+Z)"
              className={`px-2.5 py-2 rounded-lg text-sm transition-colors ${canRedo(history) && !histBusy ? 'bg-stone-800 hover:bg-stone-700 text-white' : 'bg-stone-900 text-stone-600 cursor-not-allowed'}`}>↷</button>
          </div>
          <button onClick={() => setShowLevels(true)}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-stone-800 hover:bg-stone-700 text-white transition-colors">
            🗺 Niveaux &amp; plans{levels.length > 0 ? ` (${levels.length})` : ''}
          </button>
          <button onClick={() => setShowShare(true)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${shareToken ? 'bg-emerald-700 hover:bg-emerald-600 text-white' : 'bg-stone-800 hover:bg-stone-700 text-white'}`}>
            {shareToken ? '🔗 Partagé' : '🔗 Partager'}
          </button>
          <label className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all ${uploading ? 'opacity-60 bg-stone-700 text-stone-300' : 'bg-violet-600 hover:bg-violet-500 text-white'}`}>
            {uploading ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                {importStatus ? `${importStatus.current}/${importStatus.total} · ${uploadProgress}%` : `${uploadProgress}%`}
              </span>
            ) : '+ Image 360°'}
            <input type="file" multiple className="hidden" accept="image/*"
              onChange={e => { void handleUpload360(e); }} disabled={uploading} />
          </label>
          <button onClick={() => { void handlePublish(); }}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors">
            {published ? '✓ Enregistrer les modifications' : 'Publier'}
          </button>
          {savedFlash && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#052e16', color: '#4ade80' }}>✓ Enregistré</span>
          )}
        </div>
      </header>

      {/* Progress bar */}
      {uploading && (
        <div className="h-1 bg-stone-800">
          <div className="h-1 bg-violet-500 transition-all duration-200" style={{ width: `${uploadProgress}%` }} />
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Viewer 360° */}
        <div className="flex-1 flex flex-col relative">
          {currentScene ? (
            <>
              {/* Pannellum container */}
              <div ref={viewerRef} className="flex-1" style={{ minHeight: '500px', background: '#000' }} />
              {currentScene && (
                <button onClick={openHotspotPanel} className={`absolute top-4 right-4 z-20 rounded-lg px-3 py-1.5 text-sm font-medium ${addMode ? 'bg-amber-500 text-black' : 'bg-black/60 text-white'}`}>{addMode ? 'Placement…' : '＋ Hotspot'}</button>
              )}
              {/* §7 — type de panorama de la scène courante (mono / stéréo) */}
              <div className="absolute top-4 left-4 z-20 flex items-center gap-1 rounded-lg bg-black/60 p-1 text-white">
                <span className="px-1.5 text-[10px] uppercase text-stone-400">Panorama</span>
                {([
                  { pt: 'MONO', sl: null, label: 'Mono', title: 'Panorama monoscopique' },
                  { pt: 'STEREO', sl: 'TB', label: 'Stéréo ⬍', title: 'Stéréoscopique haut/bas' },
                  { pt: 'STEREO', sl: 'SBS', label: 'Stéréo ⬌', title: 'Stéréoscopique côte à côte' },
                ] as const).map((o) => {
                  const active = (currentScene.panoramaType ?? 'MONO') === o.pt && (o.pt === 'MONO' || (currentScene.stereoLayout ?? 'TB') === o.sl);
                  return (
                    <button key={o.label} title={o.title}
                      onClick={() => void setScenePanorama(o.pt, o.sl)}
                      className={`rounded-md px-2 py-1 text-[11px] font-medium ${active ? 'bg-violet-600 text-white' : 'bg-stone-800 text-stone-300 hover:bg-stone-700'}`}>{o.label}</button>
                  );
                })}
                <span className="mx-1 h-4 w-px bg-stone-700" />
                <button onClick={() => void toggleSceneHidden()} title="Masquer cette scène dans les visites partagées (§22)"
                  className={`rounded-md px-2 py-1 text-[11px] font-medium ${currentScene.hidden ? 'bg-amber-600 text-white' : 'bg-stone-800 text-stone-300 hover:bg-stone-700'}`}>{currentScene.hidden ? '🚫 Masquée' : '👁 Visible'}</button>
              </div>

              {hotspots.length > 0 && (
                <div className="absolute bottom-4 left-4 z-20 max-h-40 w-56 overflow-y-auto rounded-lg bg-black/70 p-2 text-white">
                  <p className="mb-1 text-[10px] uppercase text-stone-400">Hotspots ({hotspots.length})</p>
                  {hotspots.map((h) => (
                    <div key={h.id} className="flex items-center justify-between py-0.5 text-xs">
                      <span className="truncate">{isDirection(h.type) ? '➤' : 'ℹ'} {hotspotLabel(h.type, h.content, scenes.find((s) => s.id === h.targetSceneId)?.name)}</span>
                      <button onClick={() => void deleteHotspot(h.id)} className="ml-2 text-stone-400 hover:text-red-400">✕</button>
                    </div>
                  ))}
                </div>
              )}

              {/* V4b — niveau de la scène courante + mini-plan (placement) */}
              {levels.length > 0 && (
                <div className="absolute bottom-4 right-4 z-20 w-64 rounded-lg bg-black/75 p-3 text-white">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-[10px] uppercase text-stone-400">Niveau</span>
                    <select
                      value={currentScene.levelId ?? ''}
                      onChange={(e) => void assignSceneLevel(currentScene.id, e.target.value || null)}
                      className="flex-1 rounded-md border border-stone-600 bg-stone-800 px-2 py-1 text-xs text-white outline-none">
                      <option value="">— Aucun —</option>
                      {levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                  {currentScene.levelId && (
                    <>
                      <button
                        onClick={() => setPlacing((p) => !p)}
                        className={`mb-2 w-full rounded-md py-1 text-xs font-medium ${placing ? 'bg-amber-500 text-black' : 'bg-violet-600 text-white hover:bg-violet-500'}`}>
                        {placing ? 'Cliquez sur le plan…' : (currentScene.mapX != null ? '↻ Repositionner sur le plan' : '＋ Placer sur le plan')}
                      </button>
                      <TourFloorPlan
                        planUrl={currentPlanUrl}
                        levelId={currentScene.levelId}
                        scenes={scenes}
                        currentSceneId={currentScene.id}
                        onMarkerClick={(sid) => { const t = scenes.find((s) => s.id === sid); if (t) setCurrentScene(t); }}
                        onPlaceClick={placing ? (x, y) => void placeCurrentScene(x, y) : undefined}
                        placingSceneName={placing ? currentScene.name : null}
                      />
                    </>
                  )}
                </div>
              )}

              {/* §11.4 — barre de placement guidé de la flèche de retour (aller-retour) */}
              {pendingReturn && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-full bg-slate-900/90 px-4 py-2.5 text-white shadow-xl backdrop-blur">
                  <span className="text-amber-400">↩</span>
                  <span className="text-sm">Placez la flèche de retour vers « {pendingReturn.sourceSceneName} »</span>
                  <button onClick={() => void confirmReturn(false)} disabled={!draft}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${draft ? 'bg-violet-600 hover:bg-violet-500' : 'bg-white/10 text-stone-400 cursor-not-allowed'}`}>Placer ici</button>
                  <button onClick={() => void confirmReturn(true)} className="rounded-full bg-white/15 px-3 py-1 text-xs hover:bg-white/25">Position auto</button>
                  <button onClick={cancelReturn} className="rounded-full bg-white/15 px-3 py-1 text-xs hover:bg-white/25">Annuler</button>
                </div>
              )}

              {/* Panneau de création de hotspot (§9, §10 icônes, §11.2 miniatures) */}
              <TourHotspotPanel
                open={hsOpen}
                step={hsStep}
                kind={hsKind}
                scenes={scenes.map((s) => ({
                  id: s.id, name: s.name, imageUrl: s.imageUrl,
                  levelName: s.levelId ? (levels.find((l) => l.id === s.levelId)?.name ?? null) : null,
                  alreadyLinked: hotspots.some((h) => isDirection(h.type) && h.targetSceneId === s.id),
                }))}
                currentSceneId={currentScene.id}
                form={hsForm}
                errors={hsErrors}
                onPickKind={pickKind}
                onChange={(name, value) => setHsForm((prev) => ({ ...prev, [name]: value }))}
                onSubmit={() => { void submitHotspot(); }}
                onBack={backToTypes}
                onCancel={closeHotspotPanel}
              />

              {infoModal && (
                <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60" onClick={() => setInfoModal(null)}>
                  <div className="max-w-sm rounded-xl bg-white p-4 text-slate-800" onClick={(e) => e.stopPropagation()}>
                    {typeof infoModal.content.title === 'string' && infoModal.content.title && (
                      <p className="mb-2 font-semibold">{infoModal.content.title}</p>
                    )}
                    {(infoKind === 'DESCRIPTION' || infoKind === 'INFO' || infoKind === 'COMMENT') && (
                      <p className="whitespace-pre-wrap text-sm">{String(infoModal.content.text ?? '')}</p>
                    )}
                    {infoKind === 'IMAGE' && (
                      <img src={String(infoModal.content.url ?? '')} alt={String(infoModal.content.caption ?? '')} className="max-h-64 rounded" />
                    )}
                    {infoKind === 'GALLERY' && (
                      <div className="grid grid-cols-2 gap-2">
                        {(Array.isArray(infoModal.content.images) ? infoModal.content.images : []).map((u, i) => (
                          <img key={i} src={String(u)} alt="" className="h-24 w-full rounded object-cover" />
                        ))}
                      </div>
                    )}
                    {infoKind === 'VIDEO' && (() => {
                      const u = String(infoModal.content.url ?? '');
                      const emb = embedUrl(u);
                      return emb
                        ? <iframe src={emb} className="aspect-video w-full rounded" allowFullScreen title="Vidéo" />
                        : <video src={u} controls className="max-h-64 rounded" />;
                    })()}
                    {(infoKind === 'PDF' || infoKind === 'FILE' || infoKind === 'URL' || infoKind === 'AUDIO' || infoKind === 'PRODUCT') && (
                      <a href={String(infoModal.content.url ?? '#')} target="_blank" rel="noopener noreferrer"
                        className="mt-1 inline-block rounded-lg bg-violet-600 px-3 py-1.5 text-sm text-white">
                        Ouvrir
                      </a>
                    )}
                    <button onClick={() => setInfoModal(null)} className="mt-3 w-full rounded bg-slate-200 py-1.5 text-sm">Fermer</button>
                  </div>
                </div>
              )}

              {/* Scene name overlay */}
              <div className="absolute top-4 left-4 z-10 flex items-center gap-2 pointer-events-none">
                <div className="px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-black/60">
                  {currentScene.name}
                </div>
                {currentScene.isInitial && (
                  <div className="px-2 py-1 rounded-lg text-xs text-amber-300 bg-black/60">
                    ★ Initiale
                  </div>
                )}
              </div>

              {!pannellumLoaded && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
                  <div className="flex items-center gap-3 text-stone-400">
                    <span className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm">Chargement du viewer...</span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8"
              style={{ minHeight: '500px' }}>
              <div className="w-24 h-24 rounded-2xl flex items-center justify-center text-5xl mb-6 opacity-30"
                style={{ background: '#1a1a1a' }}>🌐</div>
              <h3 className="text-xl font-bold text-white mb-2" style={{ fontFamily: 'Syne, sans-serif' }}>
                Aucune scène
              </h3>
              <p className="text-sm text-stone-400 mb-6 max-w-xs">
                Uploadez une image équirectangulaire (360°) pour créer votre visite.
              </p>
              <label className="px-6 py-3 rounded-xl font-medium cursor-pointer bg-violet-600 hover:bg-violet-500 text-white transition-colors">
                + Ajouter image 360°
                <input type="file" multiple className="hidden" accept="image/*"
                  onChange={e => { void handleUpload360(e); }} />
              </label>
            </div>
          )}
        </div>

        {/* Sidebar scènes */}
        <aside className="w-72 border-l border-stone-800 flex flex-col flex-shrink-0"
          style={{ background: '#111' }}>
          <div className="px-4 py-3 border-b border-stone-800 flex items-center justify-between">
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider">
              Scènes ({scenes.length})
            </p>
            <button
              onClick={() => setReordering(!reordering)}
              className="text-xs px-2 py-1 rounded-lg transition-colors"
              style={{
                background: reordering ? 'rgba(107,70,193,0.3)' : 'transparent',
                color: reordering ? '#A78BFA' : '#6B7280',
              }}>
              ↕ Réordonner
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {scenes.length === 0 && (
              <div className="text-center py-8">
                <p className="text-xs text-stone-600">Aucune scène — ajoutez une image 360°</p>
              </div>
            )}

            {scenes.map((scene, i) => (
              <div key={scene.id} className="rounded-xl transition-all"
                style={{
                  background: currentScene?.id === scene.id ? 'rgba(107,70,193,0.25)' : '#1a1a1a',
                  border: currentScene?.id === scene.id
                    ? '1px solid rgba(107,70,193,0.5)'
                    : '1px solid transparent',
                }}>
                <div className="flex items-center gap-2 p-2">
                  {/* Thumbnail */}
                  <button
                    onClick={() => setCurrentScene(scene)}
                    className="relative w-16 h-12 rounded-lg overflow-hidden flex-shrink-0"
                    style={{ background: '#0a0a0a' }}>
                    {(scene.thumbnailUrl || scene.imageUrl) ? (
                      <img src={scene.thumbnailUrl ?? scene.imageUrl} alt={scene.name}
                        loading="lazy" decoding="async"
                        className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-stone-600 text-xs">🌐</div>
                    )}
                    {(scene.derivStatus === 'PROCESSING' || scene.derivStatus === 'PENDING') && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                        <span className="w-3.5 h-3.5 border border-white border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </button>

                  {/* Name */}
                  <div className="flex-1 min-w-0">
                    {editingSceneId === scene.id ? (
                      <input
                        className="w-full bg-stone-800 text-white text-xs rounded-lg px-2 py-1 border border-violet-500 outline-none"
                        value={editingName}
                        onChange={e => setEditingName(e.target.value)}
                        onBlur={() => { void saveEditing(); }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { void saveEditing(); }
                          if (e.key === 'Escape') setEditingSceneId(null);
                        }}
                        autoFocus />
                    ) : (
                      <button onClick={() => setCurrentScene(scene)} className="text-left w-full">
                        <p className="text-sm font-medium truncate text-white">{scene.name}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-xs text-stone-500">#{i + 1}</span>
                          {scene.isInitial && <span className="text-xs text-amber-400">★</span>}
                        </div>
                      </button>
                    )}
                  </div>

                  {/* Reorder arrows */}
                  {reordering && (
                    <div className="flex flex-col gap-0.5">
                      <button onClick={() => { void moveScene(scene.id, 'up'); }} disabled={i === 0}
                        className="w-5 h-5 rounded flex items-center justify-center text-xs text-stone-400 hover:text-white disabled:opacity-30"
                        style={{ background: '#2a2a2a' }}>↑</button>
                      <button onClick={() => { void moveScene(scene.id, 'down'); }} disabled={i === scenes.length - 1}
                        className="w-5 h-5 rounded flex items-center justify-center text-xs text-stone-400 hover:text-white disabled:opacity-30"
                        style={{ background: '#2a2a2a' }}>↓</button>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 px-2 pb-2">
                  <button onClick={() => startEditing(scene)}
                    className="flex-1 text-xs py-1 rounded-lg transition-colors text-stone-400 hover:text-white hover:bg-stone-700">
                    ✏️ Renommer
                  </button>
                  {!scene.isInitial && (
                    <button onClick={() => { void setAsInitial(scene.id); }}
                      className="flex-1 text-xs py-1 rounded-lg transition-colors text-stone-400 hover:text-amber-300 hover:bg-stone-700">
                      ★ Initiale
                    </button>
                  )}
                  <button onClick={() => { void handleDeleteScene(scene.id); }}
                    disabled={deletingId === scene.id}
                    className="flex-1 text-xs py-1 rounded-lg transition-colors text-stone-500 hover:text-red-400 hover:bg-stone-700 disabled:opacity-40">
                    {deletingId === scene.id ? '...' : '🗑️ Suppr.'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Add scene */}
          <div className="p-3 border-t border-stone-800">
            <label className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-medium cursor-pointer transition-colors text-stone-400 hover:text-white hover:bg-stone-800">
              + Ajouter une scène
              <input type="file" multiple className="hidden" accept="image/*"
                onChange={e => { void handleUpload360(e); }} disabled={uploading} />
            </label>
          </div>
        </aside>
      </div>

      {/* V6 — Modale de partage public */}
      {showShare && (() => {
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        const url = shareToken ? buildShareUrl(origin, shareToken) : '';
        const embed = shareToken ? buildEmbedCode(origin, shareToken, { title: tour?.name }) : '';
        return (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowShare(false)}>
            <div className="w-full max-w-lg rounded-2xl bg-white p-5 text-slate-800" onClick={(e) => e.stopPropagation()}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold">Partage public</h3>
                <button onClick={() => setShowShare(false)} className="text-stone-400 hover:text-slate-800">✕</button>
              </div>
              {!shareToken ? (
                <>
                  <p className="mb-4 text-sm text-stone-600">Générez un lien public : toute personne disposant du lien pourra visiter la visite, sans compte. Vous pouvez le désactiver à tout moment.</p>
                  <div className="mb-4 grid grid-cols-2 gap-3">
                    <label className="block text-xs font-medium text-stone-500">Expiration (optionnel)
                      <input type="date" value={shareExpiry} onChange={(e) => setShareExpiry(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-violet-500" />
                    </label>
                    <label className="block text-xs font-medium text-stone-500">Code d’accès (optionnel)
                      <input value={shareCodeVal} onChange={(e) => setShareCodeVal(e.target.value)} placeholder="ex. 4821"
                        className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-violet-500" />
                    </label>
                  </div>
                  <button onClick={() => void enableShare()} disabled={shareBusy}
                    className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50">
                    {shareBusy ? 'Activation…' : 'Activer le partage'}
                  </button>
                </>
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="mb-1 text-xs font-medium text-stone-500">Lien public</p>
                    <div className="flex gap-2">
                      <input readOnly value={url} className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm" onFocus={(e) => e.currentTarget.select()} />
                      <button onClick={() => copyText('url', url)} className="rounded-lg bg-stone-800 px-3 py-2 text-xs text-white hover:bg-stone-700">{copied === 'url' ? '✓ Copié' : 'Copier'}</button>
                      <a href={url} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-violet-600 px-3 py-2 text-xs text-white hover:bg-violet-500">Ouvrir</a>
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-stone-500">Intégration (iframe)</p>
                    <textarea readOnly value={embed} rows={3} className="w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-[11px]" onFocus={(e) => e.currentTarget.select()} />
                    <button onClick={() => copyText('embed', embed)} className="mt-1 rounded-lg bg-stone-800 px-3 py-1.5 text-xs text-white hover:bg-stone-700">{copied === 'embed' ? '✓ Copié' : 'Copier le code'}</button>
                  </div>
                  <div className="rounded-lg border border-stone-200 p-3">
                    <p className="mb-2 text-xs font-medium text-stone-500">Restrictions d’accès (§22)</p>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block text-xs text-stone-500">Expiration
                        <input type="date" value={shareExpiry} onChange={(e) => setShareExpiry(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-stone-300 px-2 py-1.5 text-sm outline-none focus:border-violet-500" />
                      </label>
                      <label className="block text-xs text-stone-500">Code d’accès
                        <input value={shareCodeVal} onChange={(e) => setShareCodeVal(e.target.value)} placeholder="aucun"
                          className="mt-1 w-full rounded-lg border border-stone-300 px-2 py-1.5 text-sm outline-none focus:border-violet-500" />
                      </label>
                    </div>
                    <button onClick={() => void enableShare()} disabled={shareBusy}
                      className="mt-2 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50">
                      {shareBusy ? '…' : 'Mettre à jour'}
                    </button>
                    <p className="mt-1 text-[11px] text-stone-400">Videz un champ puis « Mettre à jour » pour le retirer.</p>
                  </div>
                  <button onClick={() => void disableShare()} disabled={shareBusy}
                    className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50">
                    Désactiver le partage
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* V4b — Modale de gestion des niveaux & plans */}
      {showLevels && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowLevels(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 text-slate-800" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold">Niveaux &amp; plans 2D</h3>
              <button onClick={() => setShowLevels(false)} className="text-stone-400 hover:text-slate-800">✕</button>
            </div>
            <p className="mb-3 text-xs text-stone-500">
              Créez un niveau par étage, importez son plan, puis rattachez chaque scène à son niveau et placez-la sur le plan (bouton « Placer sur le plan » dans le viewer).
            </p>

            <div className="mb-4 flex gap-2">
              <input
                value={newLevelName}
                onChange={(e) => setNewLevelName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void createLevel(); }}
                placeholder="Nom du niveau (ex. Rez-de-chaussée)"
                className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-violet-500" />
              <button onClick={() => void createLevel()} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500">Ajouter</button>
            </div>

            <div className="max-h-72 space-y-2 overflow-y-auto">
              {levels.length === 0 && <p className="py-6 text-center text-sm text-stone-400">Aucun niveau pour l’instant.</p>}
              {levels.map((l) => {
                const sceneCount = scenes.filter((s) => s.levelId === l.id).length;
                return (
                  <div key={l.id} className="rounded-xl border border-stone-200 p-3">
                    <div className="flex items-center gap-2">
                      <input
                        defaultValue={l.name}
                        onBlur={(e) => { if (e.target.value.trim() && e.target.value !== l.name) void renameLevel(l.id, e.target.value.trim()); }}
                        className="flex-1 rounded-md border border-transparent px-2 py-1 text-sm font-medium hover:border-stone-300 focus:border-violet-500 outline-none" />
                      <span className="text-xs text-stone-400">{sceneCount} scène{sceneCount !== 1 ? 's' : ''}</span>
                      <button onClick={() => void deleteLevel(l.id)} className="rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50">Supprimer</button>
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      {l.planUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={l.planUrl} alt="Plan" className="h-14 w-20 rounded object-cover" />
                      ) : (
                        <div className="flex h-14 w-20 items-center justify-center rounded bg-stone-100 text-[10px] text-stone-400">Pas de plan</div>
                      )}
                      <label className="cursor-pointer rounded-lg bg-stone-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-stone-200">
                        {planBusy === l.id ? 'Envoi…' : (l.planUrl ? 'Remplacer le plan' : 'Importer un plan (image/PDF)')}
                        <input type="file" accept="image/*,application/pdf" className="hidden" disabled={planBusy === l.id}
                          onChange={(e) => void uploadPlan(l.id, e)} />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
