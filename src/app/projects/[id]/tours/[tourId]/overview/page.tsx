'use client';
// src/app/projects/[id]/tours/[tourId]/overview/page.tsx
// Bilnov 360 — V5 : éditeur global / contrôle qualité + génération assistée.
// Vue read-mostly : rapport qualité de la visite + propositions de liens par
// proximité (à valider). S'appuie sur le moteur PUR testé src/lib/tourQuality.
import { useParams } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  proximityProposals, qualityReport,
  type SceneNode, type DirectionLink, type LevelRef, type LinkProposal, type QualityReport,
} from '@/lib/tourQuality';
import { buildReturnPayload, type HotspotPayload } from '@/lib/tourHotspots';

interface Scene extends SceneNode { position: number; }
interface Hotspot { id: string; type: string; targetSceneId: string | null; positionYaw: number; }
interface Level extends LevelRef { position: number; }
interface ApiResponse<T> { data: T; success: boolean; }

const LEVEL_STYLE: Record<string, { dot: string; label: string }> = {
  error: { dot: '#ef4444', label: 'Erreur' },
  warning: { dot: '#f59e0b', label: 'Attention' },
  info: { dot: '#60a5fa', label: 'Info' },
};

export default function TourOverviewPage() {
  const params = useParams();
  const id = params.id as string;
  const tourId = params.tourId as string;

  const [tourName, setTourName] = useState('');
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [links, setLinks] = useState<DirectionLink[]>([]);
  const [report, setReport] = useState<QualityReport | null>(null);
  const [proposals, setProposals] = useState<LinkProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const getToken = (): string => typeof window !== 'undefined' ? localStorage.getItem('bilnov_token') ?? '' : '';
  const sceneName = useCallback((sid: string) => scenes.find((s) => s.id === sid)?.name ?? sid, [scenes]);

  const load = useCallback(async () => {
    const auth = { headers: { Authorization: `Bearer ${getToken()}` } };
    const [tRes, sRes, lRes] = await Promise.all([
      fetch(`/api/projects/${id}/tours/${tourId}`, auth),
      fetch(`/api/projects/${id}/tours/${tourId}/scenes`, auth),
      fetch(`/api/projects/${id}/tours/${tourId}/levels`, auth),
    ]);
    const tData = await tRes.json() as ApiResponse<{ name?: string }>;
    if (tData.data?.name) setTourName(tData.data.name);
    const sData = await sRes.json() as ApiResponse<{ scenes: Scene[] }>;
    const list = (sData.data?.scenes ?? []).slice().sort((a, b) => a.position - b.position);
    setScenes(list);
    try {
      const lData = await lRes.json() as ApiResponse<{ levels: Level[] }>;
      setLevels((lData.data?.levels ?? []).slice().sort((a, b) => a.position - b.position));
    } catch { setLevels([]); }

    const entries = await Promise.all(list.map(async (s) => {
      try {
        const r = await fetch(`/api/projects/${id}/tours/${tourId}/scenes/${s.id}/hotspots`, auth);
        const d = await r.json() as ApiResponse<{ hotspots: Hotspot[] }>;
        return (d.data?.hotspots ?? []).filter((h) => h.type === 'LINK' && h.targetSceneId)
          .map((h) => ({ fromSceneId: s.id, toSceneId: h.targetSceneId as string }));
      } catch { return []; }
    }));
    setLinks(entries.flat());
  }, [id, tourId]);

  useEffect(() => {
    void (async () => { try { await load(); } finally { setLoading(false); } })();
  }, [load]);

  // Recalcule rapport + propositions à chaque changement de données.
  useEffect(() => {
    if (loading) return;
    setReport(qualityReport(scenes, links, levels));
    setProposals(proximityProposals(scenes, links, { maxPerScene: 2, maxDistance: 0.45 }));
  }, [scenes, links, levels, loading]);

  const acceptProposal = async (p: LinkProposal): Promise<void> => {
    setBusy(`${p.fromSceneId}|${p.toSceneId}`);
    const authJson = { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' };
    const forward: HotspotPayload = { type: 'LINK', positionYaw: 0, positionPitch: 0, targetSceneId: p.toSceneId, content: { kind: 'DIRECTION', title: p.toName } };
    try {
      await fetch(`/api/projects/${id}/tours/${tourId}/scenes/${p.fromSceneId}/hotspots`, { method: 'POST', headers: authJson, body: JSON.stringify(forward) });
      const back = buildReturnPayload(forward, p.fromSceneId, p.fromName);
      if (back) await fetch(`/api/projects/${id}/tours/${tourId}/scenes/${p.toSceneId}/hotspots`, { method: 'POST', headers: authJson, body: JSON.stringify(back) });
      // Mise à jour locale : le lien devient bidirectionnel.
      setLinks((prev) => [...prev, { fromSceneId: p.fromSceneId, toSceneId: p.toSceneId }, { fromSceneId: p.toSceneId, toSceneId: p.fromSceneId }]);
    } catch { alert('Échec de la création du lien.'); }
    finally { setBusy(null); }
  };

  const visibleProposals = proposals.filter((p) => !dismissed.has(`${p.fromSceneId}|${p.toSceneId}`));
  const scoreColor = !report ? '#666' : report.score >= 80 ? '#4ade80' : report.score >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <div className="min-h-screen" style={{ background: '#0f0f0f' }}>
      <header className="flex items-center justify-between px-6 py-4 border-b border-stone-800">
        <div className="flex items-center gap-3">
          <Link href={`/projects/${id}/tours/${tourId}`} className="text-stone-400 hover:text-white text-sm">← Éditeur</Link>
          <Link href={`/projects/${id}/tours/${tourId}/view-psv`} className="text-stone-400 hover:text-white text-sm">👁 Voir</Link>
          <div className="w-px h-4 bg-stone-700" />
          <span className="font-bold text-white" style={{ fontFamily: 'Syne, sans-serif' }}>{tourName || 'Visite'} — Contrôle qualité</span>
        </div>
      </header>

      {loading ? (
        <div className="p-10 text-center text-sm text-stone-400">Analyse de la visite…</div>
      ) : (
        <div className="mx-auto max-w-3xl space-y-6 p-6">
          {/* Score */}
          <section className="rounded-2xl border border-stone-800 bg-stone-900/50 p-5">
            <div className="flex items-center gap-5">
              <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-full border-4" style={{ borderColor: scoreColor }}>
                <span className="text-2xl font-bold text-white">{report?.score ?? '—'}</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Score de qualité</p>
                <p className="text-xs text-stone-400">
                  {scenes.length} scène{scenes.length !== 1 ? 's' : ''} · {levels.length} niveau{levels.length !== 1 ? 'x' : ''} · {report?.reachable.length ?? 0} atteignable{(report?.reachable.length ?? 0) !== 1 ? 's' : ''} depuis le départ
                </p>
              </div>
            </div>
          </section>

          {/* Problèmes détectés */}
          <section className="rounded-2xl border border-stone-800 bg-stone-900/50 p-5">
            <h2 className="mb-3 text-sm font-semibold text-white">Diagnostic</h2>
            {report && report.issues.length === 0 ? (
              <p className="rounded-lg bg-emerald-950/50 p-3 text-sm text-emerald-300">✓ Aucun problème détecté — la visite est cohérente.</p>
            ) : (
              <ul className="space-y-2">
                {report?.issues.map((iss, i) => (
                  <li key={i} className="rounded-lg bg-stone-800/60 p-3">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: LEVEL_STYLE[iss.level].dot }} />
                      <span className="text-xs uppercase tracking-wide text-stone-400">{LEVEL_STYLE[iss.level].label}</span>
                    </div>
                    <p className="mt-1 text-sm text-white">{iss.message}</p>
                    {iss.sceneIds.length > 0 && (
                      <p className="mt-1 text-xs text-stone-400">{iss.sceneIds.map(sceneName).join(', ')}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Génération assistée : propositions de liens par proximité */}
          <section className="rounded-2xl border border-stone-800 bg-stone-900/50 p-5">
            <h2 className="mb-1 text-sm font-semibold text-white">Liens suggérés (proximité sur le plan)</h2>
            <p className="mb-3 text-xs text-stone-400">Bilnov propose de relier les scènes proches d’un même niveau. Chaque lien accepté est créé dans les deux sens.</p>
            {visibleProposals.length === 0 ? (
              <p className="text-sm text-stone-500">Aucune suggestion — placez vos scènes sur les plans (onglet Niveaux) pour activer les propositions.</p>
            ) : (
              <ul className="space-y-2">
                {visibleProposals.map((p) => {
                  const key = `${p.fromSceneId}|${p.toSceneId}`;
                  return (
                    <li key={key} className="flex items-center justify-between rounded-lg bg-stone-800/60 p-3">
                      <span className="text-sm text-white">{p.fromName} <span className="text-stone-500">↔</span> {p.toName}</span>
                      <div className="flex items-center gap-2">
                        <button onClick={() => void acceptProposal(p)} disabled={busy === key}
                          className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50">
                          {busy === key ? '…' : 'Créer le lien'}
                        </button>
                        <button onClick={() => setDismissed((prev) => new Set(prev).add(key))}
                          className="rounded-lg bg-stone-700 px-3 py-1.5 text-xs text-stone-300 hover:bg-stone-600">Ignorer</button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
