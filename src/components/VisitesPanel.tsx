'use client';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { fetchWithAuth } from '@/lib/auth-client';

interface Tour360 { id: string; name: string; status: string; }
interface KrpanoTour {
  id: string; name: string; status: 'PROCESSING' | 'READY' | 'ERROR';
  fileCount: number; totalSize: number; sceneCount: number; entryKey: string;
}

interface Props {
  projectId: string;
  canManage: boolean;          // owner : peut créer/supprimer
  getToken: () => string;
}

function fmtSize(b: number): string {
  if (!b) return '';
  const mb = b / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} Mo` : `${(b / 1024).toFixed(0)} Ko`;
}

export default function VisitesPanel({ projectId, canManage, getToken }: Props) {
  const [tours360, setTours360] = useState<Tour360[]>([]);
  const [krpano, setKrpano] = useState<KrpanoTour[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [show360Form, setShow360Form] = useState(false);
  const [name360, setName360] = useState('');
  const [creating360, setCreating360] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<KrpanoTour | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([
        fetchWithAuth(`/api/projects/${projectId}/tours`).then(r => r.json()),
        fetchWithAuth(`/api/projects/${projectId}/krpano`).then(r => r.json()),
      ]);
      setTours360(a.data?.tours ?? []);
      setKrpano(b.data?.tours ?? []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  async function create360() {
    if (!name360.trim()) return;
    setCreating360(true);
    try {
      const res = await fetchWithAuth(`/api/projects/${projectId}/tours`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name360 }),
      });
      const data = await res.json() as { data?: Tour360 };
      if (data.data) { setTours360(prev => [data.data as Tour360, ...prev]); setName360(''); setShow360Form(false); }
    } catch { setError('Erreur création visite 360°'); }
    finally { setCreating360(false); }
  }

  async function runProcessLoop(tourId: string) {
    for (let i = 0; i < 60; i++) {
      const res = await fetchWithAuth(`/api/projects/${projectId}/krpano/${tourId}/process`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => null) as { error?: { message?: string } } | null;
        throw new Error(err?.error?.message ?? 'Le traitement a échoué');
      }
      const { data } = await res.json() as { data: { done?: boolean; uploaded?: number; fileCount?: number } };
      if (data.fileCount) {
        const pct = Math.min(100, Math.round(((data.uploaded ?? 0) / data.fileCount) * 100));
        setPhase(`Traitement… ${pct}% (${data.uploaded}/${data.fileCount} fichiers)`);
      }
      if (data.done) return;
      await load();
    }
    throw new Error('Traitement trop long — relancez « Reprendre ».');
  }

  async function handleKrpanoUpload(file: File) {
    setError(null);
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setError('Sélectionnez une archive .zip (krpano / Pano2VR).'); return;
    }
    setUploading(true); setProgress(0);
    try {
      setPhase("Préparation…");
      const presignRes = await fetchWithAuth(`/api/projects/${projectId}/krpano/presign`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name }),
      });
      if (!presignRes.ok) throw new Error("Impossible d'obtenir l'URL d'upload");
      const { data: presign } = await presignRes.json() as { data: { uploadUrl: string; zipKey: string } };

      setPhase('Envoi de l’archive…');
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', presign.uploadUrl);
        xhr.setRequestHeader('Content-Type', 'application/zip');
        xhr.upload.onprogress = e => { if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100)); };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error(`Upload échoué (${xhr.status})`));
        xhr.onerror = () => reject(new Error('Erreur réseau'));
        xhr.send(file);
      });

      setPhase('Enregistrement…');
      const regRes = await fetchWithAuth(`/api/projects/${projectId}/krpano`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zipKey: presign.zipKey, name: file.name.replace(/\.zip$/i, '') }),
      });
      if (!regRes.ok) throw new Error("Impossible d'enregistrer la visite");
      const { data: tour } = await regRes.json() as { data: KrpanoTour };
      await load();

      setPhase('Décompression et traitement…');
      await runProcessLoop(tour.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur pendant l’upload');
    } finally {
      setUploading(false); setProgress(0); setPhase('');
    }
  }

  async function retryProcess(id: string) {
    setError(null);
    try { await runProcessLoop(id); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Échec de la relance'); }
  }

  async function deleteKrpano(t: KrpanoTour) {
    if (!confirm(`Supprimer la visite « ${t.name} » ?`)) return;
    setDeletingId(t.id);
    try { await fetchWithAuth(`/api/projects/${projectId}/krpano/${t.id}`, { method: 'DELETE' }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Échec suppression'); }
    finally { setDeletingId(null); }
  }

  const total = tours360.length + krpano.length;

  return (
    <div>
      {/* En-tête + bouton création */}
      <div className="flex items-center justify-between mb-4 relative">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {total} visite{total !== 1 ? 's' : ''} virtuelle{total !== 1 ? 's' : ''}
        </p>
        {canManage && (
          <div className="relative">
            <button className="btn-primary text-sm" style={{ minHeight: 40 }} onClick={() => setMenuOpen(o => !o)}>
              ＋ Nouvelle visite
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-1 z-20 rounded-xl shadow-lg overflow-hidden"
                style={{ background: '#fff', border: '1px solid var(--border)', minWidth: 240 }}>
                <button className="block w-full text-left px-4 py-3 text-sm hover:bg-stone-50"
                  onClick={() => { setMenuOpen(false); setShow360Form(true); }}>
                  🌐 <b>Créer une visite 360°</b>
                  <span className="block text-xs" style={{ color: 'var(--text-light)' }}>Ajouter vos panoramas un par un</span>
                </button>
                <button className="block w-full text-left px-4 py-3 text-sm hover:bg-stone-50 border-t" style={{ borderColor: 'var(--border)' }}
                  onClick={() => { setMenuOpen(false); fileInput.current?.click(); }}>
                  🏛️ <b>Importer une archive krpano</b>
                  <span className="block text-xs" style={{ color: 'var(--text-light)' }}>Fichier .zip krpano / Pano2VR</span>
                </button>
              </div>
            )}
            <input ref={fileInput} type="file" accept=".zip,application/zip" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) void handleKrpanoUpload(f); e.target.value = ''; }} />
          </div>
        )}
      </div>

      {/* Form 360° inline */}
      {show360Form && (
        <div className="mb-4 p-4 rounded-2xl border" style={{ background: 'white', borderColor: 'var(--violet-light)' }}>
          <h3 className="font-bold mb-2" style={{ fontFamily: 'Syne, sans-serif' }}>Nouvelle visite 360°</h3>
          <div className="flex flex-col sm:flex-row gap-2">
            <input className="input flex-1" placeholder="Nom de la visite" value={name360} autoFocus
              onChange={e => setName360(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void create360(); }} />
            <button className="btn-primary" disabled={creating360 || !name360.trim()} onClick={() => void create360()}>
              {creating360 ? '...' : 'Créer'}
            </button>
            <button className="btn-secondary" onClick={() => setShow360Form(false)}>Annuler</button>
          </div>
        </div>
      )}

      {/* Barre d'upload krpano */}
      {uploading && (
        <div className="mb-4 p-4 rounded-2xl border" style={{ background: 'white', borderColor: 'var(--violet-light)' }}>
          <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
            <span>{phase}</span>{progress > 0 && <span>{progress}%</span>}
          </div>
          <div className="h-2 w-full rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
            <div className="h-full transition-all" style={{ width: `${progress || 100}%`, background: 'var(--violet)' }} />
          </div>
        </div>
      )}

      {error && <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ background: '#FEF2F2', color: '#B91C1C' }}>{error}</div>}

      {/* Liste unifiée */}
      {loading ? (
        <p style={{ color: 'var(--text-light)' }}>Chargement…</p>
      ) : total === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-4xl mb-4" style={{ background: 'var(--violet-light)' }}>🌐</div>
          <h3 className="text-lg font-bold mb-1" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>Aucune visite virtuelle</h3>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {canManage ? 'Créez une visite 360° ou importez une archive krpano.' : 'Aucune visite pour ce projet.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Cartes 360° */}
          {tours360.map(t => (
            <Link key={`t360-${t.id}`} href={`/projects/${projectId}/tours/${t.id}`}>
              <div className="file-card rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ background: 'var(--violet-light)' }}>🌐</div>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'var(--violet-light)', color: 'var(--violet)' }}>360°</span>
                </div>
                <h3 className="font-bold text-base mb-1 truncate" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>{t.name}</h3>
                <span className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: t.status === 'PUBLISHED' ? '#ECFDF5' : 'var(--surface-2)', color: t.status === 'PUBLISHED' ? '#10B981' : 'var(--text-muted)' }}>
                  {t.status === 'PUBLISHED' ? '● Publié' : '○ Brouillon'}
                </span>
              </div>
            </Link>
          ))}

          {/* Cartes krpano */}
          {krpano.map(t => (
            <div key={`kp-${t.id}`} className="file-card rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ background: 'var(--violet-light)' }}>🏛️</div>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#EEF2FF', color: '#4F46E5' }}>krpano</span>
              </div>
              <h3 className="font-bold text-base mb-1 truncate" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>{t.name}</h3>
              <p className="text-xs mb-3" style={{ color: 'var(--text-light)' }}>
                {t.status === 'READY' ? `${t.sceneCount} scène(s) · ${fmtSize(t.totalSize)}`
                  : t.status === 'PROCESSING' ? 'Traitement en cours…' : 'Échec du traitement'}
              </p>
              <div className="flex gap-2">
                {t.status === 'READY' && (
                  <button className="btn-primary text-xs flex-1" style={{ minHeight: 38 }} onClick={() => setViewing(t)}>👁 Visualiser</button>
                )}
                {t.status === 'ERROR' && canManage && (
                  <button className="btn-secondary text-xs flex-1" style={{ minHeight: 38 }} onClick={() => void retryProcess(t.id)}>↻ Reprendre</button>
                )}
                {canManage && (
                  <button className="btn-secondary text-xs" style={{ minHeight: 38, color: '#EF4444' }}
                    disabled={deletingId === t.id} onClick={() => void deleteKrpano(t)}>
                    {deletingId === t.id ? '…' : '🗑'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Visualiseur krpano plein écran */}
      {viewing && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#000' }}>
          <div className="flex items-center justify-between px-4 py-2" style={{ background: 'var(--text)' }}>
            <span className="text-sm font-medium text-white truncate">{viewing.name}</span>
            <button onClick={() => setViewing(null)} className="rounded-md px-3 text-sm text-white"
              style={{ minHeight: 40, background: 'rgba(255,255,255,.15)' }}>✕ Fermer</button>
          </div>
          <iframe title={viewing.name}
            src={`/api/krpano/${viewing.id}/${viewing.entryKey}?t=${encodeURIComponent(getToken())}`}
            className="flex-1 border-0" allow="accelerometer; gyroscope; fullscreen; xr-spatial-tracking" allowFullScreen />
        </div>
      )}
    </div>
  );
}
