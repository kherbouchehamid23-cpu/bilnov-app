'use client';
// BILNOV — Module PACKS §9/§10 — Section tarifs publique.
// Alimentée dynamiquement par les packs PUBLIÉS (API /api/public/packs). Bascule
// mensuel/annuel, badge d'économie annuelle, comparateur de fonctionnalités.
// Si aucun pack publié (ou base non migrée), la section ne s'affiche pas : la page
// d'accueil reste strictement inchangée.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { annualSavingsPct, priceForPeriod, formatMajorUnits, formatBytes, type BillingPeriod } from '@/lib/packs';
import { TRIAL_DAYS } from '@/lib/subscription';

interface PackFeatureRef { featureKey: string; position: number; }
interface Pack {
  id: string; slug: string; name: string; description?: string | null;
  monthlyPriceCents: number; annualPriceCents: number | null; currency: string;
  trialDays: number; highlighted: boolean; position: number;
  maxProjects: number | null; maxFilesPerProject: number | null; maxCollaborators: number | null;
  storageBytes: number | null; features: PackFeatureRef[];
}
interface FeatureDef { key: string; label: string; category?: string | null; position: number; }

export default function PublicPricing() {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [features, setFeatures] = useState<FeatureDef[]>([]);
  const [period, setPeriod] = useState<BillingPeriod>('MONTHLY');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/public/packs')
      .then((r) => r.json())
      .then((j) => { if (cancelled) return; setPacks(j?.data?.packs ?? []); setFeatures(j?.data?.features ?? []); })
      .catch(() => { /* silencieux : section masquée */ })
      .finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, []);

  const anyAnnual = useMemo(() => packs.some((p) => p.annualPriceCents && p.annualPriceCents > 0), [packs]);
  const usedFeatureKeys = useMemo(() => {
    const set = new Set<string>();
    packs.forEach((p) => p.features?.forEach((f) => set.add(f.featureKey)));
    return set;
  }, [packs]);
  const comparatorFeatures = useMemo(
    () => features.filter((f) => usedFeatureKeys.has(f.key)),
    [features, usedFeatureKeys],
  );

  if (!ready || packs.length === 0) return null;

  const periodLabel = period === 'ANNUAL' ? '/an' : '/mois';

  return (
    <section id="tarifs" className="px-6 sm:px-10 pb-24 mx-auto" style={{ maxWidth: 1180 }}>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, letterSpacing: '.16em', color: '#93dcf2', textTransform: 'uppercase' }}>Tarifs</p>
        <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: 'clamp(28px,4vw,40px)', fontWeight: 700, letterSpacing: '-.02em', margin: '10px 0 6px', color: '#f4f7fd' }}>
          Un pack pour chaque étape
        </h2>
        <p style={{ color: '#9fb0c9', fontSize: 15 }}>Sans engagement. Changez ou arrêtez à tout moment.</p>

        {anyAnnual && (
          <div className="lg-glass" style={{ display: 'inline-flex', gap: 4, padding: 4, borderRadius: 999, marginTop: 20 }}>
            {(['MONTHLY', 'ANNUAL'] as BillingPeriod[]).map((p) => (
              <button key={p} onClick={() => setPeriod(p)}
                style={{
                  border: 'none', cursor: 'pointer', borderRadius: 999, padding: '8px 18px', fontSize: 14, fontWeight: 600,
                  fontFamily: 'JetBrains Mono, monospace',
                  background: period === p ? 'linear-gradient(135deg,#22d3ee,#4F46E5)' : 'transparent',
                  color: period === p ? '#fff' : '#9fb0c9',
                }}>
                {p === 'MONTHLY' ? 'Mensuel' : 'Annuel'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))' }}>
        {packs.map((pk) => {
          const price = priceForPeriod(pk, period);
          const savings = period === 'ANNUAL' ? annualSavingsPct(pk.monthlyPriceCents, pk.annualPriceCents) : 0;
          const unavailable = period === 'ANNUAL' && price == null;
          return (
            <div key={pk.id} className="lg-glass" style={{
              padding: 26, position: 'relative',
              border: pk.highlighted ? '1px solid rgba(34,211,238,.55)' : '1px solid rgba(255,255,255,.14)',
              boxShadow: pk.highlighted ? '0 0 40px rgba(79,70,229,.28)' : undefined,
            }}>
              {pk.highlighted && (
                <span style={{ position: 'absolute', top: -11, left: 24, background: 'linear-gradient(135deg,#22d3ee,#4F46E5)', color: '#fff', fontSize: 11, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '.08em', padding: '3px 12px', borderRadius: 999 }}>POPULAIRE</span>
              )}
              <h3 style={{ fontFamily: 'Syne, sans-serif', fontSize: 21, fontWeight: 700, color: '#f4f7fd', marginBottom: 6 }}>{pk.name}</h3>
              {pk.description && <p style={{ color: '#9fb0c9', fontSize: 13.5, lineHeight: 1.5, minHeight: 40 }}>{pk.description}</p>}

              <div style={{ margin: '16px 0 4px', display: 'flex', alignItems: 'baseline', gap: 6 }}>
                {unavailable ? (
                  <span style={{ color: '#9fb0c9', fontSize: 15 }}>Non proposé à l&apos;année</span>
                ) : (
                  <>
                    <b style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 34, fontWeight: 600, color: '#f4f7fd' }}>{formatMajorUnits(price ?? 0)}</b>
                    <span style={{ color: '#9fb0c9', fontSize: 14 }}>{pk.currency}{periodLabel}</span>
                  </>
                )}
              </div>
              {savings > 0 && !unavailable && (
                <div style={{ color: '#39e6a8', fontSize: 12.5, fontFamily: 'JetBrains Mono, monospace', marginBottom: 4 }}>Économie de {savings}%</div>
              )}
              <div style={{ color: '#7ef0ff', fontSize: 12.5, marginBottom: 8 }}>{TRIAL_DAYS} jours d&apos;essai gratuit</div>

              <Link href="/register" className="lg-pill-solid" style={{ display: 'block', textAlign: 'center', padding: '11px 18px', borderRadius: 12, fontWeight: 600, fontSize: 14.5, margin: '14px 0 16px' }}>
                Choisir {pk.name}
              </Link>

              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
                <Bullet>{pk.maxProjects == null ? 'Projets illimités' : `${pk.maxProjects} projet${pk.maxProjects > 1 ? 's' : ''}`}</Bullet>
                <Bullet>{pk.maxCollaborators == null ? 'Collaborateurs illimités' : `${pk.maxCollaborators} collaborateur${pk.maxCollaborators > 1 ? 's' : ''}`}</Bullet>
                <Bullet>{pk.storageBytes == null ? 'Stockage illimité' : `${formatBytes(pk.storageBytes)} de stockage`}</Bullet>
                {(pk.features ?? []).slice().sort((a, b) => a.position - b.position).map((f) => {
                  const def = features.find((d) => d.key === f.featureKey);
                  return def ? <Bullet key={f.featureKey}>{def.label}</Bullet> : null;
                })}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Comparateur (§10) */}
      {comparatorFeatures.length > 0 && packs.length > 1 && (
        <div className="lg-glass" style={{ marginTop: 32, padding: 0, overflowX: 'auto', borderRadius: 18 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
            <thead>
              <tr>
                <th style={{ ...thTd, textAlign: 'left', color: '#9fb0c9', fontWeight: 600 }}>Fonctionnalité</th>
                {packs.map((p) => (
                  <th key={p.id} style={{ ...thTd, color: '#f4f7fd', fontFamily: 'Syne, sans-serif' }}>{p.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparatorFeatures.map((f) => (
                <tr key={f.key}>
                  <td style={{ ...thTd, textAlign: 'left', color: '#c9d6ea' }}>{f.label}</td>
                  {packs.map((p) => {
                    const has = (p.features ?? []).some((x) => x.featureKey === f.key);
                    return (
                      <td key={p.id} style={{ ...thTd, color: has ? '#39e6a8' : '#4b5a72' }}>{has ? '✓' : '—'}</td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li style={{ display: 'flex', alignItems: 'flex-start', gap: 9, color: '#c9d6ea', fontSize: 13.5, lineHeight: 1.45 }}>
      <span aria-hidden style={{ color: '#39e6a8', flexShrink: 0, marginTop: 1 }}>✓</span>
      <span>{children}</span>
    </li>
  );
}

const thTd: React.CSSProperties = { padding: '12px 16px', textAlign: 'center', fontSize: 13.5, borderBottom: '1px solid rgba(255,255,255,.08)' };
