import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

interface AuditEntry {
  projectId?: string | null;
  userId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
}

// Journalise une action ; ne doit JAMAIS faire echouer l'operation principale.
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        projectId: entry.projectId ?? null,
        userId: entry.userId ?? null,
        action: entry.action,
        entityType: entry.entityType ?? null,
        entityId: entry.entityId ?? null,
        ...(entry.metadata !== undefined ? { metadata: entry.metadata } : {}),
      },
    });
  } catch (e) {
    console.warn('audit log failed:', e);
  }
}
