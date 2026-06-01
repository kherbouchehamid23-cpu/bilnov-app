'use client';
import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface Member {
  id: string;
  canView: boolean;
  canUpload: boolean;
  canDownload: boolean;
  canShare: boolean;
  createdAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatarUrl: string | null;
  };
  role: {
    id: string;
    name: string;
  };
}

interface InviteForm {
  email: string;
  canView: boolean;
  canUpload: boolean;
  canDownload: boolean;
  canShare: boolean;
}

interface ApiResponse<T> {
  data: T;
  success: boolean;
}

export default function TeamPage() {
  const params = useParams();
  const id = params.id as string;

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState<InviteForm>({
    email: '',
    canView: true,
    canUpload: false,
    canDownload: true,
    canShare: false,
  });

  const getToken = (): string => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('bilnov_token') ?? '';
  };

  const fetchMembers = async (): Promise<void> => {
    try {
      const res = await fetch(`/api/projects/${id}/members`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json() as ApiResponse<{ members: Member[] }>;
      setMembers(data.data?.members ?? []);
    } catch {
      setMembers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchMembers();
  }, [id]);

  const handleInvite = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setInviting(true);
    try {
      const res = await fetch(`/api/projects/${id}/members`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form),
      });
      const data = await res.json() as ApiResponse<Member>;
      if (!res.ok) {
        const errData = data as unknown as { error?: { message?: string } };
        setError(errData.error?.message ?? 'Erreur lors de l\'invitation');
      } else {
        setSuccess(`${form.email} a été invité avec succès.`);
        setForm({ email: '', canView: true, canUpload: false, canDownload: true, canShare: false });
        setShowInviteForm(false);
        void fetchMembers();
      }
    } catch {
      setError('Erreur lors de l\'invitation');
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (memberId: string): Promise<void> => {
    if (!confirm('Retirer cet intervenant du projet ?')) return;
    try {
      await fetch(`/api/projects/${id}/members/${memberId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      setMembers(prev => prev.filter(m => m.id !== memberId));
    } catch {
      alert('Erreur lors de la suppression');
    }
  };

  const getInitials = (firstName: string, lastName: string): string =>
    `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();

  const permissionLabel = (member: Member): string => {
    const perms: string[] = [];
    if (member.canView) perms.push('Voir');
    if (member.canUpload) perms.push('Uploader');
    if (member.canDownload) perms.push('Télécharger');
    if (member.canShare) perms.push('Partager');
    return perms.join(' · ');
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
              Intervenants
            </span>
          </div>
          <button className="btn-primary text-sm" onClick={() => setShowInviteForm(true)}>
            + Inviter un intervenant
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Success message */}
        {success && (
          <div className="mb-6 p-4 rounded-xl text-sm animate-fade-up"
            style={{ background: '#ECFDF5', color: '#10B981', border: '1px solid #A7F3D0' }}>
            ✓ {success}
          </div>
        )}

        {/* Invite form */}
        {showInviteForm && (
          <div className="mb-8 p-6 rounded-2xl border animate-fade-up"
            style={{ background: 'white', borderColor: 'var(--violet-light)' }}>
            <h2 className="font-bold text-lg mb-5"
              style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>
              Inviter un intervenant
            </h2>

            <form onSubmit={(e) => { void handleInvite(e); }} className="space-y-5">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
                  Email *
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setForm(prev => ({ ...prev, email: e.target.value }))}
                  required
                  className="input"
                  placeholder="intervenant@exemple.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-3" style={{ color: 'var(--text)' }}>
                  Permissions
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { key: 'canView' as const, label: '👁️ Voir les fichiers', desc: 'Accès en lecture' },
                    { key: 'canDownload' as const, label: '⬇️ Télécharger', desc: 'Télécharger les fichiers' },
                    { key: 'canUpload' as const, label: '⬆️ Uploader', desc: 'Ajouter des fichiers' },
                    { key: 'canShare' as const, label: '🔗 Partager', desc: 'Créer des codes d\'accès' },
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

              {error && (
                <div className="p-3 rounded-xl text-sm"
                  style={{ background: '#FEF2F2', color: '#EF4444', border: '1px solid #FECACA' }}>
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button type="submit" disabled={inviting} className="btn-primary">
                  {inviting ? 'Invitation...' : 'Inviter'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowInviteForm(false); setError(''); }}
                  className="btn-secondary">
                  Annuler
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Members list */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-lg"
              style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>
              Intervenants
            </h2>
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {members.length} membre{members.length !== 1 ? 's' : ''}
            </span>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-20 rounded-2xl skeleton" />
              ))}
            </div>
          ) : members.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-4"
                style={{ background: 'var(--violet-light)' }}>
                👥
              </div>
              <h3 className="font-bold text-base mb-2" style={{ color: 'var(--text)' }}>
                Aucun intervenant
              </h3>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Invitez des collaborateurs pour travailler ensemble.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {members.map(member => (
                <div key={member.id}
                  className="flex items-center gap-4 p-4 rounded-2xl border bg-white"
                  style={{ borderColor: 'var(--border)' }}>
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                    style={{ background: 'var(--violet)' }}>
                    {getInitials(member.user.firstName, member.user.lastName)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm" style={{ color: 'var(--text)' }}>
                      {member.user.firstName} {member.user.lastName}
                    </p>
                    <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                      {member.user.email}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-light)' }}>
                      {permissionLabel(member)}
                    </p>
                  </div>

                  {/* Role badge */}
                  <span className="text-xs px-2 py-1 rounded-full flex-shrink-0"
                    style={{ background: 'var(--violet-light)', color: 'var(--violet)' }}>
                    {member.role.name}
                  </span>

                  {/* Remove button */}
                  <button
                    onClick={() => { void handleRemove(member.id); }}
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors hover:bg-red-50"
                    style={{ color: 'var(--text-light)' }}
                    title="Retirer">
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
