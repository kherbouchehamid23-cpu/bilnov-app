'use client';
import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api-client';

export default function ProjectPage() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [files, setFiles] = useState([]);
  const [tours, setTours] = useState([]);
  const [tab, setTab] = useState('files');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [openingId, setOpeningId] = useState(null);
  const [showTourForm, setShowTourForm] = useState(false);
  const [tourName, setTourName] = useState('');
  const [creatingTour, setCreatingTour] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/api/projects/' + id),
      api.get('/api/projects/' + id + '/files'),
      api.get('/api/projects/' + id + '/tours'),
    ]).then(([p, f, t]) => {
      setProject(p.data);
      setFiles(f.data?.files ?? []);
      setTours(t.data?.tours ?? []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const token = localStorage.getItem('bilnov_token');
      await fetch('/api/projects/' + id + '/files', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: formData });
      const r = await api.get('/api/projects/' + id + '/files');
      setFiles(r.data?.files ?? []);
    } catch (err) { alert(err.message ?? 'Erreur upload'); }
    finally { setUploading(false); e.target.value = ''; }
  };

  const openFile = async (fileId) => {
    if (openingId) return;
    setOpeningId(fileId);
    try {
      const token = localStorage.getItem('bilnov_token');
      const res = await fetch('/api/file-url/' + fileId + '?purpose=view', { headers: { Authorization: 'Bearer ' + token } });
      const data = await res.json();
      if (data?.data?.url) window.open(data.data.url, '_blank');
      else alert('Impossible obtenir le lien');
    } catch { alert('Erreur'); }
    finally { setOpeningId(null); }
  };

  const createTour = async () => {
    setCreatingTour(true);
    try {
      const token = localStorage.getItem('bilnov_token');
      const res = await fetch('/api/projects/' + id + '/tours', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: tourName }),
      });
      const data = await res.json();
      if (data.data) { setTours(prev => [data.data, ...prev]); setTourName(''); setShowTourForm(false); }
    } catch { alert('Erreur'); }
    finally { setCreatingTour(false); }
  };

  const icons = { IMAGE:'🖼️', IMAGE_360:'🌐', PDF:'📄', VIDEO:'🎥', GLB:'🧊', GLTF:'🧊', OBJ:'🧊' };

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--surface)' }}><div className="text-sm" style={{ color: 'var(--text-muted)' }}>Chargement...</div></div>;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--surface)' }}>
      <header className="sticky top-0 z-40 glass border-b px-6 py-4" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-stone-100 transition-colors" style={{ color: 'var(--text-muted)' }}>←</Link>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--violet)' }}><span className="text-white font-bold text-sm">B</span></div>
            <span className="font-bold" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>{project?.name}</span>
            {project?.sector && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--violet-light)', color: 'var(--violet)' }}>{project.sector}</span>}
          </div>
          {tab === 'files' && (
            <label className={'btn-primary text-sm cursor-pointer ' + (uploading ? 'opacity-60' : '')}>
              {uploading ? 'Upload...' : '+ Ajouter fichier'}
              <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
            </label>
          )}
          {tab === 'tours' && <button className="btn-primary text-sm" onClick={() => setShowTourForm(true)}>+ Nouvelle visite 360°</button>}
        </div>
      </header>

      <div className="border-b" style={{ background: 'white', borderColor: 'var(--border)' }}>
        <div className="max-w-6xl mx-auto px-6 flex gap-1">
          {[{key:'files',label:'Fichiers',count:files.length},{key:'tours',label:'Visites 360°',count:tours.length}].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors"
              style={{ borderColor: tab === t.key ? 'var(--violet)' : 'transparent', color: tab === t.key ? 'var(--violet)' : 'var(--text-muted)' }}>
              {t.label}
              <span className="px-1.5 py-0.5 rounded-full text-xs" style={{ background: tab === t.key ? 'var(--violet-light)' : 'var(--surface-2)', color: tab === t.key ? 'var(--violet)' : 'var(--text-muted)' }}>{t.count}</span>
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-6 py-8 w-full">
        {tab === 'files' && (
          files.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="text-4xl mb-3">📂</div>
              <p style={{ color: 'var(--text-muted)' }}>Aucun fichier. Uploadez votre premier fichier.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {files.map(file => (
                  <div className="text-3xl mb-3 text-center">{openingId === file.id ? '⏳' : (icons[file.fileType] ?? '📁')}</div>
                  <p className="text-sm font-medium truncate mb-1" style={{ color: 'var(--text)' }}>{file.name}</p>
                  <p className="text-xs mb-2" style={{ color: 'var(--text-light)' }}>{Math.round(Number(file.sizeBytes)/1024)} Ko</p>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>{file.fileType}</span>
                </button>
              ))}
            </div>
          )
        )}

        {tab === 'tours' && (
          <>
            {showTourForm && (
              <div className="mb-6 p-5 rounded-2xl border" style={{ background: 'white', borderColor: 'var(--violet-light)' }}>
                <h3 className="font-bold mb-3" style={{ fontFamily: 'Syne, sans-serif' }}>Nouvelle visite 360°</h3>
                <div className="flex gap-3">
                  <input className="input flex-1" placeholder="Nom de la visite" value={tourName} onChange={e => setTourName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createTour()} autoFocus />
                  <button onClick={() => setShowTourForm(false)} className="btn-secondary">Annuler</button>
                </div>
              </div>
            )}
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-4xl mb-5" style={{ background: 'var(--violet-light)' }}>🌐</div>
                <h3 className="text-xl font-bold mb-2" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>Aucune visite 360°</h3>
                <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Créez votre première visite virtuelle immersive.</p>
                <button className="btn-primary" onClick={() => setShowTourForm(true)}>+ Créer une visite 360°</button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {tours.map(tour => (
                  <Link key={tour.id} href={'/projects/' + id + '/tours/' + tour.id}>
                    <div className="file-card rounded-2xl p-5">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-4" style={{ background: 'var(--violet-light)' }}>🌐</div>
                      <h3 className="font-bold text-base mb-1" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>{tour.name}</h3>
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: tour.status === 'PUBLISHED' ? '#ECFDF5' : 'var(--surface-2)', color: tour.status === 'PUBLISHED' ? '#10B981' : 'var(--text-muted)' }}>
                        {tour.status === 'PUBLISHED' ? '● Publié' : '○ Brouillon'}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
