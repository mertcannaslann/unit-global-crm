import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { initialData } from "@/lib/demo-data";
import { normalizeCrmDataForSecurity, resolveActor, userIdsForCompany } from "@/lib/security";
import type { CrmData } from "@/lib/types";
import { insertCalendarEvent, refreshGoogleAccessToken, type CalendarTaskPayload } from "@/services/google-calendar";

const CRM_STATE_ID = "primary";

async function usableConnection(userEmail: string) {
  const connection = await prisma.googleCalendarConnection.findUnique({ where: { userEmail } });
  if (!connection) return null;

  const expiresSoon = !connection.expiryDate || connection.expiryDate.getTime() < Date.now() + 5 * 60 * 1000;
  if (!expiresSoon) return connection;

  const refreshed = await refreshGoogleAccessToken({
    ...connection,
    refreshToken: connection.refreshToken,
  });

  return prisma.googleCalendarConnection.update({
    where: { userEmail },
    data: {
      accessToken: refreshed.access_token,
      scope: refreshed.scope ?? connection.scope,
      tokenType: refreshed.token_type ?? connection.tokenType,
      expiryDate: refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000) : connection.expiryDate,
    },
  });
}

async function readFullState() {
  const state = await prisma.crmState.findUnique({ where: { id: CRM_STATE_ID } });
  return normalizeCrmDataForSecurity(state?.data as Partial<CrmData> | undefined, initialData);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json() as {
    task?: CalendarTaskPayload & { assignedToId?: string };
    attendeeEmail?: string;
  };

  if (!body.task || !body.attendeeEmail) {
    return NextResponse.json({ error: "Task and attendeeEmail are required" }, { status: 400 });
  }

  const fullState = await readFullState();
  const actor = resolveActor(fullState, session.user);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const attendeeEmail = body.attendeeEmail.trim().toLowerCase();
  const attendeeUser = fullState.users.find((user) => {
    const sameEmail = user.email.toLowerCase() === attendeeEmail || user.calendarEmail?.toLowerCase() === attendeeEmail;
    return sameEmail || (body.task?.assignedToId ? user.id === body.task.assignedToId : false);
  });
  if (!attendeeUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

  const organizerEmail = session.user.email;
  const connection = await usableConnection(organizerEmail) ?? await usableConnection(attendeeEmail);
  if (!connection) {
    return NextResponse.json({ error: "Google Calendar bağlantısı yok", connected: false }, { status: 409 });
  }

  const event = await insertCalendarEvent(connection, body.task, attendeeEmail);

  return NextResponse.json({
    connected: true,
    eventId: event.id,
    htmlLink: event.htmlLink,
    organizerEmail: connection.userEmail,
    responseStatus: event.attendees?.find((attendee) => attendee.email === attendeeEmail)?.responseStatus ?? "needsAction",
  });
}
