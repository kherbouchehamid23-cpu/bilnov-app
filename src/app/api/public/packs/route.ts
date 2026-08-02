import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

// Module PACKS §9 — API publique (sans authentification) : liste des packs PUBLIÉS,
// pour alimenter la section tarifs du site. Lecture seule, aucune donnée sensible.
//
// Robustesse : si la table n'existe pas encore (migration non appliquée) ou en cas
// d'erreur, on renvoie une liste vide plutôt que d'échouer — la page publique reste
// affichable et n'affiche simplement aucun tarif tant que la base n'est pas migrée.
export async function GET(_req: NextRequest) {
  try {
    const packs = await prisma.pack.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true, slug: true, name: true, description: true,
        monthlyPriceCents: true, annualPriceCents: true, currency: true,
        trialDays: true, highlighted: true, position: true,
        maxProjects: true, maxFilesPerProject: true, maxCollaborators: true, storageBytes: true,
        features: { where: { enabled: true }, select: { featureKey: true, position: true } },
      },
    });
    // §10 — catalogue de fonctionnalités (libellés) pour construire le comparateur.
    const features = await prisma.planFeature.findMany({
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      select: { key: true, label: true, category: true, position: true },
    });
    const json = JSON.stringify({ success: true, data: { packs, features } }, (_k, v) =>
      typeof v === 'bigint' ? Number(v) : v);
    return new Response(json, { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch {
    return Response.json({ success: true, data: { packs: [], features: [] } }, { status: 200 });
  }
}
