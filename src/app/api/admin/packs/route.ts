import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError, apiSuccess } from '@/lib/auth';
import { requireAdmin, isResponse } from '@/lib/adminAuth';

// Module PACKS §1 — CRUD administrateur des packs (liste complète + création).
// Toutes les valeurs (prix, limites, statut) sont fournies par l'admin : rien n'est codé en dur.

const STATUSES = ['DRAFT', 'PUBLISHED', 'SUSPENDED', 'ARCHIVED'] as const;

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'pack';
}

function toIntOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
function toBigIntOrNull(v: unknown): bigint | null {
  const n = toIntOrNull(v);
  return n === null ? null : BigInt(n);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizePackInput(body: any) {
  const status = STATUSES.includes(body?.status) ? body.status : 'DRAFT';
  return {
    name: String(body?.name ?? '').trim(),
    description: body?.description ? String(body.description) : null,
    monthlyPriceCents: Math.max(0, toIntOrNull(body?.monthlyPriceCents) ?? 0),
    annualPriceCents: toIntOrNull(body?.annualPriceCents),
    currency: String(body?.currency ?? 'DZD').trim().toUpperCase().slice(0, 8) || 'DZD',
    trialDays: Math.max(0, toIntOrNull(body?.trialDays) ?? 0),
    status,
    highlighted: !!body?.highlighted,
    position: toIntOrNull(body?.position) ?? 0,
    maxProjects: toIntOrNull(body?.maxProjects),
    maxFilesPerProject: toIntOrNull(body?.maxFilesPerProject),
    maxCollaborators: toIntOrNull(body?.maxCollaborators),
    storageBytes: toBigIntOrNull(body?.storageBytes),
  };
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (isResponse(admin)) return admin;
  try {
    const packs = await prisma.pack.findMany({
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      include: { features: true },
    });
    return apiSuccess({ packs });
  } catch (e) {
    return apiError(e instanceof Error ? e.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (isResponse(admin)) return admin;
  try {
    const body = await req.json();
    const data = sanitizePackInput(body);
    if (!data.name) return apiError('Le nom du pack est requis', 'VALIDATION_ERROR', 400);

    // Slug unique dérivé du nom (suffixe numérique en cas de collision).
    const base = body?.slug ? slugify(String(body.slug)) : slugify(data.name);
    let slug = base;
    for (let i = 2; await prisma.pack.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;

    const pack = await prisma.pack.create({ data: { ...data, slug } });
    return apiSuccess({ pack }, 201);
  } catch (e) {
    return apiError(e instanceof Error ? e.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
