import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError, apiSuccess } from '@/lib/auth';
import { requireAdmin, isResponse } from '@/lib/adminAuth';

// Module PACKS §1 — lecture / mise à jour / suppression d'un pack.
// La mise à jour gère aussi l'activation des fonctionnalités (§4) de façon atomique.

const STATUSES = ['DRAFT', 'PUBLISHED', 'SUSPENDED', 'ARCHIVED'] as const;

function toIntOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
function toBigIntOrNull(v: unknown): bigint | null {
  const n = toIntOrNull(v);
  return n === null ? null : BigInt(n);
}

export async function GET(req: NextRequest, { params }: { params: { packId: string } }) {
  const admin = await requireAdmin(req);
  if (isResponse(admin)) return admin;
  try {
    const pack = await prisma.pack.findUnique({ where: { id: params.packId }, include: { features: true } });
    if (!pack) return apiError('Pack introuvable', 'NOT_FOUND', 404);
    return apiSuccess({ pack });
  } catch (e) {
    return apiError(e instanceof Error ? e.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { packId: string } }) {
  const admin = await requireAdmin(req);
  if (isResponse(admin)) return admin;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any = await req.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {};
    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.description !== undefined) data.description = body.description ? String(body.description) : null;
    if (body.monthlyPriceCents !== undefined) data.monthlyPriceCents = Math.max(0, toIntOrNull(body.monthlyPriceCents) ?? 0);
    if (body.annualPriceCents !== undefined) data.annualPriceCents = toIntOrNull(body.annualPriceCents);
    if (body.currency !== undefined) data.currency = String(body.currency).trim().toUpperCase().slice(0, 8) || 'DZD';
    if (body.trialDays !== undefined) data.trialDays = Math.max(0, toIntOrNull(body.trialDays) ?? 0);
    if (body.status !== undefined && STATUSES.includes(body.status)) data.status = body.status;
    if (body.highlighted !== undefined) data.highlighted = !!body.highlighted;
    if (body.position !== undefined) data.position = toIntOrNull(body.position) ?? 0;
    if (body.maxProjects !== undefined) data.maxProjects = toIntOrNull(body.maxProjects);
    if (body.maxFilesPerProject !== undefined) data.maxFilesPerProject = toIntOrNull(body.maxFilesPerProject);
    if (body.maxCollaborators !== undefined) data.maxCollaborators = toIntOrNull(body.maxCollaborators);
    if (body.storageBytes !== undefined) data.storageBytes = toBigIntOrNull(body.storageBytes);

    // §4 — remplacement de l'ensemble des fonctionnalités activées si `features` fourni.
    // Format attendu : [{ featureKey, enabled, position }]
    const features = Array.isArray(body.features) ? body.features : null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pack = await prisma.$transaction(async (tx: any) => {
      const updated = await tx.pack.update({ where: { id: params.packId }, data });
      if (features) {
        await tx.packFeature.deleteMany({ where: { packId: params.packId } });
        for (let i = 0; i < features.length; i++) {
          const f = features[i];
          if (!f?.featureKey) continue;
          await tx.packFeature.create({
            data: {
              packId: params.packId,
              featureKey: String(f.featureKey),
              enabled: !!f.enabled,
              position: toIntOrNull(f.position) ?? i,
            },
          });
        }
      }
      return tx.pack.findUnique({ where: { id: params.packId }, include: { features: true } });
    });
    return apiSuccess({ pack });
  } catch (e) {
    return apiError(e instanceof Error ? e.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { packId: string } }) {
  const admin = await requireAdmin(req);
  if (isResponse(admin)) return admin;
  try {
    // Suppression définitive interdite si des abonnements y sont rattachés (sécurité §13).
    // Phase 1 : suppression simple (aucune souscription liée en base tant que le paiement
    // n'est pas branché). Les fonctionnalités liées partent en cascade (onDelete: Cascade).
    await prisma.pack.delete({ where: { id: params.packId } });
    return apiSuccess({ deleted: true });
  } catch (e) {
    return apiError(e instanceof Error ? e.message : 'Erreur', 'INTERNAL_ERROR', 500);
  }
}
