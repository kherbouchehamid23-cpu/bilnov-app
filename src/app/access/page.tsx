'use client';
import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, Delete } from 'lucide-react';

interface AccessData {
  project: { id: string; name: string; sector: string | null; };
  permissions: { canView: boolean; canDownload: boolean; canUpload: boolean; canShare: boolean; };
}

interface ApiResponse { success: boolean; data?: AccessData; error?: { message: string }; }

function AccessInner() {
  const router = useRouter();
  const [digits, setDigits] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const searchParams = useSearchParams();

  const validate = useCallback(async (code: string): Promise<void> => {
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
  }, [router]);

  useEffect(() => {
    const c = searchParams.get('code');
    if (c && /^\d{6}$/.test(c)) {
      setDigits(c.split(''));
      void validate(c);
    }
  }, [searchParams, validate]);

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
    <div className="lg-immersif" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="flex items-center gap-2.5 mb-12">
        <span aria-hidden style={{ width: 14, height: 14, borderRadius: '4px 4px 4px 1px', background: 'linear-gradient(135deg,#22d3ee,#4F46E5)', boxShadow: '0 0 18px rgba(79,70,229,.9)' }} />
        <span className="font-bold text-xl" style={{ fontFamily: 'Syne, sans-serif', letterSpacing: '.14em', color: '#f4f7fd' }}>BILNOV</span>
      </div>

      <div className="w-full" style={{ maxWidth: 340 }}>
        <div className="text-center mb-8">
          <div style={{ width: 64, height: 64, borderRadius: 20, margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,.11)', border: '1px solid rgba(255,255,255,.2)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.45)' }}>
            <Lock size={26} color="#9fe6ff" strokeWidth={1.7} />
          </div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 24, fontWeight: 700, color: '#f4f7fd', margin: '0 0 8px' }}>Accès sécurisé</h1>
          <p style={{ fontSize: 14, color: '#9fb0c9' }}>Saisissez votre code à 6 chiffres</p>
        </div>

        <div className="flex justify-center gap-3 mb-6">
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div key={i} style={{ width: 44, height: 56, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, transition: 'all .15s',
              border: `2px solid ${i < digits.length ? '#22d3ee' : 'rgba(255,255,255,.2)'}`,
              background: i < digits.length ? 'rgba(34,211,238,.12)' : 'rgba(255,255,255,.05)',
              color: '#7ef0ff' }}>
              {digits[i] ? '•' : ''}
            </div>
          ))}
        </div>

        {error && (
          <div className="lg-error mb-6 animate-fade-up" style={{ textAlign: 'center' }}>{error}</div>
        )}

        {loading && (
          <div className="mb-6 text-center">
            <div className="inline-flex items-center gap-2 text-sm" style={{ color: '#7ef0ff' }}>
              <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Vérification...
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
            <button key={n} onClick={() => handleDigit(String(n))} disabled={loading || digits.length >= 6}
              className="lg-key" style={{ height: 64, fontSize: 20, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>
              {n}
            </button>
          ))}
          <div />
          <button onClick={() => handleDigit('0')} disabled={loading || digits.length >= 6}
            className="lg-key" style={{ height: 64, fontSize: 20, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>
            0
          </button>
          <button onClick={handleDelete} disabled={loading || digits.length === 0}
            className="lg-key" style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="Effacer">
            <Delete size={22} strokeWidth={1.7} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AccessPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#05060c' }} />}>
      <AccessInner />
    </Suspense>
  );
}
