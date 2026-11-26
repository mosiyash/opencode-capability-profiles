import type { CapabilityMappings, LegacyImportPlan } from "./types.js";
export type LegacyConflictPolicy = "keep-global" | "use-legacy";
export declare function planLegacyImport(options: {
    projectRoot: string;
    homeDir?: string;
    legacyPath?: string;
}): LegacyImportPlan;
export declare function importLegacyToGlobal(options: {
    projectRoot: string;
    confirmation: string;
    expectedPlanFingerprint: string;
    conflictPolicy?: LegacyConflictPolicy;
    homeDir?: string;
    legacyPath?: string;
}): {
    mappings: CapabilityMappings;
    plan: LegacyImportPlan;
};
//# sourceMappingURL=migration.d.ts.map