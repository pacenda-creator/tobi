import type { TobiConfigRepository, TobiConfigRow } from "./tobi-config-repository.ts";

// Structurally compatible with pg.Pool; injected clients allow isolated tests.
export type ConfigSqlClient = {
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
};
export type ConfigSqlProvider = () => Promise<ConfigSqlClient>;
let poolPromise: Promise<ConfigSqlClient> | undefined;

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
      const pool = new Pool({
        connectionString: url.toString(),
        max: 2,
        idleTimeoutMillis: 10_000,
        connectionTimeoutMillis: 5_000,
        ssl: { rejectUnauthorized: true },
      });
      pool.on("error", () => { console.error("TOBi PostgreSQL pool unavailable"); });
      return pool as ConfigSqlClient;
    })().catch(() => {
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
    const client = await provider();
    try { return await client.query(sql, values); }
    catch { throw new Error("TOBi configuration unavailable: PostgreSQL query failed."); }
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
