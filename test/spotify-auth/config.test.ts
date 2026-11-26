import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  InvalidPortError,
  MissingClientIdError,
  getAccessToken,
  resolveClientId,
  resolveRedirectUri,
} from "../../src/core/spotify-auth";
import {
  CLIENT_ID,
  CONFIG_FILE,
  CONFIG_FILE_CLIENT_ID,
  DEFAULT_REDIRECT_URI,
  NOW,
  captureError,
  captureSyncError,
  errorText,
  makeFakeFetch,
  makeFakeLoginHooks,
  makeTempRoot,
  removeTempRoot,
  writeConfigFile,
} from "./helpers";

let root: string;
let configDir: string;

beforeEach(async () => {
  root = await makeTempRoot();
  configDir = join(root, "playset");
});

afterEach(async () => {
  await removeTempRoot(root);
});

describe("Spotify client id", () => {
  it("AC-1: uses SPOTIFY_CLIENT_ID from the environment even when the config file also holds a client id", async () => {
    await writeConfigFile(configDir, JSON.stringify({ spotifyClientId: CONFIG_FILE_CLIENT_ID }));
    const clientId = await resolveClientId({ env: { SPOTIFY_CLIENT_ID: CLIENT_ID }, configDir });
    expect(clientId).toBe(CLIENT_ID);
  });

  it("AC-1: uses SPOTIFY_CLIENT_ID from the environment when there is no config file", async () => {
    const clientId = await resolveClientId({ env: { SPOTIFY_CLIENT_ID: CLIENT_ID }, configDir });
    expect(clientId).toBe(CLIENT_ID);
  });

  it("AC-2: uses spotifyClientId from the config file when SPOTIFY_CLIENT_ID is unset", async () => {
    await writeConfigFile(configDir, JSON.stringify({ spotifyClientId: CONFIG_FILE_CLIENT_ID }));
    const clientId = await resolveClientId({ env: {}, configDir });
    expect(clientId).toBe(CONFIG_FILE_CLIENT_ID);
  });

  it("AC-2: uses spotifyClientId from the config file when SPOTIFY_CLIENT_ID is empty", async () => {
    await writeConfigFile(configDir, JSON.stringify({ spotifyClientId: CONFIG_FILE_CLIENT_ID }));
    const clientId = await resolveClientId({ env: { SPOTIFY_CLIENT_ID: "" }, configDir });
    expect(clientId).toBe(CONFIG_FILE_CLIENT_ID);
  });

  const missingCases: Array<[string, string | null]> = [
    ["the config file is missing", null],
    ["the config file has no spotifyClientId", JSON.stringify({ setlistfmApiKey: "xyz" })],
    ["the config file has an empty spotifyClientId", JSON.stringify({ spotifyClientId: "" })],
    ["the config file is not valid JSON", "{not json"],
  ];

  for (const [label, content] of missingCases) {
    it(`AC-3: raises a missing-client-id error when SPOTIFY_CLIENT_ID is unset and ${label}`, async () => {
      if (content !== null) await writeConfigFile(configDir, content);
      const err = await captureError(resolveClientId({ env: {}, configDir }));
      expect(err).toBeInstanceOf(MissingClientIdError);
    });
  }

  it("AC-3: the missing-client-id hint names SPOTIFY_CLIENT_ID, the config file path and the redirect URI to register", async () => {
    const err = await captureError(resolveClientId({ env: { SPOTIFY_CLIENT_ID: "" }, configDir }));
    expect(err).toBeInstanceOf(MissingClientIdError);
    const hint = (err as MissingClientIdError).hint;
    expect(typeof hint).toBe("string");
    expect(hint).toContain("SPOTIFY_CLIENT_ID");
    expect(hint).toContain(join(configDir, CONFIG_FILE));
    expect(hint).toContain(DEFAULT_REDIRECT_URI);
  });

  it("AC-3: the missing-client-id hint names the redirect URI for a custom PLAYSET_AUTH_PORT", async () => {
    const err = await captureError(resolveClientId({ env: { PLAYSET_AUTH_PORT: "9090" }, configDir }));
    expect(err).toBeInstanceOf(MissingClientIdError);
    expect((err as MissingClientIdError).hint).toContain("http://127.0.0.1:9090/callback");
  });

  it("AC-3: a missing client id makes no network request and opens no authorize URL when an access token is requested", async () => {
    const { fetch } = makeFakeFetch([]);
    const hooks = makeFakeLoginHooks();
    const err = await captureError(
      getAccessToken({
        configDir,
        env: {},
        fetch,
        sleep: async () => {},
        now: () => NOW,
        openAuthorizeUrl: hooks.openAuthorizeUrl,
        startCallbackReceiver: hooks.startCallbackReceiver,
      }),
    );
    expect(err).toBeInstanceOf(MissingClientIdError);
    expect(fetch).not.toHaveBeenCalled();
    expect(hooks.openAuthorizeUrl).not.toHaveBeenCalled();
  });
});

