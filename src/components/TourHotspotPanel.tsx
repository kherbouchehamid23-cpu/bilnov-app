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
import { iconsForFamily, familiesForKind, iconSvg, defaultIconFor } from '@/lib/tourIcons';

export interface SceneLite { id: string; name: string; imageUrl?: string; levelName?: string | null; alreadyLinked?: boolean; }

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
  // Vague 3 (§12/§13) — import de fichier : délégué à l'éditeur (qui a projectId + token).
  onUploadFile?: (file: File) => Promise<{ fileKey: string; name: string; size: number }>;
  // §2 — mode ÉDITION d'un hotspot existant (props optionnelles : aucun impact sur la création).
  editMode?: boolean;
  onReposition?: () => void;
  onDelete?: () => void;
  positionLabel?: string;
  visible?: boolean;
  onToggleVisible?: () => void;
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

function Field({ f, scenes, currentSceneId, value, onChange, form, kind, onUploadFile }: {
  f: FieldDef; scenes: SceneLite[]; currentSceneId: string | null;
  value: unknown; onChange: (name: string, value: unknown) => void;
  form?: Record<string, unknown>; kind?: HotspotKind | null;
  onUploadFile?: (file: File) => Promise<{ fileKey: string; name: string; size: number }>;
}) {
  const base = 'w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-violet-500';
  if (f.control === 'scene') {
    // §11.2 / §20 — sélection de la scène cible par MINIATURES (cartes) + recherche.
    return <SceneThumbPicker f={f} scenes={scenes} currentSceneId={currentSceneId} value={value} onChange={onChange} />;
  }
  if (f.control === 'media') {
    // Vague 3 (§12/§13) — import fichier (défaut) OU URL externe.
    return <MediaField form={form ?? {}} kind={kind ?? null} onChange={onChange} onUploadFile={onUploadFile} />;
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

// Vague 3 (§12/§13) — source d'un hotspot Image/PDF : IMPORTER un fichier (défaut) ou URL externe.
function MediaField({ form, kind, onChange, onUploadFile }: {
  form: Record<string, unknown>; kind: HotspotKind | null;
  onChange: (name: string, value: unknown) => void;
  onUploadFile?: (file: File) => Promise<{ fileKey: string; name: string; size: number }>;
}) {
  const isPdf = kind === 'PDF';
  const accept = isPdf ? 'application/pdf,.pdf' : 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';
  const maxMb = isPdf ? 50 : 25;
  const source = form.sourceType === 'EXTERNAL_URL' ? 'EXTERNAL_URL' : 'UPLOAD';
  const fileKey = typeof form.fileKey === 'string' ? form.fileKey : '';
  const mediaName = typeof form.mediaName === 'string' ? form.mediaName : '';
  const mediaSize = typeof form.mediaSize === 'number' ? form.mediaSize : 0;
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [drag, setDrag] = React.useState(false);
  const [preview, setPreview] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => { if (form.sourceType === undefined) onChange('sourceType', 'UPLOAD'); /* défaut = import */ }, [form.sourceType, onChange]);

  const fmtSize = (b: number) => b >= 1048576 ? `${(b / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(b / 1024))} Ko`;

  const handleFile = async (file: File): Promise<void> => {
    setErr(null);
    const okType = isPdf
      ? (file.type === 'application/pdf' || /\.pdf$/i.test(file.name))
      : (/^image\/(jpeg|png|webp)$/.test(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name));
    if (!okType) { setErr(isPdf ? 'Seuls les documents PDF sont acceptés.' : 'Format non accepté. Utilisez JPG, JPEG, PNG ou WebP.'); return; }
    if (file.size > maxMb * 1048576) { setErr(`Le fichier dépasse la limite autorisée de ${maxMb} Mo.`); return; }
    if (!onUploadFile) { setErr("Import indisponible ici."); return; }
    if (!isPdf) { try { setPreview(URL.createObjectURL(file)); } catch { /* noop */ } }
    setBusy(true);
    try {
      const res = await onUploadFile(file);
      onChange('sourceType', 'UPLOAD');
      onChange('fileKey', res.fileKey);
      onChange('mediaName', res.name || file.name);
      onChange('mediaSize', res.size || file.size);
    } catch { setErr("L'import a échoué. Vous pouvez réessayer."); }
    finally { setBusy(false); }
  };

  const clearFile = (): void => {
    onChange('fileKey', undefined); onChange('mediaName', undefined); onChange('mediaSize', undefined);
    setPreview(null); setErr(null);
  };

  return (
    <div className="block">
      <span className="mb-1 block text-xs font-medium text-stone-500">Source {isPdf ? 'du document' : "de l'image"}</span>
      <div className="mb-2 flex gap-3 text-sm text-slate-700">
        <label className="flex items-center gap-1.5"><input type="radio" checked={source === 'UPLOAD'} onChange={() => onChange('sourceType', 'UPLOAD')} />Importer un fichier</label>
        <label className="flex items-center gap-1.5"><input type="radio" checked={source === 'EXTERNAL_URL'} onChange={() => onChange('sourceType', 'EXTERNAL_URL')} />Utiliser une URL</label>
      </div>

      {source === 'UPLOAD' ? (
        !fileKey ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) void handleFile(f); }}
            onClick={() => inputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-3 py-6 text-center text-sm ${drag ? 'border-violet-500 bg-violet-50' : 'border-stone-300 bg-stone-50'}`}>
            {busy ? (
              <span className="flex items-center gap-2 text-stone-500"><span className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />Envoi en cours…</span>
            ) : (
              <>
                <span className="font-medium text-slate-700">{isPdf ? 'Déposer un PDF ici' : 'Déposer une image ici'}</span>
                <span className="text-stone-500">ou cliquez pour {isPdf ? 'sélectionner un PDF' : 'sélectionner une image'}</span>
                <span className="text-[11px] text-stone-400">{isPdf ? 'PDF' : 'JPG, JPEG, PNG, WebP'} · max {maxMb} Mo</span>
              </>
            )}
            <input ref={inputRef} type="file" accept={accept} className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ''; }} />
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-2">
            {isPdf ? (
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-500"><Icon name="pdf" /></div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview ?? (typeof form.url === 'string' ? form.url : '')} alt="" className="h-14 w-14 flex-shrink-0 rounded-lg object-cover bg-stone-100" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-700">{mediaName || 'Fichier importé'}</p>
              {mediaSize > 0 && <p className="text-xs text-stone-400">{fmtSize(mediaSize)}</p>}
              <div className="mt-1 flex gap-3 text-xs">
                <button type="button" onClick={() => inputRef.current?.click()} className="text-violet-600 hover:underline">Remplacer</button>
                <button type="button" onClick={clearFile} className="text-red-500 hover:underline">Supprimer</button>
              </div>
            </div>
            <input ref={inputRef} type="file" accept={accept} className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ''; }} />
          </div>
        )
      ) : (
        <input className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-violet-500"
          type="url" placeholder="https://…" value={typeof form.url === 'string' ? form.url : ''}
          onChange={(e) => onChange('url', e.target.value)} />
      )}
      {err && <p className="mt-1 text-xs text-red-500">{err}</p>}
    </div>
  );
}

// §11.2 / §20 — sélection de la scène cible sous forme de cartes visuelles (miniature, nom, niveau,
// indicateur « déjà relié ») avec recherche. Remplace la liste déroulante seule.
function SceneThumbPicker({ f, scenes, currentSceneId, value, onChange }: {
  f: FieldDef; scenes: SceneLite[]; currentSceneId: string | null;
  value: unknown; onChange: (name: string, value: unknown) => void;
}) {
  const [q, setQ] = React.useState('');
  const selected = typeof value === 'string' ? value : '';
  const list = scenes.filter((s) => s.id !== currentSceneId)
    .filter((s) => !q || s.name.toLowerCase().includes(q.toLowerCase()) || (s.levelName ?? '').toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="block">
      <span className="mb-1 block text-xs font-medium text-stone-500">{f.label}</span>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une scène…"
        className="mb-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-slate-800 outline-none focus:border-violet-500" />
      <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
        {list.length === 0 && <p className="col-span-2 py-4 text-center text-xs text-stone-400">Aucune scène.</p>}
        {list.map((s) => (
          <button key={s.id} type="button" onClick={() => onChange(f.name, s.id)}
            className={`relative overflow-hidden rounded-lg border text-left ${selected === s.id ? 'border-violet-500 ring-2 ring-violet-300' : 'border-stone-200 hover:border-violet-300'}`}>
            <span className="block h-20 w-full bg-stone-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {s.imageUrl ? <img src={s.imageUrl} alt={s.name} className="h-full w-full object-cover" /> : null}
            </span>
            <span className="block px-2 py-1">
              <span className="block truncate text-xs font-medium text-slate-800">{s.name}</span>
              {s.levelName && <span className="block truncate text-[10px] text-stone-400">{s.levelName}</span>}
            </span>
            {s.alreadyLinked && <span className="absolute right-1 top-1 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-medium text-white">relié</span>}
            {selected === s.id && <span className="absolute left-1 top-1 rounded-full bg-violet-600 px-1.5 py-0.5 text-[9px] font-medium text-white">✓</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

// §10 — sélecteur d'icône (familles) + couleur + taille, avec aperçu.
function IconPicker({ kind, form, onChange }: {
  kind: HotspotKind; form: Record<string, unknown>; onChange: (name: string, value: unknown) => void;
}) {
  const current = typeof form.iconId === 'string' ? form.iconId : defaultIconFor(kind);
  const color = typeof form.iconColor === 'string' ? form.iconColor : '#7c6dff';
  const scale = typeof form.iconScale === 'number' ? form.iconScale : 1;
  const opacity = typeof form.iconOpacity === 'number' ? form.iconOpacity : 1;
  const fams = familiesForKind(kind);
  return (
    <div className="rounded-lg border border-stone-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-stone-500">Icône</span>
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-stone-200"
          dangerouslySetInnerHTML={{ __html: iconSvg(current, { color, size: Math.round(20 * scale) }) }} />
      </div>
      <div className="max-h-28 overflow-y-auto">
        {fams.map((fam) => (
          <div key={fam} className="mb-1 grid grid-cols-6 gap-1">
            {iconsForFamily(fam).map((ic) => (
              <button key={ic.id} type="button" title={ic.label} onClick={() => onChange('iconId', ic.id)}
                className={`flex items-center justify-center rounded-md border p-1.5 ${current === ic.id ? 'border-violet-500 bg-violet-50' : 'border-stone-200 hover:border-violet-300'}`}
                dangerouslySetInnerHTML={{ __html: iconSvg(ic.id, { color: '#475569', size: 18 }) }} />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-3">
        <label className="flex items-center gap-1 text-[11px] text-stone-500">Couleur
          <input type="color" value={color} onChange={(e) => onChange('iconColor', e.target.value)} className="h-6 w-8 cursor-pointer rounded border border-stone-200" />
        </label>
        <label className="flex flex-1 items-center gap-2 text-[11px] text-stone-500">Taille
          <input type="range" min="0.6" max="2" step="0.1" value={scale} onChange={(e) => onChange('iconScale', Number(e.target.value))} className="flex-1" />
        </label>
      </div>
      <label className="mt-2 flex items-center gap-2 text-[11px] text-stone-500">Opacité
        <input type="range" min="0.2" max="1" step="0.05" value={opacity} onChange={(e) => onChange('iconOpacity', Number(e.target.value))} className="flex-1" />
        <span className="w-8 text-right tabular-nums">{Math.round(opacity * 100)}%</span>
      </label>
    </div>
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
              {props.editMode ? `Modifier : ${def?.label ?? 'hotspot'}` : (step === 'type' ? 'Choisir un type' : def?.label ?? 'Hotspot')}
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
              {props.editMode && (
                <div className="flex items-center justify-between rounded-lg bg-stone-100 px-3 py-2 text-xs text-slate-600">
                  <span>{props.positionLabel ?? 'Position enregistrée'}</span>
                  {props.onToggleVisible && (
                    <button type="button" onClick={props.onToggleVisible}
                      className={`rounded-full px-2 py-0.5 font-medium ${props.visible === false ? 'bg-amber-200 text-amber-900' : 'bg-emerald-200 text-emerald-900'}`}>
                      {props.visible === false ? '🚫 Masqué' : '👁 Visible'}
                    </button>
                  )}
                </div>
              )}
              {fieldsFor(kind).map((f) => (
                <Field key={f.name} f={f} scenes={scenes} currentSceneId={currentSceneId}
                  value={form[f.name]} onChange={props.onChange}
                  form={form} kind={kind} onUploadFile={props.onUploadFile} />
              ))}
              <IconPicker kind={kind} form={form} onChange={props.onChange} />
              {errors.length > 0 && (
                <ul className="rounded-lg bg-red-50 p-2 text-xs text-red-600">
                  {errors.map((e, i) => <li key={i}>• {e}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>

        {step === 'form' && (
          <div className="border-t border-stone-200 p-3 space-y-2">
            {props.editMode && (
              <div className="flex gap-2">
                {props.onReposition && (
                  <button onClick={props.onReposition}
                    className="flex-1 rounded-lg bg-stone-100 py-2 text-sm font-medium text-slate-700 hover:bg-stone-200">
                    ✥ Repositionner
                  </button>
                )}
                {props.onDelete && (
                  <button onClick={props.onDelete}
                    className="flex-1 rounded-lg bg-red-50 py-2 text-sm font-medium text-red-600 hover:bg-red-100">
                    🗑 Supprimer
                  </button>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={props.onSubmit}
                className="flex-1 rounded-lg bg-violet-600 py-2 text-sm font-medium text-white hover:bg-violet-500">
                {props.editMode ? 'Enregistrer les modifications' : 'Enregistrer'}
              </button>
              <button onClick={props.onCancel}
                className="rounded-lg bg-stone-100 px-4 py-2 text-sm text-slate-700 hover:bg-stone-200">
                Annuler
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
