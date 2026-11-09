import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Use the installed TypeScript compiler API (5.9); retain full build checks.
  experimental: { useTypeScriptCli: false },
  serverExternalPackages: ["pg"],
  async headers() {
    return ["/login", "/auth/:path*", "/admin/:path*", "/doc/:path*", "/api/config/admin/:path*"].map(source => ({
      source, headers: [
        { key: "Cache-Control", value: "private, no-cache, no-store, must-revalidate, max-age=0" },
        { key: "Pragma", value: "no-cache" }, { key: "Expires", value: "0" }, { key: "Vary", value: "Cookie" },
      ],
    }));
  },
  webpack(config) {
    // Server-only documentation imports; keep Markdown as text, never execute it.
    config.module.rules.push({ test: /\.md$/, resourceQuery: /raw/, type: "asset/source" });
    return config;
  },
};

export default nextConfig;
