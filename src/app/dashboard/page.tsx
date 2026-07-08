'use client';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api-client';
import NotificationsBell from '@/components/NotificationsBell';

interface Project {
  id: string; name: string; sector: string | null; structureType: string;
  _count: { files: number; tours: number; members: number };
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuthStore();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); return; }
    api.get<{ data: { projects: Project[] } }>('/api/projects')
      .then(r => setProjects(r.data.projects ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isAuthenticated, router]);

  const handleLogout = async () => {
    try { await api.post('/api/auth/logout', {}); } catch {}
    logout();
    router.push('/login');
  };

  const initials = user ? user.firstName[0] + user.lastName[0] : 'U';

  return (
    <div className="min-h-screen" style={{ background: 'var(--surface)' }}>
      {/* Barre supérieure (responsive, remplace la sidebar fixe) */}
      <header className="sticky top-0 z-40 glass border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="rounded-lg flex items-center justify-center" style={{ width: 32, height: 32, background: 'var(--violet)' }}>
            <span className="text-white font-bold text-sm">B</span>
          </div>
          <span className="font-bold text-base" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>Bilnov</span>
          <div className="flex-1" />
          <Link href="/projects/new" className="btn-primary text-sm" style={{ minHeight: 40 }}>＋ Nouveau projet</Link>
          <NotificationsBell />
          <div className="flex items-center gap-2 pl-2 ml-1 border-l" style={{ borderColor: 'var(--border)' }}>
            <div className="rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ width: 32, height: 32, background: 'var(--violet)' }} title={`${user?.firstName ?? ''} ${user?.lastName ?? ''}`}>
              {initials}
            </div>
            <button onClick={handleLogout} className="rounded-lg flex items-center justify-center"
              style={{ width: 40, height: 40, color: 'var(--text-muted)' }} title="Déconnexion">↪</button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold mb-1" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>
            Mes projets
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {projects.length} projet{projects.length !== 1 ? 's' : ''}
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-2xl border p-6 h-40 skeleton" style={{ borderColor: 'var(--border)' }} />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-4xl mb-5" style={{ background: 'var(--violet-light)' }}>🏗️</div>
            <h3 className="text-xl font-bold mb-2" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>Aucun projet</h3>
            <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Créez votre premier projet pour commencer.</p>
            <Link href="/projects/new" className="btn-primary">Créer mon premier projet</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map(project => (
              <Link key={project.id} href={'/projects/' + project.id}>
                <div className="file-card rounded-2xl p-6">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg mb-4" style={{ background: 'var(--violet-light)' }}>
                    {project.structureType === 'BUILDING' ? '🏠' : '🔧'}
                  </div>
                  <h3 className="font-bold text-base mb-1 truncate" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>
                    {project.name}
                  </h3>
                  {project.sector && (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: 'var(--violet-light)', color: 'var(--violet)' }}>
                      {project.sector}
                    </span>
                  )}
                  <div className="flex gap-4 mt-3 pt-3 border-t text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                    <span>📁 {project._count?.files ?? 0}</span>
                    <span>🌐 {project._count?.tours ?? 0}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
