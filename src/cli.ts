#!/usr/bin/env node
import process from "node:process";
import path from "node:path";
import { createRequire } from "node:module";
import { createInterface } from "node:readline/promises";
import {
  CAPABILITY_DEPTHS,
  LEGACY_IMPORT_CONFIRMATION,
  globalConfigPath,
  importLegacyToGlobal,
  planLegacyImport,
  projectConfigPath,
  readProfiles,
  resetGlobal,
  resetProject,
  updateConfigFile,
} from "./index.js";
import type { CapabilityMappings } from "./types.js";

const packageVersion = (createRequire(import.meta.url)("../package.json") as { version: string }).version;
const args = process.argv.slice(2);
const command = args[0] ?? "help";
const projectScope = args.includes("--project");
const globalScope = args.includes("--global");
const projectRoot = process.cwd();

function usage(): void {
  console.log(`Usage:
  opencode-capability-profiles setup --global|--project
  opencode-capability-profiles show [--project]
  opencode-capability-profiles reset --global|--project
  opencode-capability-profiles migrate [--project]
  opencode-capability-profiles doctor [--project]`);
}

function doctor(): void {
  const includesProject = args.length === 2 && args[1] === "--project";
  if (!((args.length === 1 || includesProject) && args[0] === "doctor")) {
    throw new Error("Usage: opencode-capability-profiles doctor [--project]");
  }

  const project = includesProject ? path.resolve(process.cwd()) : null;
  const profiles = readProfiles(project ? { projectRoot: project } : {});
  const hasWarnings = profiles.warnings.length > 0
    || profiles.global.warnings.length > 0
    || (profiles.project?.warnings.length ?? 0) > 0;
  const status = hasWarnings ? "warning" : "ok";
  console.log(JSON.stringify({
    schema: 1,
    component: "opencode-capability-profiles",
    package_version: packageVersion,
    status,
    project,
    profiles,
    complete: true,
  }));
  if (status === "warning") process.exitCode = 1;
}

async function promptMappings(current: CapabilityMappings): Promise<{ set: CapabilityMappings; remove: (keyof CapabilityMappings)[] }> {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const set: CapabilityMappings = {};
    const remove: (keyof CapabilityMappings)[] = [];
    for (const depth of CAPABILITY_DEPTHS) {
      const suffix = current[depth] ? ` [${current[depth]}]` : "";
      const answer = (await terminal.question(`${depth}${suffix} (blank keeps, - clears): `)).trim();
      if (answer === "-") remove.push(depth);
      else if (answer) set[depth] = answer;
    }
    return { set, remove };
  } finally {
    terminal.close();
  }
}

async function setup(): Promise<void> {
  if (projectScope === globalScope) throw new Error("Choose exactly one of --global or --project.");
  const profiles = readProfiles({ projectRoot });
  const current = projectScope ? profiles.project?.mappings ?? {} : profiles.global.mappings;
  const patch = await promptMappings(current);
  const configPath = projectScope ? projectConfigPath(projectRoot) : globalConfigPath();
  updateConfigFile(configPath, (latest) => {
    if (latest.exists && latest.warnings.length) throw new Error("Cannot update an invalid capability profiles config.");
    const mappings: CapabilityMappings = { ...latest.mappings, ...patch.set };
    for (const depth of patch.remove) delete mappings[depth];
    return mappings;
  }, { mode: projectScope ? 0o644 : 0o600 });
  console.log(`Configured ${projectScope ? "project" : "global"} capability profiles.`);
}

async function reset(): Promise<void> {
  if (projectScope === globalScope) throw new Error("Choose exactly one of --global or --project.");
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const confirmation = await terminal.question("Type RESET_PROFILES to continue: ");
    if (confirmation !== "RESET_PROFILES") throw new Error("Reset cancelled.");
  } finally {
    terminal.close();
  }
  const removed = projectScope ? resetProject(projectRoot) : resetGlobal();
  console.log(removed ? "Capability profiles reset." : "No capability profiles config existed.");
}

async function migrate(): Promise<void> {
  const plan = planLegacyImport({ projectRoot });
  console.log(JSON.stringify(plan, null, 2));
  if (!plan.legacy.exists || plan.legacy.warnings.length) throw new Error("No valid legacy config is available to import.");
  if (plan.global.exists && plan.global.warnings.length) throw new Error("Cannot import while the global config is invalid.");
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    let conflictPolicy: "keep-global" | "use-legacy" | undefined;
    if (plan.conflicts.length) {
      const answer = await terminal.question("Conflicts found. Use legacy values? [y/N]: ");
      conflictPolicy = answer.trim().toLowerCase() === "y" ? "use-legacy" : "keep-global";
    }
    const confirmation = await terminal.question(`Type ${LEGACY_IMPORT_CONFIRMATION} to import: `);
    const result = importLegacyToGlobal({
      projectRoot,
      confirmation,
      expectedPlanFingerprint: plan.fingerprint,
      ...(conflictPolicy ? { conflictPolicy } : {}),
    });
    console.log(JSON.stringify(result.mappings, null, 2));
    console.log("Legacy config was not modified or deleted.");
  } finally {
    terminal.close();
  }
}

try {
  if (command === "setup") await setup();
  else if (command === "show") console.log(JSON.stringify(readProfiles(projectScope ? { projectRoot } : {}), null, 2));
  else if (command === "reset") await reset();
  else if (command === "migrate") await migrate();
  else if (command === "doctor") doctor();
  else if (command === "help" || command === "--help" || command === "-h") usage();
  else throw new Error(`Unknown command: ${command}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
