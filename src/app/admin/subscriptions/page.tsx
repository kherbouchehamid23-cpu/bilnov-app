'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// BILNOV — Console admin : validation des demandes d'abonnement.
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import AdminNav from '@/components/AdminNav';

const REQ_LABEL: Record<string, string> = { PENDING: 'En attente', APPROVED: 'Approuvée', REJECTED: 'Rejetée' };
const REQ_COLOR: Record<string, string> = { PENDING: '#d97706', APPROVED: '#059669', REJECTED: '#dc2626' };
const PLANS = ['STARTER', 'PRO', 'ENTERPRISE'];
function fmtDate(v: string | null): string { return v ? new Date(v).toLocaleDateString('fr-FR') : '—'; }

export default function AdminSubsPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [filter, setFilter] = useState('PENDING');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approve, setApprove] = useState<any | null>(null);
  const [aForm, setAForm] = useState<{ plan: string; months: string }>({ plan: 'PRO', months: '' });
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (f = 'PENDING') => {
    setLoading(true); setError(null);
    try {
      const r = await api.get<any>('/api/admin/subscription-requests' + (f ? `?status=${f}` : ''));
      setRequests(r.data.requests ?? []);
    } catch (e: any) { setError(e?.message ?? 'Accès refusé ou erreur'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(filter); }, [load, filter]);

  const openApprove = (r: any) => {
    setApprove(r);
    setAForm({ plan: 'PRO', months: r.billingPeriod === 'ANNUAL' ? '12' : '1' });
  };

  const doApprove = async () => {
    if (!approve) return;
    setBusy(approve.id); setError(null);
    try {
      const payload: any = { action: 'APPROVE', plan: aForm.plan };
      const m = parseInt(aForm.months); if (!Number.isNaN(m) && m > 0) payload.months = m;
      await api.patch(`/api/admin/subscription-requests/${approve.id}`, payload);
      setApprove(null); await load(filter);
    } catch (e: any) { setError(e?.message ?? 'Échec'); }
    finally { setBusy(null); }
  };

  const doReject = async (r: any) => {
    if (!confirm('Rejeter cette demande ?')) return;
    setBusy(r.id); setError(null);
    try {
      await api.patch(`/api/admin/subscription-requests/${r.id}`, { action: 'REJECT' });
      await load(filter);
    } catch (e: any) { setError(e?.message ?? 'Échec'); }
    finally { setBusy(null); }
  };

  const th: React.CSSProperties = { textAlign: 'left', fontSize: 12, color: '#9ca3af', fontWeight: 600, padding: '8px 10px', borderBottom: '1px solid #1f2430' };
  const td: React.CSSProperties = { fontSize: 13, padding: '10px', borderBottom: '1px solid #151a24' };

  return (
    <div style={{ minHeight: '100vh', background: '#0b0d14', color: '#e5e7eb', padding: '32px 20px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <AdminNav active="subs" />
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Demandes d&apos;abonnement</h1>
        <p style={{ color: '#9ca3af', fontSize: 14, marginBottom: 20 }}>Approuvez pour appliquer le pack et prolonger l&apos;accès, ou rejetez la demande.</p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {['PENDING', 'APPROVED', 'REJECTED', ''].map((f) => (
            <button key={f || 'all'} onClick={() => setFilter(f)} style={{ background: filter === f ? '#4c1d95' : 'transparent', border: '1px solid #1f2430', color: filter === f ? '#fff' : '#9ca3af', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {f ? REQ_LABEL[f] : 'Toutes'}
            </button>
          ))}
        </div>

        {error && <div style={{ background: '#3f1d1d', border: '1px solid #7f1d1d', color: '#fecaca', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 14 }}>{error}</div>}
        {loading ? <p style={{ color: '#9ca3af' }}>Chargement…</p> : requests.length === 0 ? <p style={{ color: '#9ca3af' }}>Aucune demande.</p> : (
          <div style={{ overflowX: 'auto', border: '1px solid #1f2430', borderRadius: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead><tr>
                <th style={th}>État</th><th style={th}>Organisation</th><th style={th}>Titulaire</th>
                <th style={th}>Pack demandé</th><th style={th}>Période</th><th style={th}>Reçue le</th><th style={th}></th>
              </tr></thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td style={td}><span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, color: '#fff', background: REQ_COLOR[r.status] ?? '#6b7280' }}>{REQ_LABEL[r.status] ?? r.status}</span></td>
                    <td style={td}><strong>{r.organization?.name ?? '—'}</strong></td>
                    <td style={{ ...td, color: '#9ca3af' }}>{r.organization?.owner?.email ?? '—'}</td>
                    <td style={td}>{r.pack?.name ?? '—'}</td>
                    <td style={td}>{r.billingPeriod === 'ANNUAL' ? 'Annuel' : 'Mensuel'}</td>
                    <td style={{ ...td, color: '#9ca3af' }}>{fmtDate(r.createdAt)}</td>
                    <td style={td}>
                      {r.status === 'PENDING' ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button disabled={busy === r.id} onClick={() => openApprove(r)} style={{ background: '#065f46', color: '#fff', border: 'none', borderRadius: 8, padding: '5px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Approuver</button>
                          <button disabled={busy === r.id} onClick={() => doReject(r)} style={{ background: 'transparent', border: '1px solid #7f1d1d', color: '#fca5a5', borderRadius: 8, padding: '5px 12px', fontSize: 13, cursor: 'pointer' }}>Rejeter</button>
                        </div>
                      ) : <span style={{ color: '#6b7280', fontSize: 12 }}>Traitée le {fmtDate(r.decidedAt)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {approve && (
        <div onClick={() => setApprove(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 100 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#0f1420', border: '1px solid #1f2430', borderRadius: 14, padding: 24, width: 400, maxWidth: '100%' }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 2 }}>Approuver la demande</h3>
            <p style={{ color: '#9ca3af', fontSize: 13, marginBottom: 16 }}>{approve.organization?.name} · pack {approve.pack?.name ?? '—'}</p>
            <label style={{ display: 'block', fontSize: 13, color: '#9ca3af', marginBottom: 6 }}>Formule à appliquer</label>
            <select value={aForm.plan} onChange={(e) => setAForm({ ...aForm, plan: e.target.value })} style={{ width: '100%', background: '#0b0d14', border: '1px solid #1f2430', color: '#e5e7eb', borderRadius: 8, padding: '8px 10px', marginBottom: 14 }}>
              {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <label style={{ display: 'block', fontSize: 13, color: '#9ca3af', marginBottom: 6 }}>Durée d&apos;accès (mois)</label>
            <input value={aForm.months} onChange={(e) => setAForm({ ...aForm, months: e.target.value })} placeholder="ex. 12" style={{ width: '100%', background: '#0b0d14', border: '1px solid #1f2430', color: '#e5e7eb', borderRadius: 8, padding: '8px 10px', marginBottom: 18 }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setApprove(null)} disabled={!!busy} style={{ background: 'transparent', border: '1px solid #374151', color: '#e5e7eb', borderRadius: 8, padding: '8px 14px', fontSize: 14, cursor: 'pointer' }}>Annuler</button>
              <button onClick={doApprove} disabled={!!busy} style={{ background: '#065f46', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>{busy ? 'Validation…' : 'Confirmer'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
