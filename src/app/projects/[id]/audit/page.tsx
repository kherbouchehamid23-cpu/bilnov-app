'use client';
import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api-client';

interface AuditLog { id: string; action: string; entityType: string | null; entityId: string | null; userId: string | null; createdAt: string; }
interface Resp { data: { logs: AuditLog[] }; }

export default function AuditPage() {
  const params = useParams();
  const id = params.id as string;
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  useEffect(() => {
    api.get<Resp>(`/api/projects/${id}/audit`).then(r => setLogs(r.data?.logs ?? [])).catch(() => setErr(true)).finally(() => setLoading(false));
  }, [id]);
  return (
    <div className="min-h-screen p-6" style={{ background: 'var(--surface)' }}>
      <div className="max-w-3xl mx-auto">
        <Link href={`/projects/${id}`} className="text-sm" style={{ color: 'var(--text-muted)' }}>&larr; Retour au projet</Link>
        <h1 className="text-2xl font-bold mt-3 mb-4" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>Journal d&apos;audit</h1>
        {loading ? (
          <p style={{ color: 'var(--text-muted)' }}>Chargement...</p>
        ) : err ? (
          <p style={{ color: '#EF4444' }}>Acces refuse ou erreur (reserve au proprietaire).</p>
        ) : logs.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>Aucune activite enregistree pour le moment.</p>
        ) : (
          <div className="space-y-2">
            {logs.map(l => (
              <div key={l.id} className="file-card rounded-xl p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium" style={{ color: 'var(--text)' }}>{l.action}</span>
                  <span className="text-xs" style={{ color: 'var(--text-light)' }}>{new Date(l.createdAt).toLocaleString('fr-FR')}</span>
                </div>
                <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{l.entityType ?? ''}{l.entityId ? ' - ' + l.entityId.slice(0, 8) : ''}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
