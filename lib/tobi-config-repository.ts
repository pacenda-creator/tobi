import {
  defaultTobiConfig,
  tobiConfigSchema,
  type TobiAdminConfigSnapshot,
  type TobiConfig,
} from "./tobi-config.ts";
import { TobiConfigVersionConflictError } from "./tobi-config-versioning.ts";

export type TobiConfigRow = {
  configVersion: number;
  config: unknown;
  updatedAt: string;
};

export type TobiConfigRepository = {
  readActive(): Promise<TobiConfigRow | null>;
  insertSeed(snapshot: TobiAdminConfigSnapshot): Promise<void>;
  updateActive(config: TobiConfig, expectedVersion: number, updatedAt: string): Promise<TobiConfigRow | null>;
};

export function createInitialTobiConfigSnapshot(updatedAt = new Date().toISOString()): TobiAdminConfigSnapshot {
  return {
    configVersion: 1,
    updatedAt,
    config: structuredClone(defaultTobiConfig),
  };
}

export function parseTobiConfigRow(row: TobiConfigRow): TobiAdminConfigSnapshot {
  return {
    configVersion: row.configVersion,
    updatedAt: row.updatedAt,
    config: tobiConfigSchema.parse(row.config),
  };
}

export async function readOrSeedTobiConfig(repository: TobiConfigRepository): Promise<TobiAdminConfigSnapshot> {
  const existing = await repository.readActive();
  if (existing) return parseTobiConfigRow(existing);

  const seed = createInitialTobiConfigSnapshot();
  await repository.insertSeed(seed);
  const created = await repository.readActive();
  if (!created) throw new Error("Aktivní konfiguraci se nepodařilo vytvořit.");
  return parseTobiConfigRow(created);
}

export async function saveTobiConfigInRepository(
  repository: TobiConfigRepository,
  configInput: unknown,
  expectedVersion: number,
): Promise<TobiAdminConfigSnapshot> {
  const config = tobiConfigSchema.parse(configInput);
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    throw new TypeError("expectedVersion musí být kladné celé číslo.");
  }

  const updatedAt = new Date().toISOString();
  const updated = await repository.updateActive(config, expectedVersion, updatedAt);
  if (updated) return parseTobiConfigRow(updated);

  const current = await readOrSeedTobiConfig(repository);
  throw new TobiConfigVersionConflictError(current);
}
