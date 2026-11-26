import os from "node:os";
import path from "node:path";
import { CONFIG_FILE_NAME } from "./constants.js";

export function globalConfigPath(homeDir = os.homedir()): string {
  return path.join(path.resolve(homeDir), ".config", "opencode", CONFIG_FILE_NAME);
}

export function projectConfigPath(projectRoot: string): string {
  return path.join(path.resolve(projectRoot), ".opencode", CONFIG_FILE_NAME);
}

export function legacyWorkContextConfigPath(projectRoot: string): string {
  return path.join(path.resolve(projectRoot), ".work-context", "local", CONFIG_FILE_NAME);
}
