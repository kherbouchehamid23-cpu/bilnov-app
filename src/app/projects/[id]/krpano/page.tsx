'use client';
import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { fetchWithAuth } from '@/lib/auth-client';
import { Upload, Eye, Trash2, RefreshCw, ArrowLeft, Box, X } from 'lucide-react';

interface KrpanoTour {
  id: string;
  name: string;
  description: string | null;
  status: 'PROCESSING' | 'READY' | 'ERROR';
  fileCount: number;
  totalSize: number;
  sceneCount: number;
  entryKey: string;
  createdAt: string;
}

const getToken = (): string =>
  typeof window !== 'undefined' ? localStorage.getItem('bilnov_token') ?? '' : '';

function formatSize(bytes: number): string {
  if (!bytes) return '—';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} Mo` : `${(bytes / 1024).toFixed(0)} Ko`;
}

export default function KrpanoToursPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [tours, setTours] = useState<KrpanoTour[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<KrpanoTour | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadTours = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`/api/projects/${projectId}/krpano`);
      const data = (await res.json()) as { data: { tours: KrpanoTour[] } };
      setTours(data.data?.tours ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadTours();
  }, [loadTours]);

  // --- Flux d'upload : presign -> PUT R2 -> register -> process ---
  async function handleUpload(file: File) {
    setError(null);
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setError('Merci de sélectionner une archive .zip (tour krpano / Pano2VR).');
      return;
    }
    setUploading(true);
    setProgress(0);
    try {
      // 1) URL pré-signée
      setPhase("Préparation de l'upload…");
      const presignRes = await fetchWithAuth(`/api/projects/${projectId}/krpano/presign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name }),
      });
      if (!presignRes.ok) throw new Error("Impossible d'obtenir l'URL d'upload");
      const { data: presign } = (await presignRes.json()) as {
        data: { uploadUrl: string; zipKey: string };
      };

      // 2) Upload direct vers R2 avec barre de progression
      setPhase('Envoi de l’archive…');
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', presign.uploadUrl);
        xhr.setRequestHeader('Content-Type', 'application/zip');
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(new Error(`Upload échoué (${xhr.status})`));
        xhr.onerror = () => reject(new Error('Erreur réseau pendant l’upload'));
        xhr.send(file);
      });

      // 3) Enregistrement du tour (PROCESSING)
      setPhase('Enregistrement…');
      const defaultName = file.name.replace(/\.zip$/i, '');
      const regRes = await fetchWithAuth(`/api/projects/${projectId}/krpano`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zipKey: presign.zipKey, name: defaultName }),
      });
      if (!regRes.ok) throw new Error("Impossible d'enregistrer le tour");
      const { data: tour } = (await regRes.json()) as { data: KrpanoTour };
      await loadTours();

      // 4) Extraction / traitement (repreneable : on relance jusqu'à done)
      setPhase('Décompression et traitement de la visite…');
      await runProcessLoop(tour.id);
      await loadTours();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur pendant l’upload');
    } finally {
      setUploading(false);
      setProgress(0);
      setPhase('');
    }
  }

  // Relance /process tant que le traitement n'est pas terminé (done=false).
  // Chaque appel envoie un lot de fichiers (≈45s max côté serveur) ; on boucle
  // jusqu'à ce que tous les fichiers du tour soient sur R2.
  async function runProcessLoop(tourId: string): Promise<void> {
    for (let i = 0; i < 60; i++) {
      const res = await fetchWithAuth(
        `/api/projects/${projectId}/krpano/${tourId}/process`,
        { method: 'POST' },
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(err?.error?.message ?? 'Le traitement a échoué');
      }
      const { data } = (await res.json()) as {
        data: { done?: boolean; uploaded?: number; fileCount?: number };
      };
      if (data.fileCount) {
        const pct = Math.min(100, Math.round(((data.uploaded ?? 0) / data.fileCount) * 100));
        setPhase(`Traitement de la visite… ${pct}% (${data.uploaded}/${data.fileCount} fichiers)`);
      }
      if (data.done) return;
      await loadTours();
    }
    throw new Error('Traitement trop long — relancez « Reprendre » sur la visite.');
  }

  async function retryProcess(tour: KrpanoTour) {
    setError(null);
    try {
      await runProcessLoop(tour.id);
      await loadTours();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Échec de la relance');
    }
  }

  async function handleDelete(tour: KrpanoTour) {
    if (!confirm(`Supprimer définitivement la visite « ${tour.name} » ?`)) return;
    setDeletingId(tour.id);
    try {
      await fetchWithAuth(`/api/projects/${projectId}/krpano/${tour.id}`, {
        method: 'DELETE',
      });
      await loadTours();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Échec de la suppression');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-5xl">
        <Link
          href={`/projects/${projectId}`}
          className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft size={16} /> Retour au projet
        </Link>

        <div className="mb-6 flex items-center gap-3">
          <Box className="text-indigo-600" size={26} />
          <h1 className="text-2xl font-semibold text-slate-900">Visites virtuelles (krpano / Pano2VR)</h1>
        </div>

        {/* Zone d'upload */}
        <div className="mb-6 rounded-xl border-2 border-dashed border-slate-300 bg-white p-6">
          <label className="flex cursor-pointer flex-col items-center gap-2 text-center">
            <Upload className="text-indigo-500" size={28} />
            <span className="font-medium text-slate-700">
              Glisser ou cliquer pour envoyer une archive .zip de visite
            </span>
            <span className="text-xs text-slate-400">
              L’archive doit contenir tour.html (ou index.html), tour.js, tour.xml, le dossier panos/, etc.
            </span>
            <input
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleUpload(f);
                e.target.value = '';
              }}
            />
          </label>

          {uploading && (
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-xs text-slate-500">
                <span>{phase}</span>
                {progress > 0 && <span>{progress}%</span>}
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full bg-indigo-500 transition-all"
                  style={{ width: `${progress || 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {/* Liste des tours */}
        {loading ? (
          <p className="text-slate-400">Chargement…</p>
        ) : tours.length === 0 ? (
          <p className="rounded-lg bg-white p-6 text-center text-slate-400">
            Aucune visite pour l’instant. Envoyez votre première archive ci-dessus.
          </p>
        ) : (
          <div className="grid gap-3">
            {tours.map((tour) => (
              <div
                key={tour.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-slate-900">{tour.name}</span>
                    <StatusBadge status={tour.status} />
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    {tour.status === 'READY'
                      ? `${tour.sceneCount} scène(s) · ${tour.fileCount} fichiers · ${formatSize(tour.totalSize)}`
                      : tour.status === 'PROCESSING'
                        ? 'Traitement en cours…'
                        : 'Échec du traitement'}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {tour.status === 'READY' && (
                    <button
                      onClick={() => setViewing(tour)}
                      className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
                    >
                      <Eye size={15} /> Visualiser
                    </button>
                  )}
                  {tour.status === 'ERROR' && (
                    <button
                      onClick={() => void retryProcess(tour)}
                      className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600"
                    >
                      <RefreshCw size={15} /> Relancer
                    </button>
                  )}
                  <button
                    onClick={() => void handleDelete(tour)}
                    disabled={deletingId === tour.id}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  >
                    <Trash2 size={15} /> {deletingId === tour.id ? '…' : 'Supprimer'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Visualiseur plein écran (iframe krpano) */}
      {viewing && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black">
          <div className="flex items-center justify-between bg-slate-900 px-4 py-2 text-white">
            <span className="text-sm font-medium">{viewing.name}</span>
            <button
              onClick={() => setViewing(null)}
              className="inline-flex items-center gap-1 rounded-md bg-white/10 px-3 py-1 text-sm hover:bg-white/20"
            >
              <X size={16} /> Fermer
            </button>
          </div>
          <iframe
            title={vi