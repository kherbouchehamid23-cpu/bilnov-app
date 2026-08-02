import Link from 'next/link';
import { Ruler, Compass, Share2, Play, ArrowRight } from 'lucide-react';
import PublicPricing from '@/components/PublicPricing';

const FEATURES = [
  { Icon: Ruler, k: 'F·01', title: 'Mesure accrochée', desc: 'Distances, surfaces, cotation. Accrochage extrémité / milieu / intersection, verrouillage orthogonal.' },
  { Icon: Compass, k: 'F·02', title: 'Visites 360°', desc: "L'ouvrage bâti, hotspots directionnels, mini-plan synchronisé, partage par lien." },
  { Icon: Share2, k: 'F·03', title: 'Partage sécurisé', desc: "Codes d'accès à permissions granulaires. Vos clients visualisent, vous gardez la main." },
];

export default function HomePage() {
  return (
    <main className="lg-immersif" style={{ minHeight: '100vh', overflowX: 'hidden' }}>
      {/* Nav */}
      <nav className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-10 py-4 sm:py-5 sticky top-0 z-50"
        style={{ background: 'rgba(6,8,16,.55)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
        <div className="flex items-center gap-2.5">
          <span aria-hidden style={{ width: 13, height: 13, borderRadius: '4px 4px 4px 1px', background: 'linear-gradient(135deg,#22d3ee,#4F46E5)', boxShadow: '0 0 18px rgba(79,70,229,.9)' }} />
          <span className="font-bold" style={{ fontFamily: 'Syne, sans-serif', letterSpacing: '.14em', color: '#f4f7fd' }}>BILNOV</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="lg-pill-ghost text-sm whitespace-nowrap" style={{ padding: '10px 18px', borderRadius: 13, fontWeight: 500 }}>Se connecter</Link>
          <Link href="/register" className="lg-pill-solid text-sm whitespace-nowrap" style={{ padding: '10px 18px', borderRadius: 13, fontWeight: 500 }}>Essai gratuit</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-6 sm:px-10 pt-20 pb-16 mx-auto" style={{ maxWidth: 1180 }}>
        <div className="lg-hero">
          <div>
            <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, letterSpacing: '.16em', color: '#93dcf2', textTransform: 'uppercase' }}>Du plan mesuré au réel bâti</p>
            <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 'clamp(38px,6vw,58px)', fontWeight: 700, lineHeight: 1.02, letterSpacing: '-.02em', margin: '16px 0 18px', color: '#f4f7fd' }}>
              Gérez vos projets<br /><span className="lg-grad">en toute clarté.</span>
            </h1>
            <p style={{ color: '#9fb0c9', fontSize: 17, lineHeight: 1.6, maxWidth: '46ch' }}>
              BILNOV centralise vos fichiers, la mesure au millimètre sur plan DWG et vos visites 360° — dans une seule surface. Importez, mesurez, partagez.
            </p>
            <div className="flex flex-wrap items-center gap-3.5" style={{ marginTop: 26 }}>
              <Link href="/register" className="lg-pill-solid" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '13px 22px', borderRadius: 13, fontWeight: 500, fontSize: 15 }}>Démarrer gratuitement <ArrowRight size={17} /></Link>
              <Link href="/login" className="lg-pill-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '13px 22px', borderRadius: 13, fontWeight: 500, fontSize: 15 }}><Play size={15} /> Voir la démo</Link>
            </div>
            <div className="flex gap-8" style={{ marginTop: 30 }}>
              <div><b style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 22, fontWeight: 500, color: '#f4f7fd' }}>±3 mm</b><span style={{ display: 'block', color: '#6b7c98', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', marginTop: 4 }}>Précision snap</span></div>
              <div><b style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 22, fontWeight: 500, color: '#f4f7fd' }}>DWG · 360</b><span style={{ display: 'block', color: '#6b7c98', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', marginTop: 4 }}>Formats lus</span></div>
            </div>
          </div>

          {/* Aperçu verre : plan + cote (cote rouge fonctionnelle conservée) */}
          <div className="lg-preview" style={{ borderRadius: 26, overflow: 'hidden', border: '1px solid rgba(255,255,255,.2)', boxShadow: '0 18px 50px rgba(2,6,20,.55), inset 0 1px 0 rgba(255,255,255,.45)', background: 'radial-gradient(120% 120% at 20% 10%,rgba(34,211,238,.16),transparent 55%),linear-gradient(160deg,#0c1830,#0a1122)' }}>
            <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.1) 1px,transparent 1px)', backgroundSize: '34px 34px', opacity: .5 }} />
            <div aria-hidden style={{ position: 'absolute', left: '9%', top: '16%', width: '64%', height: '58%', border: '2.5px solid rgba(233,240,255,.85)', borderRadius: 3 }} />
            <div aria-hidden style={{ position: 'absolute', left: '9%', top: '80%', width: '64%', borderTop: '2px solid #ff5647' }}>
              <span style={{ position: 'absolute', left: '50%', top: -11, transform: 'translateX(-50%)', background: '#ff5647', color: '#fff', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, padding: '2px 8px', borderRadius: 6 }}>4 250 mm</span>
            </div>
            <div className="lg-glass-sm" style={{ position: 'absolute', right: '6%', top: '12%', width: 150, padding: '14px 16px', borderRadius: 16 }}>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#9fb0c9' }}>Séjour · largeur</div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 20, marginTop: 3, color: '#f4f7fd' }}>4 250 mm</div>
            </div>
            <div className="lg-glass-sm" style={{ position: 'absolute', right: '12%', bottom: '9%', display: 'flex', alignItems: 'center', gap: 9, padding: '10px 14px', borderRadius: 14 }}>
              <span aria-hidden style={{ width: 10, height: 10, borderRadius: '50%', background: '#39e6a8', boxShadow: '0 0 12px #39e6a8' }} />
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#f4f7fd' }}>— Ortho verrouillé</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 sm:px-10 pb-24 mx-auto" style={{ maxWidth: 1180 }}>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))' }}>
          {FEATURES.map(({ Icon, k, title, desc }) => (
            <div key={title} className="lg-glass" style={{ padding: 24 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,.11)', border: '1px solid rgba(255,255,255,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14, boxShadow: 'inset 0 1px 0 rgba(255,255,255,.45)' }}>
                <Icon size={22} color="#9fe6ff" strokeWidth={1.6} />
              </div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#7ef0ff', letterSpacing: '.12em' }}>{k}</div>
              <h3 style={{ fontFamily: 'Syne, sans-serif', fontSize: 19, fontWeight: 600, margin: '12px 0 8px', color: '#f4f7fd' }}>{title}</h3>
              <p style={{ color: '#9fb0c9', fontSize: 14, lineHeight: 1.55 }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Tarifs (Module PACKS §9) — dynamique : masqué tant qu'aucun pack n'est publié */}
      <PublicPricing />

      <footer className="px-6 sm:px-10 pb-10 mx-auto" style={{ maxWidth: 1180, borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 28, display: 'flex', justifyContent: 'space-between', color: '#6b7c98', fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}>
        <span>BILNOV — le plan, la mesure, la pièce. © 2026</span>
        <span>Liquid Glass</span>
      </footer>
    </main>
  );
}
