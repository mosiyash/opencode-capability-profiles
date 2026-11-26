import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { CONFIG_SCHEMA, MAX_CONFIG_BYTES } from "./constants.js";
import { CapabilityProfilesError } from "./errors.js";
import { globalConfigPath, projectConfigPath } from "./paths.js";
import type {
  CapabilityMappings,
  CapabilityProfilesConfig,
  CapabilityProfilesScope,
  CapabilityProfilesWarning,
  ReadConfigResult,
  ReadProfilesResult,
} from "./types.js";
import { assertValidMappings, validateConfig } from "./validation.js";

const LOCK_TIMEOUT_MS = 5_000;
const STALE_LOCK_MS = 30_000;
const sleepBuffer = new Int32Array(new SharedArrayBuffer(4));

function unsafePathComponent(filePath: string): string | undefined {
  const absolute = path.resolve(filePath);
  let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) return current;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }
  return undefined;
}

function warning(code: CapabilityProfilesWarning["code"], message: string, filePath: string): CapabilityProfilesWarning {
  return { code, message, path: filePath };
}

export function readConfigFile(filePath: string): ReadConfigResult {
  const resolved = path.resolve(filePath);
  try {
    const unsafe = unsafePathComponent(resolved);
    if (unsafe) {
      return { path: resolved, exists: true, mappings: {}, warnings: [warning("UNSAFE_PATH", `Ignoring capability profiles config because a path component is a symlink: ${unsafe}.`, resolved)] };
    }
    let descriptor: number | undefined;
    try {
      descriptor = fs.openSync(resolved, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { path: resolved, exists: false, mappings: {}, warnings: [] };
      throw error;
    }
    try {
      const stat = fs.fstatSync(descriptor);
      if (!stat.isFile()) {
        return { path: resolved, exists: true, mappings: {}, warnings: [warning("UNSAFE_PATH", "Ignoring capability profiles config; expected a regular file.", resolved)] };
      }
      if (stat.size > MAX_CONFIG_BYTES) {
        return { path: resolved, exists: true, mappings: {}, warnings: [warning("FILE_TOO_LARGE", `Ignoring capability profiles config larger than ${MAX_CONFIG_BYTES} bytes.`, resolved)] };
      }
      const buffer = Buffer.alloc(MAX_CONFIG_BYTES + 1);
      let bytes = 0;
      while (bytes < buffer.length) {
        const read = fs.readSync(descriptor, buffer, bytes, buffer.length - bytes, bytes);
        if (read === 0) break;
        bytes += read;
      }
      if (bytes > MAX_CONFIG_BYTES) {
        return { path: resolved, exists: true, mappings: {}, warnings: [warning("FILE_TOO_LARGE", `Ignoring capability profiles config larger than ${MAX_CONFIG_BYTES} bytes.`, resolved)] };
      }
      let input: unknown;
      try {
        input = JSON.parse(buffer.subarray(0, bytes).toString("utf8"));
      } catch {
        return { path: resolved, exists: true, mappings: {}, warnings: [warning("INVALID_CONFIG", "Invalid capability profiles config; expected JSON.", resolved)] };
      }
      const validated = validateConfig(input, resolved);
      return { path: resolved, exists: true, ...validated };
    } finally {
      fs.closeSync(descriptor);
    }
  } catch {
    return { path: resolved, exists: fs.existsSync(resolved), mappings: {}, warnings: [warning("READ_FAILED", "Cannot inspect capability profiles config; continuing without it.", resolved)] };
  }
}

function assertSafeWritePath(filePath: string): void {
  const unsafe = unsafePathComponent(filePath);
  if (unsafe) throw new CapabilityProfilesError("UNSAFE_PATH", `Symlink path component is not supported: ${unsafe}`);
  if (fs.existsSync(filePath) && !fs.lstatSync(filePath).isFile()) {
    throw new CapabilityProfilesError("UNSAFE_PATH", `Capability profiles path is not a regular file: ${filePath}`);
  }
}

function atomicWrite(filePath: string, content: string, mode: number): void {
  const resolved = path.resolve(filePath);
  const directory = path.dirname(resolved);
  assertSafeWritePath(resolved);
  fs.mkdirSync(directory, { recursive: true });
  assertSafeWritePath(resolved);
  const temporary = path.join(directory, `.${path.basename(resolved)}.${process.pid}.${randomUUID()}.tmp`);
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(temporary, "wx", mode);
    fs.writeFileSync(descriptor, content, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, resolved);
    try {
      const directoryDescriptor = fs.openSync(directory, "r");
      try { fs.fsyncSync(directoryDescriptor); } finally { fs.closeSync(directoryDescriptor); }
    } catch {
      // Some platforms do not permit opening directories for fsync.
    }
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    try { fs.unlinkSync(temporary); } catch {}
    if (error instanceof CapabilityProfilesError) throw error;
    throw new CapabilityProfilesError("WRITE_FAILED", `Unable to write capability profiles config: ${(error as Error).message}`);
  }
}

