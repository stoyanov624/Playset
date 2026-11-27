// The contract's constants: route paths, error codes, preview event names, limits and the
// admin status config labels (examples X1).
import { describe, expect, it } from "vitest";
import { CONFIG_ITEMS, ERROR_CODES, LIMITS, PREVIEW_EVENTS, ROUTES } from "../../../src/web/shared/index.js";

describe("route paths", () => {
  it("AC-1: each route key has exactly the path of the Routes table and there are no other keys", () => {
    expect(ROUTES).toEqual({
      artists: "/api/artists",
      artistSetlists: "/api/artists/:mbid/setlists",
      setlistLinks: "/api/setlist-links",
      setlist: "/api/setlists/:id",
      setlistPreview: "/api/setlists/:id/preview",
      setlistPlaylist: "/api/setlists/:id/playlist",
      adminLogin: "/admin/login",
      adminCallback: "/admin/callback",
      adminStatus: "/api/admin/status",
      adminLogout: "/api/admin/logout",
    });
    expect(Object.keys(ROUTES)).toHaveLength(10);
  });
});

describe("error codes, preview event names, limits and config labels", () => {
  it("AC-2: the error codes are exactly the 8 codes, in order", () => {
    expect([...ERROR_CODES]).toEqual([
      "INVALID_INPUT",
      "NOT_FOUND",
      "RATE_LIMITED",
      "UPSTREAM_UNAVAILABLE",
      "PLAYLISTS_UNAVAILABLE",
      "SETLIST_CHANGED",
      "NOT_ADMIN",
      "INTERNAL",
    ]);
  });

  it("AC-2: the preview event names are progress, preview and error", () => {
    expect(PREVIEW_EVENTS).toEqual({ progress: "progress", preview: "preview", error: "error" });
  });

  it("AC-2: the limits are 200, 2048, 64, 1000, 1, 10 and 30", () => {
    expect(LIMITS).toEqual({
      artistNameMaxLength: 200,
      setlistLinkMaxLength: 2048,
      versionIdMaxLength: 64,
      pageMax: 1000,
      pageDefault: 1,
      topArtistsMax: 10,
      usageDays: 30,
    });
  });

  it("AC-2: the config items are the four human-readable labels, in order, and no env name", () => {
    expect([...CONFIG_ITEMS]).toEqual(["setlist.fm API key", "Spotify client id", "Host Account id", "Cookie secret"]);
    for (const envName of ["SETLISTFM_API_KEY", "SPOTIFY_CLIENT_ID", "PLAYSET_HOST_SPOTIFY_ID"]) {
      expect(CONFIG_ITEMS).not.toContain(envName);
    }
  });
});
