'use client';

import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { isDirection, hotspotLabel } from '@/lib/tour';
import { kindFromContent } from '@/lib/tourHotspots';

interface Scene { id: string; name: string; imageUrl: string; isInitial: boolean; position: number; panoramaProxy?: string; }
interface Hotspot { id: string; type: string; positionYaw: number; positionPitch: number; targetSceneId: string | null; content: Record<string, unknown>; }
interface ApiResponse<T> { data: T; success: boolean; }

function embedUrl(u: string): string | null {
  const yt = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vm = u.match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return null;
}

// Mode VISITEUR (lecture seule) : navigation par hotspots, aucune commande d'edition.
export default function TourViewerPage() {
  const params = useParams();
  const id = params.id as string;
  const tourId = params.tourId as string;

  const [tourName, setTourName] = useState('');
  const [canEdit, setCanEdit] = useState(false);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [currentScene, setCurrentScene] = useState<Scene | null>(null);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [infoModal, setInfoModal] = useState<Hotspot | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pLoaded, setPLoaded] = useState(false);

  const viewerRef = useRef<HTMLDivElement>(null);
  const instRef = useRef<{ destroy: () => void } | null>(null);
  const scenesRef = useRef<Scene[]>([]);
  useEffect(() => { scenesRef.current = scenes; }, [scenes]);

  const getToken = (): string => typeof window !== 'undefined' ? localStorage.getItem('bilnov_token') ?? '' : '';

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

  // Charger droits + scenes
  useEffect(() => {
    void (async () => {
      try {
        const [pRes, tRes, sRes] = await Promise.all([
          fetch(`/api/projects/${id}`, { headers: { Authorization: `Bearer ${getToken()}` } }),
          fetch(`/api/projects/${id}/tours/${tourId}`, { headers: { Authorization: `Bearer ${getToken()}` } }),
          fetch(`/api/projects/${id}/tours/${tourId}/scenes`, { headers: { Authorization: `Bearer ${getToken()}` } }),
        ]);
        const pData = await pRes.json() as ApiResponse<{ access?: { canManage?: boolean; canUpload?: boolean } }>;
        setCanEdit(Boolean(pData.data?.access?.canManage || pData.data?.access?.canUpload));
        const tData = await tRes.json() as ApiResponse<{ name?: string }>;
        if (tData.data?.name) setTourName(tData.data.name);
        const sData = await sRes.json() as ApiResponse<{ scenes: Scene[] }>;
        const list = sData.data?.scenes ?? [];
        setScenes(list);
        setCurrentScene(list.find(s => s.isInitial) ?? list[0] ?? null);
      } finally { setLoaded(true); }
    })();
  }, [id, tourId]);

  // Charger hotspots de la scene courante
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

  // (Re)creer le viewer
  useEffect(() => {
    if (!pLoaded || !currentScene || !viewerRef.current) return;
    if (instRef.current) { try { instRef.current.destroy(); } catch { /* ignore */ } instRef.current = null; }
    const src = currentScene.panoramaProxy ? `${currentScene.panoramaProxy}?token=${getToken()}` : currentScene.imageUrl;
    const hs = hotspots.map((h) => ({
      id: h.id, pitch: h.positionPitch, yaw: h.positionYaw,
      cssClass: isDirection(h.type) ? 'pnlm-hotspot bilnov-dir' : 'pnlm-hotspot bilnov-info',
      text: hotspotLabel(h.type, h.content, scenesRef.current.find((s) => s.id === h.targetSceneId)?.name),
      clickHandlerFunc: () => { if (isDirection(h.type)) { const t = scenesRef.current.find((s) => s.id === h.targetSceneId); if (t) setCurrentScene(t); } else setInfoModal(h); },
    }));
    try {
      instRef.current = window.pannellum.viewer(viewerRef.current, {
        type: 'equirectangular', panorama: src, autoLoad: true, autoRotate: 0,
        compass: false, showControls: true, showFullscreenCtrl: true, showZoomCtrl: true, mouseZoom: true,
        hfov: 100, minHfov: 50, maxHfov: 120, pitch: 0, yaw: 0, hotSpots: hs,
      });
    } catch { /* init failed */ }
    return () => { if (instRef.current) { try { instRef.current.destroy(); } catch { /* ignore */ } instRef.current = null; } };
  }, [pLoaded, currentScene, hotspots]);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0f0f0f' }}>
      <header className="flex items-center justify-between px-6 py-4 border-b border-stone-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link href={`/projects/${id}`} className="text-stone-400 hover:text-white text-sm">← Retour</Link>
          <div className="w-px h-4 bg-stone-700" />
          <span className="font-bold text-white" style={{ fontFamily: 'Syne, sans-serif' }}>{tourName || 'Visite virtuelle'}</span>
        </div>
        {canEdit && (
          <Link href={`/projects/${id}/tours/${tourId}`} className="px-4 py-2 rounded-lg text-sm font-medium bg-stone-800 hover:bg-stone-700 text-white">✎ Modifier</Link>
        )}
      </header>

      <div className="flex-1 flex flex-col relative">
        {currentScene ? (
          <>
            <div ref={viewerRef} className="flex-1" style={{ minHeight: '500px', background: '#000' }} />
            <div className="absolute top-4 left-4 z-10 px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-black/60 pointer-events-none">{currentScene.name}</div>
            {!pLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
                <span className="text-sm text-stone-400">Chargement du viewer…</span>
              </div>
            )}
            {scenes.length > 1 && (
              <div className="flex gap-2 overflow-x-auto px-4 py-3 border-t border-stone-800 bg-black/40">
                {scenes.map((s) => (
                  <button key={s.id} onClick={() => setCurrentScene(s)}
                    className={`flex-shrink-0 rounded-lg overflow-hidden border-2 ${currentScene.id === s.id ? 'border-violet-500' : 'border-transparent'}`}>
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
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-4" onClick={() => setInfoModal(null)}>
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
              {k === 'VIDEO' && (emb
                ? <iframe src={emb} className="aspect-video w-full rounded" allowFullScreen title="Vidéo" />
                : <video src={url} controls className="max-h-72 w-full rounded" />)}
              {(k === 'PDF' || k === 'FILE' || k === 'URL' || k === 'AUDIO' || k === 'PRODUCT') && (
                <a href={url || '#'} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block rounded-lg bg-violet-600 px-3 py-1.5 text-sm text-white">Ouvrir</a>
              )}
              <button onClick={() => setInfoModal(null)} className="mt-3 w-full rounded bg-slate-200 py-1.5 text-sm">Fermer</button>
            </div>
          </div>
          );
        })()}
      </div>
    </div>
  );
}
