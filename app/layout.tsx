import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TOBi — Vodafone online podpora",
  description: "TOBi vám pomůže s internetem, službami a běžnými dotazy k Vodafonu.",
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
