'use client';
import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { uploadFileDirect } from '@/lib/upload';
import { kindToType, hotspotLabel, isDirection } from '@/lib/tour';

interface Tour { id: string; name: string; status: string; }
interface Scene { id: string; name: string; imageUrl: string; isInitial: boolean; position: number; panoramaProxy?: string; }
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
  const [dKind, setDKind] = useState('DIRECTION');
  const [dTarget, setDTarget] = useState('');
  const [dTitle, setDTitle] = useState('');
  const [dText, setDText] = useState('');
  const [dUrl, setDUrl] = useState('');
  const [infoModal, setInfoModal] = useState<Hotspot | null>(null);
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
        type: 'equirectangular', panorama: currentScene.panoramaProxy ? `${currentScene.panoramaProxy}?token=${getToken()}` : currentScene.imageUrl, autoLoad: true, autoRotate: 0,
        compass: false, showControls: true, showFullscreenCtrl: true, showZoomCtrl: true, mouseZoom: true,
        hfov: 100, minHfov: 50, maxHfov: 120, pitch: 0, yaw: 0, hotSpots: hs,
      });
    } catch { /* viewer init failed */ }
    const el = viewerRef.current;
    const onClick = (e: MouseEvent) => { if (!addModeRef.current || !pannellumInstanceRef.current) return; try { const c = pannellumInstanceRef.current.mouseEventToCoords(e); setDraft({ pitch: c[0], yaw: c[1] }); setAddMode(false); } catch { /* noop */ } };
    el.addEventListener('click', onClick);
    return () => { el.removeEventListener('click', onClick); if (pannellumInstanceRef.current) { try { pannellumInstanceRef.current.destroy(); } catch { /* ignore */ } pannellumInstanceRef.current = null; } };
  }, [pannellumLoaded, currentScene?.imageUrl, hotspots]);

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

  const saveHotspot = async (): Promise<void> => {
    if (!draft || !currentScene) return;
    const type = kindToType(dKind as 'DIRECTION' | 'INFO_TEXT' | 'INFO_IMAGE' | 'INFO_VIDEO');
    const content: Record<string, unknown> = dKind === 'DIRECTION' ? {} : { title: dTitle || undefined, text: dText || undefined, url: dUrl || undefined };
    try {
      const r = await fetch(`/api/projects/${id}/tours/${tourId}/scenes/${currentScene.id}/hotspots`, {
        method: 'POST', headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, positionYaw: draft.yaw, positionPitch: draft.pitch, targetSceneId: dKind === 'DIRECTION' ? (dTarget || null) : null, content }),
      });
      const d = await r.json() as ApiResponse<Hotspot>;
      if (d.data) setHotspots((prev) => [...prev, d.data]);
      setDraft(null); setDTarget(''); setDTitle(''); setDText(''); setDUrl('');
    } catch { alert('Erreur création hotspot'); }
  };
  const deleteHotspot = async (hid: string): Promise<void> => {
    try { await fetch(`/api/projects/${id}/tours/${tourId}/scenes/${currentScene?.id}/hotspots/${hid}`, { method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` } }); setHotspots((prev) => prev.filter((h) => h.id !== hid)); } catch { /* noop */ }
  };

  const loadScenes = async (): Promise<void> => {
    const res = await fetch(`/api/projects/${id}/tours/${tourId}/scenes`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    const data = await res.json() as ApiResponse<{ scenes: Scene[] }>;
    const list = data.data?.scenes ?? [];
    setScenes(list);
    if (list.length > 0 && !currentScene) setCurrentScene(list[0]);
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
      } finally {
        setLoading(false);
      }
    })();
  }, [id, tourId]);

  const handleUpload360 = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
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
      if (sceneData.data) {
        setScenes(prev => [...prev, sceneData.data]);
        setCurrentScene(sceneData.data);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erreur upload');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      e.target.value = '';
    }
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

  const handlePublish = async (): Promise<void> => {
    try {
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

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0f0f0f' }}>
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-stone-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link href={`/projects/${id}`} className="text-stone-400 hover:text-white transition-colors text-sm">
            ← Retour
          </Link>
          <Link href={`/projects/${id}/tours/${tourId}/view`} className="text-stone-400 hover:text-white transition-colors text-sm">👁 Voir</Link>
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
          <label className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all ${uploading ? 'opacity-60 bg-stone-700 text-stone-300' : 'bg-violet-600 hover:bg-violet-500 text-white'}`}>
            {uploading ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                {uploadProgress}%
              </span>
            ) : '+ Image 360°'}
            <input type="file" className="hidden" accept="image/*"
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
                <button onClick={() => setAddMode((m) => !m)} className={`absolute top-4 right-4 z-20 rounded-lg px-3 py-1.5 text-sm font-medium ${addMode ? 'bg-amber-500 text-black' : 'bg-black/60 text-white'}`}>{addMode ? 'Cliquez sur le panorama…' : '＋ Hotspot'}</button>
              )}
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
              {draft && (
                <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60">
                  <div className="w-72 rounded-xl bg-white p-4 text-slate-800">
                    <p className="mb-2 text-sm font-semibold">Nouveau hotspot</p>
                    <select value={dKind} onChange={(e) => setDKind(e.target.value)} className="mb-2 w-full rounded border px-2 py-1 text-sm">
                      <option value="DIRECTION">Direction (aller vers une scene)</option>
                      <option value="INFO_TEXT">Information (texte)</option>
                      <option value="INFO_IMAGE">Information (image)</option>
                      <option value="INFO_VIDEO">Information (video)</option>
                    </select>
                    {dKind === 'DIRECTION' ? (
                      <select value={dTarget} onChange={(e) => setDTarget(e.target.value)} className="mb-2 w-full rounded border px-2 py-1 text-sm">
                        <option value="">Scene cible…</option>
                        {scenes.filter((s) => s.id !== currentScene?.id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    ) : (
                      <>
                        <input value={dTitle} onChange={(e) => setDTitle(e.target.value)} placeholder="Titre" className="mb-2 w-full rounded border px-2 py-1 text-sm" />
                        {dKind === 'INFO_TEXT'
                          ? <textarea value={dText} onChange={(e) => setDText(e.target.value)} placeholder="Texte" rows={2} className="mb-2 w-full rounded border px-2 py-1 text-sm" />
                          : <input value={dUrl} onChange={(e) => setDUrl(e.target.value)} placeholder="URL (image/video)" className="mb-2 w-full rounded border px-2 py-1 text-sm" />}
                      </>
                    )}
                    <div className="flex gap-2">
                      <button onClick={() => void saveHotspot()} disabled={dKind === 'DIRECTION' && !dTarget} className="flex-1 rounded bg-violet-600 py-1.5 text-sm text-white disabled:opacity-40">Enregistrer</button>
                      <button onClick={() => setDraft(null)} className="rounded bg-slate-200 px-3 text-sm">Annuler</button>
                    </div>
                  </div>
                </div>
              )}
              {infoModal && (
                <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60" onClick={() => setInfoModal(null)}>
                  <div className="max-w-sm rounded-xl bg-white p-4 text-slate-800" onClick={(e) => e.stopPropagation()}>
                    {typeof infoModal.content.title === 'string' && <p className="mb-1 font-semibold">{infoModal.content.title}</p>}
                    {infoModal.type === 'TEXT' && <p className="whitespace-pre-wrap text-sm">{String(infoModal.content.text ?? '')}</p>}
                    {infoModal.type === 'IMAGE' && <img src={String(infoModal.content.url ?? '')} alt="" className="max-h-64 rounded" />}
                    {infoModal.type === 'VIDEO' && <video src={String(infoModal.content.url ?? '')} controls className="max-h-64 rounded" />}
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
                <input type="file" className="hidden" accept="image/*"
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
                    className="w-16 h-12 rounded-lg overflow-hidden flex-shrink-0"
                    style={{ background: '#0a0a0a' }}>
                    {scene.imageUrl ? (
                      <img src={scene.imageUrl} alt={scene.name}
                        className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-stone-600 text-xs">🌐</div>
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
              <input type="file" className="hidden" accept="image/*"
                onChange={e => { void handleUpload360(e); }} disabled={uploading} />
            </label>
          </div>
        </aside>
      </div>
    </div>
  );
}
