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

  const fullState = await readFullState();
  const actor = resolveActor(fullState, session.user);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const visibleState = visibleDataForActor(fullState, actor);
  const auditedState = appendAuditLogs(fullState, [
    createAuditLogEntry(actor, "CUSTOMER_LIST_VIEW", request, 200, {
      metadata: {
        result_count: visibleState.leads.length,
        page: 1,
        limit: visibleState.leads.length,
      },
    }),
  ]);

  await writeFullState(auditedState);

  return NextResponse.json({ data: visibleDataForActor(auditedState, actor) });
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

  const fullState = await readFullState();
  const actor = resolveActor(fullState, session.user);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const incomingState = normalizeCrmDataForSecurity(body.data, initialData);

  try {
    const merged = mergeAuthorizedCrmState(fullState, incomingState, actor, request);
    await writeFullState(appendAuditLogs(merged.data, merged.auditEntries));
  } catch (error) {
    if (error instanceof ForbiddenError) {
      const auditEntry = (error as ForbiddenError & { auditEntry?: ReturnType<typeof createAuditLogEntry> }).auditEntry
        ?? createAuditLogEntry(actor, "CUSTOMER_UNAUTHORIZED_ACCESS", request, 403, {
          metadata: { reason: error.message },
        });
      await writeFullState(appendAuditLogs(fullState, [auditEntry]));
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    throw error;
  }

  return NextResponse.json({ ok: true });
}
