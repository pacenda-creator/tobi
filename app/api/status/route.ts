import { getKnowledgeStats } from "@/lib/vodafone-search";
import { getTobiAdminConfigSnapshot } from "@/lib/tobi-config-store";

type TobiEnv = Cloudflare.Env & {
  OPENAI_API_KEY?: string;
};

export async function GET() {
  const runtime = process.env as TobiEnv;
  const snapshot = await getTobiAdminConfigSnapshot();
  return Response.json({
    mode: runtime.OPENAI_API_KEY ? "openai" : "smart-demo",
    model: runtime.OPENAI_API_KEY ? snapshot.config.runtime.model : "chytré demo + lokální znalosti",
    configVersion: snapshot.configVersion,
    knowledge: getKnowledgeStats(),
  }, { headers: { "Cache-Control": "no-store" } });
}
