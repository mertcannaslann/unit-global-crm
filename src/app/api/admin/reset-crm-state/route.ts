import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { initialData } from "@/lib/demo-data";
import { prisma } from "@/lib/prisma";
import type { CrmData } from "@/lib/types";

const CRM_STATE_ID = "primary";
const RESET_CONFIRMATION = "temizle";

function cleanCrmData(data: CrmData): CrmData {
  return {
    ...data,
    clients: data.clients?.length ? data.clients : initialData.clients,
    users: data.users?.length ? data.users : initialData.users,
    properties: [],
    leads: [],
    leadActions: [],
    tasks: [],
    documents: [],
    notifications: [],
    comparables: [],
    marketListings: [],
    reports: [],
    priceHistory: [],
    activityLogs: [],
    setting: {
      ...data.setting,
      lastSahibindenSyncAt: undefined,
    },
  };
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const url = new URL(request.url);
  if (url.searchParams.get("confirm") !== RESET_CONFIRMATION) {
    return NextResponse.json({ error: "Reset confirmation is required" }, { status: 400 });
  }

  const state = await prisma.crmState.findUnique({ where: { id: CRM_STATE_ID } });
  const data = (state?.data as CrmData | undefined) ?? initialData;
  const before = {
    properties: data.properties.length,
    leads: data.leads.length,
    tasks: data.tasks.length,
    documents: data.documents.length,
    notifications: data.notifications.length,
  };
  const cleaned = cleanCrmData(data);

  await prisma.crmState.upsert({
    where: { id: CRM_STATE_ID },
    create: { id: CRM_STATE_ID, data: cleaned },
    update: { data: cleaned },
  });

  return NextResponse.json({
    ok: true,
    before,
    after: {
      properties: 0,
      leads: 0,
      tasks: 0,
      documents: 0,
      notifications: 0,
    },
  });
}
