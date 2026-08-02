'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// §3 — Constructeur de direction ALLER-RETOUR A↔B.
// Affiche les deux scènes SIMULTANÉMENT (côte à côte sur ordinateur, empilées/étapes sur mobile).
// L'utilisateur place manuellement A→B dans la scène A et B→A dans la scène B ; les deux positions
// sont INDÉPENDANTES (le système n'invente jamais la position retour). La validation déclenche un
// enregistrement ATOMIQUE (endpoint /hotspots/pair). Réutilise le Pannellum déjà chargé par l'éditeur.

import { useEffect, useRef, useState } from 'react';

export interface PairScene { id: string; name: string; url: string; }
export interface PairPlacement { aYaw: number; aPitch: number; bYaw: number; bPitch: number; }

interface Props {
  sceneA: PairScene;
  sceneB: PairScene;
  onValidate: (p: PairPlacement) => Promise<void> | void;
  onCancel: () => void;
}

function useSideViewer(scene: PairScene, onPlace: (yaw: number, pitch: number) => void) {
  const hostRef = useRef<HTMLDivElement>(null);
  const instRef = useRef<any>(null);
  const onPlaceRef = useRef(onPlace);
  useEffect(() => { onPlaceRef.current = onPlace; }, [onPlace]);

  useEffect(() => {
    const w = window as any;
    if (!hostRef.current || !w.pannellum) return;
    let inst: any = null;
    try {
      inst = w.pannellum.viewer(hostRef.current, {
        type: 'equirectangular', panorama: scene.url, autoLoad: true, showControls: true,
        showFullscreenCtrl: false, showZoomCtrl: true, mouseZoom: true, compass: false,
        hfov: 100, minHfov: 50, maxHfov: 120,
      });
      instRef.current = inst;
    } catch { /* init failed */ }
    const el = hostRef.current;
    const onClick = (e: MouseEvent) => {
      if (!instRef.current) return;
      try {
        const c = instRef.current.mouseEventToCoords(e); // [pitch, yaw]
        const pitch = c[0], yaw = c[1];
        try { instRef.current.removeHotSpot('pair-mark'); } catch { /* noop */ }
        try { instRef.current.addHotSpot({ id: 'pair-mark', pitch, yaw, cssClass: 'pnlm-hotspot bilnov-dir pair-mark' }); } catch { /* noop */ }
        onPlaceRef.current(yaw, pitch);
      } catch { /* noop */ }
    };
    el.addEventListener('click', onClick);
    return () => { el.removeEventListener('click', onClick); if (instRef.current) { try { instRef.current.destroy(); } catch { /* noop */ } instRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.id, scene.url]);

  return hostRef;
}

export default function HotspotPairBuilder({ sceneA, sceneB, onValidate, onCancel }: Props) {
  const [a, setA] = useState<{ yaw: number; pitch: number } | null>(null);
  const [b, setB] = useState<{ yaw: number; pitch: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const hostA = useSideViewer(sceneA, (yaw, pitch) => setA({ yaw, pitch }));
  const hostB = useSideViewer(sceneB, (yaw, pitch) => setB({ yaw, pitch }));

  const ready = !!a && !!b;
  const validate = async () => {
    if (!a || !b || saving) return;
    setSaving(true); setErr(null);
    try { await onValidate({ aYaw: a.yaw, aPitch: a.pitch, bYaw: b.yaw, bPitch: b.pitch }); }
    catch { setErr("Échec de l'enregistrement — réessayez."); }
    finally { setSaving(false); }
  };

  const Side = ({ label, scene, host, pos, target }: { label: string; scene: PairScene; host: React.RefObject<HTMLDivElement>; pos: { yaw: number; pitch: number } | null; target: string }) => (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-3 py-2 text-xs" style={{ background: 'rgba(255,255,255,.05)' }}>
        <span className="font-semibold text-white">{label} — {scene.name}</span>
        <span className={pos ? 'text-emerald-400' : 'text-amber-400'}>
          {pos ? `✓ placé (yaw ${pos.yaw.toFixed(1)}°, pitch ${pos.pitch.toFixed(1)}°)` : `cliquez pour placer → ${target}`}
        </span>
      </div>
      <div ref={host} className="min-h-[240px] flex-1" style={{ background: '#000' }} />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#05060c' }}>
      <style>{`.pair-mark{box-shadow:0 0 0 3px #f59e0b,0 0 12px rgba(245,158,11,.9)!important}`}</style>
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'rgba(255,255,255,.1)' }}>
        <div>
          <p className="text-sm font-semibold text-white">Direction aller-retour A ↔ B</p>
          <p className="text-xs text-stone-400">Placez manuellement chaque sens. Les deux positions sont indépendantes.</p>
        </div>
        <button onClick={onCancel} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20">Fermer</button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:divide-x" style={{ borderColor: 'rgba(255,255,255,.1)' } as any}>
        <Side label="Scène A" scene={sceneA} host={hostA} pos={a} target={sceneB.name} />
        <div className="h-px w-full lg:hidden" style={{ background: 'rgba(255,255,255,.1)' }} />
        <Side label="Scène B" scene={sceneB} host={hostB} pos={b} target={sceneA.name} />
      </div>

      <div className="flex items-center justify-between gap-3 border-t px-4 py-3" style={{ borderColor: 'rgba(255,255,255,.1)' }}>
        <span className="text-xs text-stone-400">
          {ready ? 'Les deux sens sont placés.' : 'Placez A → B puis B → A pour valider.'}
          {err && <span className="ml-2 text-red-400">{err}</span>}
        </span>
        <div className="flex gap-2">
          <button onClick={onCancel} className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20">Annuler</button>
          <button onClick={() => void validate()} disabled={!ready || saving}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${ready && !saving ? 'bg-violet-600 text-white hover:bg-violet-500' : 'bg-white/10 text-stone-500'}`}>
            {saving ? 'Enregistrement…' : "Valider l'aller-retour"}
          </button>
        </div>
      </div>
    </div>
  );
}
