'use client';
// src/components/TourHotspotPanel.tsx
// Panneau coulissant (web) / bottom sheet (mobile) de création de hotspots.
// Remplace l'ancienne modale/popup (§9). Présentation pure ; l'éditeur pilote
// l'état (étape, type, formulaire). S'appuie sur le moteur src/lib/tourHotspots.
import React from 'react';
import {
  HOTSPOT_KINDS_PRIMARY, HOTSPOT_TYPES, fieldsFor,
  type HotspotKind, type FieldDef,
} from '@/lib/tourHotspots';

export interface SceneLite { id: string; name: string; }

interface Props {
  open: boolean;
  step: 'type' | 'place' | 'form';
  kind: HotspotKind | null;
  scenes: SceneLite[];
  currentSceneId: string | null;
  form: Record<string, unknown>;
  errors: string[];
  onPickKind: (k: HotspotKind) => void;
  onChange: (name: string, value: unknown) => void;
  onSubmit: () => void;
  onBack: () => void;
  onCancel: () => void;
}

const ICONS: Record<string, string> = {
  arrow: 'M5 12h14M13 6l6 6-6 6',
  image: 'M3 5h18v14H3zM3 15l5-4 4 3 3-2 6 5',
  pdf: 'M6 3h9l4 4v14H6zM15 3v4h4',
  text: 'M5 6h14M5 10h14M5 14h9',
  chat: 'M4 5h16v11H9l-4 3v-3H4z',
  link: 'M9 15l6-6M8 12l-2 2a3 3 0 1 0 4 4l2-2M16 12l2-2a3 3 0 1 0-4-4l-2 2',
  play: 'M8 5v14l11-7z',
  audio: 'M4 9h4l5-4v14l-5-4H4zM17 8a5 5 0 0 1 0 8',
  file: 'M7 3h8l4 4v14H7zM15 3v4h4',
  cube: 'M12 3 20 7.5v9L12 21 4 16.5v-9zM4 7.5 12 12l8-4.5M12 12v9',
  info: 'M12 8h.01M11 12h1v5h1',
};

function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name] ?? ICONS.info} />
    </svg>
  );
}

function Field({ f, scenes, currentSceneId, value, onChange }: {
  f: FieldDef; scenes: SceneLite[]; currentSceneId: string | null;
  value: unknown; onChange: (name: string, value: unknown) => void;
}) {
  const base = 'w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-violet-500';
  if (f.control === 'scene') {
    return (
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-stone-500">{f.label}</span>
        <select className={base} value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(f.name, e.target.value)}>
          <option value="">Choisir une scène…</option>
          {scenes.filter((s) => s.id !== currentSceneId).map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </label>
    );
  }
  if (f.control === 'select') {
    return (
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-stone-500">{f.label}</span>
        <select className={base} value={typeof value === 'string' ? value : (f.options?.[0]?.value ?? '')}
          onChange={(e) => onChange(f.name, e.target.value)}>
          {(f.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
    );
  }
  if (f.control === 'checkbox') {
    return (
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={value === true}
          onChange={(e) => onChange(f.name, e.target.checked)} />
        {f.label}
      </label>
    );
  }
  if (f.control === 'textarea') {
    return (
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-stone-500">{f.label}</span>
        <textarea className={base} rows={3} placeholder={f.placeholder}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(f.name, e.target.value)} />
      </label>
    );
  }
  if (f.control === 'images') {
    const arr = Array.isArray(value) ? (value as unknown[]) : [];
    return (
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-stone-500">{f.label}</span>
        <textarea className={base} rows={3} placeholder={f.placeholder}
          value={arr.map((x) => String(x)).join('\n')}
          onChange={(e) => onChange(f.name, e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))} />
      </label>
    );
  }
  // text / url
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-stone-500">{f.label}</span>
      <input className={base} type={f.control === 'url' ? 'url' : 'text'} placeholder={f.placeholder}
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(f.name, e.target.value)} />
    </label>
  );
}

export default function TourHotspotPanel(props: Props) {
  const { open, step, kind, scenes, currentSceneId, form, errors } = props;
  if (!open) return null;
  const def = kind ? HOTSPOT_TYPES[kind] : null;

  // Étape placement : barre non-bloquante -> le panorama reste cliquable.
  if (step === 'place') {
    return (
      <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-slate-900/90 px-4 py-2.5 text-white shadow-xl backdrop-blur">
          <span className="text-amber-400">◎</span>
          <span className="text-sm">Cliquez dans le panorama pour placer « {def?.label} »</span>
          <button onClick={props.onCancel} className="ml-1 rounded-full bg-white/15 px-3 py-1 text-xs hover:bg-white/25">Annuler</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Ajouter un hotspot">
      <div className="absolute inset-0 bg-black/40" onClick={props.onCancel} />
      <div className="absolute bg-white shadow-2xl flex flex-col
        right-0 top-0 h-full w-full sm:w-[380px]
        max-sm:top-auto max-sm:bottom-0 max-sm:h-auto max-sm:max-h-[85vh] max-sm:rounded-t-2xl">
        {/* En-tête */}
        <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
          <div className="flex items-center gap-2">
            {step !== 'type' && (
              <button onClick={props.onBack} className="text-stone-500 hover:text-slate-800" aria-label="Retour">←</button>
            )}
            <h3 className="text-sm font-semibold text-slate-800">
              {step === 'type' ? 'Choisir un type' : def?.label ?? 'Hotspot'}
            </h3>
          </div>
          <button onClick={props.onCancel} className="text-stone-400 hover:text-slate-800" aria-label="Fermer">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {step === 'type' && (
            <div className="grid grid-cols-2 gap-2">
              {HOTSPOT_KINDS_PRIMARY.map((k) => {
                const d = HOTSPOT_TYPES[k];
                return (
                  <button key={k} onClick={() => props.onPickKind(k)}
                    className="flex flex-col items-start gap-1 rounded-xl border border-stone-200 p-3 text-left hover:border-violet-400 hover:bg-violet-50">
                    <span className="text-violet-600"><Icon name={d.icon} /></span>
                    <span className="text-sm font-medium text-slate-800">{d.label}</span>
                    <span className="text-[11px] leading-tight text-stone-500">{d.description}</span>
                  </button>
                );
              })}
            </div>
          )}

          {step === 'form' && kind && (
            <div className="space-y-3">
              {fieldsFor(kind).map((f) => (
                <Field key={f.name} f={f} scenes={scenes} currentSceneId={currentSceneId}
                  value={form[f.name]} onChange={props.onChange} />
              ))}
              {errors.length > 0 && (
                <ul className="rounded-lg bg-red-50 p-2 text-xs text-red-600">
                  {errors.map((e, i) => <li key={i}>• {e}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>

        {step === 'form' && (
          <div className="flex gap-2 border-t border-stone-200 p-3">
            <button onClick={props.onSubmit}
              className="flex-1 rounded-lg bg-violet-600 py-2 text-sm font-medium text-white hover:bg-violet-500">
              Enregistrer
            </button>
            <button onClick={props.onCancel}
              className="rounded-lg bg-stone-100 px-4 py-2 text-sm text-slate-700 hover:bg-stone-200">
              Annuler
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
