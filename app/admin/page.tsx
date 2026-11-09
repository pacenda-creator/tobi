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
  if (isTobiAdminAuthorized(requestHeaders)) return <TobiStudio />;

  return (
    <InternalAccessCard
      title="Administrace TOBi — přístup uzamčen"
      description="BLOCKED: Interní přístup čeká na implementaci serverem ověřené identity a session."
      primaryAction={null}
    />
  );
}
