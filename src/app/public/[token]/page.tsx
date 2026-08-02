'use client';
// src/app/public/[token]/page.tsx
// Bilnov 360 — V6 : visionneuse PUBLIQUE (lien / iframe), sans authentification.
// Lecture seule. Récupère les données via /api/public/tours/[token].
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { isDirection, hotspotLabel } from '@/lib/tour';
import { projectionFromScene, oneEyePanoramaUrl, revokeCroppedUrl } from '@/lib/stereoCrop';
import { kindFromContent, arrivalTarget } from '@/lib/tourHotspots';
import { levelForScene, type LevelLite } from '@/lib/tourMap';
import { viewerKeyAction, neighborSceneId, preloadUrls } from '@/lib/tourViewer';
import TourFloorPlan from '@/components/TourFloorPlan';

interface Hotspot { id: string; type: string; positionYaw: number; positionPitch: number; targetSceneId: string | null; content: Record<string, unknown>; }
interface Scene { id: string; name: string; imageUrl: string; thumbnailUrl?: string | null; previewUrl?: string | null; isInitial: boolean; position: number; levelId?: string | null; mapX?: number | null; mapY?: number | null; panoramaType?: string | null; stereoLayout?: string | null; hotspots: Hotspot[]; }
interface Level extends LevelLite { planUrl?: string | null; }
interface ApiResponse<T> { data: T; success: boolean; }

function embedUrl(u: string): string | null {
  const yt = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vm = u.match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return null;
}

