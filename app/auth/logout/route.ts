import type { NextRequest } from "next/server";
import { handleAuth } from "@/lib/tobi-auth-routes";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) { return handleAuth(request, true); }
