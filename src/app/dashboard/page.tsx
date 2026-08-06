'use client';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import MobileNav from '@/components/MobileNav';
import { Plus, LogOut, Building2, Home, Wrench, FileText, Compass, AlertTriangle, RotateCw, MoreHorizontal, Archive, Trash2, RotateCcw } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api-client';
import NotificationsBell from '@/components/NotificationsBell';
import ThemeToggle from '@/components/ThemeToggle';
import AdminLink from '@/components/AdminLink';

interface Project {
  id: string; name: string; sector: string | null; structureType: string;
  _count: { files: number; tours: number; members: number };
}

type View = 'active' | 'archived' | 'trash';

const VIEWS: { k: View; label: string }[] = [
  { k: 'active', label: 'Actifs' },
  { k: 'archived', label: 'Archivés' },
  { k: 'trash', label: 'Corbeille' },
];

const EMPTY: Record<View, { title: string; desc: string }> = {
  active: { title: 'Aucun projet', desc: 'Créez votre premier projet pour commencer.' },
  archived: { title: 'Aucun projet archivé', desc: 'Les projets que vous archivez apparaîtront ici.' },
  trash: { title: 'Corbeille vide', desc: 'Les projets supprimés arrivent ici et restent restaurables.' },
};

export default function DashboardPage() {
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuthStore();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [view, setView] = useState<View>('active');
  const [menuId, setMenuId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmProject, setConfirmProject] = useState<Project | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [purging, setPurging] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); return; }
    setLoading(true); setError(false); setMenuId(null);
    api.get<{ data: { projects: Project[] } }>(`/api/projects?view=${view}`)
      .then(r => setProjects(r.data.projects ?? []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [isAuthenticated, router, view]);

  const handleLogout = async () => {
    try { await api.post('/api/auth/logout', {}); } catch {}
    logout();
    router.push('/login');
  };

  const act = async (id: string, kind: 'archive' | 'unarchive' | 'trash' | 'restore') => {
    if (kind === 'trash' && !confirm('Mettre ce projet à la corbeille ? Vous pourrez le restaurer ensuite.')) return;
    setMenuId(null); setBusyId(id);
    try {
      if (kind === 'trash') await api.delete(`/api/projects/${id}`);
      else await api.patch(`/api/projects/${id}`, { status: kind === 'archive' ? 'ARCHIVED' : 'ACTIVE' });
      setProjects(prev => prev.filter(p => p.id !== id));
    } catch {
      alert('Action impossible pour le moment. Réessayez.');
    } finally {
      setBusyId(null);
    }
  };

  const purge = async () => {
    if (!confirmProject) return;
    setPurging(true);
    try {
      await api.delete(`/api/projects/${confirmProject.id}?permanent=true`);
      setProjects(prev => prev.filter(p => p.id !== confirmProject.id));
      setConfirmProject(null); setConfirmText('');
    } catch {
      alert('Suppression définitive impossible pour le moment. Réessayez.');
    } finally {
      setPurging(false);
    }
  };

  const initials = user ? user.firstName[0] + user.lastName[0] : 'U';

  return (
    <div className="lg-app min-h-screen" style={{ background: 'var(--surface)' }} onClick={() => menuId && setMenuId(null)}>
      <MobileNav />
      <header className="sticky top-0 z-40 glass border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="rounded-lg flex items-center justify-center" style={{ width: 32, height: 32, background: 'var(--violet)' }}>
            <span className="text-white font-bold text-sm">B</span>
          </div>
          <span className="font-bold text-base" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>Bilnov</span>
          <div className="flex-1" />
          <Link href="/projects/new" className="btn-primary text-sm" style={{ minHeight: 40 }}><Plus size={16} /><span className="hidden sm:inline"> Nouveau projet</span></Link>
          <Link href="/abonnement" className="text-sm hidden sm:inline" style={{ color: 'var(--text-muted)' }}>Abonnement</Link>
          <AdminLink />
          <ThemeToggle />
          <NotificationsBell />
          <div className="flex items-center gap-2 pl-2 ml-1 border-l" style={{ borderColor: 'var(--border)' }}>
            <div className="rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ width: 32, height: 32, background: 'var(--violet)' }} title={`${user?.firstName ?? ''} ${user?.lastName ?? ''}`}>
              {initials}
            </div>
            <button onClick={handleLogout} className="rounded-lg flex items-center justify-center"
              style={{ width: 40, height: 40, color: 'var(--text-muted)' }} title="Déconnexion" aria-label="Déconnexion"><LogOut size={18} /></button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold mb-3" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>
            Mes projets
          </h1>
          <div className="flex items-center gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--surface-2)' }}>
            {VIEWS.map(v => (
              <button key={v.k} type="button" onClick={() => setView(v.k)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                style={{
                  background: view === v.k ? 'var(--violet)' : 'transparent',
                  color: view === v.k ? '#fff' : 'var(--text-muted)',
                }}>
                {v.label}
              </button>
            ))}
          </div>
          {view === 'trash' && projects.length > 0 && (
            <p className="text-xs mt-3 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg" style={{ background: 'rgba(239,68,68,.1)', color: '#EF4444' }}>
              <AlertTriangle size={13} /> Depuis la corbeille, vous pouvez restaurer un projet ou le supprimer définitivement.
            </p>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-2xl border p-6 h-40 skeleton" style={{ borderColor: 'var(--border)' }} />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-5" style={{ background: 'rgba(255,120,90,.14)' }}><AlertTriangle size={34} style={{ color: '#ff785a' }} /></div>
            <h3 className="text-xl font-bold mb-2" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>Impossible de charger vos projets</h3>
            <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Vérifiez votre connexion, puis réessayez.</p>
            <button onClick={() => window.location.reload()} className="btn-primary"><RotateCw size={16} /> Réessayer</button>
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-5" style={{ background: 'var(--violet-light)' }}>
              {view === 'trash' ? <Trash2 size={34} style={{ color: 'var(--violet)' }} /> : view === 'archived' ? <Archive size={34} style={{ color: 'var(--violet)' }} /> : <Building2 size={36} style={{ color: 'var(--violet)' }} />}
            </div>
            <h3 className="text-xl font-bold mb-2" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>{EMPTY[view].title}</h3>
            <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>{EMPTY[view].desc}</p>
            {view === 'active' && <Link href="/projects/new" className="btn-primary">Créer mon premier projet</Link>}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map(project => {
              const inner = (
                <div className="file-card rounded-2xl p-6" style={{ opacity: busyId === project.id ? 0.5 : 1 }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4" style={{ background: 'var(--violet-light)' }}>
                    {project.structureType === 'BUILDING' ? <Home size={18} style={{ color: 'var(--violet)' }} /> : <Wrench size={18} style={{ color: 'var(--violet)' }} />}
                  </div>
                  <h3 className="font-bold text-base mb-1 truncate pr-8" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>
                    {project.name}
                  </h3>
                  {project.sector && (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: 'var(--violet-light)', color: 'var(--violet)' }}>
                      {project.sector}
                    </span>
                  )}
                  {(project as { location?: string | null }).location && (<p className="text-xs mt-2 truncate" style={{ color: 'var(--text-muted)' }}>Lieu : {(project as { location?: string | null }).location}</p>)}
                  {(project as { clientName?: string | null }).clientName && (<p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>MOA : {(project as { clientName?: string | null }).clientName}</p>)}
                  <div className="flex gap-4 mt-3 pt-3 border-t text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                    <span className="inline-flex items-center gap-1"><FileText size={13} /> {project._count?.files ?? 0}</span>
                    <span className="inline-flex items-center gap-1"><Compass size={13} /> {project._count?.tours ?? 0}</span>
                  </div>
                </div>
              );
              return (
                <div key={project.id} className="relative">
                  {view === 'trash'
                    ? <div style={{ cursor: 'default' }}>{inner}</div>
                    : <Link href={'/projects/' + project.id} className="block">{inner}</Link>}

                  <button type="button" aria-label="Actions du projet"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuId(menuId === project.id ? null : project.id); }}
                    className="absolute rounded-lg flex items-center justify-center file-menu-btn"
                    style={{ top: 14, right: 14, width: 34, height: 34 }}>
                    <MoreHorizontal size={16} />
                  </button>

                  {menuId === project.id && (
                    <div className="absolute z-20 rounded-xl shadow-lg overflow-hidden file-menu-pop" style={{ top: 52, right: 14, minWidth: 200 }}
                      onClick={(e) => e.stopPropagation()}>
                      {view === 'trash' ? (
                        <>
                          <button className="flex items-center gap-2 w-full text-left px-4 text-sm" style={{ minHeight: 46, color: 'var(--text)' }}
                            onClick={() => { void act(project.id, 'restore'); }}>
                            <RotateCcw size={15} /> Restaurer
                          </button>
                          <button className="flex items-center gap-2 w-full text-left px-4 text-sm" style={{ minHeight: 46, color: '#EF4444', borderTop: '1px solid var(--border)' }}
                            onClick={() => { setMenuId(null); setConfirmProject(project); setConfirmText(''); }}>
                            <Trash2 size={15} /> Supprimer définitivement
                          </button>
                        </>
                      ) : (
                        <>
                          {view === 'archived' ? (
                            <button className="flex items-center gap-2 w-full text-left px-4 text-sm" style={{ minHeight: 46, color: 'var(--text)' }}
                              onClick={() => { void act(project.id, 'unarchive'); }}>
                              <RotateCcw size={15} /> Désarchiver
                            </button>
                          ) : (
                            <button className="flex items-center gap-2 w-full text-left px-4 text-sm" style={{ minHeight: 46, color: 'var(--text)' }}
                              onClick={() => { void act(project.id, 'archive'); }}>
                              <Archive size={15} /> Archiver
                            </button>
                          )}
                          <button className="flex items-center gap-2 w-full text-left px-4 text-sm" style={{ minHeight: 46, color: '#EF4444' }}
                            onClick={() => { void act(project.id, 'trash'); }}>
                            <Trash2 size={15} /> Mettre à la corbeille
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {confirmProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.5)' }}
          onClick={() => { if (!purging) { setConfirmProject(null); setConfirmText(''); } }}>
          <div className="rounded-2xl w-full max-w-md p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: 'rgba(239,68,68,.14)' }}>
                <Trash2 size={22} style={{ color: '#EF4444' }} />
              </div>
              <h3 className="text-lg font-bold" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>Supprimer définitivement</h3>
            </div>
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
              Cette action est <b style={{ color: 'var(--text)' }}>irréversible</b>. Le projet, ses fichiers, visites, mesures et commentaires seront supprimés définitivement.
              Pour confirmer, saisissez le nom du projet : <b style={{ color: 'var(--text)' }}>{confirmProject.name}</b>
            </p>
            <input autoFocus value={confirmText} onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Nom du projet" className="input mb-4" disabled={purging}
              onKeyDown={(e) => { if (e.key === 'Enter' && confirmText === confirmProject.name && !purging) void purge(); }} />
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setConfirmProject(null); setConfirmText(''); }} disabled={purging}
                className="btn-secondary text-sm" style={{ minHeight: 40 }}>Annuler</button>
              <button onClick={() => { void purge(); }} disabled={purging || confirmText !== confirmProject.name}
                className="text-sm px-4 rounded-lg font-medium"
                style={{
                  minHeight: 40,
                  background: confirmText === confirmProject.name ? '#EF4444' : 'var(--surface-2)',
                  color: confirmText === confirmProject.name ? '#fff' : 'var(--text-light)',
                  cursor: confirmText === confirmProject.name && !purging ? 'pointer' : 'not-allowed',
                }}>
                {purging ? 'Suppression…' : 'Supprimer définitivement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
