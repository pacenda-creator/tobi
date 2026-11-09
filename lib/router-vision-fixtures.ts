import { routerVisionResultSchema, type RouterVisionResult } from "./router-diagnostics.ts";

const VODAFONE_STATION_WIFI6_ONLINE_SHA256 = "C52F6D0BEC0C68700D79E6AD412F7E4489736C92C0D1E4AEFE894EBB545C51EF";

const vodafoneStationWifi6OnlineResult = routerVisionResultSchema.parse({
  schemaVersion: "1",
  routerModelId: "vodafone-station-wifi6",
  observations: [
    { indicator: "power", state: "solid" },
    { indicator: "internet", state: "solid" },
    { indicator: "wifi", state: "solid" },
  ],
  confidence: 0.99,
  imageQuality: "readable",
  unknownReason: null,
});

function toUpperHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

export async function resolveRouterVisionFixture(bytes: Uint8Array): Promise<RouterVisionResult | null> {
  if (process.env.TOBI_ROUTER_VISION_FIXTURES_ENABLED !== "true") return null;
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  if (toUpperHex(new Uint8Array(digest)) !== VODAFONE_STATION_WIFI6_ONLINE_SHA256) return null;
  return structuredClone(vodafoneStationWifi6OnlineResult);
}
