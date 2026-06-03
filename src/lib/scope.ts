import { prisma } from '@/lib/prisma';

// Portée de partage par arborescence.
// allowedNodeIds = nœuds explicitement cochés au partage.
//  - vide / null  -> accès à TOUT le projet (comportement historique).
//  - rempli       -> accès aux fichiers de ces nœuds ET de tous leurs
//                    descendants (un étage coché inclut ses pièces/zones).
//
// Les fichiers à la racine (nodeId null) sont inclus uniquement si le
// pseudo-id '__root__' figure dans allowedNodeIds.

export const ROOT_TOKEN = '__root__';

interface NodeRow { id: string; parentId: string | null; }

/**
 * Étend une liste de nœuds cochés à l'ensemble { cochés + descendants }.
 * Renvoie aussi si la racine (fichiers sans nœud) est incluse.
 */
export async function resolveScope(
  projectId: string,
  allowedNodeIds: string[] | null | undefined,
): Promise<{ all: boolean; nodeIds: Set<string>; includeRoot: boolean }> {
  // Pas de restriction -> tout le projet
  if (!allowedNodeIds || allowedNodeIds.length === 0) {
    return { all: true, nodeIds: new Set(), includeRoot: true };
  }

  const includeRoot = allowedNodeIds.includes(ROOT_TOKEN);
  const seeds = allowedNodeIds.filter(x => x !== ROOT_TOKEN);

  // Charger tout l'arbre du projet (léger : id + parentId)
  const nodes: NodeRow[] = await prisma.projectStructureNode.findMany({
    where: { projectId },
    select: { id: true, parentId: true },
  });

  // index parent -> enfants
  const childrenOf = new Map<string, string[]>();
  for (const n of nodes) {
    if (!n.parentId) continue;
    const arr = childrenOf.get(n.parentId) ?? [];
    arr.push(n.id);
    childrenOf.set(n.parentId, arr);
  }

  // BFS descendance à partir des seeds
  const result = new Set<string>();
  const queue = [...seeds];
  while (queue.length) {
    const id = queue.shift() as string;
    if (result.has(id)) continue;
    result.add(id);
    for (const c of childrenOf.get(id) ?? []) queue.push(c);
  }

  return { all: false, nodeIds: result, includeRoot };
}

/**
 * Construit la clause Prisma `where` de filtrage des fichiers selon la portée.
 * À fusionner avec les autres conditions (projectId, status…).
 */
export function scopeFileWhere(scope: {
  all: boolean;
  nodeIds: Set<string>;
  includeRoot: boolean;
}): Record<string, unknown> {
  if (scope.all) return {};
  const or: Record<string, unknown>[] = [];
  if (scope.nodeIds.size > 0) or.push({ nodeId: { in: Array.from(scope.nodeIds) } });
  if (scope.includeRoot) or.push({ nodeId: null });
  // Si rien n'est sélectionné concrètement -> ne rien renvoyer
  if (or.length === 0) return { id: '__none__' };
  return { OR: or };
}

/**
 * Vrai si un fichier (par son nodeId) est dans la portée.
 */
export function fileInScope(
  fileNodeId: string | null,
  scope: { all: boolean; nodeIds: Set<string>; includeRoot: boolean },
): boolean {
  if (scope.all) return true;
  if (fileNodeId === null) return scope.includeRoot;
  return scope.nodeIds.has(fileNodeId);
}
