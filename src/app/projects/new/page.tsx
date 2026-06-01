'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api-client';

interface CreateProjectResponse {
  data: {
    id: string;
    name: string;
  };
}

interface FormState {
  name: string;
  description: string;
  structureType: string;
  sector: string;
}

export default function NewProjectPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({
    name: '',
    description: '',
    structureType: 'BUILDING',
    sector: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api.post<CreateProjectResponse>('/api/projects', form);
      router.push('/projects/' + res.data.id);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la création';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'var(--surface)' }}>
      <div className="bg-white rounded-3xl border p-8 w-full max-w-lg"
        style={{ borderColor: 'var(--border)' }}>
        <div className="mb-6">
          <Link href="/dashboard" className="text-sm" style={{ color: 'var(--text-muted)' }}>
            ← Retour
          </Link>
          <h1 className="text-2xl font-bold mt-3"
            style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>
            Nouveau projet
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
              Nom du projet *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setForm(prev => ({ ...prev, name: e.target.value }))}
              required
              maxLength={100}
              className="input"
              placeholder="Ex: Appartement T4 - Paris 11e"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text)' }}>
              Type de structure
            </label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: 'BUILDING', label: '🏠 Bâtiment', desc: 'Étages et pièces' },
                { value: 'FREE', label: '🔧 Structure libre', desc: 'Multi-industrie' },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, structureType: opt.value }))}
                  className="p-4 rounded-xl border-2 text-left transition-colors"
                  style={{
                    borderColor: form.structureType === opt.value ? 'var(--violet)' : 'var(--border)',
                    background: form.structureType === opt.value ? 'var(--violet-light)' : 'white',
                  }}>
                  <div className="font-medium text-sm" style={{ color: 'var(--text)' }}>
                    {opt.label}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {opt.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
              Secteur
            </label>
            <select
              value={form.sector}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setForm(prev => ({ ...prev, sector: e.target.value }))}
              className="input">
              <option value="">Sélectionner (optionnel)</option>
              <option value="Immobilier">Immobilier</option>
              <option value="Architecture">Architecture</option>
              <option value="Industrie">Industrie</option>
              <option value="Événementiel">Événementiel</option>
              <option value="Autre">Autre</option>
            </select>
          </div>

          {error && (
            <div className="p-3 rounded-xl text-sm"
              style={{ background: '#FEF2F2', color: '#EF4444', border: '1px solid #FECACA' }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3">
            {loading ? 'Création...' : 'Créer le projet'}
          </button>
        </form>
      </div>
    </div>
  );
}
