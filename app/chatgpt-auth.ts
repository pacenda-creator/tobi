export type ChatGPTUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

// BLOCKED until a server-verified identity/session provider is approved.
// Never read unsigned oai-authenticated-* headers or development identities.
export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  return null;
}

export async function requireChatGPTUser(): Promise<ChatGPTUser> {
  throw new Error("Internal authentication BLOCKED: verified session provider required.");
}
