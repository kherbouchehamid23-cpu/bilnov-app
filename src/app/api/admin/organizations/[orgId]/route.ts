import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError, apiSuccess } from '@/lib/auth';
import { requireAdmin, isResponse } from '@/lib/adminAuth';
import { subscriptionState } from '@/lib/subscription';
import { Prisma } from '@prisma/client';

// Module PACKS — Console admin : gouvernance de l'abonnement d'une organisation.
// L'admin pilote la formule (plan), l'échéance (planExpiresAt), le pack assigné,
// et peut prolonger ou suspendre l'accès.
const PLANS = ['TRIAL', 'STARTER', 'PRO', 'ENTERPRISE'] as const;

function addMonths(base: Date, months: number): Date {
  const d = new Date(base.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
}

export async function PATCH(req: NextRequest, { params }: { params: { orgId: string } }) {
  const admin = await requireAdmin(req);
  if (isResponse(admin)) return admin;
  try {
    const org = await prisma.organization.findUnique({
      where: { id: params.orgId },
      select: { id: true, plan: true, planExpiresAt: true, packId: true },
    });
    if (!org) return apiError('Organisation introuvable', 'NOT_FOUND', 404);

    const body = await req.json().catch(() => ({}));
    const data: Prisma.OrganizationUpdateInput = {};

    if (typeof body?.plan === 'string' && PLANS.includes(body.plan)) data.plan = body.plan;
    if ('packId' in (body ?? {})) data.packId = body.packId ? String(body.packId) : null;

    const now = new Date();
    if (body?.action === 'suspend') {
      // Expiration immédiate au-delà de la grâce => lecture seule tout de suite.
      data.planExpiresAt = new Date(now.getTime() - 3650 * 86400000);
    } else if (typeof body?.extendMonths === 'number' && body.extendMonths !== 0) {
      const cur = org.planExpiresAt ? new Date(org.planExpiresAt) : null;
      const base = cur && cur > now ? cur : now;
      data.planExpiresAt = addMonths(base, Math.trunc(body.extendMonths));
    } else if ('planExpiresAt' in (body ?? {})) {
      data.planExpiresAt = body.planExpiresAt ? new Date(body.planExpiresAt) : null;
    }

    const updated = await prisma.organization.update({
      where: { id: org.id },
      data,
      select: { id: true, name: true, plan: true, planExpiresAt: true, packId: true },
    });
    return apiSuccess({ organization: { ...updated, subscription: subscriptionState(updated) } });
  } catch (e) {
    return apiError(e instanceof Error ? e.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
