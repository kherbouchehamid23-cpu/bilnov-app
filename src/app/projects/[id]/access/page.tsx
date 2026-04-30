'use client';
import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface AccessCode {
  id: string;
  displayCode: string;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
  shareRule: {
    canView: boolean;
    canDownload: boolean;
    canUpload: boolean;
    canShare: boolean;
  } | null;
  _count: {
    accessLogs: number;
  };
}

interface CreateCodeForm {
  canView: boolean;
  canDownload: boolean;
  canUpload: boolean;
  canShare: boolean;
  expiresInDays: string;
}

interface ApiResponse<T> {
  data: T;
  success: boolean;
}

export default function AccessCodesPage() {
  const params = useParams();
  const id = params.id as string;

  const [codes, setCodes] = useState<AccessCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newCode, setNewCode] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState<CreateCodeForm>({
    canView: true,
    canDownload: false,
    canUpload: false,
    canShare: false,
    expiresInDays: '30',
  });

  const getToken = (): string => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('bilnov_token') ?? '';
  };

  const fetchCodes = async (): Promise<void> => {
    try {
      const res = await fetch(`/api/projects/${id}/access-codes`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json() as ApiResponse<{ codes: AccessCode[] }>;
      setCodes(data.data?.codes ?? []);
    } catch {
      setCodes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchCodes();
  }, [id]);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError('');
    setCreating(true);
    try {
      const res = await fetch(`/api/projects/${id}/access-codes`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          canView: form.canView,
          canDownload: form.canDownload,
          canUpload: form.canUpload,
          canShare: form.canShare,
          expiresInDays: form.expiresInDays ? parseInt(form.expiresInDays, 10) : null,
        }),
      });
      const data = await res.json() as ApiResponse<{ displayCode: string }>;
      if (!res.ok) {
        const errData = data as unknown as { error?: { message?: string } };
        setError(errData.error?.message ?? 'Erreur lors de la création');
      } else {
        setNewCode(data.data.displayCode);
        setShowForm(false);
        void fetchCodes();
      }
    } catch {
      setError('Erreur lors de la création');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (codeId: string): Promise<void> => {
    if (!confirm('Désactiver ce code d\'accès ?')) return;
    try {
      await fetch(`/api/projects/${id}/access-codes/${codeId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      void fetchCodes();
    } catch {
      alert('Erreur lors de la désactivation');
    }
  };

  const copyCode = (code: string): void => {
    void navigator.clipboard.writeText(code);
  };

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return 'Jamais';
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--surface)' }}>
      {/* Header */}
      <header className="sticky top-0 z-40 glass border-b px-6 py-4"
        style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href={`/projects/${id}`}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-stone-100 transition-colors"
              style={{ color: 'var(--text-muted)' }}>
              ←
            </Link>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--violet)' }}>
              <span className="text-white font-bold text-sm">B</span>
            </div>
            <span className="font-bold" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>
              Codes de partage
            </span>
          </div>
          <button className="btn-primary text-sm" onClick={() => { setShowForm(true); setNewCode(null); }}>
            + Créer un code
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Nouveau code affiché après création */}
        {newCode && (
          <div className="mb-8 p-6 rounded-2xl border animate-fade-up"
            style={{ background: '#ECFDF5', borderColor: '#A7F3D0' }}>
            <h3 className="font-bold text-base mb-2" style={{ color: '#10B981' }}>
              ✓ Code créé avec succès !
            </h3>
            <p className="text-sm mb-4" style={{ color: '#065F46' }}>
              Partagez ce code avec vos intervenants. Il ne sera plus affiché après cette page.
            </p>
            <div className="flex items-center gap-3">
              <div className="flex-1 px-6 py-4 rounded-xl text-center font-mono text-3xl font-bold tracking-[0.3em]"
                style={{ background: 'white', color: 'var(--violet)', border: '2px solid var(--violet-light)' }}>
                {newCode}
              </div>
              <button
                onClick={() => copyCode(newCode)}
                className="btn-primary px-4 py-4">
                📋 Copier
              </button>
            </div>
          </div>
        )}

        {/* Formulaire création */}
        {showForm && (
          <div className="mb-8 p-6 rounded-2xl border animate-fade-up"
            style={{ background: 'white', borderColor: 'var(--violet-light)' }}>
            <h2 className="font-bold text-lg mb-5"
              style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>
              Nouveau code d&apos;accès
            </h2>

            <form onSubmit={(e) => { void handleCreate(e); }} className="space-y-5">
              <div>
                <label className="block text-sm font-medium mb-3" style={{ color: 'var(--text)' }}>
                  Permissions accordées
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { key: 'canView' as const, label: '👁️ Voir', desc: 'Accès en lecture' },
                    { key: 'canDownload' as const, label: '⬇️ Télécharger', desc: 'Télécharger les fichiers' },
                    { key: 'canUpload' as const, label: '⬆️ Uploader', desc: 'Ajouter des fichiers' },
                    { key: 'canShare' as const, label: '🔗 Partager', desc: 'Créer des codes' },
                  ]).map(perm => (
                    <button
                      key={perm.key}
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, [perm.key]: !prev[perm.key] }))}
                      className="p-3 rounded-xl border-2 text-left transition-all"
                      style={{
                        borderColor: form[perm.key] ? 'var(--violet)' : 'var(--border)',
                        background: form[perm.key] ? 'var(--violet-light)' : 'white',
                      }}>
                      <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                        {perm.label}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {perm.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
                  Expiration
                </label>
                <select
                  value={form.expiresInDays}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    setForm(prev => ({ ...prev, expiresInDays: e.target.value }))}
                  className="input">
                  <option value="7">7 jours</option>
                  <option value="30">30 jours</option>
                  <option value="90">90 jours</option>
                  <option value="365">1 an</option>
                  <option value="">Jamais</option>
                </select>
              </div>

              {error && (
                <div className="p-3 rounded-xl text-sm"
                  style={{ background: '#FEF2F2', color: '#EF4444', border: '1px solid #FECACA' }}>
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button type="submit" disabled={creating} className="btn-primary">
                  {creating ? 'Création...' : 'Générer le code'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setError(''); }}
                  className="btn-secondary">
                  Annuler
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Liste des codes */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-lg"
              style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>
              Codes actifs
            </h2>
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {codes.filter(c => c.isActive).length} code{codes.filter(c => c.isActive).length !== 1 ? 's' : ''}
            </span>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2].map(i => <div key={i} className="h-24 rounded-2xl skeleton" />)}
            </div>
          ) : codes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-4"
                style={{ background: 'var(--violet-light)' }}>
                🔗
              </div>
              <h3 className="font-bold text-base mb-2" style={{ color: 'var(--text)' }}>
                Aucun code de partage
              </h3>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Créez un code pour partager l&apos;accès à ce projet.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {codes.map(code => (
                <div key={code.id}
                  className="p-5 rounded-2xl border bg-white"
                  style={{
                    borderColor: code.isActive ? 'var(--border)' : '#FCA5A5',
                    opacity: code.isActive ? 1 : 0.6,
                  }}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-4">
                      {/* Code display */}
                      <div className="font-mono text-xl font-bold tracking-widest px-4 py-2 rounded-xl"
                        style={{ background: 'var(--violet-light)', color: 'var(--violet)' }}>
                        {code.displayCode}
                      </div>

                      <div>
                        {/* Permissions */}
                        <div className="flex gap-2 flex-wrap mb-1">
                          {code.shareRule?.canView && (
                            <span className="text-xs px-2 py-0.5 rounded-full"
                              style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
                              👁️ Voir
                            </span>
                          )}
                          {code.shareRule?.canDownload && (
                            <span className="text-xs px-2 py-0.5 rounded-full"
                              style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
                              ⬇️ Télécharger
                            </span>
                          )}
                          {code.shareRule?.canUpload && (
                            <span className="text-xs px-2 py-0.5 rounded-full"
                              style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
                              ⬆️ Uploader
                            </span>
                          )}
                        </div>
                        <p className="text-xs" style={{ color: 'var(--text-light)' }}>
                          Expire : {formatDate(code.expiresAt)} ·{' '}
                          {code._count.accessLogs} accès
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => copyCode(code.displayCode)}
                        className="btn-secondary text-xs px-3 py-1.5">
                        📋 Copier
                      </button>
                      {code.isActive && (
                        <button
                          onClick={() => { void handleRevoke(code.id); }}
                          className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                          style={{
                            background: '#FEF2F2',
                            color: '#EF4444',
                            border: '1px solid #FECACA',
                          }}>
                          Désactiver
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
