'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// §3 — Constructeur de direction ALLER-RETOUR A↔B.
// N'EST PAS une fonctionnalité séparée : cet écran est ouvert DEPUIS le hotspot « Direction »
// (option « Aller-retour A↔B » cochée dans le panneau, puis « Continuer »). Il affiche les deux
// scènes et laisse l'utilisateur placer MANUELLEMENT et INDÉPENDAMMENT la flèche A→B (dans A) et
// la flèche B→A (dans B) — le système n'invente jamais la position retour. Chaque sens peut aussi
// recevoir une ORIENTATION D'ARRIVÉE (la vue affichée après le changement de scène). La validation
// déclenche un enregistrement ATOMIQUE (endpoint /hotspots/pair, both-or-neither).
//
//   • Ordinateur : les deux panoramas côte à côte, simultanément.
//   • Mobile     : workflow guidé en 3 étapes (A→B, B→A, vérification), positions conservées.

import { useEffect, useRef, useState } from 'react';

export interface PairScene { id: string; name: string; url: string; }
export interface ArrivalView { yaw: number; pitch: number; hfov: number; }
export interface PairPlacement {
  aYaw: number; aPitch: number;          // flèche A→B, placée dans la scène A
  bYaw: number; bPitch: number;          // flèche B→A, placée dans la scène B
  arrivalIntoA: ArrivalView | null;      // vue à l'arrivée dans A (appliquée au sens B→A)
  arrivalIntoB: ArrivalView | null;      // vue à l'arrivée dans B (appliquée au sens A→B)
}

interface Props {
  sceneA: PairScene;
  sceneB: PairScene;
  seedA?: { yaw: number; pitch: number } | null; // position A→B déjà placée dans la scène A (facultatif)
  onValidate: (p: PairPlacement) => Promise<void> | void;
  onBack?: () => void;   // « Retour aux paramètres » : revenir au panneau Direction
  onCancel: () => void;
}

type Pos = { yaw: number; pitch: number } | null;

// Instancie un Pannellum sur une scène, place un marqueur au clic (ou au seed), et remonte
// l'instance (pour lire la vue courante → orientation d'arrivée).
function useSideViewer(scene: PairScene, seed: Pos, onPlace: (yaw: number, pitch: number) => void, onInst: (inst: any) => void) {
  const hostRef = useRef<HTMLDivElement>(null);
  const instRef = useRef<any>(null);
  const onPlaceRef = useRef(onPlace);
  const onInstRef = useRef(onInst);
  useEffect(() => { onPlaceRef.current = onPlace; }, [onPlace]);
  useEffect(() => { onInstRef.current = onInst; }, [onInst]);

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
      onInstRef.current(inst);
      if (seed) { try { inst.addHotSpot({ id: 'pair-mark', pitch: seed.pitch, yaw: seed.yaw, cssClass: 'pnlm-hotspot bilnov-dir pair-mark' }); } catch { /* noop */ } }
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

function readView(inst: any): ArrivalView | null {
  if (!inst) return null;
  try { return { yaw: inst.getYaw(), pitch: inst.getPitch(), hfov: inst.getHfov() }; } catch { return null; }
}

// Un panneau = une scène. Place la flèche SORTANTE de cette scène + capture l'orientation
// d'arrivée ENTRANTE dans cette scène (vue courante).
function Pane({ scene, seed, targetName, outLabel, inLabel, pos, onPlace, arrival, onCaptureArrival }: {
  scene: PairScene; seed: Pos; targetName: string; outLabel: string; inLabel: string;
  pos: Pos; onPlace: (yaw: number, pitch: number) => void;
  arrival: ArrivalView | null; onCaptureArrival: (inst: any) => void;
}) {
  const instRef = useRef<any>(null);
  const host = useSideViewer(scene, seed, onPlace, (inst) => { instRef.current = inst; });
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs" style={{ background: 'rgba(255,255,255,.05)' }}>
        <span className="font-semibold text-white">{scene.name}</span>
        <span className={pos ? 'text-emerald-400' : 'text-amber-400'}>
          {pos ? `✓ ${outLabel} placé (yaw ${pos.yaw.toFixed(1)}°, pitch ${pos.pitch.toFixed(1)}°)` : `Cliquez pour placer ${outLabel} → ${targetName}`}
        </span>
      </div>
      <div ref={host} className="min-h-[240px] flex-1" style={{ background: '#000' }} />
      <div className="flex items-center justify-between gap-2 px-3 py-2 text-[11px]" style={{ background: 'rgba(255,255,255,.03)' }}>
        <span className="text-stone-400">{inLabel} : {arrival ? <span className="text-emerald-400">vue définie (yaw {arrival.yaw.toFixed(0)}°)</span> : <span className="text-stone-500">cap conservé (défaut)</span>}</span>
        <button onClick={() => onCaptureArrival(instRef.current)}
          className="whitespace-nowrap rounded-full bg-white/10 px-2.5 py-1 text-white hover:bg-white/20"
          title="Enregistrer la vue actuelle de ce panorama comme orientation affichée à l'arrivée dans cette scène">
          Utiliser la vue actuelle comme arrivée
        </button>
      </div>
    </div>
  );
}

