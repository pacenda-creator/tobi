import type { Metadata } from "next";
import { headers } from "next/headers";

import TobiStudio from "@/components/tobi-studio";
import {
  InternalAccessCard,
} from "@/components/internal-access-card";
import { isTobiAdminAuthorized } from "@/lib/tobi-admin-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Administrace TOBi",
};

export default async function TobiAdminPage() {
  const requestHeaders = await headers();
  if (await isTobiAdminAuthorized(requestHeaders)) return <><form action="/auth/logout" method="post"><button>Odhlásit se</button></form><TobiStudio /></>;

  return (
    <InternalAccessCard
      title="Administrace TOBi — přístup uzamčen"
      description="Přístup vyžaduje přihlášení povoleného správce."
      primaryAction={<a href="/login?next=/admin">Přihlásit se</a>}
    />
  );
}
