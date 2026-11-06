import { getTobiPublicConfigSnapshot } from "@/lib/tobi-config-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const snapshot = await getTobiPublicConfigSnapshot();
    const etag = `\"tobi-config-${snapshot.configVersion}\"`;
    if (request.headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": "no-store" } });
    }
    return Response.json(snapshot, { headers: { ETag: etag, "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Public TOBi config load failed", error instanceof Error ? error.message : "unknown_error");
    return Response.json({ error: "config_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
