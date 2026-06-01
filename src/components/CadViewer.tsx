'use client';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { toDxfObjectUrl } from '@/lib/cad';

interface LayerItem {
  name: string;
  displayName: string;
  color: number;
  visible: boolean;
}

interface CadViewerProps {
  fileId: string;
  fileName: string;
  token: string;
  onClose: () => void;
}

// Viewer 2D DWG/DXF : telecharge le fichier via le proxy, le convertit en DXF
// si besoin (DWG -> DXF en WASM), puis l'affiche avec dxf-viewer (Three.js).
export default function CadViewer({ fileId, fileName, token, onClose }: CadViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const viewerRef = useRef<any>(null);
  const objectUrlRef = useRef<string | null>(null);

  const [phase, setPhase] = useState('Initialisation…');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [layers, setLayers] = useState<LayerItem[]>([]);

  const cleanup = useCallback(() => {
    if (viewerRef.current) {
      try {
        viewerRef.current.Destroy();
      } catch {
        /* ignore */
      }
      viewerRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        // 1) Telecharger le fichier (proxy authentifie, meme mecanisme que les autres fichiers)
        setPhase('Téléchargement du fichier…');
        const res = await fetch(
          `/api/file-proxy/${fileId}?token=${encodeURIComponent(token)}`,
        );
        if (!res.ok) throw new Error('Téléchargement impossible');
        const blob = await res.blob();
        if (cancelled) return;

        // 2) DWG -> DXF si necessaire (peut prendre quelques secondes au 1er chargement WASM)
        const isDwg = /\.dwg$/i.test(fileName);
        setPhase(isDwg ? 'Conversion du DWG…' : 'Préparation du plan…');
        const url = await toDxfObjectUrl(blob, fileName);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrlRef.current = url;

        // 3) Charger dxf-viewer
        setPhase('Rendu du plan…');
        const { DxfViewer } = await import('dxf-viewer');
        if (cancelled || !containerRef.current) return;

        const viewer = new DxfViewer(containerRef.current, {
          autoResize: true,
          antialias: true,
          colorCorrection: true,
        });
        viewerRef.current = viewer;

        await viewer.Load({ url, fonts: null });
        if (cancelled) return;

        // 4) Calques
        const ls: LayerItem[] = [];
        for (const l of viewer.GetLayers()) {
          ls.push({
            name: l.name,
            displayName: l.displayName ?? l.name,
            color: l.color,
            visible: true,
          });
        }
        setLayers(ls);
        setLoading(false);
        setPhase('');
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Erreur de lecture du plan');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [fileId, fileName, token, cleanup]);

  function toggleLayer(name: string) {
    setLayers((prev) =>
      prev.map((l) => {
        if (l.name === name && viewerRef.current) {
          const visible = !l.visible;
          try {
            viewerRef.current.ShowLayer(name, visible);
          } catch {
            /* ignore */
          }
          return { ...l, visible };
        }
        return l;
      }),
    );
  }

  function fitView() {
    const v = viewerRef.current;
    if (!v) return;
    const b = v.GetBounds();
    if (b) v.FitView(b.minX, b.maxX, b.minY, b.maxY, 0.1);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900">
      {/* Barre de titre */}
      <div className="flex items-center justify-between bg-slate-800 px-4 py-2 text-white">
        <span className="truncate text-sm font-medium">{fileName}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={fitView}
            className="rounded-md bg-white/10 px-3 py-1 text-sm hover:bg-white/20"
          >
            Ajuster
          </button>
          <button
            onClick={onClose}
            className="rounded-md bg-white/10 px-3 py-1 text-sm hover:bg-white/20"
          >
            Fermer
          </button>
        </div>
      </div>

      <div className="relative flex flex-1 overflow-hidden">
        {/* Zone de rendu */}
        <div ref={containerRef} className="flex-1 bg-white" />

        {/* Panneau calques */}
        {layers.length > 0 && (
          <div className="w-60 shrink-0 overflow-y-auto border-l border-slate-700 bg-slate-800 p-3 text-white">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Calques ({layers.length})
            </p>
            <ul className="space-y-1">
              {layers.map((l) => (
                <li key={l.name}>
                  <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-white/5">
                    <input
                      type="checkbox"
                      checked={l.visible}
                      onChange={() => toggleLayer(l.name)}
                    />
                    <span
                      className="inline-block h-3 w-3 shrink-0 rounded-sm"
                      style={{
                        backgroundColor: `#${(l.color >>> 0)
                          .toString(16)
                          .padStart(6, '0')
                          .slice(-6)}`,
                      }}
                    />
                    <span className="truncate">{l.displayName}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Overlay chargement / erreur */}
        {(loading || error) && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 text-white">
            {error ? (
              <div className="max-w-md px-6 text-center">
                <p className="mb-2 text-red-400">Impossible d&apos;afficher le plan</p>
                <p className="text-sm text-slate-300">{error}</p>
                <button
                  onClick={onClose}
                  className="mt-4 rounded-md bg-white/10 px-4 py-1.5 text-sm hover:bg-white/20"
                >
                  Fermer
                </button>
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
