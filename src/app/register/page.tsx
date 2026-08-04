'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api-client';

interface AuthResponse {
  data: {
    accessToken: string;
    user: {
      id: string; email: string; firstName: string; lastName: string;
      avatarUrl: string | null; organizationId: string; organizationName: string; plan: string;
    };
  };
}

interface FormState { firstName: string; lastName: string; email: string; password: string; profession: string; professionOther: string; }

export default function RegisterPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [form, setForm] = useState<FormState>({ firstName: '', lastName: '', email: '', password: '', profession: '', professionOther: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post<AuthResponse>('/api/auth/register', form);
      setAuth(res.data.user, res.data.accessToken);
      router.push('/dashboard');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur lors de l\'inscription';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, [field]: e.target.value }));
  };

  return (
    <div className="lg-immersif safe-x safe-top safe-bottom" style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div className="flex items-center gap-2.5 mb-8">
          <span aria-hidden style={{ width: 13, height: 13, borderRadius: '4px 4px 4px 1px', background: 'linear-gradient(135deg,#22d3ee,#4F46E5)', boxShadow: '0 0 18px rgba(79,70,229,.9)' }} />
          <span className="font-bold" style={{ fontFamily: 'Syne, sans-serif', letterSpacing: '.14em', color: '#f4f7fd' }}>BILNOV</span>
        </div>
        <div className="lg-card" style={{ padding: 32 }}>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 26, fontWeight: 700, color: '#f4f7fd', margin: '0 0 4px' }}>Créer un compte</h1>
          <p style={{ color: '#9fb0c9', fontSize: 14, marginBottom: 24 }}>Essai gratuit 14 jours · Sans carte bancaire</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="lg-label" htmlFor="reg-first">Prénom</label>
                <input id="reg-first" type="text" autoComplete="given-name" value={form.firstName} onChange={handleChange('firstName')} required className="lg-input" placeholder="Jean" />
              </div>
              <div>
                <label className="lg-label" htmlFor="reg-last">Nom</label>
                <input id="reg-last" type="text" autoComplete="family-name" value={form.lastName} onChange={handleChange('lastName')} required className="lg-input" placeholder="Dupont" />
              </div>
            </div>
            <div>
              <label className="lg-label" htmlFor="reg-email">Email</label>
              <input id="reg-email" type="email" autoComplete="email" inputMode="email" value={form.email} onChange={handleChange('email')} required className="lg-input" placeholder="vous@exemple.com" />
            </div>
            <div>
              <label className="lg-label" htmlFor="reg-password">Mot de passe</label>
              <div style={{ position: 'relative' }}>
                <input id="reg-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={form.password} onChange={handleChange('password')} required minLength={8} className="lg-input" style={{ paddingRight: 46 }} placeholder="Min. 8 caractères" />
                <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} aria-pressed={showPassword} style={{ position: 'absolute', right: 5, top: '50%', transform: 'translateY(-50%)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 10, border: 0, background: 'transparent', color: '#9fb0c9', cursor: 'pointer' }}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <div>
              <label className="lg-label" htmlFor="reg-profession">Votre métier <span style={{ color: '#9fb0c9', fontWeight: 400 }}>(optionnel)</span></label>
              <select id="reg-profession" value={form.profession} onChange={(e) => setForm(prev => ({ ...prev, profession: e.target.value, professionOther: e.target.value === 'Autre' ? prev.professionOther : '' }))} className="lg-input">
                <option value="">— Sélectionner —</option>
                {['Architecte','Maître d\'ouvrage','Maître d\'œuvre','Bureau d\'études','Promoteur immobilier','Géomètre','Entreprise du bâtiment','Artisan','Agent immobilier','Diagnostiqueur','Autre'].map(p => (<option key={p} value={p}>{p}</option>))}
              </select>
            </div>
            {form.profession === 'Autre' && (
              <div>
                <label className="lg-label" htmlFor="reg-profession-other">Précisez votre métier</label>
                <input id="reg-profession-other" type="text" value={form.professionOther} onChange={handleChange('professionOther')} className="lg-input" placeholder="Votre métier" />
              </div>
            )}
            {error && (<div className="lg-error">{error}</div>)}
            <button type="submit" disabled={loading} className="lg-pill-solid" style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px', borderRadius: 13, fontWeight: 500, fontSize: 15, border: 0, cursor: 'pointer' }}>
              {loading ? 'Création...' : (<>Démarrer l&apos;essai gratuit <ArrowRight size={17} /></>)}
            </button>
          </form>
          <p style={{ textAlign: 'center', fontSize: 14, marginTop: 20, color: '#9fb0c9' }}>
            Déjà un compte ?{' '}
            <Link href="/login" style={{ color: '#7ef0ff', fontWeight: 500 }}>Se connecter</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
