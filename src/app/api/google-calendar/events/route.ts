import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { insertCalendarEvent, refreshGoogleAccessToken, type CalendarTaskPayload } from "@/services/google-calendar";

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

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json() as {
    task?: CalendarTaskPayload;
    attendeeEmail?: string;
  };

  if (!body.task || !body.attendeeEmail) {
    return NextResponse.json({ error: "Task and attendeeEmail are required" }, { status: 400 });
  }

  const connection = await usableConnection(body.attendeeEmail);
  if (!connection) {
    return NextResponse.json({ error: "Google Calendar bağlantısı yok", connected: false }, { status: 409 });
  }

  const event = await insertCalendarEvent(connection, body.task, body.attendeeEmail);

  return NextResponse.json({
    connected: true,
    eventId: event.id,
    htmlLink: event.htmlLink,
    responseStatus: event.attendees?.find((attendee) => attendee.email === body.attendeeEmail)?.responseStatus ?? "needsAction",
  });
}
