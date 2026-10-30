import { getKnowledgeStats } from "@/lib/vodafone-search";

type TobiEnv = Cloudflare.Env & {
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
};

export async function GET() {
  const runtime = process.env as TobiEnv;
  return Response.json({
    mode: runtime.OPENAI_API_KEY ? "openai" : "mock",
    model: runtime.OPENAI_API_KEY ? runtime.OPENAI_MODEL || "gpt-6-astra" : "mock scénář",
    knowledge: getKnowledgeStats(),
  });
}
