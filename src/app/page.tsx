import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-primary-50 to-white flex flex-col items-center justify-center p-8">
      <div className="max-w-3xl text-center">
        <div className="w-16 h-16 bg-primary-700 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <span className="text-white text-2xl font-bold">B</span>
        </div>
        <h1 className="text-5xl font-bold text-primary-700 mb-4">Bilnov</h1>
        <p className="text-xl text-gray-600 max-w-xl mx-auto mb-10">
          Gestion, visualisation 3D/360° et collaboration sur vos projets visuels.
        </p>
        <div className="flex gap-4 justify-center mb-16">
          <Link href="/register" className="bg-primary-700 text-white px-8 py-3 rounded-lg font-medium hover:bg-primary-800 transition-colors">
            Démarrer gratuitement
          </Link>
          <Link href="/login" className="border border-primary-700 text-primary-700 px-8 py-3 rounded-lg font-medium hover:bg-primary-50 transition-colors">
            Se connecter
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
          {[
            { icon: '🏗️', title: 'Gestion de projet', desc: 'Structure flexible adaptée à tous les secteurs.' },
            { icon: '🌐', title: 'Visites 360°', desc: 'Créez des visites virtuelles immersives.' },
            { icon: '🔗', title: 'Partage sécurisé', desc: 'Codes d\'accès granulaires et sécurisés.' },
          ].map((f) => (
            <div key={f.title} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="font-semibold text-gray-900 mb-2">{f.title}</h3>
              <p className="text-gray-500 text-sm">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
