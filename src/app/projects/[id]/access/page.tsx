'use client';
import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import QRCode from 'qrcode';
import dynamic from 'next/dynamic';
import type { TreeNode, ScopeValue } from '@/components/NodeTreeSelect';
const NodeTreeSelect = dynamic(() => import('@/components/NodeTreeSelect'), { ssr: false });

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
    allowedNodeIds?: string[];
    allowedFileIds?: string[];
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
  commentShareMode: string;
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
  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const [rootCount, setRootCount] = useState(0);
  const [scope, setScope] = useState<ScopeValue | null>(null);
  const [editingCode, setEditingCode] = useState<AccessCode | null>(null);
  const [editScope, setEditScope] = useState<ScopeValue | null>(null);
  const [editPerms, setEditPerms] = useState({ canView: true, canDownload: false, canUpload: false, canShare: false });
  const [savingEdit, setSavingEdit] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newCode, setNewCode] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [shareUrl, setShareUrl] = useState<string>('');
  const [copied, setCopied] = useState<string>('');
  const [error, setError] = useState('');
  const [form, setForm] = useState<CreateCodeForm>({
    canView: true,
    canDownload: false,
    canUpload: false,
    canShare: false,
    commentShareMode: 'NONE',
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
    void (async () => {
      try {
        const r = await fetch(`/api/projects/${id}/nodes`, { headers: { Authorization: `Bearer ${getToken()}` } });
        const d = await r.json() as { data?: { nodes?: TreeNode[] } };
        setNodes(d.data?.nodes ?? []);
      } catch { /* ignore */ }
      try {
        const rf = await fetch(`/api/projects/${id}/files`, { headers: { Authorization: `Bearer ${getToken()}` } });
        const df = await rf.json() as { data?: { files?: { nodeId: string | null }[] } };
        setRootCount((df.data?.files ?? []).filter(x => !x.nodeId).length);
      } catch { /* ignore */ }
    })();
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
          commentShareMode: form.commentShareMode,
          expiresInDays: form.expiresInDays ? parseInt(form.expiresInDays, 10) : null,
          allowedNodeIds: scope?.nodeIds ?? [],
          allowedFileIds: scope?.fileIds ?? [],
        }),
      });
      const data = await res.json() as ApiResponse<{ displayCode: string }>;
      if (!res.ok) {
        const errData = data as unknown as { error?: { message?: string } };
        setError(errData.error?.message ?? 'Erreur lors de la création');
      } else {
        const code = data.data.displayCode;
        setNewCode(code);
        const url = `${window.location.origin}/access?code=${code}`;
        setShareUrl(url);
        try {
          const qr = await QRCode.toDataURL(url, { width: 240, margin: 1 });
          setQrDataUrl(qr);
        } catch { /* QR optionnel */ }
        setShowForm(false);
        void fetchCodes();
      }
    } catch {
      setError('Erreur lors de la création');
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (code: AccessCode): void => {
    setEditingCode(code);
    const n = code.shareRule?.allowedNodeIds ?? [];
    const fids = code.shareRule?.allowedFileIds ?? [];
    setEditScope(n.length === 0 && fids.length === 0 ? null : { nodeIds: n, fileIds: fids });
    setEditPerms({
      canView: code.shareRule?.canView ?? true,
      canDownload: code.shareRule?.canDownload ?? false,
      canUpload: code.shareRule?.canUpload ?? false,
      canShare: code.shareRule?.canShare ?? false,
    });
  };

  const saveEdit = async (): Promise<void> => {
    if (!editingCode) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/projects/${id}/access-codes/${editingCode.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editPerms,
          allowedNodeIds: editScope?.nodeIds ?? [],
          allowedFileIds: editScope?.fileIds ?? [],
        }),
      });
      if (!res.ok) throw new Error('Erreur lors de la modification');
      setEditingCode(null);
      void fetchCodes();
    } catch {
      alert('Impossible de modifier ce partage');
    } finally {
      setSavingEdit(false);
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
    setCopied('code');
    setTimeout(() => setCopied(''), 1500);
  };

  const copyLink = (): void => {
    void navigator.clipboard.writeText(shareUrl);
    setCopied('link');
    setTimeout(() => setCopied(''), 1500);
  };

  const shareLink = async (): Promise<void> => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Accès partagé — BILNOV',
          text: `Accédez aux fichiers du projet avec ce lien (code ${newCode}) :`,
          url: shareUrl,
        });
      } catch { /* annulé */ }
    } else {
      copyLink();
    }
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
            <h3 className="font-bold text-base mb-1" style={{ color: '#10B981' }}>
              ✓ Code créé avec succès !
            </h3>
            <p className="text-sm mb-4" style={{ color: '#065F46' }}>
              Envoyez le lien (ou le QR code) à votre intervenant : il accède directement aux fichiers, sans compte.
            </p>

            <div className="flex flex-col md:flex-row gap-5 items-stretch">
              {/* QR code */}
              {qrDataUrl && (
                <div className="flex flex-col items-center justify-center bg-white rounded-xl p-3"
                  style={{ border: '1px solid #A7F3D0' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrDataUrl} alt="QR code d'accès" width={150} height={150} />
                  <span className="text-xs mt-1" style={{ color: '#065F46' }}>Scanner pour ouvrir</span>
                </div>
              )}

              <div className="flex-1 flex flex-col gap-3">
                {/* Code 6 chiffres */}
                <div>
                  <p className="text-xs mb-1" style={{ color: '#065F46' }}>Code à 6 chiffres</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 px-4 py-3 rounded-xl text-center font-mono text-2xl font-bold tracking-[0.3em]"
                      style={{ background: 'white', color: 'var(--violet)', border: '2px solid var(--violet-light)' }}>
                      {newCode}
                    </div>
                    <button onClick={() => copyCode(newCode)} className="btn-secondary" style={{ minHeight: 44 }}>
                      {copied === 'code' ? '✓' : '📋'}
                    </button>
                  </div>
                </div>

                {/* Lien partageable */}
                <div>
                  <p className="text-xs mb-1" style={{ color: '#065F46' }}>Lien direct</p>
                  <div className="flex items-center gap-2">
                    <input readOnly value={shareUrl}
                      onFocus={e => e.currentTarget.select()}
                      className="flex-1 px-3 py-2 rounded-xl text-sm font-mono"
                      style={{ background: 'white', border: '1px solid #A7F3D0', color: 'var(--text)' }} />
                    <button onClick={copyLink} className="btn-secondary" style={{ minHeight: 44 }}>
                      {copied === 'link' ? '✓' : '🔗'}
                    </button>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-1">
                  <button onClick={() => { void shareLink(); }} className="btn-primary flex-1" style={{ minHeight: 44 }}>
                    📤 Partager
                  </button>
                  <a href={shareUrl} target="_blank" rel="noopener noreferrer"
                    className="btn-secondary flex items-center justify-center px-4" style={{ minHeight: 44 }}>
                    Tester
                  </a>
                </div>
              </div>
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
                  Commentaires partagés
                </label>
                <select
                  value={form.commentShareMode}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    setForm(prev => ({ ...prev, commentShareMode: e.target.value }))}
                  className="input">
                  <option value="NONE">Aucun (plan seul)</option>
                  <option value="ALL">Tous les commentaires</option>
                  <option value="OPEN">Uniquement les commentaires ouverts</option>
                  <option value="UNRESOLVED">Uniquement les non résolus</option>
                </select>
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

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
                  Contenu partagé
                </label>
                <NodeTreeSelect projectId={id} nodes={nodes} value={scope} onChange={setScope} getToken={getToken} rootFilesCount={rootCount} />
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
                          onClick={() => startEdit(code)}
                          className="btn-secondary text-xs px-3 py-1.5">
                          ✎ Modifier
                        </button>
                      )}
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

                  {/* Panneau d'édition inline */}
                  {editingCode?.id === code.id && (
                    <div className="mt-4 pt-4 border-t space-y-4" style={{ borderColor: 'var(--border)' }}>
                      <div>
                        <p className="text-sm font-medium mb-2" style={{ color: 'var(--text)' }}>Permissions</p>
                        <div className="flex flex-wrap gap-2">
                          {([
                            ['canView', '👁️ Voir'],
                            ['canDownload', '⬇️ Télécharger'],
                            ['canUpload', '⬆️ Ajouter'],
                            ['canShare', '🔗 Repartager'],
                          ] as const).map(([k, label]) => (
                            <button key={k} type="button"
                              onClick={() => setEditPerms(p => ({ ...p, [k]: !p[k] }))}
                              className="text-xs px-3 py-1.5 rounded-lg border"
                              style={{
                                background: editPerms[k] ? 'var(--violet-light)' : 'var(--surface-2)',
                                color: editPerms[k] ? 'var(--violet)' : 'var(--text-muted)',
                                borderColor: editPerms[k] ? 'var(--violet)' : 'var(--border)',
                              }}>
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium mb-2" style={{ color: 'var(--text)' }}>Contenu partagé</p>
                        <NodeTreeSelect projectId={id} nodes={nodes} value={editScope} onChange={setEditScope} getToken={getToken} rootFilesCount={rootCount} />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => { void saveEdit(); }} disabled={savingEdit} className="btn-primary text-sm">
                          {savingEdit ? 'Enregistrement…' : 'Enregistrer'}
                        </button>
                        <button onClick={() => setEditingCode(null)} className="btn-secondary text-sm">Annuler</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
