// The web server's settings, read once from an env object at startup and passed down; nothing else
// reads the environment. A bad config stops startup with every problem named, never a value.
import { z } from "zod";

/** The server listens on the loopback address only; the Host login's redirect URI uses it too. */
export const LISTEN_HOST = "127.0.0.1";

export interface WebConfig {
  setlistFmApiKey: string;
  spotifyClientId: string;
  /** The Spotify user id of the Host Account. */
  hostSpotifyId: string;
  cookieSecret: string;
  port: number;
  /** Where the SQLite file lives. */
  dataFile: string;
  /** Previews that start a run, per Visitor address per hour. */
  previewLimit: number;
  /** Admitted creates and updates, per Visitor address per hour. */
  createLimit: number;
  /** Setlist Playlists made (created or updated) per UTC day, by everyone. */
  dailyLimit: number;
  /** Whether the Visitor address is the one the nearest proxy put last in X-Forwarded-For. */
  trustProxy: boolean;
}

/** The config can't be used; the message lists every problem, one sentence each. */
export class WebConfigError extends Error {
  constructor(problems: readonly string[]) {
    super(`Playset can't start: ${problems.join(" ")}`);
    this.name = "WebConfigError";
  }
}

type Env = Readonly<Record<string, string | undefined>>;

const required = (envName: string) => z.string().min(1, `Missing ${envName}.`);

const wholeNumber = (envName: string, max?: number) => {
  const rule = max === undefined ? "a whole number of 1 or more" : `a whole number from 1 to ${max}`;
  const message = `${envName} must be ${rule}.`;
  const bounded = z.int(message).min(1, message);
  return z
    .string()
    .regex(/^[0-9]+$/, message)
    .transform(Number)
    .pipe(max === undefined ? bounded : bounded.max(max, message));
};

/**
 * One entry per setting, in the order problems are reported. `fallback` is the default of an optional
 * setting, used when its value is missing, empty or whitespace only.
 */
const SETTINGS = [
  { key: "setlistFmApiKey", envName: "SETLISTFM_API_KEY", schema: required("SETLISTFM_API_KEY") },
  { key: "spotifyClientId", envName: "SPOTIFY_CLIENT_ID", schema: required("SPOTIFY_CLIENT_ID") },
  { key: "hostSpotifyId", envName: "PLAYSET_HOST_SPOTIFY_ID", schema: required("PLAYSET_HOST_SPOTIFY_ID") },
  {
    key: "cookieSecret",
    envName: "PLAYSET_COOKIE_SECRET",
    schema: required("PLAYSET_COOKIE_SECRET").min(32, "PLAYSET_COOKIE_SECRET must be at least 32 characters."),
  },
  { key: "port", envName: "PLAYSET_WEB_PORT", schema: wholeNumber("PLAYSET_WEB_PORT", 65535), fallback: "3000" },
  { key: "dataFile", envName: "PLAYSET_WEB_DATA", schema: z.string(), fallback: "./data/playset.db" },
  { key: "previewLimit", envName: "PLAYSET_PREVIEW_LIMIT", schema: wholeNumber("PLAYSET_PREVIEW_LIMIT"), fallback: "30" },
  { key: "createLimit", envName: "PLAYSET_CREATE_LIMIT", schema: wholeNumber("PLAYSET_CREATE_LIMIT"), fallback: "10" },
  { key: "dailyLimit", envName: "PLAYSET_DAILY_LIMIT", schema: wholeNumber("PLAYSET_DAILY_LIMIT"), fallback: "200" },
  {
    key: "trustProxy",
    envName: "PLAYSET_TRUST_PROXY",
    schema: z.enum(["0", "1"], "PLAYSET_TRUST_PROXY must be 0 or 1.").transform((value) => value === "1"),
    fallback: "0",
  },
] as const satisfies ReadonlyArray<{
  key: keyof WebConfig;
  envName: string;
  schema: z.ZodType<unknown, string>;
  fallback?: string;
}>;

/** Reads and checks the config. @throws WebConfigError naming every problem in the settings' order. */
export function readWebConfig(env: Env): WebConfig {
  const values: Record<string, unknown> = {};
  const problems: string[] = [];
  for (const setting of SETTINGS) {
    const trimmed = (env[setting.envName] ?? "").trim();
    const raw = trimmed === "" && "fallback" in setting ? setting.fallback : trimmed;
    const result = setting.schema.safeParse(raw);
    if (result.success) values[setting.key] = result.data;
    else problems.push(result.error.issues[0]!.message);
  }
  if (problems.length > 0) throw new WebConfigError(problems);
  return values as unknown as WebConfig;
}
