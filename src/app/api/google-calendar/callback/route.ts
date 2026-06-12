import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exchangeGoogleCode } from "@/services/google-calendar";

function appUrl(path: string) {
  return new URL(path, process.env.NEXTAUTH_URL ?? "http://localhost:3000");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(appUrl("/entegrasyonlar?googleCalendar=error"));
  }

  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as { userEmail?: string };
    if (!decoded.userEmail) throw new Error("Missing user email in state");

    const tokens = await exchangeGoogleCode(code);
    const expiryDate = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null;

    await prisma.googleCalendarConnection.upsert({
      where: { userEmail: decoded.userEmail },
      create: {
        userEmail: decoded.userEmail,
        googleEmail: decoded.userEmail,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        scope: tokens.scope,
        tokenType: tokens.token_type,
        expiryDate,
      },
      update: {
        googleEmail: decoded.userEmail,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        scope: tokens.scope,
        tokenType: tokens.token_type,
        expiryDate,
      },
    });

    return NextResponse.redirect(appUrl("/takvim?googleCalendar=connected"));
  } catch {
    return NextResponse.redirect(appUrl("/entegrasyonlar?googleCalendar=error"));
  }
}
