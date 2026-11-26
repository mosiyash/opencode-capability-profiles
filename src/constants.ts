import type { CapabilityDepth } from "./types.js";

export const CAPABILITY_DEPTHS = Object.freeze([
  "light",
  "standard",
  "deep",
] as const satisfies readonly CapabilityDepth[]);

export const CONFIG_SCHEMA = 1 as const;
export const CONFIG_FILE_NAME = "capability-profiles.json";
export const MAX_CONFIG_BYTES = 16 * 1024;
export const MAX_TARGET_LENGTH = 200;
export const MAX_WARNINGS = 5;
export const LEGACY_IMPORT_CONFIRMATION = "IMPORT_LEGACY_CAPABILITY_PROFILES";
