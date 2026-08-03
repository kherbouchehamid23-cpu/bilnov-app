'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Compass, ArrowRight, Eye, EyeOff } from 'lucide-react';
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

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post<AuthResponse>('/api/auth/login', { email, password });
      setAuth(res.data.user, res.data.accessToken);
      router.push('/dashboard');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Email ou mot de passe incorrect';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lg-immersif lg-authgrid">
      <div className="flex flex-col items-center justify-center p-8 safe-x safe-top safe-bottom">
        <div className="w-full" style={{ maxWidth: 380 }}>
          <div className="flex items-center gap-2.5 mb-10">
            <span aria-hidden style={{ width: 13, height: 13, borderRadius: '4px 4px 4px 1px', background: 'linear-gradient(135deg,#22d3ee,#4F46E5)', boxShadow: '0 0 18px rgba(79,70,229,.9)' }} />
            <span className="font-bold" style={{ fontFamily: 'Syne, sans-serif', letterSpacing: '.14em', color: '#f4f7fd' }}>BILNOV</span>
          </div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 32, fontWeight: 700, color: '#f4f7fd', margin: '0 0 8px' }}>Bon retour</h1>
          <p style={{ color: '#9fb0c9', fontSize: 14, marginBottom: 28 }}>Connectez-vous à votre espace BILNOV</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="lg-label" htmlFor="login-email">Email</label>
              <input id="login-email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)} required className="lg-input" placeholder="vous@exemple.com" />
            </div>
            <div>
              <label className="lg-label" htmlFor="login-password">Mot de passe</label>
              <div style={{ position: 'relative' }}>
                <input id="login-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)} required className="lg-input" style={{ paddingRight: 46 }} placeholder="••••••••" />
                <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} aria-pressed={showPassword} style={{ position: 'absolute', right: 5, top: '50%', transform: 'translateY(-50%)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 10, border: 0, background: 'transparent', color: '#9fb0c9', cursor: 'pointer' }}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            {error && (<div className="lg-error">{error}</div>)}
            <button type="submit" disabled={loading} className="lg-pill-solid" style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px', borderRadius: 13, fontWeight: 500, fontSize: 15, border: 0, cursor: 'pointer' }}>
              {loading ? 'Connexion...' : (<>Se connecter <ArrowRight size={17} /></>)}
            </button>
          </form>
          <p style={{ textAlign: 'center', fontSize: 14, marginTop: 24, color: '#9fb0c9' }}>
            Pas encore de compte ?{' '}
            <Link href="/register" style={{ color: '#7ef0ff', fontWeight: 500 }}>Créer un compte</Link>
          </p>
        </div>
      </div>
      <aside className="lg-authaside" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <div className="lg-card" style={{ textAlign: 'center', padding: '44px 36px', maxWidth: 340 }}>
          <div style={{ width: 64, height: 64, borderRadius: 20, margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,.11)', border: '1px solid rgba(255,255,255,.2)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.45)' }}>
            <Compass size={30} color="#9fe6ff" strokeWidth={1.6} />
          </div>
          <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: 26, fontWeight: 700, color: '#f4f7fd', margin: '0 0 10px' }}>Visites 360°</h2>
          <p style={{ color: '#9fb0c9', fontSize: 14, lineHeight: 1.6, maxWidth: 240, margin: '0 auto' }}>Créez des expériences immersives pour vos clients et collaborateurs.</p>
        </div>
      </aside>
    </div>
  );
}
