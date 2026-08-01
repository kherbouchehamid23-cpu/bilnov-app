'use client';

import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Compass, Maximize2, Minimize2 } from 'lucide-react';
import Link from 'next/link';
import { isDirection, hotspotLabel } from '@/lib/tour';
import { kindFromContent, arrivalTarget } from '@/lib/tourHotspots';
import { levelForScene, type LevelLite } from '@/lib/tourMap';
import { viewerKeyAction, neighborSceneId, preloadUrls } from '@/lib/tourViewer';
import TourFloorPlan from '@/components/TourFloorPlan';

interface Scene { id: string; name: string; imageUrl: string; isInitial: boolean; position: number; panoramaProxy?: string; levelId?: string | null; mapX?: number | null; mapY?: number | null; hidden?: boolean; }
interface Level extends LevelLite { planUrl?: string | null; }
interface Hotspot { id: string; type: string; positionYaw: number; positionPitch: number; targetSceneId: string | null; content: Record<string, unknown>; commentId?: string | null; visible?: boolean; }
interface ApiResponse<T> { data: T; success: boolean; }

function embedUrl(u: string): string | null {
  const yt = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vm = u.match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return null;
}

// Mode VISITEUR (lecture seule).
// V3b : Pannellum en mode MULTISCENE — une seule instance conservée, transitions
// en fondu (sceneFadeDuration) et navigation via hotspots de scène natifs qui
// portent l'orientation d'arrivée (targetYaw/targetPitch/targetHfov). Fini le
// destroy/recreate par scène (ancien comportement).
export default function TourViewerPage() {
  const params = useParams();
  const id = params.id as string;
  const tourId = params.tourId as string;

  const [tourName, setTourName] = useState('');
  const [canEdit, setCanEdit] = useState(false);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [currentSceneId, setCurrentSceneId] = useState<string | null>(null);
  const [hotspotsByScene, setHotspotsByScene] = useState<Record<string, Hotspot[]>>({});
  const [levels, setLevels] = useState<Level[]>([]);
  const [showPlan, setShowPlan] = useState(true);
  const [infoModal, setInfoModal] = useState<Hotspot | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [pLoaded, setPLoaded] = useState(false);
  const [viewerReady, setViewerReady] = useState(false);
  const [gyroOn, setGyroOn] = useState(false);
  const [gyroSupported, setGyroSupported] = useState(false);
  const [isFs, setIsFs] = useState(false);

  const viewerRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  type PViewer = {
    destroy: () => void; loadScene: (id: string) => void; getScene: () => string;
    on: (e: string, f: (v: unknown) => void) => void;
    startOrientation?: () => void; stopOrientation?: () => void; isOrientationSupported?: () => boolean;
  };
  const instRef = useRef<PViewer | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  const getToken = (): string => typeof window !== 'undefined' ? localStorage.getItem('bilnov_token') ?? '' : '';

  // Charger Pannellum (CDN)
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

  // Charger droits + scènes + hotspots de TOUTES les scènes (multiScene).
  useEffect(() => {
    void (async () => {
      try {
        const auth = { headers: { Authorization: `Bearer ${getToken()}` } };
        const [pRes, tRes, sRes, lRes] = await Promise.all([
          fetch(`/api/projects/${id}`, auth),
          fetch(`/api/projects/${id}/tours/${tourId}`, auth),
          fetch(`/api/projects/${id}/tours/${tourId}/scenes`, auth),
          fetch(`/api/projects/${id}/tours/${tourId}/levels`, auth),
        ]);
        const pData = await pRes.json() as ApiResponse<{ access?: { canManage?: boolean; canUpload?: boolean } }>;
        setCanEdit(Boolean(pData.data?.access?.canManage || pData.data?.access?.canUpload));
        const tData = await tRes.json() as ApiResponse<{ name?: string }>;
        if (tData.data?.name) setTourName(tData.data.name);
        try {
          const lData = await lRes.json() as ApiResponse<{ levels: Level[] }>;
          setLevels((lData.data?.levels ?? []).slice().sort((a, b) => a.position - b.position));
        } catch { setLevels([]); }
        const sData = await sRes.json() as ApiResponse<{ scenes: Scene[] }>;
        const list = (sData.data?.scenes ?? []).slice().sort((a, b) => a.position - b.position);
        setScenes(list);
        const initial = list.find(s => s.isInitial) ?? list[0] ?? null;
        setCurrentSceneId(initial?.id ?? null);

        // Précharge les hotspots de chaque scène en parallèle.
        const entries = await Promise.all(list.map(async (s) => {
          try {
            const r = await fetch(`/api/projects/${id}/tours/${tourId}/scenes/${s.id}/hotspots`, auth);
            const d = await r.json() as ApiResponse<{ hotspots: Hotspot[] }>;
            return [s.id, d.data?.hotspots ?? []] as const;
          } catch { return [s.id, [] as Hotspot[]] as const; }
        }));
        setHotspotsByScene(Object.fromEntries(entries));
        setDataReady(true);
      } finally { setLoaded(true); }
    })();
  }, [id, tourId]);

  // Construire l'instance multiScene UNE fois (données + Pannellum prêts).
  useEffect(() => {
    if (!pLoaded || !dataReady || !viewerRef.current || scenes.length === 0) return;
    if (instRef.current) return; // déjà construit — on ne recrée jamais

    const token = getToken();
    const sceneName = (sid: string | null) => scenes.find((s) => s.id === sid)?.name;

    const cfgScenes: Record<string, unknown> = {};
    for (const s of scenes) {
      const src = s.panoramaProxy ? `${s.panoramaProxy}?token=${token}` : s.imageUrl;
      const hs = (hotspotsByScene[s.id] ?? []).filter((h) => h.visible !== false).map((h) => {
        if (isDirection(h.type) && h.targetSceneId && scenes.some((t) => t.id === h.targetSceneId)) {
          const at = arrivalTarget(h.content);
          return {
            pitch: h.positionPitch, yaw: h.positionYaw,
            cssClass: 'pnlm-hotspot bilnov-dir',
            type: 'scene', sceneId: h.targetSceneId,
            targetYaw: at.targetYaw, targetPitch: at.targetPitch,
            ...(at.targetHfov != null ? { targetHfov: at.targetHfov } : {}),
            text: hotspotLabel(h.type, h.content, sceneName(h.targetSceneId)),
          };
        }
        return {
          pitch: h.positionPitch, yaw: h.positionYaw,
          cssClass: 'pnlm-hotspot bilnov-info',
          text: hotspotLabel(h.type, h.content, sceneName(h.targetSceneId)),
          clickHandlerFunc: () => setInfoModal(h),
        };
      });
      cfgScenes[s.id] = { type: 'equirectangular', panorama: src, hotSpots: hs };
    }

    const first = currentSceneId ?? scenes[0].id;
    try {
      const inst = window.pannellum.viewer(viewerRef.current, {
        default: {
          firstScene: first,
          sceneFadeDuration: 900,
          autoLoad: true, autoRotate: 0,
          compass: false, showControls: true, showFullscreenCtrl: true, showZoomCtrl: true, mouseZoom: true,
          hfov: 100, minHfov: 50, maxHfov: 120,
        },
        scenes: cfgScenes,
      }) as unknown as PViewer;
      instRef.current = inst;
      // Suivre la scène courante (met à jour le libellé + la vignette active).
      inst.on('scenechange', (sid: unknown) => { if (typeof sid === 'string') setCurrentSceneId(sid); });
      setViewerReady(true);
      try { setGyroSupported(Boolean(inst.isOrientationSupported?.())); } catch { /* ignore */ }
    } catch { /* init failed */ }

    return () => {
      if (instRef.current) { try { instRef.current.destroy(); } catch { /* ignore */ } instRef.current = null; }
      setViewerReady(false);
    };
    // Volontairement SANS currentSceneId : l'instance est bâtie une seule fois ;
    // les changements de scène passent par loadScene / l'évènement scenechange,
    // jamais par une reconstruction. Ajouter currentSceneId recréerait le viewer
    // à chaque navigation (l'inverse du but recherché).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pLoaded, dataReady, scenes, hotspotsByScene]);

  // Navigation par vignette -> transition en fondu via loadScene (pas de recreate).
  const goToScene = (sid: string) => {
    if (instRef.current && sid !== currentSceneId) {
      try { instRef.current.loadScene(sid); } catch { /* ignore */ }
    }
  };

  // V6b — gyroscope mobile (orientation de l'appareil).
  const toggleGyro = () => {
    const inst = instRef.current;
    if (!inst || !inst.isOrientationSupported?.()) return;
    try {
      if (gyroOn) { inst.stopOrientation?.(); setGyroOn(false); }
      else { inst.startOrientation?.(); setGyroOn(true); }
    } catch { /* ignore */ }
  };

  // V6b — plein écran sur tout le conteneur (viewer + plan + vignettes).
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

  // V6b — navigation clavier (flèches/pages = scène, Échap = ferme la modale,
  // f = plein écran, g = gyroscope). Ignore la frappe dans un champ de saisie.
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

  // V6b — préchargement des panoramas voisins (fluidité des transitions).
  useEffect(() => {
    if (typeof window === 'undefined' || !dataReady || !currentSceneId) return;
    const urls = preloadUrls(currentSceneId, scenes, hotspotsByScene, { token: getToken(), max: 4 });
    const imgs = urls.map((u) => { const im = new Image(); im.src = u; return im; });
    return () => { imgs.forEach((im) => { im.src = ''; }); };
  }, [currentSceneId, scenes, hotspotsByScene, dataReady]);

  // V6b — quand la modale info s'ouvre, place le focus sur son bouton Fermer.
  useEffect(() => {
    if (infoModal) closeBtnRef.current?.focus();
  }, [infoModal]);

  const currentScene = scenes.find((s) => s.id === currentSceneId) ?? null;
  const currentLevel = currentScene ? levelForScene(levels, currentScene) : null;
  const currentPlanUrl = (currentLevel && levels.find((l) => l.id === currentLevel.id)?.planUrl) || null;
  const hasAnyPlan = levels.some((l) => l.planUrl);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0f0f0f' }}>
      <header className="flex items-center justify-between px-6 py-4 border-b border-stone-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link href={`/projects/${id}`} className="text-stone-400 hover:text-white text-sm">← Retour</Link>
          <div className="w-px h-4 bg-stone-700" />
          <span className="font-bold text-white" style={{ fontFamily: 'Syne, sans-serif' }}>{tourName || 'Visite virtuelle'}</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/projects/${id}/tours/${tourId}/view-psv`} className="px-4 py-2 rounded-lg text-sm font-medium bg-white/10 backdrop-blur-md border border-white/15 text-stone-100 hover:bg-white/20" title="Nouveau moteur immersif : transitions fondu, mono/stéréo, VR">360° immersif ✦</Link>
          <Link href={`/projects/${id}/tours/${tourId}/view-vr`} className="px-4 py-2 rounded-lg text-sm font-medium bg-white/10 backdrop-blur-md border border-white/15 text-stone-100 hover:bg-white/20" title="Mode VR WebXR immersif (casque / gyroscope)">VR 🥽</Link>
          {canEdit && (
            <Link href={`/projects/${id}/tours/${tourId}`} className="px-4 py-2 rounded-lg text-sm font-medium bg-stone-800 hover:bg-stone-700 text-white">✎ Modifier</Link>
          )}
        </div>
      </header>

      <div ref={wrapRef} className="flex-1 flex flex-col relative" style={{ background: '#0f0f0f' }}>
        {scenes.length > 0 ? (
          <>
            <div ref={viewerRef} className="flex-1" role="application" aria-label={`Visite virtuelle 360° — ${currentScene?.name ?? tourName}. Flèches gauche/droite pour changer de scène.`} style={{ minHeight: '500px', background: '#000' }} />
            {currentScene && (
              <div className="absolute top-4 left-4 z-10 px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-white/10 backdrop-blur-md border border-white/15 pointer-events-none">{currentScene.name}</div>
            )}
            <div className="absolute top-4 right-4 z-10 flex gap-2">
              {gyroSupported && (
                <button onClick={toggleGyro} aria-pressed={gyroOn} aria-label={gyroOn ? 'Désactiver le gyroscope' : 'Activer le gyroscope'} title="Gyroscope (g)"
                  className={`rounded-lg px-2.5 py-1.5 text-sm ${gyroOn ? 'bg-violet-600 text-white' : 'bg-white/10 backdrop-blur-md border border-white/15 text-stone-100 hover:bg-white/20'}`}><Compass size={16} /></button>
              )}
              <button onClick={toggleFullscreen} aria-pressed={isFs} aria-label={isFs ? 'Quitter le plein écran' : 'Plein écran'} title="Plein écran (f)"
                className="rounded-lg px-2.5 py-1.5 text-sm bg-white/10 backdrop-blur-md border border-white/15 text-stone-100 hover:bg-white/20">{isFs ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
            </div>
            {(!pLoaded || !viewerReady) && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
                <span className="text-sm text-stone-400">Chargement du viewer…</span>
              </div>
            )}

            {/* V4b — mini-carte : plan du niveau courant + marqueurs cliquables */}
            {hasAnyPlan && (
              <div className="absolute bottom-4 right-4 z-20 w-64 rounded-lg bg-white/10 backdrop-blur-md border border-white/15 p-2 text-white">
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
                              className={`rounded px-1.5 py-0.5 text-[10px] ${active ? 'bg-violet-600 text-white' : 'bg-white/15 text-stone-200 hover:bg-white/25'}`}>
                              {l.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <TourFloorPlan
                      planUrl={currentPlanUrl}
                      levelId={currentLevel?.id ?? null}
                      scenes={scenes}
                      currentSceneId={currentSceneId}
                      onMarkerClick={(sid) => goToScene(sid)}
                    />
                  </>
                )}
              </div>
            )}
            {scenes.length > 1 && (
              <div className="flex gap-2 overflow-x-auto px-4 py-3 border-t border-white/10 bg-white/8 backdrop-blur-md">
                {scenes.filter((s) => !s.hidden).map((s) => (
                  <button key={s.id} onClick={() => goToScene(s.id)}
                    className={`flex-shrink-0 rounded-lg overflow-hidden border-2 ${currentSceneId === s.id ? 'border-violet-500' : 'border-transparent'}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.imageUrl} alt={s.name} className="h-14 w-24 object-cover" />
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-center p-8">
            <p className="text-sm text-stone-400">{loaded ? 'Cette visite ne contient aucune scène.' : 'Chargement…'}</p>
          </div>
        )}

        {infoModal && (() => {
          const k = kindFromContent(infoModal.type, infoModal.content);
          const url = String(infoModal.content.url ?? '');
          const emb = embedUrl(url);
          return (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={typeof infoModal.content.title === 'string' && infoModal.content.title ? infoModal.content.title : 'Information'} onClick={() => setInfoModal(null)}>
            <div className={`${k === 'PDF' ? 'max-w-4xl' : 'max-w-md'} w-full rounded-xl bg-white p-4 text-slate-800`} onClick={(e) => e.stopPropagation()}>
              {typeof infoModal.content.title === 'string' && infoModal.content.title && <p className="mb-2 font-semibold">{infoModal.content.title}</p>}
              {(k === 'DESCRIPTION' || k === 'INFO' || k === 'COMMENT') && <p className="whitespace-pre-wrap text-sm">{String(infoModal.content.text ?? '')}</p>}
              {k === 'COMMENT' && infoModal.commentId && (
                <a href={`/projects/${id}/comments`} className="mt-2 inline-block rounded-lg bg-violet-600 px-3 py-1.5 text-sm text-white">Ouvrir dans les commentaires Bilnov</a>
              )}
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
              {k === 'VIDEO' && (emb
                ? <iframe src={emb} className="aspect-video w-full rounded" allowFullScreen title="Vidéo" />
                : <video src={url} controls className="max-h-72 w-full rounded" />)}
              {k === 'PDF' && url && (
                <div className="space-y-2">
                  <iframe src={`${url}#toolbar=1&navpanes=0`} className="h-[65vh] w-full rounded border border-slate-200" title={typeof infoModal.content.title === 'string' && infoModal.content.title ? infoModal.content.title : 'Document PDF'} />
                  {infoModal.content.allowDownload === true && (
                    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-block rounded-lg bg-violet-600 px-3 py-1.5 text-sm text-white">Télécharger</a>
                  )}
                </div>
              )}
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              {k === 'AUDIO' && url && <audio src={url} controls className="mt-1 w-full" />}
              {(k === 'FILE' || k === 'URL' || k === 'PRODUCT') && (
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
