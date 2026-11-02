import { handleChatV1 } from "@/lib/chat-v1-server";

export async function POST(request: Request) {
  return handleChatV1(request);
}
