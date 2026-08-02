import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError, apiSuccess } from '@/lib/auth';
import { requireAdmin, isResponse } from '@/lib/adminAuth';

// Module PACKS §4 — catalogue de fonctionnalités géré par l'administrateur.
// Chaque fonctionnalité (clé unique) peut ensuite être activée/désactivée par pack.

function slugKey(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50);
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (isResponse(admin)) return admin;
  try {
    const features = await prisma.planFeature.findMany({ orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] });
    return apiSuccess({ features });
  } catch (e) {
    return apiError(e instanceof Error ? e.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (isResponse(admin)) return admin;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any = await req.json();
    const label = String(body?.label ?? '').trim();
    if (!label) return apiError('Le libellé est requis', 'VALIDATION_ERROR', 400);
    const key = body?.key ? slugKey(String(body.key)) : slugKey(label);
    if (!key) return apiError('Clé invalide', 'VALIDATION_ERROR', 400);
    const existing = await prisma.planFeature.findUnique({ where: { key } });
    if (existing) return apiError('Une fonctionnalité avec cette clé existe déjà', 'CONFLICT', 409);
    const feature = await prisma.planFeature.create({
      data: {
        key, label,
        description: body?.description ? String(body.description) : null,
        category: body?.category ? String(body.category) : null,
        position: Number.isFinite(Number(body?.position)) ? Math.trunc(Number(body.position)) : 0,
      },
    });
    return apiSuccess({ feature }, 201);
  } catch (e) {
    return apiError(e instanceof Error ? e.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
