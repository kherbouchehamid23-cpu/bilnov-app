import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError } from '@/lib/auth';
import { getProjectAccess } from '@/lib/access';

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// GET : export CSV (ouvrable dans Excel) des commentaires du projet (SFD §25).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);
    const access = await getProjectAccess(user, params.id);
    if (!access || !access.canView) return apiError('Accès refusé', 'FORBIDDEN', 403);

    const comments = await prisma.comment.findMany({
      where: { projectId: params.id, deletedAt: null },
      orderBy: { number: 'asc' },
      include: { createdBy: { select: { firstName: true, lastName: true } }, _count: { select: { messages: true, locations: true } } },
    });
    const head = ['Numero', 'Type', 'Titre', 'Description', 'Statut', 'Priorite', 'Auteur', 'Echeance', 'Cree_le', 'Reponses', 'Localisations'];
    const rows = comments.map((c) => [
      c.number, c.type, c.title ?? '', c.description, c.status, c.priority,
      `${c.createdBy.firstName} ${c.createdBy.lastName}`,
      c.dueDate ? new Date(c.dueDate).toISOString().slice(0, 10) : '',
      new Date(c.createdAt).toISOString().slice(0, 10),
      c._count.messages, c._count.locations,
    ]);
    const csv = '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(';')).join('\n');
    return new Response(csv, {
      status: 200,
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="commentaires-${params.id}.csv"` },
    });
  } catch (e) {
    return apiError(e instanceof Error ? e.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
