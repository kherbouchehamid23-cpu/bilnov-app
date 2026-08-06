import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError, apiSuccess } from '@/lib/auth';
import { requireAdmin, isResponse } from '@/lib/adminAuth';
import { subscriptionState } from '@/lib/subscription';

// Module PACKS — Console admin : liste des organisations (abonnés) avec état d'abonnement.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (isResponse(admin)) return admin;
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') ?? '').trim();
    const orgs = await prisma.organization.findMany({
      where: q
        ? { OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { owner: { email: { contains: q, mode: 'insensitive' } } },
          ] }
        : undefined,
      orderBy: { createdAt: 'desc' },
      take: 300,
      select: {
        id: true, name: true, plan: true, planExpiresAt: true, packId: true, createdAt: true,
        owner: { select: { email: true, firstName: true, lastName: true } },
        _count: { select: { projects: true } },
      },
    });
    const packIds = [...new Set(orgs.map((o) => o.packId).filter(Boolean) as string[])];
    const packs = packIds.length
      ? await prisma.pack.findMany({ where: { id: { in: packIds } }, select: { id: true, name: true } })
      : [];
    const packMap: Record<string, string> = Object.fromEntries(packs.map((p) => [p.id, p.name]));
    const data = orgs.map((o) => ({
      ...o,
      packName: o.packId ? packMap[o.packId] ?? null : null,
      subscription: subscriptionState(o),
    }));
    return apiSuccess({ organizations: data });
  } catch (e) {
    return apiError(e instanceof Error ? e.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
