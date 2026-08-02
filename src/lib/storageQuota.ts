// BILNOV — Module PACKS §13 — Enforcement du quota de stockage côté serveur.
//
// La limite de l'organisation est résolue via son abonnement -> pack au moyen d'une
// requête SQL BRUTE (indépendante du client Prisma). Cela garantit la compatibilité
// AVANT comme APRÈS l'application de la migration :
//   - table/colonne absente (pré-migration)  -> l'exception est capturée -> limite null
//   - aucune souscription active liée à un pack -> limite null
// Une limite null = « aucune limite appliquée » : l'upload est autorisé. L'enforcement ne
// devient donc effectif que lorsqu'une organisation possède un abonnement actif à un pack
// dont le stockage est plafonné — aucun flux existant n'est impacté.
import { prisma } from './prisma';

/** Limite de stockage (octets) de l'organisation, ou null si illimité / indéterminé. */
export async function resolveStorageLimitBytes(organizationId: string): Promise<number | null> {
  try {
    const rows = await prisma.$queryRaw<{ storage_bytes: bigint | null }[]>`
      SELECT p.storage_bytes AS storage_bytes
      FROM subscriptions s
      JOIN packs p ON p.id = s.pack_id
      WHERE s.organization_id = ${organizationId}
        AND s.status IN ('ACTIVE', 'TRIALING')
      LIMIT 1`;
    if (!rows.length) return null;
    const v = rows[0].storage_bytes;
    return v == null ? null : Number(v);
  } catch {
    return null;
  }
}

export type QuotaResult =
  | { ok: true }
  | { ok: false; limitBytes: number; usedBytes: number };

/** Vérifie qu'un ajout de `incomingBytes` reste sous la limite. No-op si limite indéterminée. */
export async function assertStorageAllowed(
  organizationId: string,
  currentUsedBytes: number,
  incomingBytes: number,
): Promise<QuotaResult> {
  const limit = await resolveStorageLimitBytes(organizationId);
  if (limit == null) return { ok: true };
  if (currentUsedBytes + Math.max(0, incomingBytes) <= limit) return { ok: true };
  return { ok: false, limitBytes: limit, usedBytes: currentUsedBytes };
}
