// M1 front — helpers PURS pour la liste/Kanban/tableau de bord des commentaires.
// Aucune dépendance React/DOM → testable.
import { STATUS_META, type CommentStatus, type CommentPriority, isOpen } from './commentWorkflow';

export interface UIComment {
  id: string;
  number: number;
  type: string;
  title: string | null;
  description: string;
  status: CommentStatus;
  priority: CommentPriority;
  dueDate: string | null;
  createdAt: string;
  createdBy?: { id: string; firstName: string; lastName: string };
  assignees?: { id: string; userId: string | null }[];
  messages?: { id: string }[];
}

/** En retard = échéance dépassée ET statut encore ouvert. */
export function isOverdue(c: UIComment, now: Date = new Date()): boolean {
  if (!c.dueDate) return false;
  return new Date(c.dueDate).getTime() < now.getTime() && isOpen(c.status);
}

export interface CommentStats {
  total: number; open: number; overdue: number; critical: number;
  resolved: number; validated: number; unanswered: number; unassigned: number;
  byStatus: Record<string, number>; byPriority: Record<string, number>;
}

export function computeStats(comments: UIComment[], now: Date = new Date()): CommentStats {
  const s: CommentStats = {
    total: comments.length, open: 0, overdue: 0, critical: 0, resolved: 0, validated: 0,
    unanswered: 0, unassigned: 0, byStatus: {}, byPriority: {},
  };
  for (const c of comments) {
    s.byStatus[c.status] = (s.byStatus[c.status] ?? 0) + 1;
    s.byPriority[c.priority] = (s.byPriority[c.priority] ?? 0) + 1;
    if (isOpen(c.status)) s.open++;
    if (isOverdue(c, now)) s.overdue++;
    if (c.priority === 'CRITICAL') s.critical++;
    if (c.status === 'RESOLVED') s.resolved++;
    if (c.status === 'VALIDATED') s.validated++;
    if (!c.messages || c.messages.length === 0) s.unanswered++;
    if (!c.assignees || c.assignees.length === 0) s.unassigned++;
  }
  return s;
}

export interface CommentFilter { status?: string; priority?: string; type?: string; q?: string; overdueOnly?: boolean }

export function filterComments(comments: UIComment[], f: CommentFilter, now: Date = new Date()): UIComment[] {
  const q = (f.q ?? '').trim().toLowerCase();
  return comments.filter((c) => {
    if (f.status && c.status !== f.status) return false;
    if (f.priority && c.priority !== f.priority) return false;
    if (f.type && c.type !== f.type) return false;
    if (f.overdueOnly && !isOverdue(c, now)) return false;
    if (q) {
      const hay = `${c.number} ${c.title ?? ''} ${c.description}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export interface KanbanColumn { status: CommentStatus; label: string; color: string; items: UIComment[] }

// Colonnes Kanban dans l'ordre du cycle de vie (SFD §23).
const KANBAN_ORDER: CommentStatus[] = ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'BLOCKED', 'TO_VERIFY', 'RESOLVED', 'VALIDATED'];

export function kanbanColumns(comments: UIComment[]): KanbanColumn[] {
  return KANBAN_ORDER.map((status) => ({
    status,
    label: STATUS_META[status].label,
    color: STATUS_META[status].color,
    items: comments.filter((c) => c.status === status),
  }));
}
