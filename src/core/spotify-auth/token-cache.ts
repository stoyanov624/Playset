import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const TOKEN_CACHE_FILE_NAME = "spotify-token.json";

export interface TokenCache {
  refreshToken: string;
  accessToken?: string;
  /** Absolute expiry of the access token, epoch milliseconds. */
  expiresAt?: number;
}

/** Returns null when the cache is missing or unusable (corrupt JSON, no refresh token). */
export async function readTokenCache(configDir: string): Promise<TokenCache | null> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(join(configDir, TOKEN_CACHE_FILE_NAME), "utf8"));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const { refreshToken, accessToken, expiresAt } = parsed as Record<string, unknown>;
  if (typeof refreshToken !== "string" || refreshToken === "") return null;
  const cache: TokenCache = { refreshToken };
  if (typeof accessToken === "string" && accessToken !== "") cache.accessToken = accessToken;
  if (typeof expiresAt === "number" && Number.isFinite(expiresAt)) cache.expiresAt = expiresAt;
  return cache;
}

/** Writes the cache owner-only: directory 0700 when created, file 0600 even if it existed before. */
export async function writeTokenCache(configDir: string, cache: Required<TokenCache>): Promise<void> {
  await mkdir(configDir, { recursive: true, mode: 0o700 });
  const file = join(configDir, TOKEN_CACHE_FILE_NAME);
  const temp = `${file}.${process.pid}.tmp`;
  const content = JSON.stringify(
    { refreshToken: cache.refreshToken, accessToken: cache.accessToken, expiresAt: cache.expiresAt },
    null,
    2,
  );
  await writeFile(temp, content, { mode: 0o600 });
  await chmod(temp, 0o600);
  await rename(temp, file);
  await chmod(file, 0o600);
}
