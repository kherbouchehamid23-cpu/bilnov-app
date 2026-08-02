'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// §3 — Constructeur de direction ALLER-RETOUR A↔B (option du hotspot « Direction »).
// Écran ÉPURÉ : uniquement les DEUX panoramas concernés + trois boutons (Retour, Annuler,
// Valider). Aucun titre / descriptif / métadonnée. L'utilisateur place manuellement la flèche
// A→B (dans A) et la flèche B→A (dans B) ; les positions sont indépendantes. Enregistrement
// ATOMIQUE au clic sur « Valider ». L'orientation d'arrivée se règle ensuite en éditant chaque
// direction (bouton « Régler la vue d'arrivée » du panneau d'édition).
//
// Les scènes STÉRÉO sont affichées à UN ŒIL recadré (comme le viewer une-image), pour ne pas
// montrer l'image dédoublée. Mono = inchangé.

import { useEffect, useRef, useState } from 'react';
import { layoutFromScene, oneEyeUrl, revokeCroppedUrl } from '@/lib/stereoCrop';

export interface PairScene {
  id: string; name: string; url: string;
  panoramaType?: string | null; stereoLayout?: string | null;
}
export interface PairPlacement {
  aYaw: number; aPitch: number; bYaw: number; bPitch: number;
  // Champs hérités (compat transitoire), non utilisés par l'écran épuré : l'orientation
  // d'arrivée se règle désormais en éditant chaque direction.
  arrivalIntoA?: { yaw: number; pitch: number; hfov: number } | null;
  arrivalIntoB?: { yaw: number; pitch: number; hfov: number } | null;
}

interface Props {
  sceneA: PairScene;
  sceneB: PairScene;
  seedA?: { yaw: number; pitch: number } | null;
  onValidate: (p: PairPlacement) => Promise<void> | void;
  onBack?: () => void;
  onCancel: () => void;
}

type Pos = { yaw: number; pitch: number } | null;

