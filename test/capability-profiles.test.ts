import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import {
  CapabilityProfilesError,
  LEGACY_IMPORT_CONFIRMATION,
  configureGlobal,
  configureProfiles,
  configureProject,
  globalConfigPath,
  importLegacyToGlobal,
  legacyWorkContextConfigPath,
  planLegacyImport,
  projectConfigPath,
  readConfigFile,
  readProfiles,
  resetGlobal,
  resetProfiles,
  resetProject,
  resolveConfiguredDepth,
  resolveDepth,
  validateConfig,
  writeConfigFile,
} from "../src/index.js";

const makeRoot = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "capability-profiles-"));
const removeRoot = (root: string): void => fs.rmSync(root, { recursive: true, force: true });

test("global mappings resolve without a project config", () => {
  const root = makeRoot();
  try {
    const homeDir = path.join(root, "home");
    configureGlobal({ standard: "Terra" }, { homeDir });
    const result = resolveConfiguredDepth({ depth: "standard", homeDir });
    assert.deepEqual(result.resolution, { depth: "standard", source: "global", target: "Terra", advisory: true });
    assert.equal(fs.statSync(globalConfigPath(homeDir)).mode & 0o777, 0o600);
  } finally { removeRoot(root); }
});

test("project and explicit overrides use deterministic precedence", () => {
  const root = makeRoot();
  try {
    const homeDir = path.join(root, "home");
    const projectRoot = path.join(root, "project");
    configureGlobal({ light: "Luna", deep: "Global Sol" }, { homeDir });
    configureProject(projectRoot, { deep: "Project Sol" });
    const profiles = readProfiles({ homeDir, projectRoot });
    assert.deepEqual(profiles.effective, { light: "Luna", deep: "Project Sol" });
    assert.deepEqual(resolveConfiguredDepth({ depth: "deep", homeDir, projectRoot }).resolution, {
      depth: "deep", source: "project", target: "Project Sol", advisory: true,
    });
    assert.deepEqual(resolveConfiguredDepth({ depth: "deep", explicitTarget: "Explicit Sol", homeDir, projectRoot }).resolution, {
      depth: "deep", source: "explicit", target: "Explicit Sol", advisory: true,
    });
    assert.equal(fs.statSync(projectConfigPath(projectRoot)).mode & 0o777, 0o644);
  } finally { removeRoot(root); }
});

test("missing mappings fall back to the current model without selecting one", () => {
  assert.deepEqual(resolveDepth({ depth: "light" }), { depth: "light", source: "current", advisory: true });
  assert.deepEqual(resolveDepth({ depth: "light", currentModel: "Current" }), {
    depth: "light", source: "current", target: "Current", advisory: true,
  });
});

test("invalid configs produce bounded warnings and valid entries survive", () => {
  const root = makeRoot();
  try {
    const configPath = path.join(root, "capability-profiles.json");
    fs.writeFileSync(configPath, JSON.stringify({
      schema: 1,
      mappings: { light: "Luna", invalid: "No", deep: " bad " },
      extra: true,
    }));
    const result = readConfigFile(configPath);
    assert.deepEqual(result.mappings, { light: "Luna" });
    assert.equal(result.warnings.length, 3);
    const many = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`invalid${index}`, "No"]));
    assert.equal(validateConfig({ schema: 1, mappings: many }, configPath).warnings.length, 5);
  } finally { removeRoot(root); }
});

test("non-regular, oversized, and symlink configs are ignored safely", () => {
  const root = makeRoot();
  try {
    const directory = path.join(root, "directory");
    fs.mkdirSync(directory);
    assert.equal(readConfigFile(directory).warnings[0]?.code, "UNSAFE_PATH");
    const oversized = path.join(root, "oversized.json");
    fs.writeFileSync(oversized, " ".repeat(16 * 1024 + 1));
    assert.equal(readConfigFile(oversized).warnings[0]?.code, "FILE_TOO_LARGE");
    const target = path.join(root, "target.json");
    const link = path.join(root, "link.json");
    fs.writeFileSync(target, JSON.stringify({ schema: 1, mappings: { deep: "Sol" } }));
    fs.symlinkSync(target, link);
    assert.equal(readConfigFile(link).warnings[0]?.code, "UNSAFE_PATH");
    assert.throws(() => writeConfigFile(link, { deep: "Other" }), (error) => error instanceof CapabilityProfilesError && error.code === "UNSAFE_PATH");
  } finally { removeRoot(root); }
});

test("legacy import is previewed, confirmed, conflict-aware, and non-destructive", () => {
  const root = makeRoot();
  try {
    const homeDir = path.join(root, "home");
    const projectRoot = path.join(root, "project");
    const legacyPath = legacyWorkContextConfigPath(projectRoot);
    configureGlobal({ deep: "Global Sol" }, { homeDir });
    writeConfigFile(legacyPath, { standard: "Terra", deep: "Legacy Sol" });
    const plan = planLegacyImport({ homeDir, projectRoot });
    assert.deepEqual(plan.additions, { standard: "Terra" });
    assert.deepEqual(plan.conflicts, [{ depth: "deep", globalTarget: "Global Sol", legacyTarget: "Legacy Sol" }]);
    assert.throws(() => importLegacyToGlobal({ homeDir, projectRoot, confirmation: "no", expectedPlanFingerprint: plan.fingerprint }), (error) => error instanceof CapabilityProfilesError && error.code === "CONFIRMATION_REQUIRED");
    assert.throws(() => importLegacyToGlobal({ homeDir, projectRoot, confirmation: LEGACY_IMPORT_CONFIRMATION, expectedPlanFingerprint: plan.fingerprint }), (error) => error instanceof CapabilityProfilesError && error.code === "CONFLICT_DECISION_REQUIRED");
    const imported = importLegacyToGlobal({
      homeDir,
      projectRoot,
      confirmation: LEGACY_IMPORT_CONFIRMATION,
      expectedPlanFingerprint: plan.fingerprint,
      conflictPolicy: "keep-global",
    });
    assert.deepEqual(imported.mappings, { deep: "Global Sol", standard: "Terra" });
    assert.equal(fs.existsSync(legacyPath), true);
  } finally { removeRoot(root); }
});

