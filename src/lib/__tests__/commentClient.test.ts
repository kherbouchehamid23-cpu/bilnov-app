import { describe, it, expect } from 'vitest';
import { isOverdue, computeStats, filterComments, kanbanColumns, type UIComment } from '../commentClient';

const now = new Date('2026-07-27T12:00:00Z');
function mk(p: Partial<UIComment>): UIComment {
  return { id: p.id ?? 'x', number: p.number ?? 1, type: p.type ?? 'GENERAL', title: p.title ?? null,
    description: p.description ?? 'desc', status: p.status ?? 'NEW', priority: p.priority ?? 'NORMAL',
    dueDate: p.dueDate ?? null, createdAt: '2026-07-01', assignees: p.assignees, messages: p.messages };
}

describe('isOverdue', () => {
  it('échéance passée + statut ouvert = en retard', () => {
    expect(isOverdue(mk({ dueDate: '2026-07-20', status: 'IN_PROGRESS' }), now)).toBe(true);
  });
  it('échéance passée mais résolu = pas en retard', () => {
    expect(isOverdue(mk({ dueDate: '2026-07-20', status: 'RESOLVED' }), now)).toBe(false);
  });
  it('sans échéance = jamais en retard', () => {
    expect(isOverdue(mk({ status: 'IN_PROGRESS' }), now)).toBe(false);
  });
});

describe('computeStats', () => {
  const list = [
    mk({ id: 'a', status: 'NEW', priority: 'CRITICAL', dueDate: '2026-07-20' }),
    mk({ id: 'b', status: 'RESOLVED', messages: [{ id: 'm' }], assignees: [{ id: 'x', userId: 'u' }] }),
    mk({ id: 'c', status: 'VALIDATED' }),
  ];
  it('agrège correctement', () => {
    const s = computeStats(list, now);
    expect(s.total).toBe(3);
    expect(s.open).toBe(1);
    expect(s.overdue).toBe(1);
    expect(s.critical).toBe(1);
    expect(s.resolved).toBe(1);
    expect(s.validated).toBe(1);
    expect(s.unanswered).toBe(2);
    expect(s.unassigned).toBe(2);
    expect(s.byStatus.NEW).toBe(1);
  });
});

describe('filterComments', () => {
  const list = [
    mk({ id: 'a', status: 'NEW', priority: 'HIGH', type: 'RESERVE', description: 'fissure mur' }),
    mk({ id: 'b', status: 'RESOLVED', priority: 'LOW', type: 'GENERAL', description: 'peinture' }),
  ];
  it('filtre par statut / priorité / type', () => {
    expect(filterComments(list, { status: 'NEW' }).map((c) => c.id)).toEqual(['a']);
    expect(filterComments(list, { priority: 'LOW' }).map((c) => c.id)).toEqual(['b']);
    expect(filterComments(list, { type: 'RESERVE' }).map((c) => c.id)).toEqual(['a']);
  });
  it('recherche plein texte', () => {
    expect(filterComments(list, { q: 'fissure' }).map((c) => c.id)).toEqual(['a']);
    expect(filterComments(list, { q: 'zzz' })).toHaveLength(0);
  });
});

describe('kanbanColumns', () => {
  it('range par colonne dans l’ordre du cycle', () => {
    const cols = kanbanColumns([mk({ id: 'a', status: 'NEW' }), mk({ id: 'b', status: 'RESOLVED' })]);
    expect(cols[0].status).toBe('NEW');
    expect(cols[0].items.map((c) => c.id)).toEqual(['a']);
    const resolved = cols.find((c) => c.status === 'RESOLVED')!;
    expect(resolved.items.map((c) => c.id)).toEqual(['b']);
  });
});