describe("redirect URI", () => {
  it("AC-4: is exactly http://127.0.0.1:8888/callback when PLAYSET_AUTH_PORT is unset", () => {
    expect(resolveRedirectUri({})).toBe("http://127.0.0.1:8888/callback");
  });

  it("AC-5: uses PLAYSET_AUTH_PORT when it is a valid port", () => {
    expect(resolveRedirectUri({ PLAYSET_AUTH_PORT: "9090" })).toBe("http://127.0.0.1:9090/callback");
    expect(resolveRedirectUri({ PLAYSET_AUTH_PORT: "1" })).toBe("http://127.0.0.1:1/callback");
    expect(resolveRedirectUri({ PLAYSET_AUTH_PORT: "65535" })).toBe("http://127.0.0.1:65535/callback");
  });

  for (const bad of ["abc", "0", "70000", "65536", "-5", "12.5", "80abc"]) {
    it(`AC-5: raises an invalid-port error naming "${bad}" when PLAYSET_AUTH_PORT is "${bad}"`, () => {
      const err = captureSyncError(() => resolveRedirectUri({ PLAYSET_AUTH_PORT: bad }));
      expect(err).toBeInstanceOf(InvalidPortError);
      expect(errorText(err)).toContain(bad);
    });
  }

  for (const port of [undefined, "9090", "1", "65535", "8888"]) {
    it(`AC-6: the redirect URI host is 127.0.0.1 and never localhost (PLAYSET_AUTH_PORT=${String(port)})`, () => {
      const uri = resolveRedirectUri(port === undefined ? {} : { PLAYSET_AUTH_PORT: port });
      expect(new URL(uri).hostname).toBe("127.0.0.1");
      expect(uri).not.toContain("localhost");
    });
  }

  it("AC-6: the redirect URI sent in the authorize URL uses 127.0.0.1, never localhost", async () => {
    const { fetch } = makeFakeFetch([]);
    const hooks = makeFakeLoginHooks(() => ({ error: "access_denied" }));
    await captureError(
      getAccessToken({
        configDir,
        env: { SPOTIFY_CLIENT_ID: CLIENT_ID, PLAYSET_AUTH_PORT: "9090" },
        fetch,
        sleep: async () => {},
        now: () => NOW,
        openAuthorizeUrl: hooks.openAuthorizeUrl,
        startCallbackReceiver: hooks.startCallbackReceiver,
      }),
    );
    const opened = hooks.openedUrls[0];
    expect(opened).toBeDefined();
    const redirectUri = new URL(opened!).searchParams.get("redirect_uri");
    expect(redirectUri).toBe("http://127.0.0.1:9090/callback");
    expect(opened).not.toContain("localhost");
    expect(hooks.receiverRedirectUris).toEqual(["http://127.0.0.1:9090/callback"]);
  });
});
