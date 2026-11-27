// The admin callback query, admin page query, admin status answer and logout body (examples X9).
import { describe, expect, it } from "vitest";
import {
  ERROR_CODES,
  adminCallbackQuerySchema,
  adminLogoutBodySchema,
  adminPageQuerySchema,
  adminStatusResponseSchema,
} from "../../../src/web/shared/index.js";
import { adminStatusAnswer, changed, freshInstallAdminStatus } from "./fixtures/contract-values";

describe("admin callback query", () => {
  it.each([
    [{ code: "AQDx9-test-code", state: "q8VtG2mZ" }, { code: "AQDx9-test-code", state: "q8VtG2mZ" }],
    [{ error: "access_denied", state: "q8VtG2mZ" }, { error: "access_denied", state: "q8VtG2mZ" }],
    [
      { code: "AQDx9-test-code", state: "q8VtG2mZ", iss: "https://accounts.spotify.com" },
      { code: "AQDx9-test-code", state: "q8VtG2mZ" },
    ],
  ])("AC-20: callback query %j parses to %j (other keys dropped)", (query, parsed) => {
    expect(adminCallbackQuerySchema.parse(query)).toEqual(parsed);
  });

  it.each([
    ["no state", { code: "AQDx9-test-code" }],
    ["both code and error", { code: "AQDx9-test-code", error: "access_denied", state: "q8VtG2mZ" }],
    ["neither code nor error", { state: "q8VtG2mZ" }],
    ["an empty code", { code: "", state: "q8VtG2mZ" }],
    ["an empty error", { error: "", state: "q8VtG2mZ" }],
    ["an empty state", { code: "AQDx9-test-code", state: "" }],
    ["a code given twice (a list)", { code: ["a", "b"], state: "q8VtG2mZ" }],
  ])("AC-20: rejects a callback query with %s", (_why, query) => {
    expect(adminCallbackQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe("admin page query", () => {
  it("AC-21: an absent login parses", () => {
    expect(adminPageQuerySchema.parse({})).toEqual({});
  });

  it("AC-21: a login equal to each of the 8 error codes parses", () => {
    for (const code of ERROR_CODES) {
      expect(adminPageQuerySchema.parse({ login: code })).toEqual({ login: code });
    }
  });

  it.each([["wrong-account"], ["not_admin"], [""], [["NOT_ADMIN", "INTERNAL"]]])(
    "AC-21: rejects login %j",
    (login) => {
      expect(adminPageQuerySchema.safeParse({ login }).success).toBe(false);
    },
  );
});

describe("admin status answer", () => {
  it("AC-22: the status with all 30 days filled in parses unchanged", () => {
    expect(adminStatusResponseSchema.parse(adminStatusAnswer())).toEqual(adminStatusAnswer());
  });

  it("AC-22: a fresh install parses unchanged (not connected, no displayName, zero usage)", () => {
    expect(adminStatusResponseSchema.parse(freshInstallAdminStatus())).toEqual(freshInstallAdminStatus());
  });

  it("AC-22: 10 top Artists parse", () => {
    const ten = changed(adminStatusAnswer(), (d) => {
      d.usage.topArtists = Array.from({ length: 10 }, (_, i) => ({ artist: `Artist ${i + 1}`, playlistCount: 10 - i }));
    });
    expect(adminStatusResponseSchema.safeParse(ten).success).toBe(true);
  });

  it.each([
    ["29 days", (d: any) => { d.usage.perDay.pop(); }],
    ["31 days", (d: any) => { d.usage.perDay.push({ date: "2026-10-29", created: 0, updated: 0, opened: 0 }); }],
    ["11 top Artists", (d: any) => {
      d.usage.topArtists = Array.from({ length: 11 }, (_, i) => ({ artist: `Artist ${i + 1}`, playlistCount: 1 }));
    }],
    ["a config entry with a value", (d: any) => { d.config[0] = { name: "setlist.fm API key", present: true, value: "sfm-test-key-0f3c9a" }; }],
    ["a config name that is an env name", (d: any) => { d.config[0] = { name: "SETLISTFM_API_KEY", present: true }; }],
    ["a config name not in the list", (d: any) => { d.config[0] = { name: "Preview limit", present: true }; }],
    ["a config name in another case", (d: any) => { d.config[0] = { name: "setlist.fm api key", present: true }; }],
    ["a config present that isn't a boolean", (d: any) => { d.config[0].present = "yes"; }],
    ["a hostAccount with an id", (d: any) => { d.hostAccount = { connected: true, id: "31abcxyzhost" }; }],
    ["an empty displayName", (d: any) => { d.hostAccount.displayName = ""; }],
    ["a null displayName", (d: any) => { d.hostAccount.displayName = null; }],
    ["a top Artist with a playlistCount of 0", (d: any) => { d.usage.topArtists[0] = { artist: "Arctic Monkeys", playlistCount: 0 }; }],
    ["a top Artist with an empty name", (d: any) => { d.usage.topArtists[0].artist = ""; }],
    ["negative opens", (d: any) => { d.usage.opens = -1; }],
    ["negative playlistsMade", (d: any) => { d.usage.playlistsMade = -1; }],
    ["fractional opens", (d: any) => { d.usage.opens = 1.5; }],
    ["a day with a date that isn't YYYY-MM-DD", (d: any) => { d.usage.perDay[0].date = "28.11.2026"; }],
    ["a day with a negative count", (d: any) => { d.usage.perDay[0].created = -1; }],
    ["a day with a fractional count", (d: any) => { d.usage.perDay[1].opened = 2.5; }],
    ["negative rateLimitHitsToday", (d: any) => { d.rateLimitHitsToday = -1; }],
    ["no rateLimitHitsToday", (d: any) => { delete d.rateLimitHitsToday; }],
  ])("AC-22: rejects the admin status with %s", (_why, edit) => {
    expect(adminStatusResponseSchema.safeParse(changed(adminStatusAnswer(), edit)).success).toBe(false);
  });
});

describe("admin logout body", () => {
  it("AC-23: an absent body and {} parse", () => {
    expect(adminLogoutBodySchema.safeParse(undefined).success).toBe(true);
    expect(adminLogoutBodySchema.safeParse({}).success).toBe(true);
  });

  it.each([[{ all: true }], [{ versionId: "g4bd1a2f6" }]])("AC-23: rejects logout body %j", (body) => {
    expect(adminLogoutBodySchema.safeParse(body).success).toBe(false);
  });
});
