import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { googleCalendarConfigReady } from "@/services/google-calendar";

export async function GET() {
  const session = await getServerSession(authOptions);
  const userEmail = session?.user?.email;

  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connection = await prisma.googleCalendarConnection.findUnique({
    where: { userEmail },
    select: {
      userEmail: true,
      googleEmail: true,
      calendarId: true,
      expiryDate: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    connected: Boolean(connection),
    configReady: googleCalendarConfigReady(),
    userEmail,
    googleEmail: connection?.googleEmail ?? null,
    calendarId: connection?.calendarId ?? "primary",
    expiryDate: connection?.expiryDate?.toISOString() ?? null,
    updatedAt: connection?.updatedAt.toISOString() ?? null,
  });
}
