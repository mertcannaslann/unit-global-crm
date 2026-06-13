import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { initialData } from "@/lib/demo-data";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, rateLimitHeaders, rateLimitKey } from "@/lib/rate-limit";
import { normalizeCrmDataForSecurity, resolveActor, userIdsForCompany } from "@/lib/security";
import type { CrmData } from "@/lib/types";
import { sendCalendarInviteEmail } from "@/services/calendar-invite";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CRM_STATE_ID = "primary";

async function readFullState() {
  const state = await prisma.crmState.findUnique({ where: { id: CRM_STATE_ID } });
  return normalizeCrmDataForSecurity(state?.data as Partial<CrmData> | undefined, initialData);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = checkRateLimit(rateLimitKey(request, "calendar-invite", session.user.email), { max: 30, windowMs: 60_000 });
  if (!limit.ok) {
    return NextResponse.json({ error: "Çok fazla davet gönderimi denendi." }, { status: 429, headers: rateLimitHeaders(limit) });
  }

  const body = await request.json() as {
    task?: {
      id: string;
      title: string;
      description?: string;
      dueDate: string;
      endDate?: string;
      location?: string;
      reminderMinutes?: number;
      assignedToId?: string;
    };
    attendeeEmail?: string;
    attendeeName?: string;
  };

  const fullState = await readFullState();
  const actor = resolveActor(fullState, session.user);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const attendeeEmail = body.attendeeEmail?.trim().toLowerCase();
  const attendeeUser = fullState.users.find((user) => {
    const sameEmail = user.email.toLowerCase() === attendeeEmail || user.calendarEmail?.toLowerCase() === attendeeEmail;
    return sameEmail || (body.task?.assignedToId ? user.id === body.task.assignedToId : false);
  });

  if (!body.task?.title || !body.task.dueDate || !attendeeEmail || !emailPattern.test(attendeeEmail)) {
    return NextResponse.json({ error: "Davet için görev ve danışman e-postası gerekli." }, { status: 400 });
  }

  if (!attendeeUser) {
    return NextResponse.json({ error: "Danışman kullanıcı bulunamadı." }, { status: 403 });
  }

  if (actor.role !== "ADMIN") {
    const companyUserIds = userIdsForCompany(fullState, actor.companyId);
    if (!companyUserIds.has(attendeeUser.id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (actor.role === "CONSULTANT" && attendeeUser.id !== actor.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const client = fullState.clients.find((item) => item.id === attendeeUser.clientId || item.id === actor.companyId);
  const organizerEmail = client?.inviteFromEmail?.trim().toLowerCase() || session.user.email;
  if (!organizerEmail || !emailPattern.test(organizerEmail)) {
    return NextResponse.json({ error: "Davet gönderen e-postası geçerli değil." }, { status: 400 });
  }

  const result = await sendCalendarInviteEmail({
    task: body.task,
    attendeeEmail,
    attendeeName: attendeeUser.name || body.attendeeName,
    companyName: client?.name || "Unit CRM",
    organizerEmail,
    companyLogoUrl: client?.logoUrl,
  });

  if (!result.sent) {
    return NextResponse.json(result, { status: 503 });
  }

  return NextResponse.json(result);
}
