'use client';
// BILNOV — Console admin : barre de navigation partagée entre les écrans d'administration.
import Link from 'next/link';

const TABS: { key: string; label: string; href: string }[] = [
  { key: 'home', label: 'Tableau de bord', href: '/admin' },
  { key: 'orgs', label: 'Organisations', href: '/admin/organizations' },
  { key: 'subs', label: 'Demandes', href: '/admin/subscriptions' },
  { key: 'packs', label: 'Packs', href: '/admin/packs' },
];

export default function AdminNav({ active }: { active?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #1f2430' }}>
      <Link href="/dashboard" style={{ color: '#9ca3af', textDecoration: 'none', fontWeight: 700, marginRight: 8 }}>← Bilnov</Link>
      {TABS.map((t) => {
        const on = t.key === active;
        return (
          <Link key={t.key} href={t.href} style={{
            textDecoration: 'none', fontSize: 14, fontWeight: 600, padding: '6px 12px', borderRadius: 8,
            color: on ? '#fff' : '#9ca3af', background: on ? '#4c1d95' : 'transparent',
          }}>{t.label}</Link>
        );
      })}
    </div>
  );
}
