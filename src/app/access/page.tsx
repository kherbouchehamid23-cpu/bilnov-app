'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

interface AccessData {
  project: {
    id: string;
    name: string;
    sector: string | null;
  };
  permissions: {
    canView: boolean;
    canDownload: boolean;
    canUpload: boolean;
    canShare: boolean;
  };
}

interface ApiResponse {
  success: boolean;
  data?: AccessData;
  error?: { message: string };
}

export default function AccessPage() {
  const router = useRouter();
  const [digits, setDigits] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const validate = async (code: string): Promise<void> => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/access/${code}`);
      const data = await res.json() as ApiResponse;
      if (!res.ok || !data.success) {
        setError(data.error?.message ?? 'Code invalide ou expiré');
        setDigits([]);
      } else {
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('bilnov_access_code', code);
          sessionStorage.setItem('bilnov_access_data', JSON.stringify(data.data));
        }
        router.push(`/shared/${data.data?.project.id}`);
      }
    } catch {
      setError('Erreur de connexion');
      setDigits([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDigit = (n: string): void => {
    if (loading) return;
    const next = [...digits, n];
    setDigits(next);
    if (next.length === 6) {
      void validate(next.join(''));
    }
  };

  const handleDelete = (): void => {
    setDigits(prev => prev.slice(0, -1));
    setError('');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: 'var(--surface)' }}>

      {/* Logo */}
      <div className="flex items-center gap-2 mb-12">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'var(--violet)' }}>
          <span className="text-white font-bold text-lg">B</span>
        </div>
        <span className="font-bold text-xl" style={{ fontFamily: 'Syne, sans-serif' }}>Bilnov</span>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4"
            style={{ background: 'var(--violet-light)' }}>
            🔐
          </div>
          <h1 className="text-2xl font-bold mb-2"
            style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>
            Accès sécurisé
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Saisissez votre code à 6 chiffres
          </p>
        </div>

        {/* Code display */}
        <div className="flex justify-center gap-3 mb-6">
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div key={i}
              className="w-11 h-14 rounded-xl border-2 flex items-center justify-center text-xl font-bold transition-all"
              style={{
                borderColor: i < digits.length ? 'var(--violet)' : 'var(--border)',
                background: i < digits.length ? 'var(--violet-light)' : 'white',
                color: 'var(--violet)',
              }}>
              {digits[i] ? '•' : ''}
            </div>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-3 rounded-xl text-sm text-center animate-fade-up"
            style={{ background: '#FEF2F2', color: '#EF4444', border: '1px solid #FECACA' }}>
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="mb-6 text-center">
            <div className="inline-flex items-center gap-2 text-sm"
              style={{ color: 'var(--violet)' }}>
              <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Vérification...
            </div>
          </div>
        )}

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
            <button
              key={n}
              onClick={() => handleDigit(String(n))}
              disabled={loading || digits.length >= 6}
              className="h-16 rounded-2xl text-xl font-bold transition-all active:scale-95"
              style={{
                background: 'white',
                color: 'var(--text)',
                border: '1.5px solid var(--border)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              }}>
              {n}
            </button>
          ))}
          {/* Empty + 0 + Delete */}
          <div />
          <button
            onClick={() => handleDigit('0')}
            disabled={loading || digits.length >= 6}
            className="h-16 rounded-2xl text-xl font-bold transition-all active:scale-95"
            style={{
              background: 'white',
              color: 'var(--text)',
              border: '1.5px solid var(--border)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}>
            0
          </button>
          <button
            onClick={handleDelete}
            disabled={loading || digits.length === 0}
            className="h-16 rounded-2xl text-xl transition-all active:scale-95"
            style={{
              background: 'var(--surface-2)',
              color: 'var(--text-muted)',
              border: '1.5px solid var(--border)',
            }}>
            ⌫
          </button>
        </div>
      </div>
    </div>
  );
}
