import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { emptyCrmData } from "@/lib/empty-crm-data";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, rateLimitHeaders, rateLimitKey } from "@/lib/rate-limit";
import { normalizeCrmDataForSecurity, resolveActor, userIdsForCompany } from "@/lib/security";
import type { CrmData, Task } from "@/lib/types";
import { sendCalendarInviteEmail } from "@/services/calendar-invite";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CRM_STATE_ID = "primary";

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

function publicLogoUrl(logoUrl: string | undefined, request: Request) {
  if (!logoUrl) return undefined;
  if (logoUrl.startsWith("data:")) return new URL("/api/client-logo/unit-global", request.url).toString();
  if (logoUrl.startsWith("/")) return new URL(logoUrl, request.url).toString();
  if (logoUrl.startsWith("http://") || logoUrl.startsWith("https://")) return logoUrl;
  return undefined;
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
    task?: Partial<Task> & {
      id?: string;
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

  const taskId = body.task.id || `task-${Date.now()}`;

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

  const persistedTask: Task = {
    id: taskId,
    title: body.task.title,
    description: body.task.description ?? "Görevler sayfasından oluşturuldu.",
    type: body.task.type ?? "RANDEVU",
    dueDate: body.task.dueDate,
    endDate: body.task.endDate,
    location: body.task.location ?? "",
    reminderMinutes: body.task.reminderMinutes ?? 30,
    priority: body.task.priority ?? "ORTA",
    status: body.task.status ?? "ACIK",
    assignedToId: attendeeUser.id,
    createdById: actor.id,
    leadId: body.task.leadId,
    propertyId: body.task.propertyId,
    calendarInviteStatus: "Davet gönderiliyor",
    googleCalendarResponseStatus: "needsAction",
  };

  const stateWithTask: CrmData = {
    ...fullState,
    tasks: fullState.tasks.some((task) => task.id === taskId)
      ? fullState.tasks.map((task) => (task.id === taskId ? { ...task, ...persistedTask } : task))
      : [persistedTask, ...fullState.tasks],
  };
  await writeFullState(stateWithTask);

  const result = await sendCalendarInviteEmail({
    task: { ...persistedTask, id: taskId },
    attendeeEmail,
    attendeeName: attendeeUser.name || body.attendeeName,
    companyName: client?.name || "Estafy CRM",
    organizerEmail,
    companyLogoUrl: publicLogoUrl(client?.logoUrl, request),
  });

  if (!result.sent) {
    console.error("[calendar-invite] send failed", {
      taskId,
      attendeeEmail,
      actorId: actor.id,
      companyId: actor.companyId,
      error: result.error,
    });
    await writeFullState({
      ...stateWithTask,
      tasks: stateWithTask.tasks.map((task) => (task.id === taskId ? { ...task, calendarInviteStatus: "Davet gönderilemedi" } : task)),
    });
    return NextResponse.json(result, { status: 503 });
  }

  await writeFullState({
    ...stateWithTask,
    tasks: stateWithTask.tasks.map((task) => (task.id === taskId ? { ...task, calendarInviteStatus: "Davet gönderildi" } : task)),
  });

  return NextResponse.json({ ...result, taskId });
}
