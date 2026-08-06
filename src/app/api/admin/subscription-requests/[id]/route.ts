import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError, apiSuccess } from '@/lib/auth';
import { requireAdmin, isResponse } from '@/lib/adminAuth';
import { subscriptionState } from '@/lib/subscription';

// Module PACKS — Console admin : validation d'une demande d'abonnement.
// APPROVE applique le pack à l'organisation et prolonge l'échéance ; REJECT clôt la demande.
const PLANS = ['TRIAL', 'STARTER', 'PRO', 'ENTERPRISE'] as const;

function addMonths(base: Date, months: number): Date {
  const d = new Date(base.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(req);
  if (isResponse(admin)) return admin;
  try {
    const reqRow = await prisma.subscriptionRequest.findUnique({ where: { id: params.id } });
    if (!reqRow) return apiError('Demande introuvable', 'NOT_FOUND', 404);
    if (reqRow.status !== 'PENDING') return apiError('Cette demande a déjà été traitée.', 'CONFLICT', 409);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? '').toUpperCase();
    const note = body?.note ? String(body.note).slice(0, 1000) : null;

    if (action === 'REJECT') {
      const updated = await prisma.subscriptionRequest.update({
        where: { id: reqRow.id },
        data: { status: 'REJECTED', decidedAt: new Date(), decidedBy: admin.sub, note },
      });
      return apiSuccess({ request: updated });
    }

    if (action !== 'APPROVE') return apiError('Action invalide (APPROVE ou REJECT).', 'VALIDATION_ERROR', 400);

    const org = await prisma.organization.findUnique({
      where: { id: reqRow.organizationId },
      select: { id: true, plan: true, planExpiresAt: true, packId: true },
    });
    if (!org) return apiError('Organisation introuvable', 'NOT_FOUND', 404);

    const months = typeof body?.months === 'number' && body.months > 0
      ? Math.trunc(body.months)
      : (reqRow.billingPeriod === 'ANNUAL' ? 12 : 1);
    const plan = typeof body?.plan === 'string' && PLANS.includes(body.plan)
      ? body.plan
      : (org.plan === 'TRIAL' ? 'PRO' : org.plan);

    const now = new Date();
    const cur = org.planExpiresAt ? new Date(org.planExpiresAt) : null;
    const base = cur && cur > now ? cur : now;
    const newExp = addMonths(base, months);

    const [updatedOrg, updatedReq] = await prisma.$transaction([
      prisma.organization.update({
        where: { id: org.id },
        data: { plan, planExpiresAt: newExp, packId: reqRow.packId ?? org.packId },
        select: { id: true, name: true, plan: true, planExpiresAt: true, packId: true },
      }),
      prisma.subscriptionRequest.update({
        where: { id: reqRow.id },
        data: { status: 'APPROVED', decidedAt: now, decidedBy: admin.sub, note },
      }),
    ]);
    return apiSuccess({ request: updatedReq, organization: { ...updatedOrg, subscription: subscriptionState(updatedOrg) } });
  } catch (e) {
    return apiError(e instanceof Error ? e.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
