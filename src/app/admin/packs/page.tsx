'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// BILNOV — Module PACKS §1/§2/§4 — Console admin : gestion des packs d'abonnement.
// Interface autonome (aucun header partagé encore). Accès réservé aux administrateurs
// plateforme (contrôle serveur via PLATFORM_ADMIN_EMAILS ; 403 sinon).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api-client';
import { annualSavingsPct, formatBytes, gbToBytes, bytesToGb, formatMajorUnits } from '@/lib/packs';
import AdminNav from '@/components/AdminNav';

interface Feature { id?: string; key: string; label: string; description?: string | null; category?: string | null; position: number; }
interface PackFeature { featureKey: string; enabled: boolean; position: number; }
interface Pack {
  id: string; slug: string; name: string; description?: string | null;
  monthlyPriceCents: number; annualPriceCents: number | null; currency: string;
  trialDays: number; status: string; highlighted: boolean; position: number;
  maxProjects: number | null; maxFilesPerProject: number | null; maxCollaborators: number | null;
  storageBytes: number | null; features?: PackFeature[];
}

const STATUS_LABEL: Record<string, string> = { DRAFT: 'Brouillon', PUBLISHED: 'Publié', SUSPENDED: 'Suspendu', ARCHIVED: 'Archivé' };
const STATUS_COLOR: Record<string, string> = { DRAFT: '#6b7280', PUBLISHED: '#059669', SUSPENDED: '#d97706', ARCHIVED: '#374151' };

type LimitField = 'maxProjects' | 'maxFilesPerProject' | 'maxCollaborators';

function emptyDraft(): Pack {
  return {
    id: '', slug: '', name: '', description: '', monthlyPriceCents: 0, annualPriceCents: null,
    currency: 'DZD', trialDays: 0, status: 'DRAFT', highlighted: false, position: 0,
    maxProjects: null, maxFilesPerProject: null, maxCollaborators: null, storageBytes: null, features: [],
  };
}