test("concurrent locked updates preserve independent mapping changes", async () => {
  const root = makeRoot();
  try {
    const homeDir = path.join(root, "home");
    const modulePath = new URL("../dist/index.js", import.meta.url).href;
    const entries = [["light", "Luna"], ["standard", "Terra"], ["deep", "Sol"]] as const;
    const children = entries.map(([depth, target]) => new Promise<void>((resolve, reject) => {
      const script = `import { globalConfigPath, updateConfigFile } from ${JSON.stringify(modulePath)}; const file = globalConfigPath(${JSON.stringify(homeDir)}); updateConfigFile(file, current => ({ ...current.mappings, ${depth}: ${JSON.stringify(target)} }));`;
      const child = spawn(process.execPath, ["--input-type=module", "--eval", script], { stdio: "pipe" });
      let stderr = "";
      child.stderr.on("data", (chunk) => { stderr += String(chunk); });
      child.on("error", reject);
      child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(stderr)));
    }));
    await Promise.all(children);
    const result = readConfigFile(globalConfigPath(homeDir));
    assert.equal(result.warnings.length, 0);
    assert.deepEqual(result.mappings, { light: "Luna", standard: "Terra", deep: "Sol" });
    assert.deepEqual(fs.readdirSync(path.dirname(globalConfigPath(homeDir))).filter((name) => name.endsWith(".tmp")), []);
  } finally { removeRoot(root); }
});

test("legacy import refuses to replace an invalid global config", () => {
  const root = makeRoot();
  try {
    const homeDir = path.join(root, "home");
    const projectRoot = path.join(root, "project");
    writeConfigFile(legacyWorkContextConfigPath(projectRoot), { deep: "Legacy Sol" });
    const globalPath = globalConfigPath(homeDir);
    fs.mkdirSync(path.dirname(globalPath), { recursive: true });
    fs.writeFileSync(globalPath, "{ malformed");
    const plan = planLegacyImport({ homeDir, projectRoot });
    assert.throws(() => importLegacyToGlobal({
      homeDir,
      projectRoot,
      confirmation: LEGACY_IMPORT_CONFIRMATION,
      expectedPlanFingerprint: plan.fingerprint,
    }), (error) => error instanceof CapabilityProfilesError && error.code === "INVALID_ARGUMENT");
    assert.equal(fs.readFileSync(globalPath, "utf8"), "{ malformed");
  } finally { removeRoot(root); }
});

test("legacy import aborts when the previewed plan drifts", () => {
  const root = makeRoot();
  try {
    const homeDir = path.join(root, "home");
    const projectRoot = path.join(root, "project");
    writeConfigFile(legacyWorkContextConfigPath(projectRoot), { deep: "Legacy Sol" });
    const plan = planLegacyImport({ homeDir, projectRoot });
    configureGlobal({ deep: "Concurrent Sol" }, { homeDir });
    assert.throws(() => importLegacyToGlobal({
      homeDir,
      projectRoot,
      confirmation: LEGACY_IMPORT_CONFIRMATION,
      expectedPlanFingerprint: plan.fingerprint,
      conflictPolicy: "use-legacy",
    }), (error) => error instanceof CapabilityProfilesError && error.code === "PLAN_CHANGED");
    assert.deepEqual(readConfigFile(globalConfigPath(homeDir)).mappings, { deep: "Concurrent Sol" });
  } finally { removeRoot(root); }
});

test("global and project reset are independent and idempotent", () => {
  const root = makeRoot();
  try {
    const homeDir = path.join(root, "home");
    const projectRoot = path.join(root, "project");
    configureGlobal({ light: "Luna" }, { homeDir });
    configureProject(projectRoot, { deep: "Sol" });
    assert.equal(resetProject(projectRoot), true);
    assert.equal(resetProject(projectRoot), false);
    assert.equal(readProfiles({ homeDir, projectRoot }).effective.light, "Luna");
    assert.equal(resetGlobal({ homeDir }), true);
    assert.equal(resetGlobal({ homeDir }), false);
  } finally { removeRoot(root); }
});

test("scope-based configure and reset entry points require project context", () => {
  const root = makeRoot();
  try {
    const projectRoot = path.join(root, "project");
    configureProfiles({ scope: "project", projectRoot, mappings: { standard: "Terra" } });
    assert.deepEqual(readProfiles({ projectRoot }).project?.mappings, { standard: "Terra" });
    assert.equal(resetProfiles({ scope: "project", projectRoot }), true);
    assert.throws(() => configureProfiles({ scope: "project", mappings: {} }), (error) => error instanceof CapabilityProfilesError && error.code === "INVALID_ARGUMENT");
    assert.throws(() => resetProfiles({ scope: "project" }), (error) => error instanceof CapabilityProfilesError && error.code === "INVALID_ARGUMENT");
  } finally { removeRoot(root); }
});
