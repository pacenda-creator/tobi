import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { tobiConfigurations } from "@/db/schema";
import {
  toPublicTobiConfig,
  type TobiAdminConfigSnapshot,
  type TobiPublicConfigSnapshot,
} from "@/lib/tobi-config";
import {
  createInitialTobiConfigSnapshot,
  readOrSeedTobiConfig,
  saveTobiConfigInRepository,
  type TobiConfigRepository,
} from "@/lib/tobi-config-repository";
import { createNextTobiConfigSnapshot } from "@/lib/tobi-config-versioning";

export { TobiConfigVersionConflictError } from "@/lib/tobi-config-versioning";

const ACTIVE_CONFIG_ID = "active";

type MemoryState = TobiAdminConfigSnapshot | null;
const memoryKey = Symbol.for("tobi.config.memory-store");
type GlobalWithConfigMemory = typeof globalThis & { [memoryKey]?: MemoryState };

function inMemoryStoreEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.TOBI_IN_MEMORY_CONFIG === "true";
}

function getMemorySnapshot() {
  const holder = globalThis as GlobalWithConfigMemory;
  if (!holder[memoryKey]) holder[memoryKey] = createInitialTobiConfigSnapshot();
  return structuredClone(holder[memoryKey]!);
}

function setMemorySnapshot(snapshot: TobiAdminConfigSnapshot) {
  (globalThis as GlobalWithConfigMemory)[memoryKey] = structuredClone(snapshot);
}

function createDatabaseRepository(): TobiConfigRepository {
  const db = getDb();
  return {
    async readActive() {
      const [row] = await db.select().from(tobiConfigurations).where(eq(tobiConfigurations.id, ACTIVE_CONFIG_ID)).limit(1);
      return row || null;
    },
    async insertSeed(seed) {
      await db.insert(tobiConfigurations).values({
        id: ACTIVE_CONFIG_ID,
        configVersion: seed.configVersion,
        config: seed.config,
        updatedAt: seed.updatedAt,
      }).onConflictDoNothing();
    },
    async updateActive(config, expectedVersion, updatedAt) {
      const [updated] = await db.update(tobiConfigurations).set({
        configVersion: expectedVersion + 1,
        config,
        updatedAt,
      }).where(and(
        eq(tobiConfigurations.id, ACTIVE_CONFIG_ID),
        eq(tobiConfigurations.configVersion, expectedVersion),
      )).returning();
      return updated || null;
    },
  };
}

export async function getTobiAdminConfigSnapshot(): Promise<TobiAdminConfigSnapshot> {
  if (inMemoryStoreEnabled()) return getMemorySnapshot();
  return readOrSeedTobiConfig(createDatabaseRepository());
}

export async function getTobiPublicConfigSnapshot(): Promise<TobiPublicConfigSnapshot> {
  const snapshot = await getTobiAdminConfigSnapshot();
  return {
    configVersion: snapshot.configVersion,
    updatedAt: snapshot.updatedAt,
    config: toPublicTobiConfig(snapshot.config),
  };
}

export async function saveTobiConfig(configInput: unknown, expectedVersion: number): Promise<TobiAdminConfigSnapshot> {
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new TypeError("expectedVersion musí být kladné celé číslo.");

  if (inMemoryStoreEnabled()) {
    const current = getMemorySnapshot();
    const next = createNextTobiConfigSnapshot(current, configInput, expectedVersion);
    setMemorySnapshot(next);
    return structuredClone(next);
  }

  return saveTobiConfigInRepository(createDatabaseRepository(), configInput, expectedVersion);
}
