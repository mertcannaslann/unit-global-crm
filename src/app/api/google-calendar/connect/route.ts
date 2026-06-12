import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { buildGoogleOAuthUrl, googleCalendarConfigReady } from "@/services/google-calendar";

function appUrl(path: string) {
  return new URL(path, process.env.NEXTAUTH_URL ?? "http://localhost:3000");
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;

  if (!email) {
    return NextResponse.redirect(appUrl("/login"));
  }

  if (!googleCalendarConfigReady()) {
    return NextResponse.redirect(appUrl("/entegrasyonlar?googleCalendar=missing_config"));
  }

  const state = Buffer.from(JSON.stringify({ userEmail: email, createdAt: Date.now() })).toString("base64url");
  return NextResponse.redirect(buildGoogleOAuthUrl(state));
}
