import { handleRouterDiagnosticAnalyze } from "@/lib/router-diagnostics-server";

export async function POST(request: Request) {
  return handleRouterDiagnosticAnalyze(request);
}
