import Link from 'next/link';
export default function HomePage() {
  return (
    <main className="min-h-screen" style={{ background: 'var(--surface)' }}>
      <nav className="flex items-center justify-between px-8 py-5 glass sticky top-0 z-50 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--violet)' }}>
            <span className="text-white font-bold text-sm">B</span>
          </div>
          <span className="text-lg font-bold" style={{ color: 'var(--text)', fontFamily: 'Syne, sans-serif' }}>Bilnov</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="btn-secondary text-sm">Se connecter</Link>
          <Link href="/register" className="btn-primary text-sm">Essai gratuit</Link>
        </div>
      </nav>
      <section className="px-8 pt-24 pb-20 max-w-5xl mx-auto text-center">
        <h1 className="text-6xl font-bold leading-tight mb-6" style={{ color: 'var(--text)', fontFamily: 'Syne, sans-serif' }}>
          Gérez vos projets<br /><span className="gradient-text">en toute clarté</span>
        </h1>
        <p className="text-lg mb-10 max-w-xl mx-auto" style={{ color: 'var(--text-muted)' }}>
          Bilnov centralise vos fichiers, visites 360° et collaboration.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link href="/register" className="btn-primary px-6 py-3 text-base">Démarrer gratuitement</Link>
          <Link href="/login" className="btn-secondary px-6 py-3 text-base">Se connecter</Link>
        </div>
      </section>
      <section className="px-8 pb-24 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[{icon:'🏗️',title:'Gestion de projet',desc:'Structure flexible par étages et pièces.',color:'#EDE9FE'},{icon:'🌐',title:'Visites 360°',desc:'Créez des visites virtuelles immersives.',color:'#ECFDF5'},{icon:'🔗',title:'Partage sécurisé',desc:'Codes accès avec permissions granulaires.',color:'#FEF3C7'}].map((f)=>(
            <div key={f.title} className="card-hover rounded-2xl p-6 border" style={{ background: 'white', borderColor: 'var(--border)' }}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-4" style={{ background: f.color }}>{f.icon}</div>
              <h3 className="font-bold text-lg mb-2" style={{ color: 'var(--text)', fontFamily: 'Syne, sans-serif' }}>{f.title}</h3>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}