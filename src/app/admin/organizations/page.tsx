'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// BILNOV — Console admin : gouvernance des organisations (abonnés).
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import AdminNav from '@/components/AdminNav';

const PLANS = ['TRIAL', 'STARTER', 'PRO', 'ENTERPRISE'];
const STATE_LABEL: Record<string, string> = { trial: 'Essai', active: 'Actif', grace: 'Grâce', expired: 'Expiré' };
const STATE_COLOR: Record<string, string> = { trial: '#2563eb', active: '#059669', grace: '#d97706', expired: '#dc2626' };

function fmtDate(v: string | null): string { return v ? new Date(v).toLocaleDateString('fr-FR') : '—'; }

export default function AdminOrgsPage() {
  const [orgs, setOrgs] = useState<any[]>([]);
  const [packs, setPacks] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<any | null>(null);
  const [form, setForm] = useState<{ plan: string; extendMonths: string; packId: string }>({ plan: '', extendMonths: '', packId: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (query = '') => {
    setLoading(true); setError(null);
    try {
      const [o, p] = await Promise.all([
        api.get<any>('/api/admin/organizations' + (query ? `?q=${encodeURIComponent(query)}` : '')),
        api.get<any>('/api/admin/packs').catch(() => ({ data: { packs: [] } })),
      ]);
      setOrgs(o.data.organizations ?? []);
      setPacks(p.data.packs ?? []);
    } catch (e: any) { setError(e?.message ?? 'Accès refusé ou erreur'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const openEdit = (o: any) => { setEdit(o); setForm({ plan: o.plan, extendMonths: '', packId: o.packId ?? '' }); };
  const close = () => setEdit(null);

  const patchOrg = async (payload: any) => {
    if (!edit) return;
    setSaving(true); setError(null);
    try {
      await api.patch(`/api/admin/organizations/${edit.id}`, payload);
      close(); await load(q);
    } catch (e: any) { setError(e?.message ?? 'Échec'); }
    finally { setSaving(false); }
  };

  const save = () => {
    const payload: any = { plan: form.plan, packId: form.packId || null };
    const m = parseInt(form.extendMonths); if (!Number.isNaN(m) && m !== 0) payload.extendMonths = m;
    void patchOrg(payload);
  };
  const suspend = () => { if (confirm('Suspendre l\'accès de cette organisation (lecture seule immédiate) ?')) void patchOrg({ action: 'suspend' }); };

  const th: React.CSSProperties = { textAlign: 'left', fontSize: 12, color: '#9ca3af', fontWeight: 600, padding: '8px 10px', borderBottom: '1px solid #1f2430' };
  const td: React.CSSProperties = { fontSize: 13, padding: '10px', borderBottom: '1px solid #151a24' };

  return (
    <div style={{ minHeight: '100vh', background: '#0b0d14', color: '#e5e7eb', padding: '32px 20px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <AdminNav active="orgs" />
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Organisations</h1>
        <p style={{ color: '#9ca3af', fontSize: 14, marginBottom: 20 }}>Pilotez la formule, l&apos;échéance et le pack de chaque abonné.</p>

        <form onSubmit={(e) => { e.preventDefault(); void load(q); }} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher (nom, email)…" style={{ flex: 1, maxWidth: 320, background: '#0f1420', border: '1px solid #1f2430', borderRadius: 8, color: '#e5e7eb', padding: '8px 12px', fontSize: 14 }} />
          <button type="submit" style={{ background: '#4c1d95', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Rechercher</button>
        </form>

        {error && <div style={{ background: '#3f1d1d', border: '1px solid #7f1d1d', color: '#fecaca', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 14 }}>{error}</div>}
        {loading ? <p style={{ color: '#9ca3af' }}>Chargement…</p> : orgs.length === 0 ? <p style={{ color: '#9ca3af' }}>Aucune organisation.</p> : (
          <div style={{ overflowX: 'auto', border: '1px solid #1f2430', borderRadius: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead><tr>
                <th style={th}>Organisation</th><th style={th}>Titulaire</th><th style={th}>État</th>
                <th style={th}>Formule</th><th style={th}>Échéance</th><th style={th}>Pack</th><th style={th}>Projets</th><th style={th}></th>
              </tr></thead>
              <tbody>
                {orgs.map((o) => {
                  const st = o.subscription?.state ?? 'active';
                  return (
                    <tr key={o.id}>
                      <td style={td}><strong>{o.name}</strong></td>
                      <td style={{ ...td, color: '#9ca3af' }}>{o.owner?.email ?? '—'}</td>
                      <td style={td}><span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, color: '#fff', background: STATE_COLOR[st] }}>{STATE_LABEL[st] ?? st}</span></td>
                      <td style={td}>{o.plan}</td>
                      <td style={td}>{fmtDate(o.planExpiresAt)}</td>
                      <td style={{ ...td, color: '#9ca3af' }}>{o.packName ?? '—'}</td>
                      <td style={td}>{o._count?.projects ?? 0}</td>
                      <td style={td}><button onClick={() => openEdit(o)} style={{ background: 'transparent', border: '1px solid #374151', color: '#e5e7eb', borderRadius: 8, padding: '5px 12px', fontSize: 13, cursor: 'pointer' }}>Gérer</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {edit && (
        <div onClick={close} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 100 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#0f1420', border: '1px solid #1f2430', borderRadius: 14, padding: 24, width: 420, maxWidth: '100%' }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 2 }}>{edit.name}</h3>
            <p style={{ color: '#9ca3af', fontSize: 13, marginBottom: 16 }}>{edit.owner?.email} · échéance actuelle {fmtDate(edit.planExpiresAt)}</p>
            <label style={{ display: 'block', fontSize: 13, color: '#9ca3af', marginBottom: 6 }}>Formule</label>
            <select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} style={{ width: '100%', background: '#0b0d14', border: '1px solid #1f2430', color: '#e5e7eb', borderRadius: 8, padding: '8px 10px', marginBottom: 14 }}>
              {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <label style={{ display: 'block', fontSize: 13, color: '#9ca3af', marginBottom: 6 }}>Pack assigné</label>
            <select value={form.packId} onChange={(e) => setForm({ ...form, packId: e.target.value })} style={{ width: '100%', background: '#0b0d14', border: '1px solid #1f2430', color: '#e5e7eb', borderRadius: 8, padding: '8px 10px', marginBottom: 14 }}>
              <option value="">— Aucun —</option>
              {packs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <label style={{ display: 'block', fontSize: 13, color: '#9ca3af', marginBottom: 6 }}>Prolonger de (mois)</label>
            <input value={form.extendMonths} onChange={(e) => setForm({ ...form, extendMonths: e.target.value })} placeholder="ex. 12" style={{ width: '100%', background: '#0b0d14', border: '1px solid #1f2430', color: '#e5e7eb', borderRadius: 8, padding: '8px 10px', marginBottom: 18 }} />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
              <button onClick={suspend} disabled={saving} style={{ background: 'transparent', border: '1px solid #7f1d1d', color: '#fca5a5', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>Suspendre l&apos;accès</button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={close} disabled={saving} style={{ background: 'transparent', border: '1px solid #374151', color: '#e5e7eb', borderRadius: 8, padding: '8px 14px', fontSize: 14, cursor: 'pointer' }}>Annuler</button>
                <button onClick={save} disabled={saving} style={{ background: '#4c1d95', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
