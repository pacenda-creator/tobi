import { getKnowledgeStats } from "@/lib/vodafone-search";
import { getTobiAdminConfigSnapshot } from "@/lib/tobi-config-store";

export const dynamic = "force-dynamic";

type TobiEnv = {
  OPENAI_API_KEY?: string;
};

export async function GET() {
  const runtime = process.env as TobiEnv;
  const snapshot = await getTobiAdminConfigSnapshot().catch(() => null);
  if (!snapshot) return Response.json({ error: "config_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  return Response.json({
    mode: runtime.OPENAI_API_KEY ? "openai" : "smart-demo",
    model: runtime.OPENAI_API_KEY ? snapshot.config.runtime.model : "chytré demo + lokální znalosti",
    configVersion: snapshot.configVersion,
    knowledge: getKnowledgeStats(),
  }, { headers: { "Cache-Control": "no-store" } });
}
