import type { Metadata } from "next";
import { headers } from "next/headers";


import DocPortal from "@/components/tobi-docs/doc-portal";
import {
  InternalAccessCard,
} from "@/components/internal-access-card";
import { isTobiAdminAuthorized } from "@/lib/tobi-admin-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dokumentace TOBi",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default async function TobiDocumentationPage() {
  const requestHeaders = await headers();
  if (await isTobiAdminAuthorized(requestHeaders)) {
    const { getTobiDocContent } = await import("@/lib/tobi-docs/server-content");
    return <><form action="/auth/logout" method="post"><button>Odhlásit se</button></form><DocPortal content={getTobiDocContent()} /></>;
  }

  return (
    <InternalAccessCard
      title="Dokumentace TOBi — přístup uzamčen"
      description="Přístup vyžaduje přihlášení povoleného správce."
      primaryAction={<a href="/login?next=/doc">Přihlásit se</a>}
    />
  );
}
