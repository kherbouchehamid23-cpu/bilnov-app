'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api-client';

interface AuthResponse {
  data: {
    accessToken: string;
    user: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      avatarUrl: string | null;
      organizationId: string;
      organizationName: string;
      plan: string;
    };
  };
}

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    <div className="min-h-screen flex" style={{ background: 'var(--surface)' }}>
      <div className="flex-1 flex flex-col items-center justify-center p-8 max-w-md mx-auto w-full">
        <div className="w-full">
          <div className="flex items-center gap-2 mb-10">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--violet)' }}>
              <span className="text-white font-bold">B</span>
            </div>
            <span className="font-bold text-lg" style={{ fontFamily: 'Syne, sans-serif' }}>Bilnov</span>
          </div>

          <h1 className="text-3xl font-bold mb-2"
            style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>
            Bon retour 👋
          </h1>
          <p className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>
            Connectez-vous à votre espace Bilnov
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                required
                className="input"
                placeholder="vous@exemple.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
                Mot de passe
              </label>
              <input
                type="password"
                value={password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                required
                className="input"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="p-3 rounded-xl text-sm"
                style={{ background: '#FEF2F2', color: '#EF4444', border: '1px solid #FECACA' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center py-3 text-base">
              {loading ? 'Connexion...' : 'Se connecter →'}
            </button>
          </form>

          <p className="text-center text-sm mt-6" style={{ color: 'var(--text-muted)' }}>
            Pas encore de compte ?{' '}
            <Link href="/register" style={{ color: 'var(--violet)', fontWeight: 500 }}>
              Créer un compte
            </Link>
          </p>
        </div>
      </div>

      <div className="hidden lg:flex flex-1 items-center justify-center"
        style={{ background: 'var(--violet-dark)' }}>
        <div className="text-center text-white">
          <div className="text-8xl mb-6">🌐</div>
          <h2 className="text-3xl font-bold mb-3" style={{ fontFamily: 'Syne, sans-serif' }}>
            Visites 360°
          </h2>
          <p style={{ color: '#C4B5FD', maxWidth: '240px', fontSize: '14px', lineHeight: '1.6' }}>
            Créez des expériences immersives pour vos clients et collaborateurs.
          </p>
        </div>
      </div>
    </div>
  );
}