export default function PublicTourPage() {
  const params = useParams();
  const token = params.token as string;

  const [tourName, setTourName] = useState('');
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [currentSceneId, setCurrentSceneId] = useState<string | null>(null);
  const [infoModal, setInfoModal] = useState<Hotspot | null>(null);
  const [showPlan, setShowPlan] = useState(true);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error' | 'expired' | 'code'>('loading');
  const [codeInput, setCodeInput] = useState('');
  const [codeErr, setCodeErr] = useState<string | null>(null);
  const [pLoaded, setPLoaded] = useState(false);
  const [viewerReady, setViewerReady] = useState(false);
  const [gyroOn, setGyroOn] = useState(false);
  const [gyroSupported, setGyroSupported] = useState(false);
  const [isFs, setIsFs] = useState(false);
  // §4 — interface immersive : les commandes se masquent après inactivité et réapparaissent
  // au moindre mouvement / toucher / touche. Toujours retrouvables (jamais retirées du DOM).
  const [chromeVisible, setChromeVisible] = useState(true);
  const chromeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const viewerRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  type PViewer = {
    destroy: () => void; loadScene: (id: string) => void; on: (e: string, f: (v: unknown) => void) => void;
    startOrientation?: () => void; stopOrientation?: () => void; isOrientationSupported?: () => boolean;
  };
  const instRef = useRef<PViewer | null>(null);

  // Charger Pannellum
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.pannellum) { setPLoaded(true); return; }
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = 'https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css';
    document.head.appendChild(link);
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js';
    script.onload = () => setPLoaded(true);
    document.body.appendChild(script);
  }, []);

  // Charger les données publiques (§22 : gère expiration + code d'accès).
  const loadPublic = async (code?: string): Promise<void> => {
    try {
      const q = code ? `?code=${encodeURIComponent(code)}` : '';
      const r = await fetch(`/api/public/tours/${encodeURIComponent(token)}${q}`);
      if (r.status === 410) { setStatus('expired'); return; }
      if (r.status === 403) { setCodeErr(code ? 'Code invalide, réessayez.' : null); setStatus('code'); return; }
      if (!r.ok) { setStatus('error'); return; }
      const d = await r.json() as ApiResponse<{ name: string; scenes: Scene[]; levels: Level[] }>;
      const list = (d.data?.scenes ?? []).slice().sort((a, b) => a.position - b.position);
      setTourName(d.data?.name ?? '');
      setScenes(list);
      setLevels((d.data?.levels ?? []).slice().sort((a, b) => a.position - b.position));
      setCurrentSceneId((list.find((s) => s.isInitial) ?? list[0])?.id ?? null);
      setStatus('ok');
    } catch { setStatus('error'); }
  };
  useEffect(() => {
    void loadPublic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Construire l'instance multiScene UNE fois
  useEffect(() => {
    if (!pLoaded || status !== 'ok' || !viewerRef.current || scenes.length === 0) return;
    if (instRef.current) return;
    let cancelled = false;
    const createdBlobs: string[] = [];
    const sceneName = (sid: string | null) => scenes.find((s) => s.id === sid)?.name;
    (async () => {
      // §7 — pré-calcule l'URL panorama de chaque scène : mono inchangé, stéréo recadré à un
      // seul œil (over/under → moitié haute ; side-by-side → moitié gauche) pour un affichage
      // correct (non déformé) sur téléphone, tablette et desktop. Visites 100% mono : aucun coût.
      const panoById: Record<string, string> = {};
      await Promise.all(scenes.map(async (s) => {
        // §1 — on charge l'APERÇU léger (webp ~4096) plutôt que l'original lourd : chargement
        // bien plus rapide (Algérie / 4G / connexions lentes). Repli sur l'original si absent.
        const base = s.previewUrl || s.imageUrl;
        const proj = projectionFromScene(s.panoramaType, s.stereoLayout);
        if (proj === 'mono') { panoById[s.id] = base; return; }
        try {
          const u = await oneEyePanoramaUrl(base, proj);
          panoById[s.id] = u;
          if (u.startsWith('blob:')) createdBlobs.push(u);
        } catch { panoById[s.id] = base; }
      }));
      if (cancelled || !viewerRef.current || instRef.current) return;
      const cfgScenes: Record<string, unknown> = {};
      for (const s of scenes) {
        const hs = (s.hotspots ?? []).map((h) => {
          if (isDirection(h.type) && h.targetSceneId && scenes.some((t) => t.id === h.targetSceneId)) {
            const at = arrivalTarget(h.content);
            return {
              pitch: h.positionPitch, yaw: h.positionYaw, cssClass: 'pnlm-hotspot bilnov-dir',
              type: 'scene', sceneId: h.targetSceneId, targetYaw: at.targetYaw, targetPitch: at.targetPitch,
              ...(at.targetHfov != null ? { targetHfov: at.targetHfov } : {}),
              text: hotspotLabel(h.type, h.content, sceneName(h.targetSceneId)),
            };
          }
          return { pitch: h.positionPitch, yaw: h.positionYaw, cssClass: 'pnlm-hotspot bilnov-info', text: hotspotLabel(h.type, h.content, sceneName(h.targetSceneId)), clickHandlerFunc: () => setInfoModal(h) };
        });
        cfgScenes[s.id] = { type: 'equirectangular', panorama: panoById[s.id] ?? s.imageUrl, hotSpots: hs };
      }
      const first = currentSceneId ?? scenes[0].id;
      try {
        const inst = window.pannellum.viewer(viewerRef.current, {
          default: { firstScene: first, sceneFadeDuration: 900, autoLoad: true, autoRotate: 0, compass: false, showControls: true, showFullscreenCtrl: true, showZoomCtrl: true, mouseZoom: true, hfov: 100, minHfov: 50, maxHfov: 120 },
          scenes: cfgScenes,
        }) as unknown as PViewer;
        instRef.current = inst;
        inst.on('scenechange', (sid: unknown) => { if (typeof sid === 'string') setCurrentSceneId(sid); });
        setViewerReady(true);
        try { setGyroSupported(Boolean(inst.isOrientationSupported?.())); } catch { /* ignore */ }
      } catch { /* init failed */ }
    })();
    return () => { cancelled = true; if (instRef.current) { try { instRef.current.destroy(); } catch { /* ignore */ } instRef.current = null; } setViewerReady(false); createdBlobs.forEach(revokeCroppedUrl); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pLoaded, status, scenes]);

  const goToScene = (sid: string) => { if (instRef.current && sid !== currentSceneId) { try { instRef.current.loadScene(sid); } catch { /* ignore */ } } };

  // V6b — gyroscope mobile.
  const toggleGyro = () => {
    const inst = instRef.current;
    if (!inst || !inst.isOrientationSupported?.()) return;
    try {
      if (gyroOn) { inst.stopOrientation?.(); setGyroOn(false); }
      else { inst.startOrientation?.(); setGyroOn(true); }
    } catch { /* ignore */ }
  };

  // V6b — plein écran conteneur.
  const toggleFullscreen = () => {
    const el = wrapRef.current;
    if (typeof document === 'undefined') return;
    try {
      if (document.fullscreenElement) void document.exitFullscreen();
      else if (el?.requestFullscreen) void el.requestFullscreen();
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onFs = () => setIsFs(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // V6b — navigation clavier.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const action = viewerKeyAction(e.key);
      if (!action) return;
      if (infoModal) { if (action === 'closeModal') { e.preventDefault(); setInfoModal(null); } return; }
      if (action === 'closeModal') return;
      e.preventDefault();
      if (action === 'next') { const n = neighborSceneId(currentSceneId, scenes, 1); if (n) goToScene(n); }
      else if (action === 'prev') { const p = neighborSceneId(currentSceneId, scenes, -1); if (p) goToScene(p); }
      else if (action === 'toggleFullscreen') toggleFullscreen();
      else if (action === 'toggleGyro') toggleGyro();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSceneId, scenes, infoModal, gyroOn]);

  // V6b — préchargement des panoramas voisins (fluidité).
  useEffect(() => {
    if (typeof window === 'undefined' || status !== 'ok' || !currentSceneId) return;
    const hsByScene = Object.fromEntries(scenes.map((s) => [s.id, s.hotspots ?? []]));
    const urls = preloadUrls(currentSceneId, scenes, hsByScene, { max: 4 });
    const imgs = urls.map((u) => { const im = new Image(); im.src = u; return im; });
    return () => { imgs.forEach((im) => { im.src = ''; }); };
  }, [currentSceneId, scenes, status]);

  // V6b — focus la fermeture à l'ouverture de la modale.
  useEffect(() => {
    if (infoModal) closeBtnRef.current?.focus();
  }, [infoModal]);

  // §4 — masquage automatique des commandes après inactivité (interface immersive).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reveal = () => {
      setChromeVisible(true);
      if (chromeTimer.current) clearTimeout(chromeTimer.current);
      chromeTimer.current = setTimeout(() => setChromeVisible(false), 3500);
    };
    reveal();
    const opts: AddEventListenerOptions = { passive: true };
    window.addEventListener('mousemove', reveal, opts);
    window.addEventListener('pointerdown', reveal, opts);
    window.addEventListener('touchstart', reveal, opts);
    window.addEventListener('keydown', reveal);
    return () => {
      if (chromeTimer.current) clearTimeout(chromeTimer.current);
      window.removeEventListener('mousemove', reveal);
      window.removeEventListener('pointerdown', reveal);
      window.removeEventListener('touchstart', reveal);
      window.removeEventListener('keydown', reveal);
    };
  }, []);

  const currentScene = scenes.find((s) => s.id === currentSceneId) ?? null;
  const currentLevel = currentScene ? levelForScene(levels, currentScene) : null;
  const currentPlanUrl = (currentLevel && levels.find((l) => l.id === currentLevel.id)?.planUrl) || null;
  const hasAnyPlan = levels.some((l) => l.planUrl);

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0f0f0f' }}>
        <p className="text-sm text-stone-400">Cette visite n’est pas disponible ou n’est plus partagée.</p>
      </div>
    );
  }

  if (status === 'expired') {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: '#0f0f0f' }}>
        <div className="text-center">
          <p className="mb-1 text-base font-semibold text-white">Lien expiré</p>
          <p className="text-sm text-stone-400">Ce lien de partage a expiré. Demandez-en un nouveau au propriétaire de la visite.</p>
        </div>
      </div>
    );
  }

  if (status === 'code') {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: '#0f0f0f' }}>
        <form
          onSubmit={(e) => { e.preventDefault(); if (codeInput.trim()) { setStatus('loading'); void loadPublic(codeInput.trim()); } }}
          className="w-full max-w-xs rounded-2xl border border-stone-800 p-6 text-center">
          <p className="mb-1 text-base font-semibold text-white">Visite protégée</p>
          <p className="mb-4 text-sm text-stone-400">Saisissez le code d’accès communiqué par le propriétaire.</p>
          <input
            autoFocus value={codeInput} onChange={(e) => setCodeInput(e.target.value)}
            placeholder="Code d’accès"
            className="mb-2 w-full rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-center text-sm text-white outline-none focus:border-violet-500" />
          {codeErr && <p className="mb-2 text-xs text-red-400">{codeErr}</p>}
          <button type="submit" disabled={!codeInput.trim()}
            className={`w-full rounded-lg py-2 text-sm font-medium ${codeInput.trim() ? 'bg-violet-600 text-white hover:bg-violet-500' : 'bg-stone-800 text-stone-500 cursor-not-allowed'}`}>Accéder</button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0f0f0f' }}>
      <div ref={wrapRef} className="flex-1 flex flex-col relative" style={{ background: '#0f0f0f' }}>
        {scenes.length > 0 ? (
          <>
            <div ref={viewerRef} className="flex-1" role="application" aria-label={`Visite virtuelle 360° — ${currentScene?.name ?? tourName}. Flèches gauche/droite pour changer de scène.`} style={{ minHeight: '100vh', background: '#000' }} />
            {currentScene && (
              <div className={`absolute top-4 left-4 z-10 px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-black/60 pointer-events-none transition-opacity duration-500 ${chromeVisible ? 'opacity-100' : 'opacity-0'}`}>{currentScene.name}</div>
            )}
            <div className={`absolute top-4 right-4 z-10 flex flex-col items-end gap-2 transition-opacity duration-500 ${chromeVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
              <div className="flex gap-2">
                {gyroSupported && (
                  <button onClick={toggleGyro} aria-pressed={gyroOn} aria-label={gyroOn ? 'Désactiver le gyroscope' : 'Activer le gyroscope'} title="Gyroscope (g)"
                    className={`rounded-lg px-2.5 py-1.5 text-sm ${gyroOn ? 'bg-violet-600 text-white' : 'bg-black/60 text-stone-200 hover:bg-black/80'}`}>🧭</button>
                )}
                <button onClick={toggleFullscreen} aria-pressed={isFs} aria-label={isFs ? 'Quitter le plein écran' : 'Plein écran'} title="Plein écran (f)"
                  className="rounded-lg px-2.5 py-1.5 text-sm bg-black/60 text-stone-200 hover:bg-black/80">{isFs ? '🡼' : '⛶'}</button>
              </div>
              {tourName && (
                <div className="px-3 py-1.5 rounded-lg text-xs text-stone-200 bg-black/50 pointer-events-none">{tourName}</div>
              )}
            </div>
            {(!pLoaded || !viewerReady) && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
                <span className="text-sm text-stone-400">Chargement…</span>
              </div>
            )}

            {/* Barre de navigation entre scènes — indispensable sur mobile (pas de clavier)
                et quand la visite n'a ni flèche de direction ni plan. */}
            {scenes.length > 1 && (
              <div className={`absolute bottom-4 left-1/2 z-20 -translate-x-1/2 max-w-[calc(100%-2rem)] overflow-x-auto rounded-full bg-black/70 px-2 py-1.5 transition-opacity duration-500 ${chromeVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <div className="flex items-center gap-1">
                  {scenes.map((s) => {
                    const active = s.id === currentSceneId;
                    return (
                      <button key={s.id} onClick={() => goToScene(s.id)} title={s.name}
                        aria-label={`Aller à la scène ${s.name}`} aria-current={active ? 'true' : undefined}
                        className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors ${active ? 'bg-violet-600 text-white' : 'bg-white/10 text-stone-200 hover:bg-white/20'}`}>
                        {s.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {hasAnyPlan && (
              <div className={`absolute bottom-4 right-4 z-20 w-60 rounded-lg bg-black/75 p-2 text-white transition-opacity duration-500 ${chromeVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[10px] uppercase text-stone-400">Plan{currentLevel ? ` — ${currentLevel.name}` : ''}</span>
                  <button onClick={() => setShowPlan((v) => !v)} className="text-xs text-stone-300 hover:text-white">{showPlan ? '▾' : '▸'}</button>
                </div>
                {showPlan && (
                  <>
                    {levels.filter((l) => l.planUrl).length > 1 && (
                      <div className="mb-1 flex flex-wrap gap-1">
                        {levels.filter((l) => l.planUrl).map((l) => {
                          const active = currentLevel?.id === l.id;
                          const target = scenes.find((s) => s.levelId === l.id);
                          return (
                            <button key={l.id} onClick={() => { if (target) goToScene(target.id); }}
                              className={`rounded px-1.5 py-0.5 text-[10px] ${active ? 'bg-violet-600 text-white' : 'bg-white/15 text-stone-200 hover:bg-white/25'}`}>{l.name}</button>
                          );
                        })}
                      </div>
                    )}
                    <TourFloorPlan planUrl={currentPlanUrl} levelId={currentLevel?.id ?? null} scenes={scenes} currentSceneId={currentSceneId} onMarkerClick={(sid) => goToScene(sid)} />
                  </>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-center p-8">
            <p className="text-sm text-stone-400">{status === 'loading' ? 'Chargement…' : 'Cette visite ne contient aucune scène.'}</p>
          </div>
        )}

        {infoModal && (() => {
          const k = kindFromContent(infoModal.type, infoModal.content);
          const url = String(infoModal.content.url ?? '');
          const emb = embedUrl(url);
          return (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={typeof infoModal.content.title === 'string' && infoModal.content.title ? infoModal.content.title : 'Information'} onClick={() => setInfoModal(null)}>
            <div className="max-w-md rounded-xl bg-white p-4 text-slate-800" onClick={(e) => e.stopPropagation()}>
              {typeof infoModal.content.title === 'string' && infoModal.content.title && <p className="mb-2 font-semibold">{infoModal.content.title}</p>}
              {(k === 'DESCRIPTION' || k === 'INFO' || k === 'COMMENT') && <p className="whitespace-pre-wrap text-sm">{String(infoModal.content.text ?? '')}</p>}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {k === 'IMAGE' && <img src={url} alt={String(infoModal.content.caption ?? '')} className="max-h-72 w-full rounded object-contain" />}
              {k === 'GALLERY' && (
                <div className="grid grid-cols-2 gap-2">
                  {(Array.isArray(infoModal.content.images) ? infoModal.content.images : []).map((u, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={String(u)} alt="" className="h-28 w-full rounded object-cover" />
                  ))}
                </div>
              )}
              {k === 'VIDEO' && (emb ? <iframe src={emb} className="aspect-video w-full rounded" allowFullScreen title="Vidéo" /> : <video src={url} controls className="max-h-72 w-full rounded" />)}
              {(k === 'PDF' || k === 'FILE' || k === 'URL' || k === 'AUDIO' || k === 'PRODUCT') && (
                <a href={url || '#'} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block rounded-lg bg-violet-600 px-3 py-1.5 text-sm text-white">Ouvrir</a>
              )}
              <button ref={closeBtnRef} onClick={() => setInfoModal(null)} className="mt-3 w-full rounded bg-slate-200 py-1.5 text-sm">Fermer</button>
            </div>
          </div>
          );
        })()}
      </div>
    </div>
  );
}
