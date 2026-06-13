import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkRateLimit, rateLimitHeaders, rateLimitKey } from "@/lib/rate-limit";
import { getListingPreview } from "@/services/listing-providers/listing-preview";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = checkRateLimit(rateLimitKey(request, "listing-preview", session.user.email), { max: 40, windowMs: 60_000 });
  if (!limit.ok) {
    return NextResponse.json({ error: "Çok fazla ilan önizleme isteği gönderildi." }, { status: 429, headers: rateLimitHeaders(limit) });
  }

  const { searchParams } = new URL(request.url);
  const sourceUrl = searchParams.get("url") ?? "";
  const platform = searchParams.get("platform") ?? undefined;

  return NextResponse.json({
    preview: await getListingPreview(sourceUrl, platform),
  });
}
