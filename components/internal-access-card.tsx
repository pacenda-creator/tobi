import Link from "next/link";
import type { ReactNode } from "react";

export const internalActionClassName =
  "inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2 text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e60000]";

export function InternalAccessCard({
  title,
  description,
  primaryAction,
}: {
  title: string;
  description: string;
  primaryAction: ReactNode;
}) {
  return (
    <main className="grid min-h-dvh place-items-center bg-[#f7f7f7] p-6">
      <section className="w-full max-w-lg rounded-2xl border border-[#dedede] bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-[#111]">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-[#555]">{description}</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {primaryAction}
          <Link
            href="/"
            className={`${internalActionClassName} border border-[#d4d4d4] bg-white text-[#222] hover:bg-[#f5f5f5]`}
          >
            Otevřít zákaznický chat
          </Link>
        </div>
      </section>
    </main>
  );
}
