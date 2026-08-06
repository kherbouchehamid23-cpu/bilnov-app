'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api-client';

interface Sub { state: 'trial' | 'active' | 'grace' | 'expired'; daysLeft: number | null; }
interface MeResp { data: { subscription?: Sub } }

export default function SubscriptionBanner() {
  const [sub, setSub] = useState<Sub | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem('bilnov_token')) return;
    api.get<MeResp>('/api/auth/me').then((r) => setSub(r.data?.subscription ?? null)).catch(() => {});
  }, []);
  if (!sub || sub.state === 'active') return null;
  const d = sub.daysLeft;
  if (sub.state === 'trial' && (d == null || d > 3)) return null;

  let bg = '#FEF3C7', color = '#92400E', msg = '';
  if (sub.state === 'trial') {
    msg = `Votre essai gratuit se termine dans ${d} jour${(d ?? 0) > 1 ? 's' : ''}.`;
  } else if (sub.state === 'grace') {
    bg = '#FFEDD5'; color = '#9A3412';
    msg = "Votre abonnement a expiré — période de grâce en cours. Renouvelez pour éviter le passage en lecture seule.";
  } else {
    bg = '#FEE2E2'; color = '#991B1B';
    msg = "Abonnement expiré : votre espace est en lecture seule. Renouvelez pour réactiver création et modification.";
  }
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 60, background: bg, color, padding: '8px 16px', fontSize: 13, display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
      <span>{msg}</span>
      <Link href="/abonnement" style={{ fontWeight: 700, textDecoration: 'underline', color }}>Voir les offres</Link>
    </div>
  );
}
