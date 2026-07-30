'use client';
// src/components/TourFloorPlan.tsx
// Bilnov 360 — V4b : rendu d'un plan 2D avec marqueurs de scènes.
// Partagé par l'éditeur (mode placement) et le visiteur (navigation).
// S'appuie sur le moteur PUR testé src/lib/tourMap (markersForLevel).
import React, { useRef } from 'react';
import { markersForLevel, type SceneMapLite } from '@/lib/tourMap';

interface Props {
  planUrl: string | null;
  levelId: string | null;
  scenes: SceneMapLite[];
  currentSceneId?: string | null;
  /** Clic sur un marqueur (navigation). */
  onMarkerClick?: (sceneId: string) => void;
  /** Mode placement (éditeur) : clic sur le plan -> coord normalisées 0..1. */
  onPlaceClick?: (x: number, y: number) => void;
  placingSceneName?: string | null;
  className?: string;
}

export default function TourFloorPlan({
  planUrl, levelId, scenes, currentSceneId,
  onMarkerClick, onPlaceClick, placingSceneName, className,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const markers = markersForLevel(levelId, scenes, currentSceneId);

  if (!planUrl) {
    return (
      <div className={className}>
        <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-stone-600 text-xs text-stone-500">
          Aucun plan pour ce niveau
        </div>
      </div>
    );
  }

  const handleClick = (e: React.MouseEvent) => {
    if (!onPlaceClick || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    onPlaceClick(Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000);
  };

  return (
    <div className={className}>
      <div
        ref={ref}
        className="relative w-full select-none overflow-hidden rounded-lg"
        onClick={handleClick}
        style={{ cursor: onPlaceClick ? 'crosshair' : 'default' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={planUrl} alt="Plan du niveau" className="block w-full" draggable={false} />
        {markers.map((m) => (
          <button
            key={m.id}
            type="button"
            title={m.name}
            onClick={(e) => { e.stopPropagation(); onMarkerClick?.(m.id); }}
            className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }}
          >
            <span
              className={`block h-3.5 w-3.5 rounded-full border-2 border-white shadow-md transition-transform hover:scale-125 ${m.isCurrent ? 'bg-amber-400' : 'bg-violet-500'}`}
            />
          </button>
        ))}
        {placingSceneName && (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 bg-amber-500/90 py-1 text-center text-xs font-medium text-black">
            Cliquez sur le plan pour placer « {placingSceneName} »
          </div>
        )}
      </div>
    </div>
  );
}