// Instancie un Pannellum sur une scène (un œil si stéréo), place un marqueur au clic (ou au seed).
function useSideViewer(scene: PairScene, seed: Pos, onPlace: (yaw: number, pitch: number) => void) {
  const hostRef = useRef<HTMLDivElement>(null);
  const instRef = useRef<any>(null);
  const onPlaceRef = useRef(onPlace);
  useEffect(() => { onPlaceRef.current = onPlace; }, [onPlace]);

  useEffect(() => {
    const w = window as any;
    if (!hostRef.current || !w.pannellum) return;
    let cancelled = false;
    let cropBlob: string | null = null;
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
    const init = (panoramaUrl: string) => {
      if (cancelled || !hostRef.current) return;
      try {
        const inst = w.pannellum.viewer(hostRef.current, {
          type: 'equirectangular', panorama: panoramaUrl, autoLoad: true, showControls: true,
          showFullscreenCtrl: false, showZoomCtrl: true, mouseZoom: true, compass: false,
          hfov: 100, minHfov: 50, maxHfov: 120,
        });
        instRef.current = inst;
        if (seed) { try { inst.addHotSpot({ id: 'pair-mark', pitch: seed.pitch, yaw: seed.yaw, cssClass: 'pnlm-hotspot bilnov-dir pair-mark' }); } catch { /* noop */ } }
      } catch { /* init failed */ }
      el.addEventListener('click', onClick);
    };
    // §1 (anomalie) — scène stéréo : afficher UN œil recadré (comme le viewer une-image),
    // selon la disposition réelle (TB/BT/LR/RL).
    const lay = layoutFromScene(scene.panoramaType, scene.stereoLayout);
    if (lay === 'MONO') { init(scene.url); }
    else {
      void oneEyeUrl(scene.url, lay, 'left')
        .then((u) => { if (cancelled) { revokeCroppedUrl(u); return; } if (u.startsWith('blob:')) cropBlob = u; init(u); })
        .catch(() => init(scene.url));
    }
    return () => {
      cancelled = true;
      el.removeEventListener('click', onClick);
      if (instRef.current) { try { instRef.current.destroy(); } catch { /* noop */ } instRef.current = null; }
      revokeCroppedUrl(cropBlob);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.id, scene.url, scene.panoramaType, scene.stereoLayout]);

  return hostRef;
}

// Un panneau = une scène. Badge minimal (quel sens placer) + panorama. Rien d'autre.
function Pane({ scene, seed, badge, placed, onPlace }: {
  scene: PairScene; seed: Pos; badge: string; placed: boolean; onPlace: (yaw: number, pitch: number) => void;
}) {
  const host = useSideViewer(scene, seed, onPlace);
  return (
    <div className="relative min-h-0 flex-1">
      <div ref={host} className="absolute inset-0" style={{ background: '#000' }} />
      <div className={`pointer-events-none absolute left-3 top-3 z-10 rounded-full px-3 py-1 text-xs font-semibold ${placed ? 'bg-emerald-600 text-white' : 'bg-black/70 text-white'}`}>
        {placed ? `✓ ${badge}` : badge}
      </div>
    </div>
  );
}

export default function HotspotPairBuilder({ sceneA, sceneB, seedA, onValidate, onBack, onCancel }: Props) {
  const [a, setA] = useState<Pos>(seedA ?? null);
  const [b, setB] = useState<Pos>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [step, setStep] = useState(1);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 1023px)');
    const on = () => setIsMobile(mq.matches);
    on();
    try { mq.addEventListener('change', on); return () => mq.removeEventListener('change', on); }
    catch { mq.addListener(on); return () => mq.removeListener(on); }
  }, []);

  const ready = !!a && !!b;
  const validate = async () => {
    if (!a || !b || saving) return;
    setSaving(true); setErr(null);
    try { await onValidate({ aYaw: a.yaw, aPitch: a.pitch, bYaw: b.yaw, bPitch: b.pitch }); }
    catch { setErr("Échec de l'enregistrement — réessayez."); }
    finally { setSaving(false); }
  };

  const buttons = (
    <>
      {onBack && <button onClick={onBack} className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20">Retour</button>}
      <button onClick={onCancel} className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20">Annuler</button>
      <button onClick={() => void validate()} disabled={!ready || saving}
        className={`rounded-lg px-4 py-2 text-sm font-medium ${ready && !saving ? 'bg-violet-600 text-white hover:bg-violet-500' : 'bg-white/10 text-stone-500'}`}>
        {saving ? 'Enregistrement…' : 'Valider'}
      </button>
    </>
  );

  const markStyle = `.pair-mark{box-shadow:0 0 0 3px #f59e0b,0 0 12px rgba(245,158,11,.9)!important}`;

  // Mobile : une image à la fois (positions conservées), mêmes 3 boutons.
  if (isMobile) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#000' }}>
        <style>{markStyle}</style>
        <div className="min-h-0 flex-1">
          {step === 1
            ? <Pane key="mA" scene={sceneA} seed={a} badge="A → B" placed={!!a} onPlace={(y, p) => setA({ yaw: y, pitch: p })} />
            : <Pane key="mB" scene={sceneB} seed={b} badge="B → A" placed={!!b} onPlace={(y, p) => setB({ yaw: y, pitch: p })} />}
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3" style={{ background: '#05060c' }}>
          {err && <span className="mr-auto text-xs text-red-400">{err}</span>}
          {onBack && <button onClick={onBack} className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20">Retour</button>}
          <button onClick={onCancel} className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20">Annuler</button>
          {step === 1 ? (
            <button onClick={() => setStep(2)} disabled={!a}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${a ? 'bg-violet-600 text-white hover:bg-violet-500' : 'bg-white/10 text-stone-500'}`}>Suivant</button>
          ) : (
            <button onClick={() => void validate()} disabled={!ready || saving}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${ready && !saving ? 'bg-violet-600 text-white hover:bg-violet-500' : 'bg-white/10 text-stone-500'}`}>
              {saving ? 'Enregistrement…' : 'Valider'}
            </button>
          )}
        </div>
      </div>
    );
  }

  // Ordinateur : les deux panoramas côte à côte + 3 boutons. Rien d'autre.
  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#000' }}>
      <style>{markStyle}</style>
      <div className="flex min-h-0 flex-1">
        <Pane scene={sceneA} seed={a} badge="A → B" placed={!!a} onPlace={(y, p) => setA({ yaw: y, pitch: p })} />
        <div className="w-px" style={{ background: 'rgba(255,255,255,.15)' }} />
        <Pane scene={sceneB} seed={b} badge="B → A" placed={!!b} onPlace={(y, p) => setB({ yaw: y, pitch: p })} />
      </div>
      <div className="flex items-center justify-end gap-2 px-4 py-3" style={{ background: '#05060c' }}>
        {err && <span className="mr-auto text-xs text-red-400">{err}</span>}
        {buttons}
      </div>
    </div>
  );
}
