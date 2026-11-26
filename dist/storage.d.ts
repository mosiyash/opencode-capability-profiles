import type { CapabilityMappings, CapabilityProfilesConfig, CapabilityProfilesScope, ReadConfigResult, ReadProfilesResult } from "./types.js";
export declare function readConfigFile(filePath: string): ReadConfigResult;
export declare function writeConfigFile(filePath: string, mappings: CapabilityMappings, options?: {
    mode?: number;
}): CapabilityProfilesConfig;
export declare function updateConfigFile(filePath: string, update: (current: ReadConfigResult) => CapabilityMappings, options?: {
    mode?: number;
}): CapabilityProfilesConfig;
export declare function resetConfigFile(filePath: string): boolean;
export declare function mergeMappings(globalMappings: CapabilityMappings, projectMappings: CapabilityMappings): CapabilityMappings;
export declare function readProfiles(options?: {
    homeDir?: string;
    projectRoot?: string;
}): ReadProfilesResult;
export declare function configureGlobal(mappings: CapabilityMappings, options?: {
    homeDir?: string;
}): CapabilityProfilesConfig;
export declare function configureProject(projectRoot: string, mappings: CapabilityMappings): CapabilityProfilesConfig;
export declare function resetGlobal(options?: {
    homeDir?: string;
}): boolean;
export declare function resetProject(projectRoot: string): boolean;
export declare const showProfiles: typeof readProfiles;
export declare function configureProfiles(options: {
    scope: CapabilityProfilesScope;
    mappings: CapabilityMappings;
    homeDir?: string;
    projectRoot?: string;
}): CapabilityProfilesConfig;
export declare function resetProfiles(options: {
    scope: CapabilityProfilesScope;
    homeDir?: string;
    projectRoot?: string;
}): boolean;
//# sourceMappingURL=storage.d.ts.map