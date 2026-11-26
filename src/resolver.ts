import { CapabilityProfilesError } from "./errors.js";
import type {
  CapabilityDepth,
  CapabilityMappings,
  CapabilityResolution,
  ReadProfilesResult,
} from "./types.js";
import { isCapabilityDepth, isValidTarget } from "./validation.js";
import { readProfiles } from "./storage.js";

export function resolveDepth(options: {
  depth: CapabilityDepth;
  explicitTarget?: string;
  projectMappings?: CapabilityMappings;
  globalMappings?: CapabilityMappings;
  currentModel?: string;
}): CapabilityResolution {
  if (!isCapabilityDepth(options.depth)) throw new CapabilityProfilesError("INVALID_ARGUMENT", `Unknown capability depth: ${String(options.depth)}`);
  if (options.explicitTarget !== undefined && !isValidTarget(options.explicitTarget)) throw new CapabilityProfilesError("INVALID_ARGUMENT", "Invalid explicit capability target.");
  if (options.currentModel !== undefined && !isValidTarget(options.currentModel)) throw new CapabilityProfilesError("INVALID_ARGUMENT", "Invalid current model label.");
  const projectTarget = options.projectMappings?.[options.depth];
  const globalTarget = options.globalMappings?.[options.depth];
  if (options.explicitTarget) return { depth: options.depth, source: "explicit", target: options.explicitTarget, advisory: true };
  if (projectTarget) return { depth: options.depth, source: "project", target: projectTarget, advisory: true };
  if (globalTarget) return { depth: options.depth, source: "global", target: globalTarget, advisory: true };
  return {
    depth: options.depth,
    source: "current",
    ...(options.currentModel ? { target: options.currentModel } : {}),
    advisory: true,
  };
}

export function resolveConfiguredDepth(options: {
  depth: CapabilityDepth;
  explicitTarget?: string;
  currentModel?: string;
  homeDir?: string;
  projectRoot?: string;
}): { resolution: CapabilityResolution; profiles: ReadProfilesResult } {
  const profiles = readProfiles({
    ...(options.homeDir ? { homeDir: options.homeDir } : {}),
    ...(options.projectRoot ? { projectRoot: options.projectRoot } : {}),
  });
  return {
    resolution: resolveDepth({
      depth: options.depth,
      ...(options.explicitTarget ? { explicitTarget: options.explicitTarget } : {}),
      ...(options.currentModel ? { currentModel: options.currentModel } : {}),
      globalMappings: profiles.global.mappings,
      ...(profiles.project ? { projectMappings: profiles.project.mappings } : {}),
    }),
    profiles,
  };
}
