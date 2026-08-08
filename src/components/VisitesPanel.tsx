'use client';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { fetchWithAuth } from '@/lib/auth-client';
import { Globe, Landmark, Eye, Trash2, Pencil } from 'lucide-react';

interface Tour360 { id: string; name: string; status: string; coverUrl?: string | null; isPublic?: boolean; publicToken?: string | null; sceneCount?: number; visibleSceneCount?: number; }
// Anomalie 3 — panorama équirectangulaire brut détecté à l'upload (fichier IMAGE_360).
// Il s'affiche ici (catégorie 360°) et non plus dans « Images ».
interface Pano { id: string; name: string; coverUrl?: string | null; }
interface KrpanoTour {
  id: string; name: string; status: 'PROCESSING' | 'READY' | 'ERROR';
  fileCount: number; totalSize: number; sceneCount: number; entryKey: string;
}

interface Props {
  projectId: string;
  canManage: boolean;          // owner : peut créer/supprimer
  getToken: () => string;
  publishedOnly?: boolean;
}

export default function VisitesPanel({ projectId, canManage, getToken, publishedOnly }: Props) {
  const [tours360, setTours360] = useState<Tour360[]>([]);
  const [krpano, setKrpano] = useState<KrpanoTour[]>([]);
  const [panos, setPanos] = useState<Pano[]>([]);
  const [cardMenu, setCardMenu] = useState<string | null>(null);
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
      const [a, b, c] = await Promise.all([
        fetchWithAuth(`/api/projects/${projectId}/tours`).then(r => r.json()),
        fetchWithAuth(`/api/projects/${projectId}/krpano`).then(r => r.json()),
        fetchWithAuth(`/api/projects/${projectId}/tours-unified`).then(r => r.json()).catch(() => null),
      ]);
      setTours360(a.data?.tours ?? []);
      setKrpano(b.data?.tours ?? []);
      const items: Array<{ id: string; name: string; kind: string; coverUrl?: string | null }> = c?.data?.items ?? [];
      setPanos(items.filter(it => it.kind === 'pano').map(it => ({ id: it.id, name: it.name, coverUrl: it.coverUrl ?? null })));
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

  const total = tours360.length + krpano.length + panos.length;

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
                  <Globe size={15} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} /><b>Créer une visite 360°</b>
                  <span className="block text-xs" style={{ color: 'var(--text-light)' }}>Ajouter vos panoramas un par un</span>
                </button>
                <button className="block w-full text-left px-4 py-3 text-sm hover:bg-stone-50 border-t" style={{ borderColor: 'var(--border)' }}
                  onClick={() => { setMenuOpen(false); fileInput.current?.click(); }}>
                  <Landmark size={15} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} /><b>Importer une archive krpano</b>
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
        <div className="mb-4 p-4 rounded-2xl border" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
          <h3 className="font-bold mb-2" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>Nouvelle visite 360°</h3>
          <div className="flex flex-col sm:flex-row gap-2">
            <input className="input flex-1" placeholder="Nom de la visite" value={name360} autoFocus
              style={{ color: 'var(--text)', background: 'var(--surface-2)', borderColor: 'var(--border)' }}
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
        <div className="mb-4 p-4 rounded-2xl border" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
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
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'var(--violet-light)' }}><Globe size={32} style={{ color: 'var(--violet)' }} /></div>
          <h3 className="text-lg font-bold mb-1" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>Aucune visite virtuelle</h3>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {canManage ? 'Créez une visite 360° ou importez une archive krpano.' : 'Aucune visite pour ce projet.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Cartes 360° — image large lisible, sigle 360 au-dessus, nom seul ; actions repliées. */}
          {(publishedOnly ? tours360.filter(t => t.status === 'PUBLISHED') : tours360).map(t => {
            const openLink = canManage ? `/projects/${projectId}/tours/${t.id}` : (t.isPublic && t.publicToken ? `/public/${t.publicToken}` : `/projects/${projectId}/tours/${t.id}/view-psv`);
            return (
              <div key={`t360-${t.id}`} className="file-card rounded-2xl overflow-hidden relative">
                <Link href={openLink} className="block">
                  <div className="relative w-full" style={{ height: 190, background: 'var(--surface-2)' }}>
                    {t.coverUrl
                      ? <img src={t.coverUrl} alt={t.name} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center"><Globe size={40} style={{ color: 'var(--violet)' }} /></div>}
                    <span className="absolute top-3 left-3 text-xs px-2.5 py-1 rounded-full font-bold" style={{ background: 'rgba(124,58,237,.95)', color: '#fff', letterSpacing: '.02em' }}>360°</span>
                  </div>
                  <div className="p-4"><h3 className="font-bold text-base truncate" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>{t.name}</h3></div>
                </Link>
                {typeof t.visibleSceneCount === 'number' && typeof t.sceneCount === 'number' && t.visibleSceneCount < t.sceneCount && (
                  <p className="px-4 pb-3 -mt-2 text-[11px]" style={{ color: '#B45309' }}>🚫 {t.sceneCount - t.visibleSceneCount} masquée(s) · {t.visibleSceneCount}/{t.sceneCount} visibles</p>
                )}
                {canManage && (
                  <div className="absolute top-2 right-2">
                    <button type="button" aria-label="Actions" onClick={(e) => { e.preventDefault(); setCardMenu(cardMenu === `t-${t.id}` ? null : `t-${t.id}`); }} className="rounded-full flex items-center justify-center" style={{ width: 34, height: 34, background: 'rgba(0,0,0,.45)', color: '#fff' }}>⋯</button>
                    {cardMenu === `t-${t.id}` && (
                      <div className="absolute right-0 mt-1 z-20 rounded-xl shadow-lg overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 190 }}>
                        <Link href={`/projects/${projectId}/tours/${t.id}`} onClick={() => setCardMenu(null)} className="block px-4 py-3 text-sm hover:bg-stone-50" style={{ color: 'var(--text)' }}><Pencil size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 8, color: 'var(--violet)' }} />Gérer les scènes</Link>
                        <Link href={`/projects/${projectId}/tours/${t.id}/view-psv`} onClick={() => setCardMenu(null)} className="block px-4 py-3 text-sm hover:bg-stone-50 border-t" style={{ color: 'var(--text)', borderColor: 'var(--border)' }}><Eye size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 8, color: 'var(--text-muted)' }} />Aperçu</Link>
                        {t.status !== 'PUBLISHED' && (
                          <button type="button" onClick={async (e) => { e.preventDefault(); setCardMenu(null); await fetchWithAuth(`/api/projects/${projectId}/tours/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'PUBLISHED' }) }); load(); }} className="block w-full text-left px-4 py-3 text-sm hover:bg-stone-50 border-t" style={{ color: '#10B981', borderColor: 'var(--border)' }}>✓ Publier</button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Cartes krpano — même mise en page, actions repliées derrière un bouton. */}
          {(publishedOnly ? krpano.filter(t => t.status === 'READY') : krpano).map(t => (
            <div key={`kp-${t.id}`} className="file-card rounded-2xl overflow-hidden relative">
              <button type="button" disabled={t.status !== 'READY'} onClick={() => t.status === 'READY' && setViewing(t)} className="block w-full text-left">
                <div className="relative w-full flex items-center justify-center" style={{ height: 190, background: 'var(--surface-2)' }}>
                  <Landmark size={40} style={{ color: 'var(--violet)' }} />
                  <span className="absolute top-3 left-3 text-xs px-2.5 py-1 rounded-full font-bold" style={{ background: '#4F46E5', color: '#fff' }}>360° krpano</span>
                  {t.status !== 'READY' && <span className="absolute inset-0 flex items-center justify-center text-xs font-medium" style={{ background: 'rgba(0,0,0,.4)', color: '#fff' }}>{t.status === 'PROCESSING' ? 'Traitement…' : 'Échec du traitement'}</span>}
                </div>
                <div className="p-4"><h3 className="font-bold text-base truncate" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>{t.name}</h3></div>
              </button>
              {canManage && (
                <div className="absolute top-2 right-2">
                  <button type="button" aria-label="Actions" onClick={(e) => { e.preventDefault(); setCardMenu(cardMenu === `k-${t.id}` ? null : `k-${t.id}`); }} className="rounded-full flex items-center justify-center" style={{ width: 34, height: 34, background: 'rgba(0,0,0,.45)', color: '#fff' }}>⋯</button>
                  {cardMenu === `k-${t.id}` && (
                    <div className="absolute right-0 mt-1 z-20 rounded-xl shadow-lg overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 180 }}>
                      {t.status === 'READY' && <button type="button" onClick={() => { setCardMenu(null); setViewing(t); }} className="block w-full text-left px-4 py-3 text-sm hover:bg-stone-50" style={{ color: 'var(--text)' }}><Eye size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 8, color: 'var(--violet)' }} />Visualiser</button>}
                      {t.status === 'ERROR' && <button type="button" onClick={() => { setCardMenu(null); void retryProcess(t.id); }} className="block w-full text-left px-4 py-3 text-sm hover:bg-stone-50" style={{ color: 'var(--text)' }}>↻ Reprendre</button>}
                      <button type="button" disabled={deletingId === t.id} onClick={() => { setCardMenu(null); void deleteKrpano(t); }} className="block w-full text-left px-4 py-3 text-sm hover:bg-stone-50 border-t" style={{ color: '#EF4444', borderColor: 'var(--border)' }}><Trash2 size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 8 }} />{deletingId === t.id ? 'Suppression…' : 'Supprimer'}</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Cartes panorama 360° brut (fichiers IMAGE_360 détectés à l'upload). */}
          {panos.map(p => (
            <div key={`pano-${p.id}`} className="file-card rounded-2xl overflow-hidden">
              <Link href={`/projects/${projectId}/files/${p.id}/pano`} className="block">
                <div className="relative w-full" style={{ height: 190, background: 'var(--surface-2)' }}>
                  {p.coverUrl
                    ? <img src={p.coverUrl} alt={p.name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center"><Globe size={40} style={{ color: 'var(--violet)' }} /></div>}
                  <span className="absolute top-3 left-3 text-xs px-2.5 py-1 rounded-full font-bold" style={{ background: 'rgba(124,58,237,.95)', color: '#fff' }}>360°</span>
                </div>
                <div className="p-4"><h3 className="font-bold text-base truncate" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>{p.name}</h3></div>
              </Link>
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
