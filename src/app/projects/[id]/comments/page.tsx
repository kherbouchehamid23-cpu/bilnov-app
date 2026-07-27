'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import {
  STATUS_META, PRIORITY_META, COMMENT_TYPES, nextStatuses, requiresPrivilege,
  type CommentStatus, type CommentPriority,
} from '@/lib/commentWorkflow';
import { computeStats, filterComments, kanbanColumns, isOverdue, type UIComment } from '@/lib/commentClient';

interface Person { id: string; firstName: string; lastName: string }
interface Msg { id: string; body: string; createdAt: string; author: Person }
interface Assignee { id: string; userId: string | null; companyId: string | null; responsibility: string }
interface Loc { id: string; locationType: string; title: string | null }
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

export default function CommentsPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [comments, setComments] = useState<PageComment[]>([]);
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

  // Formulaire de création
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

  const filtered = useMemo(
    () => filterComments(comments, { status: fStatus, priority: fPriority, type: fType, q: fq }) as PageComment[],
    [comments, fStatus, fPriority, fType, fq],
  );
  const stats = useMemo(() => computeStats(comments), [comments]);
  const columns = useMemo(() => kanbanColumns(filtered), [filtered]);
  const selected = comments.find((c) => c.id === selectedId) ?? null;

  async function createComment() {
    if (!cDesc.trim()) return;
    setBusy(true);
    try {
      await api.post(`/api/projects/${projectId}/comments`, {
        type: cType, title: cTitle || null, description: cDesc, priority: cPriority,
        dueDate: cDue || null,
      });
      setShowCreate(false); setCTitle(''); setCDesc(''); setCDue(''); setCPriority('NORMAL');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); }
    finally { setBusy(false); }
  }

  async function transition(cid: string, status: CommentStatus) {
    setBusy(true);
    try { await api.post(`/api/comments/${cid}/status`, { status }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Transition refusée'); }
    finally { setBusy(false); }
  }

  async function sendReply(cid: string) {
    if (!reply.trim()) return;
    setBusy(true);
    try { await api.post(`/api/comments/${cid}/messages`, { body: reply }); setReply(''); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); }
    finally { setBusy(false); }
  }

  const StatusChip = ({ s }: { s: CommentStatus }) => (
    <span className="rounded px-1.5 py-0.5 text-[11px] font-medium text-white" style={{ background: STATUS_META[s].color }}>{STATUS_META[s].label}</span>
  );
  const PrioDot = ({ p }: { p: CommentPriority }) => (
    <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: PRIORITY_META[p].color }}>● {PRIORITY_META[p].label}</span>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <Link href={`/projects/${projectId}`} className="text-xs text-slate-500 hover:underline">← Projet</Link>
            <h1 className="text-xl font-bold text-slate-800">Commentaires</h1>
          </div>
          <button onClick={() => setShowCreate(true)} className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700">+ Nouveau commentaire</button>
        </div>

        {/* Tableau de bord */}
        <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {[
            { k: 'Total', v: stats.total, c: '#334155' },
            { k: 'Ouverts', v: stats.open, c: '#EF4444' },
            { k: 'En retard', v: stats.overdue, c: '#B91C1C' },
            { k: 'Critiques', v: stats.critical, c: '#7F1D1D' },
            { k: 'Résolus', v: stats.resolved, c: '#10B981' },
            { k: 'Validés', v: stats.validated, c: '#3B82F6' },
          ].map((s) => (
            <div key={s.k} className="rounded-lg bg-white p-2 shadow-sm">
              <div className="text-lg font-bold" style={{ color: s.c }}>{s.v}</div>
              <div className="text-[11px] text-slate-500">{s.k}</div>
            </div>
          ))}
        </div>

        {/* Filtres + vue */}
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
          <div className="ml-auto flex rounded-lg border bg-white">
            <button onClick={() => setView('list')} className={`px-3 py-1 text-sm ${view === 'list' ? 'bg-violet-600 text-white' : ''}`}>Liste</button>
            <button onClick={() => setView('kanban')} className={`px-3 py-1 text-sm ${view === 'kanban' ? 'bg-violet-600 text-white' : ''}`}>Kanban</button>
          </div>
        </div>

        {error && <p className="mb-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {loading ? (
          <p className="text-sm text-slate-500">Chargement…</p>
        ) : view === 'list' ? (
          <div className="overflow-hidden rounded-lg border bg-white">
            {filtered.length === 0 && <p className="p-4 text-center text-sm text-slate-400">Aucun commentaire.</p>}
            {filtered.map((c) => (
              <button key={c.id} onClick={() => setSelectedId(c.id)} className="flex w-full items-center gap-3 border-b px-3 py-2 text-left hover:bg-slate-50">
                <span className="w-8 shrink-0 text-xs font-bold text-slate-400">#{c.number}</span>
                <span className="flex-1 truncate text-sm text-slate-800">{c.title || c.description}</span>
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
              <div key={col.status} className="w-56 shrink-0 rounded-lg bg-slate-100 p-2">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
                  <span className="h-2 w-2 rounded-full" style={{ background: col.color }} /> {col.label} <span className="text-slate-400">({col.items.length})</span>
                </div>
                <div className="space-y-1.5">
                  {col.items.map((c) => (
                    <button key={c.id} onClick={() => setSelectedId(c.id)} className="w-full rounded-md bg-white p-2 text-left shadow-sm hover:ring-2 hover:ring-violet-200">
                      <div className="text-[11px] text-slate-400">#{c.number}</div>
                      <div className="truncate text-xs font-medium text-slate-800">{c.title || c.description}</div>
                      <div className="mt-1"><PrioDot p={c.priority} /></div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Volet détail */}
      {selected && (
        <div className="fixed inset-y-0 right-0 z-40 w-full max-w-md overflow-y-auto border-l bg-white shadow-xl">
          <div className="flex items-center justify-between border-b p-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400">#{selected.number}</span>
              <StatusChip s={selected.status} />
            </div>
            <button onClick={() => setSelectedId(null)} className="text-slate-400 hover:text-slate-700">✕</button>
          </div>
          <div className="p-3">
            <h2 className="text-sm font-semibold text-slate-800">{selected.title || 'Commentaire'}</h2>
            <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">{selected.description}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{TYPE_LABEL[selected.type] ?? selected.type}</span>
              <PrioDot p={selected.priority} />
              {selected.dueDate && <span className="text-[11px] text-slate-400">échéance {new Date(selected.dueDate).toLocaleDateString('fr-FR')}</span>}
            </div>

            {/* Transitions de statut */}
            <div className="mt-3">
              <p className="mb-1 text-[10px] uppercase text-slate-400">Faire évoluer</p>
              <div className="flex flex-wrap gap-1.5">
                {nextStatuses(selected.status).map((to) => (
                  <button key={to} disabled={busy} onClick={() => void transition(selected.id, to)}
                    className="rounded border px-2 py-1 text-[11px] font-medium hover:bg-slate-50 disabled:opacity-40"
                    style={{ borderColor: STATUS_META[to].color, color: STATUS_META[to].color }}
                    title={requiresPrivilege(to) ? 'Réservé à un rôle habilité' : undefined}>
                    → {STATUS_META[to].label}{requiresPrivilege(to) ? ' 🔒' : ''}
                  </button>
                ))}
                {nextStatuses(selected.status).length === 0 && <span className="text-[11px] text-slate-400">Statut terminal.</span>}
              </div>
            </div>

            {/* Localisations */}
            {selected.locations.length > 0 && (
              <div className="mt-3">
                <p className="mb-1 text-[10px] uppercase text-slate-400">Localisations</p>
                <div className="flex flex-wrap gap-1.5">
                  {selected.locations.map((l) => <span key={l.id} className="rounded bg-violet-50 px-1.5 py-0.5 text-[11px] text-violet-700">{l.title || l.locationType}</span>)}
                </div>
              </div>
            )}

            {/* Fil de discussion */}
            <div className="mt-3">
              <p className="mb-1 text-[10px] uppercase text-slate-400">Discussion ({selected.messages.length})</p>
              <div className="space-y-1.5">
                {selected.messages.map((m) => (
                  <div key={m.id} className="rounded bg-slate-50 p-2">
                    <p className="whitespace-pre-wrap text-xs text-slate-700">{m.body}</p>
                    <p className="mt-1 text-[10px] text-slate-400">{m.author.firstName} {m.author.lastName} · {new Date(m.createdAt).toLocaleString('fr-FR')}</p>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-1.5">
                <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Répondre…" className="flex-1 rounded border px-2 py-1 text-xs" />
                <button disabled={busy || !reply.trim()} onClick={() => void sendReply(selected.id)} className="rounded bg-violet-600 px-2 py-1 text-xs text-white disabled:opacity-40">Envoyer</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Création */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">Nouveau commentaire</h2>
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
              <button onClick={() => setShowCreate(false)} className="rounded bg-slate-200 px-3 text-sm text-slate-700">Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
