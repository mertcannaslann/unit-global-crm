import { NextResponse } from "next/server";
import { getListingPreview } from "@/services/listing-providers/listing-preview";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sourceUrl = searchParams.get("url") ?? "";
  const platform = searchParams.get("platform") ?? undefined;

  return NextResponse.json({
    preview: getListingPreview(sourceUrl, platform),
  });
}