export default function HotspotPairBuilder({ sceneA, sceneB, seedA, onValidate, onBack, onCancel }: Props) {
  const [a, setA] = useState<Pos>(seedA ?? null);
  const [b, setB] = useState<Pos>(null);
  const [arrivalIntoA, setArrivalIntoA] = useState<ArrivalView | null>(null);
  const [arrivalIntoB, setArrivalIntoB] = useState<ArrivalView | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [step, setStep] = useState(1); // mobile : 1=A→B, 2=B→A, 3=vérification

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
    try {
      await onValidate({ aYaw: a.yaw, aPitch: a.pitch, bYaw: b.yaw, bPitch: b.pitch, arrivalIntoA, arrivalIntoB });
    } catch { setErr("Échec de l'enregistrement — réessayez."); }
    finally { setSaving(false); }
  };

  const summary = (
    <div className="rounded-lg border border-white/10 p-3 text-xs">
      <p className="mb-2 font-semibold text-white">Résumé de l’aller-retour</p>
      <ul className="space-y-1 text-stone-300">
        <li>A → B ({sceneA.name} → {sceneB.name}) : {a ? <span className="text-emerald-400">position définie</span> : <span className="text-amber-400">position manquante</span>}</li>
        <li>B → A ({sceneB.name} → {sceneA.name}) : {b ? <span className="text-emerald-400">position définie</span> : <span className="text-amber-400">position manquante</span>}</li>
        <li>Arrivée dans {sceneB.name} : {arrivalIntoB ? 'vue personnalisée' : 'cap conservé (défaut)'}</li>
        <li>Arrivée dans {sceneA.name} : {arrivalIntoA ? 'vue personnalisée' : 'cap conservé (défaut)'}</li>
      </ul>
    </div>
  );

  const header = (
    <div className="flex items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: 'rgba(255,255,255,.1)' }}>
      <div>
        <p className="text-sm font-semibold text-white">Direction aller-retour A ↔ B</p>
        <p className="text-xs text-stone-400">
          {isMobile ? `Étape ${step} sur 3 — ${step === 1 ? `Direction A → B (${sceneA.name})` : step === 2 ? `Direction B → A (${sceneB.name})` : 'Vérification'}`
            : 'Placez chaque flèche manuellement. Les deux positions sont indépendantes.'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {onBack && <button onClick={onBack} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20">Retour aux paramètres</button>}
        <button onClick={onCancel} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20">Fermer</button>
      </div>
    </div>
  );

  // ---- Rendu MOBILE : 3 étapes guidées (une scène à la fois, positions conservées) ----
  if (isMobile) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#05060c' }}>
        <style>{`.pair-mark{box-shadow:0 0 0 3px #f59e0b,0 0 12px rgba(245,158,11,.9)!important}`}</style>
        {header}
        <div className="flex min-h-0 flex-1 flex-col">
          {step === 1 && (
            <Pane key="mA" scene={sceneA} seed={a} targetName={sceneB.name} outLabel="A → B" inLabel={`Arrivée dans ${sceneA.name}`}
              pos={a} onPlace={(y, p) => setA({ yaw: y, pitch: p })}
              arrival={arrivalIntoA} onCaptureArrival={(inst) => setArrivalIntoA(readView(inst))} />
          )}
          {step === 2 && (
            <Pane key="mB" scene={sceneB} seed={b} targetName={sceneA.name} outLabel="B → A" inLabel={`Arrivée dans ${sceneB.name}`}
              pos={b} onPlace={(y, p) => setB({ yaw: y, pitch: p })}
              arrival={arrivalIntoB} onCaptureArrival={(inst) => setArrivalIntoB(readView(inst))} />
          )}
          {step === 3 && (
            <div className="flex-1 overflow-y-auto p-4">{summary}{err && <p className="mt-2 text-sm text-red-400">{err}</p>}</div>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t px-4 py-3" style={{ borderColor: 'rgba(255,255,255,.1)' }}>
          <button onClick={() => (step === 1 ? onCancel() : setStep((s) => s - 1))} className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20">
            {step === 1 ? 'Annuler' : 'Précédent'}
          </button>
          {step < 3 ? (
            <button onClick={() => setStep((s) => s + 1)} disabled={(step === 1 && !a) || (step === 2 && !b)}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${((step === 1 && a) || (step === 2 && b)) ? 'bg-violet-600 text-white hover:bg-violet-500' : 'bg-white/10 text-stone-500'}`}>
              Suivant
            </button>
          ) : (
            <button onClick={() => void validate()} disabled={!ready || saving}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${ready && !saving ? 'bg-violet-600 text-white hover:bg-violet-500' : 'bg-white/10 text-stone-500'}`}>
              {saving ? 'Enregistrement…' : "Valider l'aller-retour"}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ---- Rendu ORDINATEUR : deux panoramas simultanés ----
  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#05060c' }}>
      <style>{`.pair-mark{box-shadow:0 0 0 3px #f59e0b,0 0 12px rgba(245,158,11,.9)!important}`}</style>
      {header}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:divide-x" style={{ borderColor: 'rgba(255,255,255,.1)' } as any}>
        <Pane scene={sceneA} seed={a} targetName={sceneB.name} outLabel="A → B" inLabel={`Arrivée dans ${sceneA.name}`}
          pos={a} onPlace={(y, p) => setA({ yaw: y, pitch: p })}
          arrival={arrivalIntoA} onCaptureArrival={(inst) => setArrivalIntoA(readView(inst))} />
        <div className="h-px w-full lg:hidden" style={{ background: 'rgba(255,255,255,.1)' }} />
        <Pane scene={sceneB} seed={b} targetName={sceneA.name} outLabel="B → A" inLabel={`Arrivée dans ${sceneB.name}`}
          pos={b} onPlace={(y, p) => setB({ yaw: y, pitch: p })}
          arrival={arrivalIntoB} onCaptureArrival={(inst) => setArrivalIntoB(readView(inst))} />
      </div>
      <div className="flex items-center justify-between gap-3 border-t px-4 py-3" style={{ borderColor: 'rgba(255,255,255,.1)' }}>
        <div className="hidden min-w-0 flex-1 sm:block">
          <span className="text-xs text-stone-400">
            {ready ? 'Les deux sens sont placés — vérifiez le résumé puis validez.' : 'Placez A → B puis B → A pour activer la validation.'}
            {err && <span className="ml-2 text-red-400">{err}</span>}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="mr-2 hidden max-w-xs lg:block">{summary}</div>
          <button onClick={onCancel} className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20">Annuler</button>
          {onBack && <button onClick={onBack} className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20">Retour aux paramètres</button>}
          <button onClick={() => void validate()} disabled={!ready || saving}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${ready && !saving ? 'bg-violet-600 text-white hover:bg-violet-500' : 'bg-white/10 text-stone-500'}`}>
            {saving ? 'Enregistrement…' : "Valider l'aller-retour"}
          </button>
        </div>
      </div>
    </div>
  );
}
