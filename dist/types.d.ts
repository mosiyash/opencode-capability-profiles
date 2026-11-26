export type CapabilityDepth = "light" | "standard" | "deep";
export type CapabilityMappings = Partial<Record<CapabilityDepth, string>>;
export type CapabilityProfilesScope = "global" | "project";
export interface CapabilityProfilesConfig {
    schema: 1;
    mappings: CapabilityMappings;
}
export type WarningCode = "INVALID_CONFIG" | "UNSAFE_PATH" | "FILE_TOO_LARGE" | "READ_FAILED";
export interface CapabilityProfilesWarning {
    code: WarningCode;
    message: string;
    path: string;
}
export interface ReadConfigResult {
    path: string;
    exists: boolean;
    mappings: CapabilityMappings;
    warnings: CapabilityProfilesWarning[];
}
export interface ReadProfilesResult {
    global: ReadConfigResult;
    project?: ReadConfigResult;
    effective: CapabilityMappings;
    warnings: CapabilityProfilesWarning[];
}
export type ResolutionSource = "explicit" | "project" | "global" | "current";
export interface CapabilityResolution {
    depth: CapabilityDepth;
    source: ResolutionSource;
    target?: string;
    advisory: true;
}
export interface LegacyImportConflict {
    depth: CapabilityDepth;
    globalTarget: string;
    legacyTarget: string;
}
export interface LegacyImportPlan {
    fingerprint: string;
    legacy: ReadConfigResult;
    global: ReadConfigResult;
    additions: CapabilityMappings;
    conflicts: LegacyImportConflict[];
}
//# sourceMappingURL=types.d.ts.map