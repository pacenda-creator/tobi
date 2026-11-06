import { tobiConfigSchema, type TobiAdminConfigSnapshot } from "./tobi-config.ts";

export class TobiConfigVersionConflictError extends Error {
  readonly current: TobiAdminConfigSnapshot;

  constructor(current: TobiAdminConfigSnapshot) {
    super("Konfigurace byla mezitím změněna.");
    this.name = "TobiConfigVersionConflictError";
    this.current = current;
  }
}

export function createNextTobiConfigSnapshot(current: TobiAdminConfigSnapshot, configInput: unknown, expectedVersion: number, updatedAt = new Date().toISOString()): TobiAdminConfigSnapshot {
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new TypeError("expectedVersion musí být kladné celé číslo.");
  if (current.configVersion !== expectedVersion) throw new TobiConfigVersionConflictError(current);
  return {
    configVersion: expectedVersion + 1,
    updatedAt,
    config: tobiConfigSchema.parse(configInput),
  };
}

export function shouldApplyTobiConfigVersion(currentVersion: number, incomingVersion: number) {
  return Number.isSafeInteger(incomingVersion) && incomingVersion >= 1 && incomingVersion >= currentVersion;
}

function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function mergeDraftValue(latest: unknown, base: unknown, draft: unknown): unknown {
  if (sameValue(draft, base)) return structuredClone(latest);
  if (!latest || !base || !draft || typeof latest !== "object" || typeof base !== "object" || typeof draft !== "object" || Array.isArray(latest) || Array.isArray(base) || Array.isArray(draft)) {
    return structuredClone(draft);
  }
  const keys = new Set([...Object.keys(latest), ...Object.keys(base), ...Object.keys(draft)]);
  return Object.fromEntries([...keys].map((key) => [key, mergeDraftValue(
    (latest as Record<string, unknown>)[key],
    (base as Record<string, unknown>)[key],
    (draft as Record<string, unknown>)[key],
  )]));
}

export function mergeTobiConfigDraft(latest: TobiAdminConfigSnapshot["config"], base: TobiAdminConfigSnapshot["config"], draft: TobiAdminConfigSnapshot["config"]) {
  const merged = mergeDraftValue(latest, base, draft) as TobiAdminConfigSnapshot["config"];
  const modelSettingsChangedInDraft = (["model", "reasoningEffort", "temperature"] as const)
    .some((key) => !sameValue(draft.runtime[key], base.runtime[key]));
  const modelSettings = modelSettingsChangedInDraft ? draft.runtime : latest.runtime;
  merged.runtime.model = modelSettings.model;
  merged.runtime.reasoningEffort = modelSettings.reasoningEffort;
  merged.runtime.temperature = modelSettings.temperature;
  return tobiConfigSchema.parse(merged);
}
