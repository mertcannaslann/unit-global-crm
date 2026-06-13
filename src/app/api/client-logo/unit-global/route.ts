import { UNIT_GLOBAL_LOGO_DATA_URL } from "@/lib/client-assets";

export const dynamic = "force-static";

export function GET() {
  const [meta, base64] = UNIT_GLOBAL_LOGO_DATA_URL.split(",");
  const contentType = meta.match(/^data:(.*);base64$/)?.[1] ?? "image/png";

  return new Response(Buffer.from(base64, "base64"), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
