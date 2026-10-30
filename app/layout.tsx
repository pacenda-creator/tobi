import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TOBi nové generace — Vodafone chatbot prototype",
  description: "Interaktivní prototyp nové generace chatbota TOBi pro telco podporu.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="cs">
      <body>{children}</body>
    </html>
  );
}
