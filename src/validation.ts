import {
  CAPABILITY_DEPTHS,
  CONFIG_FILE_NAME,
  CONFIG_SCHEMA,
  MAX_TARGET_LENGTH,
  MAX_WARNINGS,
} from "./constants.js";
import { CapabilityProfilesError } from "./errors.js";
import type {
  CapabilityDepth,
  CapabilityMappings,
  CapabilityProfilesWarning,
} from "./types.js";

export function isCapabilityDepth(value: unknown): value is CapabilityDepth {
  return typeof value === "string" && CAPABILITY_DEPTHS.includes(value as CapabilityDepth);
}

export function isValidTarget(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= MAX_TARGET_LENGTH
    && value.trim() === value
    && !/[\u0000-\u001f\u007f]/.test(value);
}

export function assertValidMappings(value: unknown): asserts value is CapabilityMappings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CapabilityProfilesError("INVALID_ARGUMENT", "Capability mappings must be an object.");
  }
  for (const [depth, target] of Object.entries(value)) {
    if (!isCapabilityDepth(depth) || !isValidTarget(target)) {
      throw new CapabilityProfilesError("INVALID_ARGUMENT", `Invalid capability mapping for ${depth}.`);
    }
  }
}

export function validateConfig(
  input: unknown,
  filePath = CONFIG_FILE_NAME,
): { mappings: CapabilityMappings; warnings: CapabilityProfilesWarning[] } {
  const warnings: CapabilityProfilesWarning[] = [];
  const warn = (message: string) => {
    if (warnings.length < MAX_WARNINGS) warnings.push({ code: "INVALID_CONFIG", message, path: filePath });
  };
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    warn(`Invalid ${CONFIG_FILE_NAME}; expected an object.`);
    return { mappings: {}, warnings };
  }
  const record = input as Record<string, unknown>;
  if (record.schema !== CONFIG_SCHEMA || !record.mappings || typeof record.mappings !== "object" || Array.isArray(record.mappings)) {
    warn(`Invalid ${CONFIG_FILE_NAME}; expected { "schema": ${CONFIG_SCHEMA}, "mappings": { ... } }.`);
    return { mappings: {}, warnings };
  }
  if (Object.keys(record).some((key) => key !== "schema" && key !== "mappings")) {
    warn(`Ignoring unknown top-level keys in ${CONFIG_FILE_NAME}.`);
  }
  const mappings: CapabilityMappings = {};
  for (const [depth, target] of Object.entries(record.mappings as Record<string, unknown>)) {
    const safeDepth = depth.replace(/[\u0000-\u001f\u007f]/g, "?").slice(0, 40);
    if (!isCapabilityDepth(depth)) warn(`Ignoring unknown capability depth mapping: ${safeDepth}.`);
    else if (!isValidTarget(target)) warn(`Ignoring invalid target for capability depth mapping: ${depth}.`);
    else mappings[depth] = target;
  }
  return { mappings, warnings };
}
