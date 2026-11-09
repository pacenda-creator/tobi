import { X509Certificate } from "node:crypto";
import type { TobiConfigRepository, TobiConfigRow } from "./tobi-config-repository.ts";

type PostgresFailurePhase = "initialization" | "provider" | "query" | "idle_pool";
const failureCodes = new Map<string, string>([
  ["28P01", "authentication"], ["42501", "permission"], ["42P01", "schema"],
  ["ECONNREFUSED", "connection"], ["ETIMEDOUT", "timeout"], ["ENOTFOUND", "dns"],
  ["SELF_SIGNED_CERT_IN_CHAIN", "tls"], ["UNABLE_TO_VERIFY_LEAF_SIGNATURE", "tls"],
  ["CERT_HAS_EXPIRED", "tls"], ["ERR_TLS_CERT_ALTNAME_INVALID", "tls"],
  ["TOBI_INVALID_CA_CERT", "configuration"],
]);

// Only code/cause are inspected; never stringify or retain the original error.
function reportPostgresFailure(phase: PostgresFailurePhase, raw: unknown): void {
  let code = "UNKNOWN";
  let category = "unknown";
  const seen = new Set<object>();
  let node = raw;
  for (let depth = 0; depth < 4; depth++) {
    if (node === null || (typeof node !== "object" && typeof node !== "function") || seen.has(node)) break;
    seen.add(node);
    try {
      const candidate: unknown = (node as { code?: unknown }).code;
      if (typeof candidate === "string" && failureCodes.has(candidate)) {
        code = candidate;
        category = failureCodes.get(candidate)!;
        break;
      }
    } catch { /* A hostile getter supplies no trusted code. */ }
    if (depth === 3) break;
    try { node = (node as { cause?: unknown }).cause; }
    catch { break; }
  }
  console.error("TOBi PostgreSQL failure", JSON.stringify({ phase, code, category }));
}

// Structurally compatible with pg.Pool; injected clients allow isolated tests.
export type ConfigSqlClient = {
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
};
export type ConfigSqlProvider = () => Promise<ConfigSqlClient>;
let poolPromise: Promise<ConfigSqlClient> | undefined;

function validatedCa(): { ca?: string } {
  const ca = process.env.DATABASE_CA_CERT;
  if (ca === undefined) return {};
  try {
    const pattern = /-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/g;
    let end = 0;
    let count = 0;
    for (const match of ca.matchAll(pattern)) {
      if (ca.slice(end, match.index).trim()) throw new Error();
      const body = match[1].replace(/\s/g, "");
      if (!body || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body)) throw new Error();
      const der = Buffer.from(body, "base64");
      if (der.toString("base64") !== body) throw new Error();
      const cert = new X509Certificate(match[0]);
      if (!cert.raw.equals(der)) throw new Error();
      end = match.index! + match[0].length;
      count++;
    }
    if (!count || ca.slice(end).trim()) throw new Error();
    return { ca };
  } catch {
    throw Object.assign(new Error("Invalid TOBi CA certificate configuration."), { code: "TOBI_INVALID_CA_CERT" });
  }
}

async function serverPool(): Promise<ConfigSqlClient> {
  if (!process.env.DATABASE_URL) {
    throw new Error("TOBi configuration unavailable: DATABASE_URL is required.");
  }
  if (!poolPromise) {
    poolPromise = (async () => {
      // pg is a Node server-only external. Import is deferred until a request.
      // No connection during import or build.
      const { Pool } = await import("pg");
      const url = new URL(process.env.DATABASE_URL!);
      if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("Invalid protocol");
      // pg connection-string SSL parameters can override ssl options; remove them
      // so TLS verification cannot be disabled through a URL query parameter.
      for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert", "ssl", "uselibpqcompat"]) url.searchParams.delete(key);
      const caOptions = validatedCa();
      const pool = new Pool({
        connectionString: url.toString(),
        max: 2,
        idleTimeoutMillis: 10_000,
        connectionTimeoutMillis: 5_000,
        ssl: { rejectUnauthorized: true, ...caOptions },
      });
      pool.on("error", (error: unknown) => { reportPostgresFailure("idle_pool", error); });
      return pool as ConfigSqlClient;
    })().catch((error: unknown) => {
      reportPostgresFailure("initialization", error);
      poolPromise = undefined;
      throw new Error("TOBi configuration unavailable: PostgreSQL initialization failed.");
    });
  }
  return poolPromise;
}

function mapRow(row: Record<string, unknown> | undefined): TobiConfigRow | null {
  if (!row) return null;
  const configVersion = Number(row.config_version);
  if (!Number.isSafeInteger(configVersion) || configVersion < 1) throw new Error("Invalid stored config version");
  const updatedAt = row.updated_at instanceof Date ? row.updated_at.toISOString() : new Date(String(row.updated_at)).toISOString();
  return { configVersion, config: row.config, updatedAt };
}

export function createPostgresTobiConfigRepository(provider: ConfigSqlProvider = serverPool): TobiConfigRepository {
  async function query(sql: string, values: unknown[] = []) {
    let client: ConfigSqlClient;
    try { client = await provider(); }
    catch (error) {
      // serverPool already produces safe errors and reports initialization failures.
      if (provider === serverPool) throw error;
      reportPostgresFailure("provider", error);
      throw new Error("TOBi configuration unavailable: PostgreSQL provider failed.");
    }
    try { return await client.query(sql, values); }
    catch (error) {
      reportPostgresFailure("query", error);
      throw new Error("TOBi configuration unavailable: PostgreSQL query failed.");
    }
  }
  return {
    async readActive() {
      return mapRow((await query("SELECT config_version, config, updated_at FROM public.tobi_configurations WHERE id = $1", ["active"])).rows[0]);
    },
    async insertSeed(seed) {
      await query("INSERT INTO public.tobi_configurations (id, config_version, config, updated_at) VALUES ($1, $2, $3::jsonb, $4::timestamptz) ON CONFLICT (id) DO NOTHING", ["active", seed.configVersion, JSON.stringify(seed.config), seed.updatedAt]);
    },
    async updateActive(config, expectedVersion, updatedAt) {
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1 || expectedVersion >= 2147483647) throw new TypeError("Invalid expected config version");
      return mapRow((await query("UPDATE public.tobi_configurations SET config_version = config_version + 1, config = $1::jsonb, updated_at = $2::timestamptz WHERE id = $3 AND config_version = $4 RETURNING config_version, config, updated_at", [JSON.stringify(config), updatedAt, "active", expectedVersion])).rows[0]);
    },
  };
}
