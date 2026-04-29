'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api-client';

export default function DashboardPage() {
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuthStore();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/projects').then(r => setProjects(r.data.projects ?? [])).catch(() => {}).finally(() => setLoading(false));
  }, [isAuthenticated, router]);

  const handleLogout = async () => {
    try { await api.post('/api/auth/logout', {}); } catch {}
    logout();
    router.push('/login');
  };

  const initials = user ? user.firstName[0] + user.lastName[0] : 'U';

  return (
    <div className="min-h-screen" style={{ background: 'var(--surface)' }}>
      <aside className="fixed left-0 top-0 h-full w-60 border-r flex flex-col z-40" style={{ background: 'white', borderColor: 'var(--border)' }}>
        <div className="px-5 py-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--violet)' }}>
              <span className="text-white font-bold text-sm">B</span>
            </div>
            <span className="font-bold text-base" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>Bilnov</span>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {[{icon:'⊞',label:'Projets',href:'/dashboard',active:true},{icon:'🌐',label:'Visites 360°',href:'/tours'},{icon:'📁',label:'Fichiers',href:'/files'}].map(item => (
            <Link key={item.label} href={item.href} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{ background: item.active ? 'var(--violet-light)' : 'transparent', color: item.active ? 'var(--violet)' : 'var(--text-muted)' }}>
              <span>{item.icon}</span>{item.label}
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: 'var(--surface)' }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ background: 'var(--violet)' }}>{initials}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{user?.firstName} {user?.lastName}</p>
              <p className="text-xs" style={{ color: 'var(--text-light)' }}>{user?.plan}</p>
            </div>
            <button onClick={handleLogout} style={{ color: 'var(--text-light)', fontSize: '16px' }} title="Déconnexion">↪</button>
          </div>
        </div>
      </aside>
      <main className="ml-60 p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-1" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>Mes projets</h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{projects.length} projet{projects.length !== 1 ? 's' : ''}</p>
          </div>
          <Link href="/projects/new" className="btn-primary">+ Nouveau projet</Link>
        </div>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[1,2,3].map(i => <div key={i} className="rounded-2xl border p-6 h-40 skeleton" style={{ borderColor: 'var(--border)' }} />)}
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-4xl mb-5" style={{ background: 'var(--violet-light)' }}>🏗️</div>
            <h3 className="text-xl font-bold mb-2" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>Aucun projet</h3>
            <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Créez votre premier projet pour commencer.</p>
            <Link href="/projects/new" className="btn-primary">Créer mon premier projet</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {projects.map((project, i) => (
              <Link key={project.id} href={'/projects/' + project.id}>
                <div className="file-card rounded-2xl p-6">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg mb-4" style={{ background: 'var(--violet-light)' }}>
                    {project.structureType === 'BUILDING' ? '🏠' : '🔧'}
                  </div>
                  <h3 className="font-bold text-base mb-1 truncate" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>{project.name}</h3>
                  {project.sector && <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: 'var(--violet-light)', color: 'var(--violet)' }}>{project.sector}</span>}
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