function withConfigLock<T>(filePath: string, operation: () => T): T {
  const resolved = path.resolve(filePath);
  const directory = path.dirname(resolved);
  assertSafeWritePath(resolved);
  fs.mkdirSync(directory, { recursive: true });
  assertSafeWritePath(resolved);
  const lockPath = `${resolved}.lock`;
  const ownerPath = path.join(lockPath, "owner.json");
  const token = randomUUID();
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  let acquired = false;
  while (true) {
    try {
      fs.mkdirSync(lockPath, { mode: 0o700 });
      try {
        fs.writeFileSync(ownerPath, `${JSON.stringify({ token, pid: process.pid, createdAt: new Date().toISOString() })}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
      } catch (error) {
        try { fs.rmSync(lockPath, { recursive: true }); } catch {}
        throw error;
      }
      acquired = true;
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw new CapabilityProfilesError("WRITE_FAILED", `Unable to acquire capability profiles lock: ${(error as Error).message}`);
      }
      const stat = fs.lstatSync(lockPath);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new CapabilityProfilesError("UNSAFE_PATH", `Capability profiles lock path is unsafe: ${lockPath}`);
      if (Date.now() - stat.mtimeMs > STALE_LOCK_MS) {
        try {
          const ownerStat = fs.lstatSync(ownerPath);
          if (!ownerStat.isFile() || ownerStat.isSymbolicLink()) throw new Error("unsafe owner");
          const owner = JSON.parse(fs.readFileSync(ownerPath, "utf8")) as { pid?: unknown };
          if (Number.isInteger(owner.pid) && (owner.pid as number) > 0) {
            let alive = true;
            try { process.kill(owner.pid as number, 0); } catch (ownerError) { alive = (ownerError as NodeJS.ErrnoException).code === "EPERM"; }
            if (!alive) {
              fs.rmSync(lockPath, { recursive: true });
              continue;
            }
          }
        } catch {
          // An unverifiable lock is never reclaimed automatically.
        }
      }
      if (Date.now() >= deadline) throw new CapabilityProfilesError("LOCK_TIMEOUT", `Timed out waiting for capability profiles lock: ${lockPath}`);
      Atomics.wait(sleepBuffer, 0, 0, 10);
    }
  }
  try {
    return operation();
  } finally {
    if (acquired) {
      try {
        const owner = JSON.parse(fs.readFileSync(ownerPath, "utf8")) as { token?: unknown };
        if (owner.token === token) fs.rmSync(lockPath, { recursive: true });
      } catch {}
    }
  }
}

function writeConfigFileUnlocked(filePath: string, mappings: CapabilityMappings, mode: number): CapabilityProfilesConfig {
  assertValidMappings(mappings);
  const config: CapabilityProfilesConfig = { schema: CONFIG_SCHEMA, mappings: { ...mappings } };
  atomicWrite(filePath, `${JSON.stringify(config, null, 2)}\n`, mode);
  return config;
}

export function writeConfigFile(filePath: string, mappings: CapabilityMappings, options: { mode?: number } = {}): CapabilityProfilesConfig {
  return withConfigLock(filePath, () => writeConfigFileUnlocked(filePath, mappings, options.mode ?? 0o600));
}

export function updateConfigFile(
  filePath: string,
  update: (current: ReadConfigResult) => CapabilityMappings,
  options: { mode?: number } = {},
): CapabilityProfilesConfig {
  return withConfigLock(filePath, () => {
    const current = readConfigFile(filePath);
    return writeConfigFileUnlocked(filePath, update(current), options.mode ?? 0o600);
  });
}

export function resetConfigFile(filePath: string): boolean {
  const resolved = path.resolve(filePath);
  return withConfigLock(resolved, () => {
    assertSafeWritePath(resolved);
    try {
      fs.unlinkSync(resolved);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw new CapabilityProfilesError("WRITE_FAILED", `Unable to reset capability profiles config: ${(error as Error).message}`);
    }
  });
}

export function mergeMappings(globalMappings: CapabilityMappings, projectMappings: CapabilityMappings): CapabilityMappings {
  return { ...globalMappings, ...projectMappings };
}

export function readProfiles(options: { homeDir?: string; projectRoot?: string } = {}): ReadProfilesResult {
  const global = readConfigFile(globalConfigPath(options.homeDir));
  const project = options.projectRoot ? readConfigFile(projectConfigPath(options.projectRoot)) : undefined;
  return {
    global,
    ...(project ? { project } : {}),
    effective: mergeMappings(global.mappings, project?.mappings ?? {}),
    warnings: [...global.warnings, ...(project?.warnings ?? [])],
  };
}

export function configureGlobal(mappings: CapabilityMappings, options: { homeDir?: string } = {}): CapabilityProfilesConfig {
  return writeConfigFile(globalConfigPath(options.homeDir), mappings, { mode: 0o600 });
}

export function configureProject(projectRoot: string, mappings: CapabilityMappings): CapabilityProfilesConfig {
  return writeConfigFile(projectConfigPath(projectRoot), mappings, { mode: 0o644 });
}

export function resetGlobal(options: { homeDir?: string } = {}): boolean {
  return resetConfigFile(globalConfigPath(options.homeDir));
}

export function resetProject(projectRoot: string): boolean {
  return resetConfigFile(projectConfigPath(projectRoot));
}

export const showProfiles = readProfiles;

export function configureProfiles(options: {
  scope: CapabilityProfilesScope;
  mappings: CapabilityMappings;
  homeDir?: string;
  projectRoot?: string;
}): CapabilityProfilesConfig {
  if (options.scope === "global") return configureGlobal(options.mappings, options.homeDir ? { homeDir: options.homeDir } : {});
  if (!options.projectRoot) throw new CapabilityProfilesError("INVALID_ARGUMENT", "projectRoot is required for project capability profiles.");
  return configureProject(options.projectRoot, options.mappings);
}

export function resetProfiles(options: {
  scope: CapabilityProfilesScope;
  homeDir?: string;
  projectRoot?: string;
}): boolean {
  if (options.scope === "global") return resetGlobal(options.homeDir ? { homeDir: options.homeDir } : {});
  if (!options.projectRoot) throw new CapabilityProfilesError("INVALID_ARGUMENT", "projectRoot is required for project capability profiles.");
  return resetProject(options.projectRoot);
}
