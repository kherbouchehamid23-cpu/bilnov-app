'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import {
  STATUS_META, PRIORITY_META, COMMENT_TYPES, nextStatuses, requiresPrivilege,
  type CommentStatus, type CommentPriority,
} from '@/lib/commentWorkflow';
import { extractMentions } from '@/lib/mentions';
import { navigationTarget } from '@/lib/locations';
import { computeStats, filterComments, kanbanColumns, isOverdue, type UIComment } from '@/lib/commentClient';

interface Person { id: string; firstName: string; lastName: string }
interface Msg { id: string; body: string; createdAt: string; editedAt: string | null; author: Person }
interface Assignee { id: string; userId: string | null; companyId: string | null; responsibility: string }
interface Loc { id: string; locationType: string; title: string | null; resourceId: string | null; metadata?: Record<string, unknown> | null }
interface Att { id: string; filename: string; mimeType: string; url?: string }
interface PageComment extends UIComment {
  createdBy: Person;
  assignees: Assignee[];
  messages: Msg[];
  locations: Loc[];
}

const TYPE_LABEL: Record<string, string> = {
  GENERAL: 'Général', OBSERVATION: 'Observation', TECHNICAL: 'Remarque technique', QUESTION: 'Question',
  INFO_REQUEST: 'Demande d’info', INSTRUCTION: 'Instruction', DECISION: 'Décision', TASK: 'Tâche',
  RESERVE: 'Réserve', NON_CONFORMITY: 'Non-conformité', BLOCKER: 'Blocage', RISK: 'Risque',
  VALIDATION_REQUEST: 'Validation demandée', COORDINATION: 'Coordination', QUALITY: 'Qualité',
  SAFETY: 'Sécurité', COST: 'Coût', DELAY: 'Délai',
};
const RESP_LABEL: Record<string, string> = { RESPONSIBLE: 'Responsable', APPROVER: 'Approbateur', CONSULTED: 'Consulté', INFORMED: 'Informé' };

