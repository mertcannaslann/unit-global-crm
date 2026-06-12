import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { listCalendarChanges, refreshGoogleAccessToken } from "@/services/google-calendar";

async function getFreshConnection(userEmail: string) {
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

export async function POST() {
  const session = await getServerSession(authOptions);
  const userEmail = session?.user?.email;

  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connection = await getFreshConnection(userEmail);
  if (!connection) {
    return NextResponse.json({ connected: false, updates: [] }, { status: 409 });
  }

  const result = await listCalendarChanges(connection);
  const updates = (result.items ?? [])
    .map((event) => {
      const crmTaskId = event.extendedProperties?.shared?.crmTaskId;
      if (!crmTaskId) return null;
      const attendee = event.attendees?.find((item) => item.email === userEmail);
      return {
        taskId: crmTaskId,
        eventId: event.id,
        htmlLink: event.htmlLink,
        responseStatus: attendee?.responseStatus ?? "needsAction",
      };
    })
    .filter(Boolean);

  if (result.nextSyncToken) {
    await prisma.googleCalendarConnection.update({
      where: { userEmail },
      data: { syncToken: result.nextSyncToken },
    });
  }

  return NextResponse.json({ connected: true, updates });
}
