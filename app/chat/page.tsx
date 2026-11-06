import type { Metadata } from "next";

import TobiStudio from "@/components/tobi-studio";
import { getTobiPublicConfigSnapshot } from "@/lib/tobi-config-store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Chat s TOBim",
};

export default async function CustomerChatPreview() {
  const initialSnapshot = await getTobiPublicConfigSnapshot().catch(() => null);
  return <TobiStudio customerOnly initialConfigSnapshot={initialSnapshot} />;
}
