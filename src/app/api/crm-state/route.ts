import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { initialData } from "@/lib/demo-data";
import { prisma } from "@/lib/prisma";
import type { CrmData } from "@/lib/types";

const CRM_STATE_ID = "primary";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state = await prisma.crmState.findUnique({ where: { id: CRM_STATE_ID } });
  if (!state) {
    return NextResponse.json({ data: initialData });
  }

  return NextResponse.json({ data: state.data as CrmData });
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

  await prisma.crmState.upsert({
    where: { id: CRM_STATE_ID },
    create: { id: CRM_STATE_ID, data: body.data },
    update: { data: body.data },
  });

  return NextResponse.json({ ok: true });
}
