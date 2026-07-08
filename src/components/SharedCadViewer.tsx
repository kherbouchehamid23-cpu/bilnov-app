'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toDxfObjectUrl } from '@/lib/cad';
import { STATUS_META, statusColor, statusLabel, type CadStatus, type CadPriority } from '@/lib/cadStatus';

interface Person { id: string; firstName: string; lastName: string }
interface Reply { id: string; body: string; createdAt: string; author: Person }
interface Comment {
  id: string; number: number; x: number; y: number; title: string | null; text: string;
  priority: CadPriority; status: CadStatus; createdAt: string;
  author: Person; assignee: Person | null; replies: Reply[]; attachments: { id: string; name: string; kind: string }[];
}

interface Props { shareId: string; code: string; fileId: string; fileName: string; onClose: () => void }

// Viewer CAO en LECTURE SEULE pour la vue partagée publique (§14) : affiche le
// plan + les marqueurs de commentaires partagés + la liste (sans édition).
export default function SharedCadViewer({ shareId, code, fileId, fileName, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const THREERef = useRef<any>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState('Chargement…');
  const [, setTick] = useState(0);
  const [comments, setComments] = useState<Comment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showPanel, setShowPanel] = useState(true);

  const worldToScreen = useCallback((x: number, y: number): { px: number; py: number } | null => {
    const v = viewerRef.current; const THREE = THREERef.current; const cont = containerRef.current;
    if (!v || !THREE || !cont) return null;
    try {
      const origin = v.GetOrigin(); const cam = v.GetCamera();
      const p = new THREE.Vector3(x - origin.x, y - origin.y, 0).project(cam);
      return { px: (p.x * 0.5 + 0.5) * cont.clientWidth, py: (-p.y * 0.5 + 0.5) * cont.clientHeight };
    } catch { return null; }
  }, []);

  const centerOn = useCallback((x: number, y: number) => {
    const v = viewerRef.current; const THREE = THREERef.current; const cont = containerRef.current;
    if (!v || !THREE || !cont) return;
    try {
      const cam = v.GetCamera();
      const a = new THREE.Vector3(-1, 0, 0).unproject(cam);
      const b = new THREE.Vector3(1, 0, 0).unproject(cam);
      const wpp = Math.abs(b.x - a.x) / cont.clientWidth;
      const hw = (wpp * cont.clientWidth) / 2, hh = (wpp * cont.clientHeight) / 2;
      v.FitView(x - hw, x + hw, y - hh, y + hh, 0);
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true); setError(null); setPhase('Téléchargement du plan…');
        const res = await fetch(`/api/shared/${shareId}/files/${fileId}/raw?code=${encodeURIComponent(code)}`);
        if (!res.ok) throw new Error('Téléchargement impossible');
        const blob = await res.blob();
        setPhase('Conversion DWG…');
        const { url } = await toDxfObjectUrl(blob, fileName);
        if (cancelled) { URL.revokeObjectURL(url); return; }
        objectUrlRef.current = url;
        setPhase('Rendu du plan…');
        const [{ DxfViewer }, THREE] = await Promise.all([import('dxf-viewer'), import('three')]);
        THREERef.current = THREE;
        if (cancelled || !containerRef.current) return;
        const viewer = new DxfViewer(containerRef.current, {
          autoResize: true, antialias: false, colorCorrection: true, retainParsedDxf: false,
          sceneOptions: { suppressPaperSpace: true, arcTessellationAngle: 15 },
        });
        viewerRef.current = viewer;
        await viewer.Load({ url, fonts: ['/cad/DejaVuSans.ttf'] });
        if (cancelled) return;
        viewer.Subscribe('viewChanged', () => setTick((t) => t + 1));
        try {
          const cr = await fetch(`/api/shared/${shareId}/files/${fileId}/comments?code=${encodeURIComponent(code)}`);
          const cd = await cr.json() as { data?: { comments?: Comment[] } };
          if (!cancelled) setComments(cd.data?.comments ?? []);
        } catch { /* commentaires optionnels */ }
        setLoading(false); setPhase('');
      } catch (e) {
        if (!cancelled) { setError(e instanceof Error ? e.message : 'Erreur de lecture'); setLoading(false); }
      }
    })();
    return () => {
      cancelled = true;
      try { viewerRef.current?.Destroy?.(); } catch { /* noop */ }
      viewerRef.current = null;
      if (objectUrlRef.current) { URL.revokeObjectURL(objectUrlRef.current); objectUrlRef.current = null; }
    };
  }, [shareId, code, fileId, fileName]);

  function fitView() { const v = viewerRef.current; if (!v) return; const b = v.GetBounds(); if (b) v.FitView(b.minX, b.maxX, b.minY, b.maxY, 0.1); }
  const selected = comments.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900">
      <div className="flex items-center justify-between bg-slate-800 px-3 py-2 text-white">
        <span className="truncate text-sm font-medium max-w-[40%]">{fileName}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-300">Lecture seule</span>
          <button className="rounded-md bg-white/10 px-3 py-1 text-sm hover:bg-white/20" onClick={() => setShowPanel((s) => !s)}>🗂️ Commentaires ({comments.length})</button>
          <button className="rounded-md bg-white/10 px-3 py-1 text-sm hover:bg-white/20" onClick={fitView}>Ajuster</button>
          <button className="rounded-md bg-white/10 px-3 py-1 text-sm hover:bg-white/20" onClick={onClose}>Fermer</button>
        </div>
      </div>

      <div className="relative flex flex-1 overflow-hidden">
        <div ref={containerRef} className="flex-1 bg-white" />

        <div className="pointer-events-none absolute inset-0" style={{ right: showPanel ? 340 : 0 }}>
          {comments.map((c) => {
            const s = worldToScreen(c.x, c.y); if (!s) return null;
            const col = statusColor(c.status); const active = c.id === selectedId;
            return (
              <button key={c.id} className="absolute pointer-events-auto -translate-x-1/2 -translate-y-full" style={{ left: s.px, top: s.py }} onClick={() => setSelectedId(c.id)}>
                <div className="flex flex-col items-center">
                  <div className="flex items-center justify-center rounded-full text-white text-xs font-bold shadow-lg" style={{ width: 26, height: 26, background: col, border: active ? '3px solid #fff' : '2px solid #fff' }}>{c.number}</div>
                  <span style={{ color: col, fontSize: 16, lineHeight: 1, marginTop: -2 }}>&#9660;</span>
                </div>
              </button>
            );
          })}
        </div>

        {showPanel && (
          <div className="w-[340px] shrink-0 overflow-y-auto border-l border-slate-700 bg-slate-50">
            {selected ? (
              <div className="p-3">
                <button className="text-xs text-slate-500 hover:underline mb-2" onClick={() => setSelectedId(null)}>← Liste</button>
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center rounded-full text-white text-[11px] font-bold" style={{ width: 20, height: 20, background: statusColor(selected.status) }}>{selected.number}</span>
                  <h3 className="text-sm font-semibold text-slate-800">{selected.title || 'Commentaire'}</h3>
                </div>
                <p className="mt-1 text-xs text-slate-600 whitespace-pre-wrap">{selected.text}</p>
                <div className="mt-2 flex items-center gap-2 text-[11px]">
                  <span className="px-1.5 py-0.5 rounded text-white" style={{ background: statusColor(selected.status) }}>{statusLabel(selected.status)}</span>
                  <span className="text-slate-400">par {selected.author.firstName} {selected.author.lastName}</span>
                </div>
                <button className="mt-2 text-xs text-violet-600 hover:underline" onClick={() => centerOn(selected.x, selected.y)}>Centrer sur le plan</button>
                <div className="mt-3">
                  <p className="text-[10px] uppercase text-slate-400 mb-1">Discussion ({selected.replies.length})</p>
                  {selected.replies.length === 0 && <p className="text-xs text-slate-400">Aucune réponse.</p>}
                  <div className="space-y-1.5">
                    {selected.replies.map((r) => (
                      <div key={r.id} className="rounded bg-white shadow-sm p-2">
                        <p className="text-xs text-slate-700 whitespace-pre-wrap">{r.body}</p>
                        <p className="text-[10px] text-slate-400 mt-1">{r.author.firstName} {r.author.lastName} · {new Date(r.createdAt).toLocaleString('fr-FR')}</p>
                      </div>
                    ))}
                  </div>
                  {selected.attachments.length > 0 && (
                    <p className="mt-2 text-[11px] text-slate-500">{selected.attachments.length} pièce(s) jointe(s)</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-3">
                <p className="text-sm font-semibold text-slate-700 mb-2">Commentaires ({comments.length})</p>
                {comments.length === 0 && <p className="text-xs text-slate-400 mt-4 text-center">Aucun commentaire partagé.</p>}
                <ul className="space-y-1.5">
                  {comments.map((c) => (
                    <li key={c.id}>
                      <button className="w-full text-left rounded-lg bg-white shadow-sm p-2 hover:ring-2 hover:ring-violet-200" onClick={() => { setSelectedId(c.id); centerOn(c.x, c.y); }}>
                        <div className="flex items-center gap-2">
                          <span className="flex items-center justify-center rounded-full text-white text-[10px] font-bold shrink-0" style={{ width: 18, height: 18, background: statusColor(c.status) }}>{c.number}</span>
                          <span className="text-xs font-medium text-slate-800 truncate flex-1">{c.title || c.text}</span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-400">
                          <span>{STATUS_META[c.status].label}</span>
                          <span>· {c.author.firstName} {c.author.lastName}</span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {(loading || error) && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 text-white">
            {error ? (
              <div className="max-w-md px-6 text-center">
                <p className="mb-2 text-red-400">Impossible d&apos;afficher le plan</p>
                <p className="text-sm text-slate-300">{error}</p>
                <button onClick={onClose} className="mt-4 rounded-md bg-white/10 px-4 py-1.5 text-sm hover:bg-white/20">Fermer</button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                <p className="text-sm">{phase}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
