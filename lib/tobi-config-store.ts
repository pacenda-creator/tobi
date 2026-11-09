import { createPostgresTobiConfigRepository } from "./tobi-config-postgres.ts";
import {
  toPublicTobiConfig,
  type TobiAdminConfigSnapshot,
  type TobiPublicConfigSnapshot,
} from "./tobi-config.ts";
import {
  createInitialTobiConfigSnapshot,
  readOrSeedTobiConfig,
  saveTobiConfigInRepository,
} from "./tobi-config-repository.ts";
import { createNextTobiConfigSnapshot } from "./tobi-config-versioning.ts";

export { TobiConfigVersionConflictError } from "./tobi-config-versioning.ts";


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

const createDatabaseRepository = createPostgresTobiConfigRepository;

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
