'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// BILNOV — Console admin : tableau de bord. Vue d'ensemble abonnements + accès rapides.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import AdminNav from '@/components/AdminNav';

const STATE_LABEL: Record<string, string> = { trial: 'Essai', active: 'Actif', grace: 'Grâce', expired: 'Expiré' };

export default function AdminHomePage() {
  const [orgs, setOrgs] = useState<any[]>([]);
  const [pending, setPending] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [o, r] = await Promise.all([
        api.get<any>('/api/admin/organizations'),
        api.get<any>('/api/admin/subscription-requests?status=PENDING'),
      ]);
      setOrgs(o.data.organizations ?? []);
      setPending((r.data.requests ?? []).length);
    } catch (e: any) {
      setError(e?.message ?? 'Accès refusé ou erreur de chargement');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const counts = orgs.reduce((acc: Record<string, number>, o) => {
    const s = o.subscription?.state ?? 'active'; acc[s] = (acc[s] ?? 0) + 1; return acc;
  }, {});

  const tile = (label: string, value: React.ReactNode, color = '#e5e7eb') => (
    <div style={{ border: '1px solid #1f2430', borderRadius: 12, padding: '16px 18px', background: '#0f1420', minWidth: 150 }}>
      <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color }}>{value}</div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#0b0d14', color: '#e5e7eb', padding: '32px 20px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <AdminNav active="home" />
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Tableau de bord</h1>
        <p style={{ color: '#9ca3af', fontSize: 14, marginBottom: 24 }}>Vue d&apos;ensemble des abonnements et de l&apos;accès à Bilnov.</p>

        {error && <div style={{ background: '#3f1d1d', border: '1px solid #7f1d1d', color: '#fecaca', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 14 }}>{error}</div>}
        {loading ? <p style={{ color: '#9ca3af' }}>Chargement…</p> : (
          <>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
              {tile('Organisations', orgs.length)}
              {tile('Demandes en attente', pending, pending > 0 ? '#fbbf24' : '#e5e7eb')}
              {tile('Actifs', (counts.active ?? 0) + (counts.trial ?? 0), '#34d399')}
              {tile('En grâce', counts.grace ?? 0, '#fb923c')}
              {tile('Expirés', counts.expired ?? 0, '#f87171')}
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Link href="/admin/subscriptions" style={{ textDecoration: 'none', flex: 1, minWidth: 240, border: '1px solid #1f2430', borderRadius: 12, padding: 18, background: '#0f1420', color: '#e5e7eb' }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Valider les demandes {pending > 0 ? `(${pending})` : ''}</div>
                <div style={{ fontSize: 13, color: '#9ca3af' }}>Approuver ou rejeter les demandes de pack des abonnés.</div>
              </Link>
              <Link href="/admin/organizations" style={{ textDecoration: 'none', flex: 1, minWidth: 240, border: '1px solid #1f2430', borderRadius: 12, padding: 18, background: '#0f1420', color: '#e5e7eb' }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Gérer les organisations</div>
                <div style={{ fontSize: 13, color: '#9ca3af' }}>Formule, échéance, pack, suspension d&apos;accès.</div>
              </Link>
              <Link href="/admin/packs" style={{ textDecoration: 'none', flex: 1, minWidth: 240, border: '1px solid #1f2430', borderRadius: 12, padding: 18, background: '#0f1420', color: '#e5e7eb' }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Configurer les packs</div>
                <div style={{ fontSize: 13, color: '#9ca3af' }}>Prix, limites et fonctionnalités des offres.</div>
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
