import type { CapabilityDepth, CapabilityMappings, CapabilityResolution, ReadProfilesResult } from "./types.js";
export declare function resolveDepth(options: {
    depth: CapabilityDepth;
    explicitTarget?: string;
    projectMappings?: CapabilityMappings;
    globalMappings?: CapabilityMappings;
    currentModel?: string;
}): CapabilityResolution;
export declare function resolveConfiguredDepth(options: {
    depth: CapabilityDepth;
    explicitTarget?: string;
    currentModel?: string;
    homeDir?: string;
    projectRoot?: string;
}): {
    resolution: CapabilityResolution;
    profiles: ReadProfilesResult;
};
//# sourceMappingURL=resolver.d.ts.map