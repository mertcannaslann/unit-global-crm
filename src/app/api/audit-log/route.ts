import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { persistAuditEntries, readAuditEntriesForActor } from "@/lib/audit-persistence";
import { emptyCrmData } from "@/lib/empty-crm-data";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, rateLimitHeaders, rateLimitKey } from "@/lib/rate-limit";
import {
  appendAuditLogs,
  assertCanAccessLead,
  createAuditLogEntry,
  ForbiddenError,
  normalizeCrmDataForSecurity,
  resolveActor,
} from "@/lib/security";
import type { AuditLogAction, CrmData } from "@/lib/types";

const CRM_STATE_ID = "primary";

const allowedActions: AuditLogAction[] = [
  "CUSTOMER_SEARCH",
  "CUSTOMER_LIST_VIEW",
  "CUSTOMER_DETAIL_VIEW",
  "CUSTOMER_CREATE",
  "CUSTOMER_UPDATE",
  "CUSTOMER_DELETE",
  "CUSTOMER_NOTE_VIEW",
  "CUSTOMER_NOTE_CREATE",
  "CUSTOMER_FILE_VIEW",
  "CUSTOMER_FILE_DOWNLOAD",
  "CUSTOMER_EXPORT",
  "CUSTOMER_CONTACT_COPY",
  "CUSTOMER_FILTER",
  "CUSTOMER_BULK_ACTION",
  "CUSTOMER_UNAUTHORIZED_ACCESS",
];

async function readFullState() {
  const state = await prisma.crmState.findUnique({ where: { id: CRM_STATE_ID } });
  return normalizeCrmDataForSecurity(state?.data as Partial<CrmData> | undefined, emptyCrmData);
}

async function writeFullState(data: CrmData) {
  return prisma.crmState.upsert({
    where: { id: CRM_STATE_ID },
    create: { id: CRM_STATE_ID, data: data as unknown as Prisma.InputJsonValue },
    update: { data: data as unknown as Prisma.InputJsonValue },
  });
}

function isAuditAction(value: unknown): value is AuditLogAction {
  return typeof value === "string" && allowedActions.includes(value as AuditLogAction);
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = checkRateLimit(rateLimitKey(request, "audit-log:get", session.user.email), { max: 80, windowMs: 60_000 });
  if (!limit.ok) {
    return NextResponse.json({ error: "Çok fazla audit isteği gönderildi." }, { status: 429, headers: rateLimitHeaders(limit) });
  }

  const fullState = await readFullState();
  const actor = resolveActor(fullState, session.user);
  if (!actor || actor.role === "CONSULTANT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  const userId = url.searchParams.get("userId");
  const customerId = url.searchParams.get("customerId");
  const ip = url.searchParams.get("ip");
  const statusCode = url.searchParams.get("statusCode");

  const dbLogs = await readAuditEntriesForActor(actor);
  const logs = dbLogs
    .filter((entry) => !action || entry.action === action)
    .filter((entry) => !userId || entry.userId === userId)
    .filter((entry) => !customerId || entry.targetCustomerId === customerId)
    .filter((entry) => !ip || entry.ipAddress === ip)
    .filter((entry) => !statusCode || String(entry.statusCode) === statusCode);

  return NextResponse.json({ logs });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = checkRateLimit(rateLimitKey(request, "audit-log:post", session.user.email), { max: 120, windowMs: 60_000 });
  if (!limit.ok) {
    return NextResponse.json({ error: "Çok fazla audit kaydı gönderildi." }, { status: 429, headers: rateLimitHeaders(limit) });
  }

  const fullState = await readFullState();
  const actor = resolveActor(fullState, session.user);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    action?: unknown;
    entityId?: string;
    entityType?: string;
    targetCustomerId?: string;
    metadata?: Record<string, unknown>;
  };

  if (!isAuditAction(body.action)) {
    return NextResponse.json({ error: "Invalid audit action" }, { status: 400 });
  }

  try {
    if (body.targetCustomerId) {
      assertCanAccessLead(actor, fullState, body.targetCustomerId, request);
    }

    const entry = createAuditLogEntry(actor, body.action, request, 200, {
      entityId: body.entityId ?? body.targetCustomerId,
      entityType: body.entityType ?? "CUSTOMER",
      targetCustomerId: body.targetCustomerId,
      metadata: body.metadata,
    });
    await persistAuditEntries([entry]);
    await writeFullState(appendAuditLogs(fullState, [entry]));
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      const auditEntry = (error as ForbiddenError & { auditEntry?: ReturnType<typeof createAuditLogEntry> }).auditEntry
        ?? createAuditLogEntry(actor, "CUSTOMER_UNAUTHORIZED_ACCESS", request, 403, {
          targetCustomerId: body.targetCustomerId,
          metadata: { reason: error.message },
        });
      await persistAuditEntries([auditEntry]);
      await writeFullState(appendAuditLogs(fullState, [auditEntry]));
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    throw error;
  }
}

export async function PUT() {
  return NextResponse.json({ error: "Audit log records are append-only" }, { status: 405 });
}

export async function DELETE() {
  return NextResponse.json({ error: "Audit log records are append-only" }, { status: 405 });
}
