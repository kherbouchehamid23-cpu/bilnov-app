'use client';
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

// Les visites krpano sont desormais integrees dans l'onglet "Visites" de la
// page projet. Cette page ne sert plus que de redirection (anciens liens).
export default function KrpanoRedirect() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  useEffect(() => {
    router.replace(`/projects/${id}`);
  }, [id, router]);
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--surface)' }}>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Redirection…</p>
    </div>
  );
}
