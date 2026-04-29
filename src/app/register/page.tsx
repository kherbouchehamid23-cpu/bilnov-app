'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api-client';

export default function RegisterPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/api/auth/register', form);
      setAuth(res.data.user, res.data.accessToken);
      router.push('/dashboard');
    } catch (err) {
      setError(err.message ?? 'Erreur inscription');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--surface)' }}>
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--violet)' }}>
            <span className="text-white font-bold">B</span>
          </div>
          <span className="font-bold text-lg" style={{ fontFamily: 'Syne, sans-serif' }}>Bilnov</span>
        </div>
        <div className="p-8 rounded-3xl border" style={{ background: 'white', borderColor: 'var(--border)' }}>
          <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>Créer un compte</h1>
          <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Essai gratuit 14 jours · Sans carte bancaire</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1.5">Prénom</label>
                <input value={form.firstName} onChange={e => setForm(p => ({...p, firstName: e.target.value}))} required className="input" placeholder="Jean" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Nom</label>
                <input value={form.lastName} onChange={e => setForm(p => ({...p, lastName: e.target.value}))} required className="input" placeholder="Dupont" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Email</label>
              <input type="email" value={form.email} onChange={e => setForm(p => ({...p, email: e.target.value}))} required className="input" placeholder="vous@exemple.com" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Mot de passe</label>
              <input type="password" value={form.password} onChange={e => setForm(p => ({...p, password: e.target.value}))} required minLength={8} className="input" placeholder="Min. 8 caractères" />
            </div>
            {error && <div className="p-3 rounded-xl text-sm" style={{ background: '#FEF2F2', color: '#EF4444' }}>{error}</div>}
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3 text-base">
              {loading ? 'Création...' : 'Démarrer l essai gratuit →'}
            </button>
          </form>
          <p className="text-center text-sm mt-5" style={{ color: 'var(--text-muted)' }}>
            Déjà un compte ? <Link href="/login" style={{ color: 'var(--violet)' }}>Se connecter</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
