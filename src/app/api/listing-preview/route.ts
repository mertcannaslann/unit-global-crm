import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getListingPreview } from "@/services/listing-providers/listing-preview";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const sourceUrl = searchParams.get("url") ?? "";
  const platform = searchParams.get("platform") ?? undefined;

  return NextResponse.json({
    preview: getListingPreview(sourceUrl, platform),
  });
}
