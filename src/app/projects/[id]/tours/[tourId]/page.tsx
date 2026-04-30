'use client';
import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface Tour {
  id: string;
  name: string;
  status: string;
}

interface Scene {
  id: string;
  name: string;
  imageUrl: string;
  isInitial: boolean;
  position: number;
}

interface ApiResponse<T> {
  data: T;
  success: boolean;
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
  const [isDragging, setIsDragging] = useState(false);
  const [published, setPublished] = useState(false);

  // Scene management state
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const [dragSceneId, setDragSceneId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Viewer drag
  const startX = useRef(0);
  const rotation = useRef(0);
  const [rotationDeg, setRotationDeg] = useState(0);

  const getToken = (): string => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('bilnov_token') ?? '';
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

  // Upload 360 image
  const handleUpload360 = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const token = getToken();
    const formData = new FormData();
    formData.append('file', file);
    try {
      const fileRes = await fetch(`/api/projects/${id}/files`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const fileData = await fileRes.json() as ApiResponse<{ id: string }>;
      const fileId = fileData.data?.id;
      if (fileId) {
        const sceneRes = await fetch(`/api/projects/${id}/tours/${tourId}/scenes`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileId, name: file.name.replace(/\.[^.]+$/, '') }),
        });
        const sceneData = await sceneRes.json() as ApiResponse<Scene>;
        if (sceneData.data) {
          const newScene = sceneData.data;
          setScenes(prev => [...prev, newScene]);
          setCurrentScene(newScene);
        }
      }
    } catch { alert('Erreur upload'); }
    finally { setUploading(false); e.target.value = ''; }
  };

  // Delete scene
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
        if (currentScene?.id === sceneId) {
          setCurrentScene(next[0] ?? null);
        }
        return next;
      });
    } catch { alert('Erreur suppression'); }
    finally { setDeletingId(null); }
  };

  // Rename scene
  const startEditing = (scene: Scene): void => {
    setEditingSceneId(scene.id);
    setEditingName(scene.name);
  };

  const saveEditing = async (): Promise<void> => {
    if (!editingSceneId || !editingName.trim()) { setEditingSceneId(null); return; }
    try {
      const res = await fetch(`/api/projects/${id}/tours/${tourId}/scenes/${editingSceneId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingName }),
      });
      const data = await res.json() as ApiResponse<Scene>;
      if (data.data) {
        setScenes(prev => prev.map(s => s.id === editingSceneId ? { ...s, name: editingName } : s));
        if (currentScene?.id === editingSceneId) {
          setCurrentScene(prev => prev ? { ...prev, name: editingName } : null);
        }
      }
    } catch { alert('Erreur renommage'); }
    finally { setEditingSceneId(null); }
  };

  // Set initial scene
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

  // Drag reorder
  const handleDragStart = (sceneId: string): void => {
    setDragSceneId(sceneId);
  };

  const handleDragOver = (e: React.DragEvent, sceneId: string): void => {
    e.preventDefault();
    setDragOverId(sceneId);
  };

  const handleDrop = async (targetId: string): Promise<void> => {
    if (!dragSceneId || dragSceneId === targetId) {
      setDragSceneId(null);
      setDragOverId(null);
      return;
    }
    setReordering(true);

    const reordered = [...scenes];
    const fromIdx = reordered.findIndex(s => s.id === dragSceneId);
    const toIdx = reordered.findIndex(s => s.id === targetId);
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);

    const withPositions = reordered.map((s, i) => ({ ...s, position: i }));
    setScenes(withPositions);

    try {
      await fetch(`/api/projects/${id}/tours/${tourId}/scenes/reorder`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: withPositions.map(s => s.id) }),
      });
    } catch { await loadScenes(); }
    finally {
      setDragSceneId(null);
      setDragOverId(null);
      setReordering(false);
    }
  };

  // Move scene up/down
  const moveScene = async (sceneId: string, direction: 'up' | 'down'): Promise<void> => {
    const idx = scenes.findIndex(s => s.id === sceneId);
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === scenes.length - 1) return;

    const reordered = [...scenes];
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    [reordered[idx], reordered[targetIdx]] = [reordered[targetIdx], reordered[idx]];
    const withPositions = reordered.map((s, i) => ({ ...s, position: i }));
    setScenes(withPositions);

    try {
      await fetch(`/api/projects/${id}/tours/${tourId}/scenes/reorder`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: withPositions.map(s => s.id) }),
      });
    } catch { await loadScenes(); }
  };

  // Publish
  const handlePublish = async (): Promise<void> => {
    try {
      await fetch(`/api/projects/${id}/tours/${tourId}/publish`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      setPublished(true);
      setTour(prev => prev ? { ...prev, status: 'PUBLISHED' } : null);
    } catch { alert('Erreur publication'); }
  };

  // Viewer drag
  const handleMouseDown = (e: React.MouseEvent): void => {
    setIsDragging(true);
    startX.current = e.clientX - rotation.current;
  };
  const handleMouseMove = (e: React.MouseEvent): void => {
    if (!isDragging) return;
    rotation.current = e.clientX - startX.current;
    setRotationDeg(rotation.current);
  };
  const handleMouseUp = (): void => setIsDragging(false);

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
          <Link href={`/projects/${id}`}
            className="text-stone-400 hover:text-white transition-colors text-sm">
            ← Retour
          </Link>
          <div className="w-px h-4 bg-stone-700" />
          <span className="font-bold text-white" style={{ fontFamily: 'Syne, sans-serif' }}>
            {tour?.name}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-stone-800 text-stone-400">
            {scenes.length} scène{scenes.length !== 1 ? 's' : ''}
          </span>
          {published && (
            <span className="text-xs px-2 py-0.5 rounded-full"
              style={{ background: '#052e16', color: '#4ade80' }}>
              ● Publié
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <label className={
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all ' +
            (uploading ? 'opacity-60 bg-stone-700 text-stone-300' : 'bg-violet-600 hover:bg-violet-500 text-white')
          }>
            {uploading ? (
              <><span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />Upload...</>
            ) : '+ Image 360°'}
            <input type="file" className="hidden" accept="image/*"
              onChange={e => { void handleUpload360(e); }} disabled={uploading} />
          </label>
          {!published && (
            <button
              onClick={() => { void handlePublish(); }}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors">
              Publier la visite
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Viewer */}
        <div className="flex-1 flex flex-col">
          {currentScene ? (
            <div
              className="flex-1 relative overflow-hidden select-none"
              style={{
                background: '#0a0a0a',
                cursor: isDragging ? 'grabbing' : 'grab',
                minHeight: '400px',
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}>
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  transform: `perspective(1200px) rotateY(${rotationDeg * 0.3}deg)`,
                  transition: isDragging ? 'none' : 'transform 0.15s ease',
                }}>
                {currentScene.imageUrl ? (
                  <img
                    src={currentScene.imageUrl}
                    alt={currentScene.name}
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-3 text-stone-600">
                    <div className="text-6xl opacity-40">🌐</div>
                    <p className="text-sm">Image non disponible</p>
                  </div>
                )}
              </div>

              {/* Overlay info */}
              <div className="absolute top-4 left-4 flex items-center gap-2">
                <div className="px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-black/60">
                  {currentScene.name}
                </div>
                {currentScene.isInitial && (
                  <div className="px-2 py-1 rounded-lg text-xs text-amber-300 bg-black/60">
                    ★ Scène initiale
                  </div>
                )}
              </div>
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-xs text-stone-400 bg-black/50">
                Faites glisser pour naviguer dans la scène
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8"
              style={{ minHeight: '400px' }}>
              <div className="w-24 h-24 rounded-2xl flex items-center justify-center text-5xl mb-6 opacity-30"
                style={{ background: '#1a1a1a' }}>🌐</div>
              <h3 className="text-xl font-bold text-white mb-2"
                style={{ fontFamily: 'Syne, sans-serif' }}>Aucune scène</h3>
              <p className="text-sm text-stone-400 mb-6 max-w-xs">
                Ajoutez votre première image 360° pour créer votre visite virtuelle.
              </p>
              <label className="px-6 py-3 rounded-xl font-medium cursor-pointer bg-violet-600 hover:bg-violet-500 text-white transition-colors">
                + Ajouter image 360°
                <input type="file" className="hidden" accept="image/*"
                  onChange={e => { void handleUpload360(e); }} />
              </label>
            </div>
          )}
        </div>

        {/* Sidebar — scene management */}
        <aside className="w-72 border-l border-stone-800 flex flex-col" style={{ background: '#111' }}>
          {/* Sidebar header */}
          <div className="px-4 py-3 border-b border-stone-800 flex items-center justify-between">
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider">
              Scènes ({scenes.length})
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setReordering(!reordering)}
                className="text-xs px-2 py-1 rounded-lg transition-colors"
                style={{
                  background: reordering ? 'rgba(107,70,193,0.3)' : 'transparent',
                  color: reordering ? '#A78BFA' : '#6B7280',
                }}
                title="Mode réorganisation">
                ↕ Réordonner
              </button>
            </div>
          </div>

          {/* Scenes list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {scenes.length === 0 && (
              <div className="text-center py-8">
                <p className="text-xs text-stone-600">Aucune scène — ajoutez une image 360°</p>
              </div>
            )}

            {scenes.map((scene, i) => (
              <div
                key={scene.id}
                draggable={reordering}
                onDragStart={() => handleDragStart(scene.id)}
                onDragOver={e => handleDragOver(e, scene.id)}
                onDrop={() => { void handleDrop(scene.id); }}
                onDragEnd={() => { setDragSceneId(null); setDragOverId(null); }}
                className="rounded-xl transition-all"
                style={{
                  background: currentScene?.id === scene.id ? 'rgba(107,70,193,0.25)' : '#1a1a1a',
                  border: dragOverId === scene.id
                    ? '2px solid rgba(107,70,193,0.8)'
                    : currentScene?.id === scene.id
                      ? '1px solid rgba(107,70,193,0.5)'
                      : '1px solid transparent',
                  opacity: dragSceneId === scene.id ? 0.5 : 1,
                  cursor: reordering ? 'grab' : 'default',
                }}>

                {/* Scene thumbnail + info */}
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
                      <div className="w-full h-full flex items-center justify-center text-stone-600">🌐</div>
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
                        autoFocus
                      />
                    ) : (
                      <button
                        onClick={() => setCurrentScene(scene)}
                        className="text-left w-full">
                        <p className="text-sm font-medium truncate text-white">{scene.name}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-xs text-stone-500">#{i + 1}</span>
                          {scene.isInitial && (
                            <span className="text-xs text-amber-400">★</span>
                          )}
                        </div>
                      </button>
                    )}
                  </div>

                  {/* Reorder arrows */}
                  {reordering && (
                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={() => { void moveScene(scene.id, 'up'); }}
                        disabled={i === 0}
                        className="w-5 h-5 rounded flex items-center justify-center text-xs text-stone-400 hover:text-white disabled:opacity-30 transition-colors"
                        style={{ background: '#2a2a2a' }}>
                        ↑
                      </button>
                      <button
                        onClick={() => { void moveScene(scene.id, 'down'); }}
                        disabled={i === scenes.length - 1}
                        className="w-5 h-5 rounded flex items-center justify-center text-xs text-stone-400 hover:text-white disabled:opacity-30 transition-colors"
                        style={{ background: '#2a2a2a' }}>
                        ↓
                      </button>
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-1 px-2 pb-2">
                  <button
                    onClick={() => startEditing(scene)}
                    className="flex-1 text-xs py-1 rounded-lg transition-colors text-stone-400 hover:text-white hover:bg-stone-700">
                    ✏️ Renommer
                  </button>
                  {!scene.isInitial && (
                    <button
                      onClick={() => { void setAsInitial(scene.id); }}
                      className="flex-1 text-xs py-1 rounded-lg transition-colors text-stone-400 hover:text-amber-300 hover:bg-stone-700">
                      ★ Initiale
                    </button>
                  )}
                  <button
                    onClick={() => { void handleDeleteScene(scene.id); }}
                    disabled={deletingId === scene.id}
                    className="flex-1 text-xs py-1 rounded-lg transition-colors text-stone-500 hover:text-red-400 hover:bg-stone-700 disabled:opacity-40">
                    {deletingId === scene.id ? '...' : '🗑️ Suppr.'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Add scene button at bottom */}
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
