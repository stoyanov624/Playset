// The create-or-update body and answer (examples X8).
import { describe, expect, it } from "vitest";
import {
  createPlaylistBodySchema,
  createPlaylistResponseSchema,
  versionIdSchema,
} from "../../../src/web/shared/index.js";
import { SHARE_URL } from "./fixtures/contract-values";

describe("create body", () => {
  it.each([
    [{ versionId: "g4bd1a2f6" }],
    [{ versionId: "G4BD1A2F6" }],
    [{ versionId: "x".repeat(64) }],
    [{ versionId: "a" }],
  ])("AC-18: %j parses unchanged (the version is opaque, not lower-cased)", (body) => {
    expect(createPlaylistBodySchema.parse(body)).toEqual(body);
    expect(versionIdSchema.parse(body.versionId)).toBe(body.versionId);
  });

  it.each([
    ["no versionId", {}],
    ["an empty versionId", { versionId: "" }],
    ["a versionId of 65 characters", { versionId: "x".repeat(65) }],
    ["a space inside the versionId", { versionId: "g4bd 1a2f6" }],
    ["a leading space in the versionId", { versionId: " g4bd1a2f6" }],
    ["a tab in the versionId", { versionId: "g4bd1a2f6\t" }],
    ["a number versionId", { versionId: 42 }],
    ["a null versionId", { versionId: null }],
    ["a public key", { versionId: "g4bd1a2f6", public: false }],
    ["a setlistId key", { versionId: "g4bd1a2f6", setlistId: "2bf1c8e4" }],
    ["an array body", ["g4bd1a2f6"]],
    ["a string body", "g4bd1a2f6"],
    ["a null body", null],
  ])("AC-18: rejects a create body with %s", (_why, body) => {
    expect(createPlaylistBodySchema.safeParse(body).success).toBe(false);
  });
});

describe("create answer", () => {
  it.each([
    [{ url: SHARE_URL, status: "created" }],
    [{ url: "https://open.spotify.com/playlist/6QrStUvWxYzAbCdEfGhIjK", status: "updated" }],
  ])("AC-19: %j parses unchanged", (answer) => {
    expect(createPlaylistResponseSchema.parse(answer)).toEqual(answer);
  });

  it.each([
    ["status current", { url: SHARE_URL, status: "current" }],
    ["no status", { url: SHARE_URL }],
    ["no url", { status: "created" }],
    ["a spotify: URI", { url: "spotify:playlist:5PqRsTuVwXyZaBcDeFgHiJ", status: "created" }],
    ["a share link with a query string", { url: `${SHARE_URL}?si=abc`, status: "created" }],
    ["a trackCount key", { url: SHARE_URL, status: "created", trackCount: 3 }],
    ["a playlistId key", { url: SHARE_URL, status: "created", playlistId: "5PqRsTuVwXyZaBcDeFgHiJ" }],
  ])("AC-19: rejects a create answer with %s", (_why, answer) => {
    expect(createPlaylistResponseSchema.safeParse(answer).success).toBe(false);
  });
});
