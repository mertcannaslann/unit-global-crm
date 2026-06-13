import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { initialData } from "@/lib/demo-data";
import { prisma } from "@/lib/prisma";
import {
  appendAuditLogs,
  createAuditLogEntry,
  ForbiddenError,
  mergeAuthorizedCrmState,
  normalizeCrmDataForSecurity,
  resolveActor,
  visibleDataForActor,
} from "@/lib/security";
import type { CrmData } from "@/lib/types";

const CRM_STATE_ID = "primary";

function stateStats(data: CrmData) {
  return {
    clients: data.clients.length,
    users: data.users.length,
    properties: data.properties.length,
    leads: data.leads.length,
    tasks: data.tasks.length,
    auditLogs: data.auditLogs.length,
  };
}

function logCrmState(event: string, fields: Record<string, unknown>) {
  console.info(`[crm-state] ${event}`, fields);
}

async function readFullState() {
  const state = await prisma.crmState.findUnique({ where: { id: CRM_STATE_ID } });
  return normalizeCrmDataForSecurity(state?.data as Partial<CrmData> | undefined, initialData);
}

async function writeFullState(data: CrmData) {
  return prisma.crmState.upsert({
    where: { id: CRM_STATE_ID },
    create: { id: CRM_STATE_ID, data: data as unknown as Prisma.InputJsonValue },
    update: { data: data as unknown as Prisma.InputJsonValue },
  });
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    logCrmState("GET başladı", { userEmail: session.user.email });
    const fullState = await readFullState();
    const actor = resolveActor(fullState, session.user);
    if (!actor) {
      logCrmState("GET rol hatası", { userEmail: session.user.email });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const visibleState = visibleDataForActor(fullState, actor);
    logCrmState("GET okuma başarılı", {
      userId: actor.id,
      tenantId: actor.companyId ?? "platform",
      role: actor.role,
      full: stateStats(fullState),
      visible: stateStats(visibleState),
    });

    const auditedState = appendAuditLogs(fullState, [
      createAuditLogEntry(actor, "CUSTOMER_LIST_VIEW", request, 200, {
        metadata: {
          result_count: visibleState.leads.length,
          page: 1,
          limit: visibleState.leads.length,
        },
      }),
    ]);

    try {
      await writeFullState(auditedState);
      logCrmState("GET audit yazımı başarılı", { userId: actor.id, tenantId: actor.companyId ?? "platform" });
      return NextResponse.json({ data: visibleDataForActor(auditedState, actor), meta: { stats: stateStats(visibleState) } });
    } catch (auditError) {
      console.error("[crm-state] GET audit yazımı başarısız", auditError);
      return NextResponse.json({ data: visibleState, meta: { stats: stateStats(visibleState), auditWriteFailed: true } });
    }
  } catch (error) {
    console.error("[crm-state] GET database read failed", error);
    return NextResponse.json({ error: "CRM verisi database'den okunamadı." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { data?: CrmData };
  if (!body.data || !Array.isArray(body.data.users)) {
    return NextResponse.json({ error: "Invalid CRM state" }, { status: 400 });
  }

  let fullState: CrmData | undefined;
  let actor: ReturnType<typeof resolveActor> | null = null;

  try {
    logCrmState("SAVE başladı", { userEmail: session.user.email });
    fullState = await readFullState();
    actor = resolveActor(fullState, session.user);
    if (!actor) {
      logCrmState("SAVE rol hatası", { userEmail: session.user.email });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const incomingState = normalizeCrmDataForSecurity(body.data, initialData);
    logCrmState("SAVE merge başladı", {
      userId: actor.id,
      tenantId: actor.companyId ?? "platform",
      role: actor.role,
      incoming: stateStats(incomingState),
      current: stateStats(fullState),
    });

    const merged = mergeAuthorizedCrmState(fullState, incomingState, actor, request);
    const auditedData = appendAuditLogs(merged.data, merged.auditEntries);
    await writeFullState(auditedData);
    const visibleState = visibleDataForActor(auditedData, actor);
    logCrmState("SAVE database write başarılı", {
      userId: actor.id,
      tenantId: actor.companyId ?? "platform",
      role: actor.role,
      saved: stateStats(auditedData),
      visible: stateStats(visibleState),
    });
    return NextResponse.json({ ok: true, data: visibleState, meta: { stats: stateStats(visibleState) } });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      const auditEntry = (error as ForbiddenError & { auditEntry?: ReturnType<typeof createAuditLogEntry> }).auditEntry
        ?? (actor ? createAuditLogEntry(actor, "CUSTOMER_UNAUTHORIZED_ACCESS", request, 403, {
          metadata: { reason: error.message },
        }) : undefined);
      if (fullState && auditEntry) {
        await writeFullState(appendAuditLogs(fullState, [auditEntry]));
      }
      logCrmState("SAVE forbidden", { userEmail: session.user.email, reason: error.message });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    console.error("[crm-state] SAVE database write failed", error);
    return NextResponse.json({ error: "CRM verisi database'e kaydedilemedi." }, { status: 500 });
  }
}
