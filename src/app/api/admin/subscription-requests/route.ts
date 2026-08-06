import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError, apiSuccess } from '@/lib/auth';
import { requireAdmin, isResponse } from '@/lib/adminAuth';

// Module PACKS — Console admin : file des demandes d'abonnement à valider.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (isResponse(admin)) return admin;
  try {
    const { searchParams } = new URL(req.url);
    const status = (searchParams.get('status') ?? '').trim().toUpperCase();
    const where = ['PENDING', 'APPROVED', 'REJECTED'].includes(status) ? { status } : {};
    const requests = await prisma.subscriptionRequest.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 300,
    });
    const orgIds = [...new Set(requests.map((r) => r.organizationId))];
    const packIds = [...new Set(requests.map((r) => r.packId).filter(Boolean) as string[])];
    const [orgs, packs] = await Promise.all([
      orgIds.length
        ? prisma.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true, plan: true, planExpiresAt: true, owner: { select: { email: true } } } })
        : Promise.resolve([]),
      packIds.length
        ? prisma.pack.findMany({ where: { id: { in: packIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
    ]);
    const orgMap = Object.fromEntries(orgs.map((o) => [o.id, o]));
    const packMap = Object.fromEntries(packs.map((p) => [p.id, p]));
    const data = requests.map((r) => ({
      ...r,
      organization: orgMap[r.organizationId] ?? null,
      pack: r.packId ? packMap[r.packId] ?? null : null,
    }));
    return apiSuccess({ requests: data });
  } catch (e) {
    return apiError(e instanceof Error ? e.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
