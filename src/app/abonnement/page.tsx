'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// BILNOV — Abonnement (côté client). L'abonné (propriétaire du compte) consulte les packs
// publiés et soumet une demande ; l'admin plateforme la valide. Les autres membres
// consultent l'état mais ne peuvent pas demander (contrôle serveur, 403 sinon).

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { priceForPeriod, formatMajorUnits, annualSavingsPct, formatBytes } from '@/lib/packs';
import type { BillingPeriod } from '@/lib/packs';

interface Feature { key: string; label: string; category?: string | null; position: number; }
interface Pack {
  id: string; slug: string; name: string; description?: string | null;
  monthlyPriceCents: number; annualPriceCents: number | null; currency: string;
  trialDays: number; highlighted: boolean; position: number;
  maxProjects: number | null; maxFilesPerProject: number | null; maxCollaborators: number | null;
  storageBytes: number | null; features?: { featureKey: string; position: number }[];
}
interface Sub { state: 'trial' | 'active' | 'grace' | 'expired'; daysLeft: number | null; expiresAt: string | null; graceEndsAt: string | null; }
interface Me { plan: string; isOwner: boolean; subscription: Sub; organizationName?: string | null; }
interface Req { id: string; packId: string | null; billingPeriod: string | null; status: string; createdAt: string; decidedAt: string | null; note: string | null; pack: { name: string } | null; }

const STATE_LABEL: Record<string, string> = { trial: 'Essai gratuit', active: 'Actif', grace: 'Période de grâce', expired: 'Expiré' };
const STATE_COLOR: Record<string, string> = { trial: '#2563eb', active: '#059669', grace: '#d97706', expired: '#dc2626' };
const REQ_LABEL: Record<string, string> = { PENDING: 'En attente', APPROVED: 'Approuvée', REJECTED: 'Rejetée' };
const REQ_COLOR: Record<string, string> = { PENDING: '#d97706', APPROVED: '#059669', REJECTED: '#dc2626' };

function limitTxt(v: number | null): string { return v === null || v === undefined ? 'Illimité' : String(v); }

