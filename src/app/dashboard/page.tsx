'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api-client';

export default function DashboardPage() {
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuthStore();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); return; }
    api.get<{ data: { projects: any[] } }>('/api/projects')
      .then((r) => setProjects(r.data.projects ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isAuthenticated, router]);

  const handleLogout = async () => {
    try { await api.post('/api/auth/logout', {}); } catch {}
    logout();
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary-700 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">B</span>
          </div>
          <span className="font-semibold text-gray-900">Bilnov</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">{user?.firstName} {user?.lastName}</span>
          <span className="text-xs bg-primary-100 text-primary-700 px-2 py-1 rounded-full font-medium">{user?.plan}</span>
          <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-gray-700">Déconnexion</button>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Mes projets</h1>
          <Link href="/projects/new" className="bg-primary-700 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-primary-800 transition-colors">
            + Nouveau projet
          </Link>
        </div>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1,2,3].map(i => <div key={i} className="bg-white rounded-xl border p-6 animate-pulse h-32" />)}
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">🏗️</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Aucun projet</h3>
            <p className="text-gray-500 mb-6">Créez votre premier projet pour commencer.</p>
            <Link href="/projects/new" className="bg-primary-700 text-white px-6 py-3 rounded-lg font-medium hover:bg-primary-800 transition-colors">
              Créer mon premier projet
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map(p => (
              <Link key={p.id} href={`/projects/${p.id}`}>
                <div className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow cursor-pointer">
                  <h3 className="font-semibold text-gray-900 mb-1">{p.name}</h3>
                  {p.sector && <span className="text-xs text-primary-700 bg-primary-50 px-2 py-0.5 rounded-full">{p.sector}</span>}
                  <div className="flex gap-4 mt-4 text-sm text-gray-500">
                    <span>📁 {p._count?.files ?? 0}</span>
                    <span>🌐 {p._count?.tours ?? 0}</span>
                    <span>👥 {p._count?.members ?? 0}</span>
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
