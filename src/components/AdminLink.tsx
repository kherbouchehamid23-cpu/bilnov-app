'use client';
// BILNOV — Lien discret vers la console admin, affiché uniquement aux administrateurs plateforme.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api-client';

interface MeResp { data: { isPlatformAdmin?: boolean } }

export default function AdminLink() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem('bilnov_token')) return;
    api.get<MeResp>('/api/auth/me').then((r) => setShow(!!r.data?.isPlatformAdmin)).catch(() => {});
  }, []);
  if (!show) return null;
  return (
    <Link href="/admin" className="text-sm hidden sm:inline" style={{ color: 'var(--text-muted)' }}>Admin</Link>
  );
}
