import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Actor } from "@/lib/security";
import type { AuditLogEntry } from "@/lib/types";

export async function persistAuditEntries(entries: AuditLogEntry[]) {
  if (!entries.length) return;

  try {
    await prisma.auditLog.createMany({
      data: entries.map((entry) => ({
        id: entry.id,
        companyId: entry.companyId,
        userId: entry.userId,
        userRole: entry.userRole,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        targetCustomerId: entry.targetCustomerId,
        metadata: entry.metadata as Prisma.InputJsonValue | undefined,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        requestPath: entry.requestPath,
        requestMethod: entry.requestMethod,
        statusCode: entry.statusCode,
        createdAt: new Date(entry.createdAt),
      })),
      skipDuplicates: true,
    });
  } catch (error) {
    console.error("[audit] database write failed", error);
  }
}

export async function readAuditEntriesForActor(actor: Actor): Promise<AuditLogEntry[]> {
  try {
    const rows = await prisma.auditLog.findMany({
      where: actor.role === "ADMIN" ? undefined : { companyId: actor.companyId },
      orderBy: { createdAt: "desc" },
      take: 1000,
    });

    return rows.map((row) => ({
      id: row.id,
      companyId: row.companyId ?? undefined,
      userId: row.userId,
      userRole: row.userRole,
      action: row.action as AuditLogEntry["action"],
      entityType: row.entityType,
      entityId: row.entityId ?? undefined,
      targetCustomerId: row.targetCustomerId ?? undefined,
      metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata as Record<string, unknown> : undefined,
      ipAddress: row.ipAddress ?? undefined,
      userAgent: row.userAgent ?? undefined,
      requestPath: row.requestPath ?? undefined,
      requestMethod: row.requestMethod ?? undefined,
      statusCode: row.statusCode,
      createdAt: row.createdAt.toISOString(),
    }));
  } catch (error) {
    console.error("[audit] database read failed", error);
    return [];
  }
}