function authHeader(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('bilnov_token') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export default function CommentsPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [comments, setComments] = useState<PageComment[]>([]);
  const [members, setMembers] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<'list' | 'kanban'>('list');
  const [fStatus, setFStatus] = useState('');
  const [fPriority, setFPriority] = useState('');
  const [fType, setFType] = useState('');
  const [fq, setFq] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [atts, setAtts] = useState<Att[]>([]);
  const [newAssignee, setNewAssignee] = useState('');
  const [editMsgId, setEditMsgId] = useState<string | null>(null);
  const [editMsgBody, setEditMsgBody] = useState('');
  const [locType, setLocType] = useState('DWG');
  const [locRes, setLocRes] = useState('');
  const [locTitle, setLocTitle] = useState('');

  const [cType, setCType] = useState('OBSERVATION');
  const [cTitle, setCTitle] = useState('');
  const [cDesc, setCDesc] = useState('');
  const [cPriority, setCPriority] = useState<CommentPriority>('NORMAL');
  const [cDue, setCDue] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true); setError('');
      const r = await api.get<{ data: { comments: PageComment[] } }>(`/api/projects/${projectId}/comments`);
      setComments(r.data.comments ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); }
    finally { setLoading(false); }
  }, [projectId]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get<{ data: { members: { user: Person }[] } }>(`/api/projects/${projectId}/members`);
        setMembers((r.data.members ?? []).map((m) => m.user));
      } catch { /* pas d'accès à la liste : pas de sélecteur */ }
    })();
  }, [projectId]);

  const loadAtts = useCallback(async (cid: string) => {
    try {
      const r = await api.get<{ data: { attachments: Att[] } }>(`/api/comments/${cid}/attachments`);
      setAtts(r.data.attachments ?? []);
    } catch { setAtts([]); }
  }, []);
  useEffect(() => { if (selectedId) void loadAtts(selectedId); else setAtts([]); }, [selectedId, loadAtts]);

  const filtered = useMemo(
    () => filterComments(comments, { status: fStatus, priority: fPriority, type: fType, q: fq }) as PageComment[],
    [comments, fStatus, fPriority, fType, fq],
  );
  const stats = useMemo(() => computeStats(comments), [comments]);
  const columns = useMemo(() => kanbanColumns(filtered), [filtered]);
  const selected = comments.find((c) => c.id === selectedId) ?? null;
  const memberName = (id: string | null) => { const m = members.find((x) => x.id === id); return m ? `${m.firstName} ${m.lastName}` : (id ?? '—'); };

  async function createComment() {
    if (!cDesc.trim()) return;
    setBusy(true);
    try {
      await api.post(`/api/projects/${projectId}/comments`, { type: cType, title: cTitle || null, description: cDesc, priority: cPriority, dueDate: cDue || null });
      setShowCreate(false); setCTitle(''); setCDesc(''); setCDue(''); setCPriority('NORMAL'); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); } finally { setBusy(false); }
  }
  async function transition(cid: string, status: CommentStatus) {
    setBusy(true);
    try { await api.post(`/api/comments/${cid}/status`, { status }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Transition refusée'); } finally { setBusy(false); }
  }
  async function convertTo(cid: string, type: string) {
    setBusy(true);
    try { await api.patch(`/api/comments/${cid}`, { type }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); } finally { setBusy(false); }
  }
  async function sendReply(cid: string) {
    if (!reply.trim()) return;
    setBusy(true);
    const handles = extractMentions(reply);
    const mentions = members.filter((m) => handles.some((h) => `${m.firstName}${m.lastName}`.toLowerCase().includes(h.toLowerCase()) || m.firstName.toLowerCase() === h.toLowerCase())).map((m) => m.id);
    try { await api.post(`/api/comments/${cid}/messages`, { body: reply, mentions }); setReply(''); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); } finally { setBusy(false); }
  }
  async function saveEditMsg(mid: string) {
    if (!editMsgBody.trim()) return;
    setBusy(true);
    try { await api.patch(`/api/comment-messages/${mid}`, { body: editMsgBody }); setEditMsgId(null); setEditMsgBody(''); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); } finally { setBusy(false); }
  }
  async function deleteMsg(mid: string) {
    setBusy(true);
    try { await api.delete(`/api/comment-messages/${mid}`); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); } finally { setBusy(false); }
  }
  async function addAssignee(cid: string) {
    if (!newAssignee) return;
    setBusy(true);
    try { await api.post(`/api/comments/${cid}/assignees`, { userId: newAssignee, responsibility: 'RESPONSIBLE' }); setNewAssignee(''); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); } finally { setBusy(false); }
  }
  async function removeAssignee(cid: string, assigneeId: string) {
    setBusy(true);
    try { await api.delete(`/api/comments/${cid}/assignees?assigneeId=${assigneeId}`); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); } finally { setBusy(false); }
  }
  async function uploadAtt(cid: string, file: File) {
    setBusy(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await fetch(`/api/comments/${cid}/attachments`, { method: 'POST', headers: authHeader(), body: fd });
      if (!res.ok) throw new Error('Upload refusé');
      await loadAtts(cid);
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); } finally { setBusy(false); }
  }
  async function deleteAtt(cid: string, attId: string) {
    setBusy(true);
    try { await api.delete(`/api/comments/${cid}/attachments?attachmentId=${attId}`); await loadAtts(cid); }
    catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); } finally { setBusy(false); }
  }
  async function exportCsv() {
    try {
      const res = await fetch(`/api/projects/${projectId}/comments/export/csv`, { headers: authHeader() });
      if (!res.ok) throw new Error('Export refusé');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob); const a = document.createElement('a');
      a.href = url; a.download = `commentaires-${projectId}.csv`; a.click(); URL.revokeObjectURL(url);
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); }
  }
  async function addLocation(cid: string) {
    if (!locRes.trim() && locType !== 'PANORAMA_360') return;
    setBusy(true);
    try { await api.post(`/api/comments/${cid}/locations`, { locationType: locType, resourceType: 'file', resourceId: locRes || null, title: locTitle || null }); setLocRes(''); setLocTitle(''); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); } finally { setBusy(false); }
  }
  async function backfillDwg() {
    setBusy(true);
    try {
      const r = await api.post<{ data: { created: number; skipped: number } }>(`/api/projects/${projectId}/comments/backfill-cad`, {});
      setError(`Import DWG : ${r.data.created} créé(s), ${r.data.skipped} déjà présent(s).`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); } finally { setBusy(false); }
  }

  const StatusChip = ({ s }: { s: CommentStatus }) => (
    <span className="rounded px-1.5 py-0.5 text-[11px] font-medium text-white" style={{ background: STATUS_META[s].color }}>{STATUS_META[s].label}</span>
  );
  const PrioDot = ({ p }: { p: CommentPriority }) => (
    <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: PRIORITY_META[p].color }}>● {PRIORITY_META[p].label}</span>
  );

  return (
    <div className="lg-app min-h-screen">
      <div className="mx-auto max-w-6xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <Link href={`/projects/${projectId}`} className="text-xs text-slate-400 hover:underline">← Projet</Link>
            <h1 className="text-xl font-bold text-slate-100">Commentaires</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => void backfillDwg()} disabled={busy} className="rounded-lg border px-3 py-2 text-sm text-slate-300 hover:bg-slate-800/70 disabled:opacity-40" title="Importer les annotations des plans DWG comme commentaires">Importer du plan</button>
            <button onClick={() => void exportCsv()} className="rounded-lg border px-3 py-2 text-sm text-slate-300 hover:bg-slate-800/70">Export CSV</button>
            <button onClick={() => setShowCreate(true)} className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700">+ Nouveau commentaire</button>
          </div>
        </div>

        <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {[
            { k: 'Total', v: stats.total, c: '#334155' }, { k: 'Ouverts', v: stats.open, c: '#EF4444' },
            { k: 'En retard', v: stats.overdue, c: '#B91C1C' }, { k: 'Critiques', v: stats.critical, c: '#7F1D1D' },
            { k: 'Résolus', v: stats.resolved, c: '#10B981' }, { k: 'Validés', v: stats.validated, c: '#3B82F6' },
          ].map((s) => (
            <div key={s.k} className="rounded-lg bg-slate-800/60 p-2 shadow-sm">
              <div className="text-lg font-bold" style={{ color: s.c }}>{s.v}</div>
              <div className="text-[11px] text-slate-400">{s.k}</div>
            </div>
          ))}
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input value={fq} onChange={(e) => setFq(e.target.value)} placeholder="Rechercher…" className="rounded border px-2 py-1 text-sm" />
          <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="rounded border px-2 py-1 text-sm">
            <option value="">Tous statuts</option>
            {(Object.keys(STATUS_META) as CommentStatus[]).map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </select>
          <select value={fPriority} onChange={(e) => setFPriority(e.target.value)} className="rounded border px-2 py-1 text-sm">
            <option value="">Toutes priorités</option>
            {(Object.keys(PRIORITY_META) as CommentPriority[]).map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
          </select>
          <select value={fType} onChange={(e) => setFType(e.target.value)} className="rounded border px-2 py-1 text-sm">
            <option value="">Tous types</option>
            {COMMENT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t] ?? t}</option>)}
          </select>
          <div className="ml-auto flex rounded-lg border bg-slate-800/60">
            <button onClick={() => setView('list')} className={`px-3 py-1 text-sm ${view === 'list' ? 'bg-violet-600 text-white' : ''}`}>Liste</button>
            <button onClick={() => setView('kanban')} className={`px-3 py-1 text-sm ${view === 'kanban' ? 'bg-violet-600 text-white' : ''}`}>Kanban</button>
          </div>
        </div>

        {error && <p className="mb-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {loading ? (<p className="text-sm text-slate-400">Chargement…</p>) : view === 'list' ? (
          <div className="overflow-hidden rounded-lg border bg-slate-800/60">
            {filtered.length === 0 && <p className="p-4 text-center text-sm text-slate-400">Aucun commentaire.</p>}
            {filtered.map((c) => (
              <button key={c.id} onClick={() => setSelectedId(c.id)} className="flex w-full items-center gap-3 border-b px-3 py-2 text-left hover:bg-slate-900/50">
                <span className="w-8 shrink-0 text-xs font-bold text-slate-400">#{c.number}</span>
                <span className="flex-1 truncate text-sm text-slate-100">{c.title || c.description}</span>
                {isOverdue(c) && <span className="text-[11px] font-semibold text-red-600">retard</span>}
                <span className="hidden text-[11px] text-slate-400 sm:inline">{TYPE_LABEL[c.type] ?? c.type}</span>
                <PrioDot p={c.priority} />
                <StatusChip s={c.status} />
              </button>
            ))}
          </div>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-2">
            {columns.map((col) => (
              <div key={col.status} className="w-56 shrink-0 rounded-lg bg-slate-800/70 p-2">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
                  <span className="h-2 w-2 rounded-full" style={{ background: col.color }} /> {col.label} <span className="text-slate-400">({col.items.length})</span>
                </div>
                <div className="space-y-1.5">
                  {col.items.map((c) => (
                    <button key={c.id} onClick={() => setSelectedId(c.id)} className="w-full rounded-md bg-slate-800/60 p-2 text-left shadow-sm hover:ring-2 hover:ring-violet-200">
                      <div className="text-[11px] text-slate-400">#{c.number}</div>
                      <div className="truncate text-xs font-medium text-slate-100">{c.title || c.description}</div>
                      <div className="mt-1"><PrioDot p={c.priority} /></div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-y-0 right-0 z-40 w-full max-w-md overflow-y-auto border-l bg-slate-800/60 shadow-xl">
          <div className="flex items-center justify-between border-b p-3">
            <div className="flex items-center gap-2"><span className="text-xs font-bold text-slate-400">#{selected.number}</span><StatusChip s={selected.status} /></div>
            <button onClick={() => setSelectedId(null)} className="text-slate-400 hover:text-slate-200">✕</button>
          </div>
          <div className="p-3">
            <h2 className="text-sm font-semibold text-slate-100">{selected.title || 'Commentaire'}</h2>
            <p className="mt-1 whitespace-pre-wrap text-xs text-slate-300">{selected.description}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded bg-slate-800/70 px-1.5 py-0.5 text-[11px] text-slate-300">{TYPE_LABEL[selected.type] ?? selected.type}</span>
              <PrioDot p={selected.priority} />
              {selected.dueDate && <span className="text-[11px] text-slate-400">échéance {new Date(selected.dueDate).toLocaleDateString('fr-FR')}</span>}
            </div>

            <div className="mt-3">
              <p className="mb-1 text-[10px] uppercase text-slate-400">Faire évoluer</p>
              <div className="flex flex-wrap gap-1.5">
                {nextStatuses(selected.status).map((to) => (
                  <button key={to} disabled={busy} onClick={() => void transition(selected.id, to)} className="rounded border px-2 py-1 text-[11px] font-medium hover:bg-slate-900/50 disabled:opacity-40" style={{ borderColor: STATUS_META[to].color, color: STATUS_META[to].color }} title={requiresPrivilege(to) ? 'Réservé à un rôle habilité' : undefined}>→ {STATUS_META[to].label}{requiresPrivilege(to) ? ' 🔒' : ''}</button>
                ))}
                {nextStatuses(selected.status).length === 0 && <span className="text-[11px] text-slate-400">Statut terminal.</span>}
              </div>
            </div>

            <div className="mt-3">
              <p className="mb-1 text-[10px] uppercase text-slate-400">Convertir</p>
              <div className="flex flex-wrap gap-1.5">
                {selected.type !== 'RESERVE' && <button disabled={busy} onClick={() => void convertTo(selected.id, 'RESERVE')} className="rounded border border-amber-500 px-2 py-1 text-[11px] font-medium text-amber-600 hover:bg-amber-50 disabled:opacity-40">En réserve</button>}
                {selected.type !== 'NON_CONFORMITY' && <button disabled={busy} onClick={() => void convertTo(selected.id, 'NON_CONFORMITY')} className="rounded border border-red-500 px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-40">En non-conformité</button>}
              </div>
            </div>

            <div className="mt-3">
              <p className="mb-1 text-[10px] uppercase text-slate-400">Affectations</p>
              <div className="flex flex-wrap gap-1.5">
                {selected.assignees.map((a) => (
                  <span key={a.id} className="inline-flex items-center gap-1 rounded bg-slate-800/70 px-1.5 py-0.5 text-[11px] text-slate-200">
                    {memberName(a.userId)} <span className="text-slate-400">· {RESP_LABEL[a.responsibility] ?? a.responsibility}</span>
                    <button onClick={() => void removeAssignee(selected.id, a.id)} className="ml-0.5 text-slate-400 hover:text-red-600">✕</button>
                  </span>
                ))}
                {selected.assignees.length === 0 && <span className="text-[11px] text-slate-400">Aucune.</span>}
              </div>
              {members.length > 0 && (
                <div className="mt-1.5 flex gap-1.5">
                  <select value={newAssignee} onChange={(e) => setNewAssignee(e.target.value)} className="flex-1 rounded border px-2 py-1 text-xs">
                    <option value="">Ajouter un intervenant…</option>
                    {members.map((m) => <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>)}
                  </select>
                  <button disabled={busy || !newAssignee} onClick={() => void addAssignee(selected.id)} className="rounded bg-slate-700 px-2 py-1 text-xs text-white disabled:opacity-40">+</button>
                </div>
              )}
            </div>

            <div className="mt-3">
              <p className="mb-1 text-[10px] uppercase text-slate-400">Localisations ({selected.locations.length})</p>
              <div className="space-y-1">
                {selected.locations.map((l) => { const t = navigationTarget(projectId, l); return (
                  <div key={l.id} className="flex items-center gap-2 text-[11px]">
                    <span className="rounded bg-violet-50 px-1.5 py-0.5 text-violet-700">{l.title || l.locationType}</span>
                    {t.href ? <Link href={t.href} className="text-violet-600 hover:underline">{t.label} →</Link> : <span className="text-slate-400">{t.label}</span>}
                  </div>
                ); })}
                {selected.locations.length === 0 && <span className="text-[11px] text-slate-400">Aucune.</span>}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <select value={locType} onChange={(e) => setLocType(e.target.value)} className="rounded border px-1.5 py-1 text-xs">
                  <option value="DWG">Plan DWG</option><option value="PDF">PDF</option><option value="PANORAMA_360">Visite 360°</option><option value="PHOTO">Photo</option><option value="BIM_IFC">Objet IFC</option>
                </select>
                <input value={locRes} onChange={(e) => setLocRes(e.target.value)} placeholder="ID ressource (fichier)" className="w-36 rounded border px-1.5 py-1 text-xs" />
                <input value={locTitle} onChange={(e) => setLocTitle(e.target.value)} placeholder="Libellé" className="w-28 rounded border px-1.5 py-1 text-xs" />
                <button disabled={busy} onClick={() => void addLocation(selected.id)} className="rounded bg-slate-700 px-2 py-1 text-xs text-white disabled:opacity-40">+ Localiser</button>
              </div>
            </div>

            <div className="mt-3">
              <p className="mb-1 text-[10px] uppercase text-slate-400">Pièces jointes ({atts.length})</p>
              <div className="space-y-1">
                {atts.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 text-xs">
                    <a href={a.url} target="_blank" rel="noreferrer" className="flex-1 truncate text-violet-600 hover:underline">{a.filename}</a>
                    <button onClick={() => void deleteAtt(selected.id, a.id)} className="text-slate-400 hover:text-red-600">✕</button>
                  </div>
                ))}
              </div>
              <label className="mt-1.5 inline-block cursor-pointer rounded border border-dashed px-2 py-1 text-[11px] text-slate-400 hover:bg-slate-900/50">
                + Ajouter un fichier
                <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f && selected) void uploadAtt(selected.id, f); e.target.value = ''; }} />
              </label>
            </div>

            <div className="mt-3">
              <p className="mb-1 text-[10px] uppercase text-slate-400">Discussion ({selected.messages.length})</p>
              <div className="space-y-1.5">
                {selected.messages.map((m) => (
                  <div key={m.id} className="rounded bg-slate-900/50 p-2">
                    {editMsgId === m.id ? (
                      <div className="flex gap-1.5">
                        <input value={editMsgBody} onChange={(e) => setEditMsgBody(e.target.value)} className="flex-1 rounded border px-2 py-1 text-xs" />
                        <button onClick={() => void saveEditMsg(m.id)} className="rounded bg-violet-600 px-2 text-xs text-white">OK</button>
                        <button onClick={() => { setEditMsgId(null); setEditMsgBody(''); }} className="text-xs text-slate-400">×</button>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap text-xs text-slate-200">{m.body}</p>
                    )}
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-400">
                      <span>{m.author.firstName} {m.author.lastName} · {new Date(m.createdAt).toLocaleString('fr-FR')}{m.editedAt ? ' · modifié' : ''}</span>
                      <button onClick={() => { setEditMsgId(m.id); setEditMsgBody(m.body); }} className="hover:text-slate-200">éditer</button>
                      <button onClick={() => void deleteMsg(m.id)} className="hover:text-red-600">suppr.</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-1.5">
                <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Répondre (@ pour mentionner)…" className="flex-1 rounded border px-2 py-1 text-xs" />
                <button disabled={busy || !reply.trim()} onClick={() => void sendReply(selected.id)} className="rounded bg-violet-600 px-2 py-1 text-xs text-white disabled:opacity-40">Envoyer</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-slate-800/60 p-4 shadow-xl">
            <h2 className="mb-3 text-sm font-semibold text-slate-100">Nouveau commentaire</h2>
            <div className="space-y-2">
              <select value={cType} onChange={(e) => setCType(e.target.value)} className="w-full rounded border px-2 py-1 text-sm">
                {COMMENT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t] ?? t}</option>)}
              </select>
              <input value={cTitle} onChange={(e) => setCTitle(e.target.value)} placeholder="Titre (optionnel)" className="w-full rounded border px-2 py-1 text-sm" />
              <textarea value={cDesc} onChange={(e) => setCDesc(e.target.value)} placeholder="Description *" rows={3} className="w-full rounded border px-2 py-1 text-sm" />
              <div className="flex gap-2">
                <select value={cPriority} onChange={(e) => setCPriority(e.target.value as CommentPriority)} className="flex-1 rounded border px-2 py-1 text-sm">
                  {(Object.keys(PRIORITY_META) as CommentPriority[]).map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
                </select>
                <input type="date" value={cDue} onChange={(e) => setCDue(e.target.value)} className="flex-1 rounded border px-2 py-1 text-sm" />
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button disabled={busy || !cDesc.trim()} onClick={() => void createComment()} className="flex-1 rounded bg-violet-600 py-2 text-sm font-semibold text-white disabled:opacity-40">Créer</button>
              <button onClick={() => setShowCreate(false)} className="rounded bg-slate-200 px-3 text-sm text-slate-200">Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
