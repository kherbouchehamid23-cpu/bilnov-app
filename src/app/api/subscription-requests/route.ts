import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';

// Module PACKS — Demandes d'abonnement côté client.
// Seul l'abonné (propriétaire de l'organisation) peut soumettre une demande de pack ;
// l'administrateur plateforme la validera ensuite (voir /api/admin/subscription-requests).

const PERIODS = ['MONTHLY', 'ANNUAL'] as const;

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const requests = await prisma.subscriptionRequest.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const packIds = [...new Set(requests.map((r) => r.packId).filter(Boolean) as string[])];
    const packs = packIds.length
      ? await prisma.pack.findMany({ where: { id: { in: packIds } }, select: { id: true, name: true, slug: true } })
      : [];
    const packMap: Record<string, { id: string; name: string; slug: string }> =
      Object.fromEntries(packs.map((p) => [p.id, p]));
    const data = requests.map((r) => ({ ...r, pack: r.packId ? packMap[r.packId] ?? null : null }));
    return apiSuccess({ requests: data });
  } catch (e) {
    return apiError(e instanceof Error ? e.message : 'Erreur serveur', 'INTERNAL_ERROR', 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { id: true, ownerId: true },
    });
    if (!org) return apiError('Organisation introuvable', 'NOT_FOUND', 404);
    if (org.ownerId !== user.sub) {
      return apiError("Seul l'abonné (propriétaire du compte) peut demander un pack.", 'FORBIDDEN', 403);
    }

    const body = await req.json().catch(() => ({}));
    const billingPeriod = PERIODS.includes(body?.billingPeriod) ? body.billingPeriod : 'MONTHLY';
    const note = body?.note ? String(body.note).slice(0, 1000) : null;
    let packId: string | null = null;
    if (body?.packId) {
      const pack = await prisma.pack.findFirst({
        where: { id: String(body.packId), status: 'PUBLISHED' },
        select: { id: true },
      });
      if (!pack) return apiError('Pack introuvable ou non disponible', 'VALIDATION_ERROR', 400);
      packId = pack.id;
    }

    const pending = await prisma.subscriptionRequest.findFirst({
      where: { organizationId: org.id, status: 'PENDING' },
      select: { id: true },
    });
    if (pending) return apiError('Une demande est déjà en attente de validation.', 'CONFLICT', 409);

    const created = await prisma.subscriptionRequest.create({
      data: { organizationId: org.id, packId, billingPeriod, status: 'PENDING', note },
    });
    return apiSuccess({ request: created }, 201);
  } catch (e) {
    return apiError(e instanceof Error ? e.message : 'Erreur serveur', 'INTERNAL_ERROR', 500);
  }
}
