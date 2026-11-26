import type { CapabilityDepth, CapabilityMappings, CapabilityProfilesWarning } from "./types.js";
export declare function isCapabilityDepth(value: unknown): value is CapabilityDepth;
export declare function isValidTarget(value: unknown): value is string;
export declare function assertValidMappings(value: unknown): asserts value is CapabilityMappings;
export declare function validateConfig(input: unknown, filePath?: string): {
    mappings: CapabilityMappings;
    warnings: CapabilityProfilesWarning[];
};
//# sourceMappingURL=validation.d.ts.map