export default function AdminPacksPage() {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Pack | null>(null);
  const [enabledKeys, setEnabledKeys] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [newFeature, setNewFeature] = useState({ label: '', category: '' });

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [p, f] = await Promise.all([
        api.get<any>('/api/admin/packs'),
        api.get<any>('/api/admin/features'),
      ]);
      setPacks(p.data.packs ?? []);
      setFeatures(f.data.features ?? []);
    } catch (e: any) {
      setError(e?.message ?? 'Erreur de chargement');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openNew = () => { const d = emptyDraft(); setDraft(d); setEnabledKeys(new Set()); };
  const openEdit = (pk: Pack) => {
    setDraft({ ...pk, description: pk.description ?? '' });
    setEnabledKeys(new Set((pk.features ?? []).filter((x) => x.enabled).map((x) => x.featureKey)));
  };
  const closeEditor = () => setDraft(null);

  const setField = (k: keyof Pack, v: any) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  const toggleFeature = (key: string) => setEnabledKeys((s) => {
    const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n;
  });

  const save = async () => {
    if (!draft) return;
    if (!draft.name.trim()) { setError('Le nom du pack est requis'); return; }
    setSaving(true); setError(null);
    const payload: any = {
      name: draft.name, description: draft.description, monthlyPriceCents: draft.monthlyPriceCents,
      annualPriceCents: draft.annualPriceCents, currency: draft.currency, trialDays: draft.trialDays,
      status: draft.status, highlighted: draft.highlighted, position: draft.position,
      maxProjects: draft.maxProjects, maxFilesPerProject: draft.maxFilesPerProject,
      maxCollaborators: draft.maxCollaborators, storageBytes: draft.storageBytes,
      features: features.map((f, i) => ({ featureKey: f.key, enabled: enabledKeys.has(f.key), position: i })),
    };
    try {
      if (draft.id) await api.patch(`/api/admin/packs/${draft.id}`, payload);
      else await api.post('/api/admin/packs', payload);
      closeEditor(); await load();
    } catch (e: any) { setError(e?.message ?? 'Échec de l\'enregistrement'); }
    finally { setSaving(false); }
  };

  const removePack = async (pk: Pack) => {
    if (!confirm(`Supprimer le pack « ${pk.name} » ? Cette action est définitive.`)) return;
    setError(null);
    try { await api.delete(`/api/admin/packs/${pk.id}`); await load(); }
    catch (e: any) { setError(e?.message ?? 'Échec de la suppression'); }
  };

  const addFeature = async () => {
    if (!newFeature.label.trim()) return;
    try {
      await api.post('/api/admin/features', { label: newFeature.label, category: newFeature.category || null });
      setNewFeature({ label: '', category: '' });
      const f = await api.get<any>('/api/admin/features');
      setFeatures(f.data.features ?? []);
    } catch (e: any) { setError(e?.message ?? 'Échec de l\'ajout de fonctionnalité'); }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0b0d14', color: '#e5e7eb', padding: '32px 20px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <AdminNav active="packs" />
        <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, marginBottom: 8 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em' }}>Abonnements &amp; facturation</h1>
          <span style={{ fontSize: 13, color: '#9ca3af' }}>Gestion des packs</span>
        </header>
        <p style={{ color: '#9ca3af', fontSize: 14, marginBottom: 24 }}>
          Créez et publiez des packs. Prix, limites et fonctionnalités sont entièrement pilotés ici — rien n&apos;est figé dans le code.
        </p>

        {error && (
          <div style={{ background: '#3f1d1d', border: '1px solid #7f1d1d', color: '#fecaca', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
            {error}
          </div>
        )}

        {loading ? (
          <p style={{ color: '#9ca3af' }}>Chargement…</p>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
              <button onClick={openNew} style={btnPrimary}>+ Nouveau pack</button>
            </div>

            {packs.length === 0 ? (
              <div style={{ border: '1px dashed #374151', borderRadius: 12, padding: 40, textAlign: 'center', color: '#9ca3af' }}>
                Aucun pack pour l&apos;instant. Créez votre premier pack pour l&apos;afficher sur la page tarifs.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {packs.map((pk) => {
                  const savePct = annualSavingsPct(pk.monthlyPriceCents, pk.annualPriceCents);
                  return (
                    <div key={pk.id} style={cardStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: 17 }}>{pk.name}</strong>
                        <span style={{ ...badge, background: STATUS_COLOR[pk.status] }}>{STATUS_LABEL[pk.status] ?? pk.status}</span>
                        {pk.highlighted && <span style={{ ...badge, background: '#7c3aed' }}>Mis en avant</span>}
                        <span style={{ marginLeft: 'auto', fontSize: 15, fontWeight: 600 }}>
                          {formatMajorUnits(pk.monthlyPriceCents)} {pk.currency}/mois
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 6, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        <span>Annuel : {pk.annualPriceCents ? `${formatMajorUnits(pk.annualPriceCents)} ${pk.currency}${savePct > 0 ? ` (−${savePct}%)` : ''}` : '—'}</span>
                        <span>Projets : {pk.maxProjects ?? 'Illimité'}</span>
                        <span>Collaborateurs : {pk.maxCollaborators ?? 'Illimité'}</span>
                        <span>Stockage : {pk.storageBytes != null ? formatBytes(pk.storageBytes) : 'Illimité'}</span>
                        <span>Essai : {pk.trialDays} j</span>
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                        <button onClick={() => openEdit(pk)} style={btnGhost}>Modifier</button>
                        <button onClick={() => void removePack(pk)} style={btnDanger}>Supprimer</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Catalogue de fonctionnalités */}
            <section style={{ marginTop: 40 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Catalogue de fonctionnalités</h2>
              <p style={{ color: '#9ca3af', fontSize: 13, marginBottom: 12 }}>
                Les fonctionnalités définies ici sont activables pack par pack.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {features.map((f) => (
                  <span key={f.key} style={{ ...badge, background: '#1f2937', color: '#d1d5db' }} title={f.key}>{f.label}</span>
                ))}
                {features.length === 0 && <span style={{ color: '#6b7280', fontSize: 13 }}>Aucune fonctionnalité définie.</span>}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input value={newFeature.label} onChange={(e) => setNewFeature((s) => ({ ...s, label: e.target.value }))}
                  placeholder="Libellé (ex : Mode VR/WebXR)" style={{ ...input, minWidth: 240 }} />
                <input value={newFeature.category} onChange={(e) => setNewFeature((s) => ({ ...s, category: e.target.value }))}
                  placeholder="Catégorie (optionnel)" style={{ ...input, minWidth: 160 }} />
                <button onClick={() => void addFeature()} style={btnGhost}>Ajouter</button>
              </div>
            </section>
          </>
        )}
      </div>

      {draft && (
        <PackEditor
          draft={draft} features={features} enabledKeys={enabledKeys} saving={saving}
          setField={setField} toggleFeature={toggleFeature} onSave={save} onClose={closeEditor}
        />
      )}
    </div>
  );
}

function PackEditor({ draft, features, enabledKeys, saving, setField, toggleFeature, onSave, onClose }: {
  draft: Pack; features: Feature[]; enabledKeys: Set<string>; saving: boolean;
  setField: (k: keyof Pack, v: any) => void; toggleFeature: (k: string) => void;
  onSave: () => void; onClose: () => void;
}) {
  const storageGb = useMemo(() => (draft.storageBytes != null ? Math.round(bytesToGb(draft.storageBytes) * 10) / 10 : ''), [draft.storageBytes]);
  const majorInput = (cents: number | null) => (cents == null ? '' : String(Math.round(cents) / 100));

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>{draft.id ? 'Modifier le pack' : 'Nouveau pack'}</h2>

        <Field label="Nom">
          <input style={input} value={draft.name} onChange={(e) => setField('name', e.target.value)} />
        </Field>
        <Field label="Description">
          <textarea style={{ ...input, minHeight: 60, resize: 'vertical' }} value={draft.description ?? ''} onChange={(e) => setField('description', e.target.value)} />
        </Field>

        <div style={row2}>
          <Field label="Prix mensuel (unité)">
            <input style={input} type="number" min={0} value={majorInput(draft.monthlyPriceCents)}
              onChange={(e) => setField('monthlyPriceCents', Math.round(Number(e.target.value || 0) * 100))} />
          </Field>
          <Field label="Prix annuel (unité, vide = non proposé)">
            <input style={input} type="number" min={0} value={majorInput(draft.annualPriceCents)}
              onChange={(e) => setField('annualPriceCents', e.target.value === '' ? null : Math.round(Number(e.target.value) * 100))} />
          </Field>
        </div>

        <div style={row2}>
          <Field label="Devise">
            <input style={input} value={draft.currency} onChange={(e) => setField('currency', e.target.value.toUpperCase())} />
          </Field>
          <Field label="Jours d'essai gratuit">
            <input style={input} type="number" min={0} value={draft.trialDays} onChange={(e) => setField('trialDays', Math.max(0, Math.trunc(Number(e.target.value || 0))))} />
          </Field>
        </div>

        <div style={row2}>
          <Field label="Statut">
            <select style={input} value={draft.status} onChange={(e) => setField('status', e.target.value)}>
              <option value="DRAFT">Brouillon</option>
              <option value="PUBLISHED">Publié</option>
              <option value="SUSPENDED">Suspendu</option>
              <option value="ARCHIVED">Archivé</option>
            </select>
          </Field>
          <Field label="Ordre d'affichage">
            <input style={input} type="number" value={draft.position} onChange={(e) => setField('position', Math.trunc(Number(e.target.value || 0)))} />
          </Field>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 16px', fontSize: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={draft.highlighted} onChange={(e) => setField('highlighted', e.target.checked)} />
          Mettre ce pack en avant (« populaire ») sur la page tarifs
        </label>

        <h3 style={{ fontSize: 15, fontWeight: 600, margin: '8px 0' }}>Limites (vide = illimité)</h3>
        <div style={row2}>
          <LimitInput label="Projets max" field="maxProjects" draft={draft} setField={setField} />
          <LimitInput label="Fichiers / projet max" field="maxFilesPerProject" draft={draft} setField={setField} />
        </div>
        <div style={row2}>
          <LimitInput label="Collaborateurs max" field="maxCollaborators" draft={draft} setField={setField} />
          <Field label="Stockage (Go, vide = illimité)">
            <input style={input} type="number" min={0} value={storageGb}
              onChange={(e) => setField('storageBytes', e.target.value === '' ? null : gbToBytes(Number(e.target.value)))} />
          </Field>
        </div>

        <h3 style={{ fontSize: 15, fontWeight: 600, margin: '16px 0 8px' }}>Fonctionnalités incluses</h3>
        {features.length === 0 ? (
          <p style={{ color: '#9ca3af', fontSize: 13 }}>Ajoutez d&apos;abord des fonctionnalités au catalogue.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
            {features.map((f) => (
              <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                <input type="checkbox" checked={enabledKeys.has(f.key)} onChange={() => toggleFeature(f.key)} />
                {f.label}
              </label>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={btnGhost}>Annuler</button>
          <button onClick={onSave} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

function LimitInput({ label, field, draft, setField }: { label: string; field: LimitField; draft: Pack; setField: (k: keyof Pack, v: any) => void; }) {
  const val = draft[field];
  return (
    <Field label={label}>
      <input style={input} type="number" min={0} value={val == null ? '' : val}
        onChange={(e) => setField(field, e.target.value === '' ? null : Math.max(0, Math.trunc(Number(e.target.value))))} />
    </Field>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <span style={{ display: 'block', fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  );
}

const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: '#111827', border: '1px solid #374151', color: '#e5e7eb', borderRadius: 8, padding: '9px 11px', fontSize: 14, outline: 'none' };
const row2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };
const cardStyle: React.CSSProperties = { background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: 16 };
const badge: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#fff', padding: '2px 8px', borderRadius: 999 };
const btnPrimary: React.CSSProperties = { background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer' };
const btnGhost: React.CSSProperties = { background: '#1f2937', color: '#e5e7eb', border: '1px solid #374151', borderRadius: 8, padding: '8px 14px', fontSize: 14, cursor: 'pointer' };
const btnDanger: React.CSSProperties = { background: 'transparent', color: '#f87171', border: '1px solid #7f1d1d', borderRadius: 8, padding: '8px 14px', fontSize: 14, cursor: 'pointer' };
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto', zIndex: 50 };
const modal: React.CSSProperties = { background: '#0b0d14', border: '1px solid #1f2937', borderRadius: 16, padding: 24, width: '100%', maxWidth: 620 };
