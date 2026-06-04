import { prisma } from '@/lib/prisma';

// Portée de partage par arborescence + fichiers précis.
//
//  allowedNodeIds : espaces partagés ENTIERS (dynamiques : incluent les
//                   fichiers futurs). Un nœud coché inclut ses descendants.
//  allowedFileIds : fichiers précis partagés (figés à ces fichiers).
//
// Règle : un fichier est visible si son nodeId ∈ (nœuds cochés + descendants)
//         OU si son id ∈ allowedFileIds.
//  - Les deux vides/null -> accès à TOUT le projet.
//  - '__root__' dans allowedNodeIds -> inclut les fichiers à la racine.

export const ROOT_TOKEN = '__root__';

interface NodeRow { id: string; parentId: string | null; }

export interface Scope {
  all: boolean;
  nodeIds: Set<string>;
  fileIds: Set<string>;
  includeRoot: boolean;
}

export async function resolveScope(
  projectId: string,
  allowedNodeIds: string[] | null | undefined,
  allowedFileIds?: string[] | null | undefined,
): Promise<Scope> {
  const hasNodes = allowedNodeIds && allowedNodeIds.length > 0;
  const hasFiles = allowedFileIds && allowedFileIds.length > 0;

  if (!hasNodes && !hasFiles) {
    return { all: true, nodeIds: new Set(), fileIds: new Set(), includeRoot: true };
  }

  const includeRoot = !!allowedNodeIds?.includes(ROOT_TOKEN);
  const seeds = (allowedNodeIds ?? []).filter(x => x !== ROOT_TOKEN);

  const expanded = new Set<string>();
  if (seeds.length > 0) {
    const nodes: NodeRow[] = await prisma.projectStructureNode.findMany({
      where: { projectId },
      select: { id: true, parentId: true },
    });
    const childrenOf = new Map<string, string[]>();
    for (const n of nodes) {
      if (!n.parentId) continue;
      const arr = childrenOf.get(n.parentId) ?? [];
      arr.push(n.id);
      childrenOf.set(n.parentId, arr);
    }
    const queue = [...seeds];
    while (queue.length) {
      const id = queue.shift() as string;
      if (expanded.has(id)) continue;
      expanded.add(id);
      for (const c of childrenOf.get(id) ?? []) queue.push(c);
    }
  }

  return {
    all: false,
    nodeIds: expanded,
    fileIds: new Set(allowedFileIds ?? []),
    includeRoot,
  };
}

export function scopeFileWhere(scope: Scope): Record<string, unknown> {
  if (scope.all) return {};
  const or: Record<string, unknown>[] = [];
  if (scope.nodeIds.size > 0) or.push({ nodeId: { in: Array.from(scope.nodeIds) } });
  if (scope.includeRoot) or.push({ nodeId: null });
  if (scope.fileIds.size > 0) or.push({ id: { in: Array.from(scope.fileIds) } });
  if (or.length === 0) return { id: '__none__' };
  return { OR: or };
}

export function fileInScope(
  fileNodeId: string | null,
  fileId: string,
  scope: Scope,
): boolean {
  if (scope.all) return true;
  if (scope.fileIds.has(fileId)) return true;
  if (fileNodeId === null) return scope.includeRoot;
  return scope.nodeIds.has(fileNodeId);
}
