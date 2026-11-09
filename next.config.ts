import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Use the installed TypeScript compiler API (5.9); retain full build checks.
  experimental: { useTypeScriptCli: false },
  serverExternalPackages: ["pg"],
  webpack(config) {
    // Server-only documentation imports; keep Markdown as text, never execute it.
    config.module.rules.push({ test: /\.md$/, resourceQuery: /raw/, type: "asset/source" });
    return config;
  },
};

export default nextConfig;
