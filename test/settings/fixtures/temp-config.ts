// Helpers for settings store tests: temp config directories and raw file access.
// Every test works inside its own mkdtemp root, never the user's real ~/.config/playset/.
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const CONFIG_FILE = "config.json";
export const TOKEN_CACHE_FILE = "spotify-token.json";

export const ENV_CLIENT_ID = "3f9a0c2e7b4d4e1f8a6b5c4d3e2f1a0b";
export const FILE_CLIENT_ID = "aaaabbbbccccdddd0000111122223333";
export const ENV_API_KEY = "sfm-env-key-111";
export const FILE_API_KEY = "sfm-file-key-222";

export const NOW = 1795716000000;
export const TOKENS = {
  refreshToken: "AQCr7Yh1...refresh",
  accessToken: "BQDj8Zk2...access",
  expiresAt: NOW + 3_600_000,
};
export const NEWER_TOKENS = {
  refreshToken: "AQRotated...refresh",
  accessToken: "BQNew222...access",
  expiresAt: NOW + 7_200_000,
};

export async function makeTempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "playset-settings-"));
}

export async function removeTempRoot(root: string): Promise<void> {
  // Restore write access in case a test made a directory read-only.
  await chmodTree(root).catch(() => {});
  await rm(root, { recursive: true, force: true });
}

async function chmodTree(dir: string): Promise<void> {
  await chmod(dir, 0o700);
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) await chmodTree(join(dir, entry.name));
  }
}

export async function writeConfigFile(configDir: string, content: string): Promise<void> {
  await mkdir(configDir, { recursive: true });
  await writeFile(join(configDir, CONFIG_FILE), content, "utf8");
}

export async function readConfigFileRaw(configDir: string): Promise<string | null> {
  try {
    return await readFile(join(configDir, CONFIG_FILE), "utf8");
  } catch {
    return null;
  }
}

export async function writeTokenCacheFile(configDir: string, content: unknown, mode = 0o600): Promise<void> {
  await mkdir(configDir, { recursive: true });
  const path = join(configDir, TOKEN_CACHE_FILE);
  await writeFile(path, typeof content === "string" ? content : JSON.stringify(content), "utf8");
  await chmod(path, mode);
}

export async function readTokenCacheRaw(configDir: string): Promise<string | null> {
  try {
    return await readFile(join(configDir, TOKEN_CACHE_FILE), "utf8");
  } catch {
    return null;
  }
}

export async function fileMode(path: string): Promise<number> {
  return (await stat(path)).mode & 0o777;
}

export async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Resolves to the rejection reason, or undefined if the promise fulfilled. */
export async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    return undefined;
  } catch (err) {
    return err ?? new Error("rejected with a nullish reason");
  }
}

/** File-permission tests cannot be provoked as root (root ignores modes) or on Windows. */
export const canTestPermissions =
  process.platform !== "win32" && typeof process.getuid === "function" && process.getuid() !== 0;
