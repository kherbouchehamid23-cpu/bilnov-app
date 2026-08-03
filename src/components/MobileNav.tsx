'use client';
// Doc Amelioration UI/UX 3/6 - barre de navigation inferieure mobile. Visible < 768px.
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutGrid, Plus, LogOut } from 'lucide-react';

export default function MobileNav() {
  const pathname = usePathname() || '';
  const router = useRouter();
  const onProjects = pathname === '/dashboard' || pathname.startsWith('/projects');
  const logout = () => {
    try { localStorage.removeItem('bilnov_token'); localStorage.removeItem('bilnov-auth'); } catch { /* noop */ }
    router.push('/login');
  };
  return (
    <nav className="bilnov-mobilenav" aria-label="Navigation principale">
      <Link href="/dashboard" className={'bmn-item' + (onProjects ? ' bmn-active' : '')}>
        <LayoutGrid size={22} aria-hidden />
        <span>{'Projets'}</span>
      </Link>
      <Link href="/projects/new" className="bmn-item bmn-cta">
        <span className="bmn-fab"><Plus size={24} aria-hidden /></span>
        <span>{'Nouveau'}</span>
      </Link>
      <button type="button" onClick={logout} className="bmn-item">
        <LogOut size={22} aria-hidden />
        <span>{'Déconnexion'}</span>
      </button>
    </nav>
  );
}
