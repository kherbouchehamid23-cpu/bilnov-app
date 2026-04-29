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
  const startX = useRef(0);
  const rotation = useRef(0);
  const [rotationDeg, setRotationDeg] = useState(0);

  useEffect(() => {
    const token = localStorage.getItem('bilnov_token') ?? '';
    void Promise.all([
      fetch('/api/projects/' + id + '/tours/' + tourId, {
        headers: { Authorization: 'Bearer ' + token },
      }).then(r => r.json()) as Promise<{ data: Tour }>,
      fetch('/api/projects/' + id + '/tours/' + tourId + '/scenes', {
        headers: { Authorization: 'Bearer ' + token },
      }).then(r => r.json()) as Promise<{ data: { scenes: Scene[] } }>,
    ]).then(([t, s]) => {
      setTour(t.data);
      const list = s.data?.scenes ?? [];
      setScenes(list);
      if (list.length > 0) setCurrentScene(list[0]);
    }).finally(() => setLoading(false));
  }, [id, tourId]);

  const handleUpload360 = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const token = localStorage.getItem('bilnov_token') ?? '';
    const formData = new FormData();
    formData.append('file', file);
    try {
      const fileRes = await fetch('/api/projects/' + id + '/files', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
        body: formData,
      });
      const fileData = await fileRes.json() as { data?: { id: string } };
      const fileId = fileData.data?.id;
      if (fileId) {
        const sceneRes = await fetch('/api/projects/' + id + '/tours/' + tourId + '/scenes', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileId, name: file.name.replace(/\.[^.]+$/, '') }),
        });
        const sceneData = await sceneRes.json() as { data?: Scene };
        if (sceneData.data) {
          const newScene = sceneData.data;
          setScenes(prev => [...prev, newScene]);
          if (!currentScene) setCurrentScene(newScene);
        }
      }
    } catch {
      alert('Erreur upload');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    startX.current = e.clientX - rotation.current;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    rotation.current = e.clientX - startX.current;
    setRotationDeg(rotation.current);
  };

  const handleMouseUp = () => setIsDragging(false);

  const publish = async () => {
    const token = localStorage.getItem('bilnov_token') ?? '';
    await fetch('/api/projects/' + id + '/tours/' + tourId + '/publish', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
    });
    alert('Visite publiée !');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: '#0f0f0f' }}>
        <div className="text-sm text-stone-400">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0f0f0f' }}>
      <header className="flex items-center justify-between px-6 py-4 border-b border-stone-800">
        <div className="flex items-center gap-3">
          <Link href={'/projects/' + id}
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
        </div>
        <div className="flex items-center gap-3">
          <label className={
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all ' +
            (uploading ? 'opacity-60 bg-stone-700 text-stone-300' : 'bg-violet-600 hover:bg-violet-500 text-white')
          }>
            {uploading ? 'Upload...' : '+ Image 360°'}
            <input type="file" className="hidden" accept="image/*"
              onChange={e => { void handleUpload360(e); }} disabled={uploading} />
          </label>
          <button onClick={() => { void publish(); }}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors">
            Publier
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col">
          {currentScene ? (
            <div
              className="flex-1 relative overflow-hidden"
              style={{
                background: '#0a0a0a',
                cursor: isDragging ? 'grabbing' : 'grab',
                minHeight: '500px',
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  transform: `perspective(1000px) rotateY(${rotationDeg * 0.3}deg)`,
                  transition: isDragging ? 'none' : 'transform 0.1s ease',
                }}>
                {currentScene.imageUrl ? (
                  <img
                    src={currentScene.imageUrl}
                    alt={currentScene.name}
                    className="w-full h-full object-cover select-none"
                    draggable={false}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-4 text-stone-500">
                    <div className="text-6xl opacity-30">🌐</div>
                    <p className="text-sm">Image non disponible</p>
                  </div>
                )}
              </div>
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-xs text-stone-400 bg-black/50">
                Faites glisser pour naviguer
              </div>
              <div className="absolute top-4 left-4 px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-black/50">
                {currentScene.name}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8"
              style={{ minHeight: '500px' }}>
              <div className="w-24 h-24 rounded-2xl flex items-center justify-center text-5xl mb-6 opacity-30"
                style={{ background: '#1a1a1a' }}>🌐</div>
              <h3 className="text-xl font-bold text-white mb-2"
                style={{ fontFamily: 'Syne, sans-serif' }}>Aucune scène</h3>
              <p className="text-sm text-stone-400 mb-6 max-w-xs">
                Ajoutez votre première image 360° pour créer votre visite.
              </p>
              <label className="px-6 py-3 rounded-xl font-medium cursor-pointer bg-violet-600 hover:bg-violet-500 text-white transition-colors">
                + Ajouter image 360°
                <input type="file" className="hidden" accept="image/*"
                  onChange={e => { void handleUpload360(e); }} />
              </label>
            </div>
          )}
        </div>

        <aside className="w-64 border-l border-stone-800 flex flex-col" style={{ background: '#111' }}>
          <div className="px-4 py-3 border-b border-stone-800">
            <p className="text-xs font-medium text-stone-400 uppercase tracking-wider">
              Scènes ({scenes.length})
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {scenes.map((scene, i) => (
              <button
                key={scene.id}
                onClick={() => setCurrentScene(scene)}
                className="w-full text-left p-3 rounded-xl transition-all"
                style={{
                  background: currentScene?.id === scene.id ? 'rgba(107,70,193,0.3)' : '#1a1a1a',
                  border: currentScene?.id === scene.id
                    ? '1px solid rgba(107,70,193,0.5)'
                    : '1px solid transparent',
                }}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-stone-500 w-5 text-center">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate text-white">{scene.name}</p>
                    {scene.isInitial && (
                      <p className="text-xs text-amber-400">★ Initiale</p>
                    )}
                  </div>
                </div>
              </button>
            ))}
            {scenes.length === 0 && (
              <div className="text-center py-8">
                <p className="text-xs text-stone-600">Aucune scène</p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