export default function AbonnementPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [requests, setRequests] = useState<Req[]>([]);
  const [period, setPeriod] = useState<BillingPeriod>('MONTHLY');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [authed, setAuthed] = useState(true);

  const loadReqs = useCallback(async () => {
    try { const r = await api.get<any>('/api/subscription-requests'); setRequests(r.data.requests ?? []); } catch { /* noop */ }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const hasToken = typeof window !== 'undefined' && !!localStorage.getItem('bilnov_token');
    setAuthed(hasToken);
    try {
      const pubP = api.get<any>('/api/public/packs');
      if (hasToken) {
        const [meR, pub] = await Promise.all([api.get<any>('/api/auth/me').catch(() => null), pubP]);
        if (meR) setMe(meR.data);
        setPacks(pub.data.packs ?? []); setFeatures(pub.data.features ?? []);
        await loadReqs();
      } else {
        const pub = await pubP; setPacks(pub.data.packs ?? []); setFeatures(pub.data.features ?? []);
      }
    } finally { setLoading(false); }
  }, [loadReqs]);

  useEffect(() => { void load(); }, [load]);

  const pending = useMemo(() => requests.find((r) => r.status === 'PENDING') ?? null, [requests]);
  const isOwner = me?.isOwner ?? false;

  const request = async (pack: Pack) => {
    setMsg(null); setSubmitting(pack.id);
    try {
      await api.post('/api/subscription-requests', { packId: pack.id, billingPeriod: period });
      setMsg({ kind: 'ok', text: `Demande envoyée pour le pack « ${pack.name} ». Notre équipe la validera rapidement.` });
      await loadReqs();
    } catch (e: any) {
      setMsg({ kind: 'err', text: e?.message ?? 'Échec de la demande' });
    } finally { setSubmitting(null); }
  };

  const sub = me?.subscription;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface, #f8fafc)', color: 'var(--text, #0f172a)' }}>
      <header style={{ borderBottom: '1px solid var(--border, #e2e8f0)', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/dashboard" style={{ textDecoration: 'none', color: 'inherit', fontWeight: 700, fontFamily: 'Syne, sans-serif' }}>← Bilnov</Link>
        <span style={{ opacity: 0.5 }}>/</span>
        <span style={{ fontWeight: 600 }}>Abonnement</span>
      </header>

      <main style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 20px 64px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, fontFamily: 'Syne, sans-serif', margin: '4px 0 6px' }}>Votre abonnement</h1>
        <p style={{ opacity: 0.7, marginBottom: 20 }}>Choisissez un pack et envoyez votre demande. L&apos;activation est faite par notre équipe.</p>

        {sub && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', border: '1px solid var(--border, #e2e8f0)', borderRadius: 12, padding: '14px 16px', marginBottom: 22, background: 'var(--card, #fff)' }}>
            <span style={{ padding: '4px 10px', borderRadius: 999, fontSize: 13, fontWeight: 700, color: '#fff', background: STATE_COLOR[sub.state] }}>{STATE_LABEL[sub.state] ?? sub.state}</span>
            <span style={{ fontSize: 14 }}>Formule : <strong>{me?.plan}</strong></span>
            {sub.state === 'trial' && sub.daysLeft != null && <span style={{ fontSize: 14 }}>Il reste <strong>{sub.daysLeft} jour(s)</strong> d&apos;essai.</span>}
            {sub.state === 'grace' && sub.graceEndsAt && <span style={{ fontSize: 14 }}>Lecture seule à partir du <strong>{new Date(sub.graceEndsAt).toLocaleDateString('fr-FR')}</strong>.</span>}
            {sub.expiresAt && sub.state !== 'grace' && <span style={{ fontSize: 14, opacity: 0.75 }}>Échéance : {new Date(sub.expiresAt).toLocaleDateString('fr-FR')}</span>}
          </div>
        )}

        {msg && (
          <div style={{ borderRadius: 10, padding: '10px 14px', marginBottom: 18, fontSize: 14, background: msg.kind === 'ok' ? '#dcfce7' : '#fee2e2', color: msg.kind === 'ok' ? '#166534' : '#991b1b' }}>{msg.text}</div>
        )}

        {authed && !isOwner && (
          <div style={{ borderRadius: 10, padding: '10px 14px', marginBottom: 18, fontSize: 14, background: '#eff6ff', color: '#1e40af' }}>
            Seul le titulaire du compte (l&apos;abonné) peut souscrire ou changer de pack. Vous pouvez consulter les offres ci-dessous.
          </div>
        )}
        {authed && isOwner && pending && (
          <div style={{ borderRadius: 10, padding: '10px 14px', marginBottom: 18, fontSize: 14, background: '#fef9c3', color: '#854d0e' }}>
            Une demande est déjà <strong>en attente</strong>{pending.pack ? ` (pack « ${pending.pack.name} »)` : ''}. Vous pourrez en soumettre une autre une fois celle-ci traitée.
          </div>
        )}

        <div style={{ display: 'inline-flex', border: '1px solid var(--border, #e2e8f0)', borderRadius: 999, padding: 3, marginBottom: 20 }}>
          {(['MONTHLY', 'ANNUAL'] as BillingPeriod[]).map((p) => (
            <button key={p} onClick={() => setPeriod(p)} style={{ border: 'none', cursor: 'pointer', borderRadius: 999, padding: '6px 16px', fontSize: 13, fontWeight: 600, background: period === p ? 'var(--violet, #6d28d9)' : 'transparent', color: period === p ? '#fff' : 'var(--text, #0f172a)' }}>
              {p === 'MONTHLY' ? 'Mensuel' : 'Annuel'}
            </button>
          ))}
        </div>

        {loading ? (
          <p style={{ opacity: 0.6 }}>Chargement…</p>
        ) : packs.length === 0 ? (
          <p style={{ opacity: 0.6 }}>Aucun pack disponible pour le moment.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
            {packs.map((pack) => {
              const price = priceForPeriod(pack, period);
              const save = period === 'ANNUAL' ? annualSavingsPct(pack.monthlyPriceCents, pack.annualPriceCents) : 0;
              const keys = new Set((pack.features ?? []).map((f) => f.featureKey));
              const feats = features.filter((f) => keys.has(f.key)).slice(0, 6);
              return (
                <div key={pack.id} style={{ border: pack.highlighted ? '2px solid var(--violet, #6d28d9)' : '1px solid var(--border, #e2e8f0)', borderRadius: 14, padding: 18, background: 'var(--card, #fff)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{pack.name}</h3>
                    {pack.highlighted && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--violet, #6d28d9)' }}>Recommandé</span>}
                  </div>
                  {pack.description && <p style={{ fontSize: 13, opacity: 0.7, margin: 0 }}>{pack.description}</p>}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 26, fontWeight: 800 }}>{price === null ? '—' : formatMajorUnits(price)}</span>
                    <span style={{ fontSize: 13, opacity: 0.7 }}>{pack.currency} / {period === 'MONTHLY' ? 'mois' : 'an'}</span>
                  </div>
                  {save > 0 && <span style={{ fontSize: 12, color: '#059669', fontWeight: 600 }}>−{save}% en annuel</span>}
                  {pack.trialDays > 0 && <span style={{ fontSize: 12, opacity: 0.7 }}>{pack.trialDays} jours d&apos;essai</span>}
                  <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0', display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13 }}>
                    <li>✓ Projets : <strong>{limitTxt(pack.maxProjects)}</strong></li>
                    <li>✓ Collaborateurs : <strong>{limitTxt(pack.maxCollaborators)}</strong></li>
                    <li>✓ Stockage : <strong>{pack.storageBytes ? formatBytes(pack.storageBytes) : 'Illimité'}</strong></li>
                    {feats.map((f) => <li key={f.key}>✓ {f.label}</li>)}
                  </ul>
                  <div style={{ flex: 1 }} />
                  {authed && isOwner ? (
                    <button disabled={!!submitting || !!pending} onClick={() => request(pack)}
                      style={{ border: 'none', cursor: submitting || pending ? 'not-allowed' : 'pointer', borderRadius: 10, padding: '10px 14px', fontSize: 14, fontWeight: 700, color: '#fff', background: pending ? '#9ca3af' : 'var(--violet, #6d28d9)', opacity: submitting === pack.id ? 0.7 : 1 }}>
                      {submitting === pack.id ? 'Envoi…' : pending ? 'Demande en attente' : 'Demander ce pack'}
                    </button>
                  ) : authed ? (
                    <button disabled style={{ border: '1px solid var(--border, #e2e8f0)', borderRadius: 10, padding: '10px 14px', fontSize: 14, fontWeight: 600, background: 'transparent', color: 'var(--text-muted, #64748b)', cursor: 'not-allowed' }}>Réservé à l&apos;abonné</button>
                  ) : (
                    <Link href="/login" style={{ textAlign: 'center', textDecoration: 'none', borderRadius: 10, padding: '10px 14px', fontSize: 14, fontWeight: 700, color: '#fff', background: 'var(--violet, #6d28d9)' }}>Se connecter pour souscrire</Link>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {authed && requests.length > 0 && (
          <section style={{ marginTop: 40 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>Vos demandes</h2>
            <div style={{ border: '1px solid var(--border, #e2e8f0)', borderRadius: 12, overflow: 'hidden' }}>
              {requests.map((r, i) => (
                <div key={r.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', padding: '12px 16px', borderTop: i ? '1px solid var(--border, #e2e8f0)' : 'none', fontSize: 14, background: 'var(--card, #fff)' }}>
                  <span style={{ padding: '3px 9px', borderRadius: 999, fontSize: 12, fontWeight: 700, color: '#fff', background: REQ_COLOR[r.status] ?? '#6b7280' }}>{REQ_LABEL[r.status] ?? r.status}</span>
                  <strong>{r.pack?.name ?? 'Pack (supprimé)'}</strong>
                  <span style={{ opacity: 0.7 }}>{r.billingPeriod === 'ANNUAL' ? 'Annuel' : 'Mensuel'}</span>
                  <div style={{ flex: 1 }} />
                  <span style={{ opacity: 0.6, fontSize: 13 }}>{new Date(r.createdAt).toLocaleDateString('fr-FR')}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
