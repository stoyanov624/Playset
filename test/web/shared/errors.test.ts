// The error body `{ error: { code, message, hint? } }` and the preview stream's error event
// data (examples X2 and the end of X7).
import { describe, expect, it } from "vitest";
import {
  ERROR_CODES,
  apiErrorSchema,
  errorBodySchema,
  previewErrorSchema,
} from "../../../src/web/shared/index.js";

const tooManyPlaylists = {
  error: {
    code: "RATE_LIMITED",
    message: "Too many playlists from here in the last hour.",
    hint: "Try again in a few minutes.",
  },
};

describe("error body", () => {
  it("AC-3: an error body with a known code, a message and a hint parses unchanged", () => {
    expect(errorBodySchema.parse(tooManyPlaylists)).toEqual(tooManyPlaylists);
  });

  it("AC-3: an error body without a hint parses unchanged", () => {
    const notFound = { error: { code: "NOT_FOUND", message: "setlist.fm has no Setlist with that id." } };
    expect(errorBodySchema.parse(notFound)).toEqual(notFound);
  });

  it("AC-3: each of the 8 error codes parses", () => {
    for (const code of ERROR_CODES) {
      expect(errorBodySchema.safeParse({ error: { code, message: "Something happened." } }).success).toBe(true);
      expect(apiErrorSchema.safeParse({ code, message: "Something happened." }).success).toBe(true);
    }
  });

  it.each([
    ["an unknown code", { error: { code: "TEAPOT", message: "x" } }],
    ["a lower-case code", { error: { code: "internal", message: "x" } }],
    ["an empty message", { error: { code: "INTERNAL", message: "" } }],
    ["a missing message", { error: { code: "INTERNAL" } }],
    ["a missing code", { error: { message: "Something went wrong on our side." } }],
    ["an empty hint", { error: { code: "INTERNAL", message: "Something went wrong on our side.", hint: "" } }],
    ["a null hint", { error: { code: "INTERNAL", message: "Something went wrong on our side.", hint: null } }],
    ["a stack on the inner error", { error: { code: "INTERNAL", message: "Something went wrong on our side.", stack: "Error: at …" } }],
    ["a cause on the inner error", { error: { code: "INTERNAL", message: "Something went wrong on our side.", cause: "ECONNRESET" } }],
    ["a status on the body", { error: { code: "UPSTREAM_UNAVAILABLE", message: "setlist.fm isn't answering right now." }, status: 503 }],
    ["a bare error without the wrapper", { code: "INTERNAL", message: "Something went wrong on our side." }],
  ])("AC-3: rejects an error body with %s", (_why, body) => {
    expect(errorBodySchema.safeParse(body).success).toBe(false);
  });

  it("AC-3: the inner error schema rejects an unknown key and a null hint", () => {
    expect(apiErrorSchema.safeParse({ code: "INTERNAL", message: "x", status: 500 }).success).toBe(false);
    expect(apiErrorSchema.safeParse({ code: "INTERNAL", message: "x", hint: null }).success).toBe(false);
  });
});

describe("error event data", () => {
  it("AC-17: the bare { code, message, hint } parses unchanged as error-event data", () => {
    const spotifyDown = {
      code: "UPSTREAM_UNAVAILABLE",
      message: "setlist.fm isn't answering right now.",
      hint: "Try again in a minute.",
    };
    expect(previewErrorSchema.parse(spotifyDown)).toEqual(spotifyDown);
    const withoutHint = { code: "UPSTREAM_UNAVAILABLE", message: "Spotify isn't answering right now." };
    expect(previewErrorSchema.parse(withoutHint)).toEqual(withoutHint);
  });

  it("AC-17: the wrapped error body is rejected as error-event data", () => {
    const wrapped = { error: { code: "UPSTREAM_UNAVAILABLE", message: "setlist.fm isn't answering right now." } };
    expect(previewErrorSchema.safeParse(wrapped).success).toBe(false);
  });

  it.each([
    ["an unknown code", { code: "TEAPOT", message: "x" }],
    ["an empty message", { code: "INTERNAL", message: "" }],
    ["an empty hint", { code: "INTERNAL", message: "x", hint: "" }],
    ["a null hint", { code: "INTERNAL", message: "x", hint: null }],
    ["an unknown key", { code: "INTERNAL", message: "x", stack: "Error: at …" }],
  ])("AC-17: rejects error-event data with %s", (_why, data) => {
    expect(previewErrorSchema.safeParse(data).success).toBe(false);
  });
});
