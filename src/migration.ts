import { CAPABILITY_DEPTHS, LEGACY_IMPORT_CONFIRMATION } from "./constants.js";
import { createHash } from "node:crypto";
import { CapabilityProfilesError } from "./errors.js";
import { globalConfigPath, legacyWorkContextConfigPath } from "./paths.js";
import { readConfigFile, updateConfigFile } from "./storage.js";
import type { CapabilityMappings, LegacyImportPlan, ReadConfigResult } from "./types.js";

export type LegacyConflictPolicy = "keep-global" | "use-legacy";

function buildPlan(legacy: ReadConfigResult, global: ReadConfigResult): LegacyImportPlan {
  const additions: CapabilityMappings = {};
  const conflicts: LegacyImportPlan["conflicts"] = [];
  for (const depth of CAPABILITY_DEPTHS) {
    const legacyTarget = legacy.mappings[depth];
    if (!legacyTarget) continue;
    const globalTarget = global.mappings[depth];
    if (!globalTarget) additions[depth] = legacyTarget;
    else if (globalTarget !== legacyTarget) conflicts.push({ depth, globalTarget, legacyTarget });
  }
  const fingerprint = createHash("sha256").update(JSON.stringify({
    legacy: { exists: legacy.exists, mappings: legacy.mappings, warnings: legacy.warnings },
    global: { exists: global.exists, mappings: global.mappings, warnings: global.warnings },
    additions,
    conflicts,
  })).digest("hex");
  return { fingerprint, legacy, global, additions, conflicts };
}

export function planLegacyImport(options: {
  projectRoot: string;
  homeDir?: string;
  legacyPath?: string;
}): LegacyImportPlan {
  const legacy = readConfigFile(options.legacyPath ?? legacyWorkContextConfigPath(options.projectRoot));
  const global = readConfigFile(globalConfigPath(options.homeDir));
  return buildPlan(legacy, global);
}

export function importLegacyToGlobal(options: {
  projectRoot: string;
  confirmation: string;
  expectedPlanFingerprint: string;
  conflictPolicy?: LegacyConflictPolicy;
  homeDir?: string;
  legacyPath?: string;
}): { mappings: CapabilityMappings; plan: LegacyImportPlan } {
  if (options.confirmation !== LEGACY_IMPORT_CONFIRMATION) {
    throw new CapabilityProfilesError("CONFIRMATION_REQUIRED", `Legacy import requires ${LEGACY_IMPORT_CONFIRMATION}.`);
  }
  const legacy = readConfigFile(options.legacyPath ?? legacyWorkContextConfigPath(options.projectRoot));
  if (!legacy.exists || legacy.warnings.length > 0) {
    throw new CapabilityProfilesError("INVALID_ARGUMENT", "No valid legacy capability profiles config is available to import.");
  }
  let appliedPlan: LegacyImportPlan | undefined;
  const config = updateConfigFile(globalConfigPath(options.homeDir), (global) => {
    if (global.exists && global.warnings.length > 0) {
      throw new CapabilityProfilesError("INVALID_ARGUMENT", "Cannot import legacy mappings while the global config is invalid.");
    }
    const plan = buildPlan(legacy, global);
    if (plan.fingerprint !== options.expectedPlanFingerprint) {
      throw new CapabilityProfilesError("PLAN_CHANGED", "Legacy import plan changed after preview; review it again before importing.");
    }
    if (plan.conflicts.length > 0 && !options.conflictPolicy) {
      throw new CapabilityProfilesError("CONFLICT_DECISION_REQUIRED", "Legacy import conflicts require an explicit conflict policy.");
    }
    const mappings: CapabilityMappings = { ...plan.global.mappings, ...plan.additions };
    if (options.conflictPolicy === "use-legacy") {
      for (const conflict of plan.conflicts) mappings[conflict.depth] = conflict.legacyTarget;
    }
    appliedPlan = plan;
    return mappings;
  }, { mode: 0o600 });
  if (!appliedPlan) throw new CapabilityProfilesError("WRITE_FAILED", "Legacy import did not produce a migration plan.");
  return { mappings: config.mappings, plan: appliedPlan };
}
