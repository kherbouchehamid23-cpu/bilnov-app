import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, apiError, apiSuccess } from '@/lib/auth';

// Recursively build tree from flat list
interface NodeWithChildren {
  id: string;
  name: string;
  nodeType: string;
  position: number;
  parentId: string | null;
  projectId: string;
  createdAt: Date;
  updatedAt: Date;
  _count: { files: number; tours: number };
  children: NodeWithChildren[];
}

function buildTree(nodes: Omit<NodeWithChildren, 'children'>[]): NodeWithChildren[] {
  const map = new Map<string, NodeWithChildren>();
  const roots: NodeWithChildren[] = [];

  for (const node of nodes) {
    map.set(node.id, { ...node, children: [] });
  }

  for (const node of nodes) {
    const mapped = map.get(node.id);
    if (!mapped) continue;
    if (node.parentId && map.has(node.parentId)) {
      const parent = map.get(node.parentId);
      if (parent) parent.children.push(mapped);
    } else {
      roots.push(mapped);
    }
  }

  return roots;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const flat = await prisma.projectStructureNode.findMany({
      where: { projectId: params.id },
      include: { _count: { select: { files: true, tours: true } } },
      orderBy: { position: 'asc' },
    });

    const nodes = buildTree(flat);
    return apiSuccess({ nodes });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : 'Erreur',
      'INTERNAL_ERROR',
      500
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError('Non authentifié', 'UNAUTHORIZED', 401);

    const body = await req.json() as {
      name?: string;
      nodeType?: string;
      parentId?: string | null;
    };

    const { name, nodeType, parentId } = body;

    if (!name) return apiError('Nom requis', 'VALIDATION_ERROR', 400);

    const count = await prisma.projectStructureNode.count({
      where: { projectId: params.id, parentId: parentId ?? null },
    });

    const node = await prisma.projectStructureNode.create({
      data: {
        projectId: params.id,
        name,
        nodeType: nodeType ?? 'custom',
        parentId: parentId ?? null,
        position: count,
      },
      include: { _count: { select: { files: true, tours: true } } },
    });

    return apiSuccess({ ...node, children: [] }, 201);
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : 'Erreur',
      'INTERNAL_ERROR',
      500
    );
  }
}
