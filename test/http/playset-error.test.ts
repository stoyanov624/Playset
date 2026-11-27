import { describe, expect, it } from "vitest";
import { HttpError, PlaysetError } from "../../src/core/http/index.js";

describe("PlaysetError — the base for every Playset error", () => {
  it("is an Error carrying the given message", () => {
    const err = new PlaysetError("Could not reach setlist.fm");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(PlaysetError);
    expect(err.message).toBe("Could not reach setlist.fm");
  });

  it("keeps the hint it was given", () => {
    const err = new PlaysetError("No setlist.fm API key", { hint: "Set SETLISTFM_API_KEY." });
    expect(err.hint).toBe("Set SETLISTFM_API_KEY.");
  });

  it("has no hint when none is given", () => {
    expect(new PlaysetError("m").hint).toBeUndefined();
    expect(new PlaysetError("m", {}).hint).toBeUndefined();
  });

  it("keeps the cause it was given", () => {
    const cause = new TypeError("fetch failed");
    const err = new PlaysetError("Could not reach Spotify", { cause });
    expect(err.cause).toBe(cause);
  });

  it("keeps hint and cause together", () => {
    const cause = new Error("socket hang up");
    const err = new PlaysetError("Spotify answered strangely", { hint: "Try again.", cause });
    expect(err.hint).toBe("Try again.");
    expect(err.cause).toBe(cause);
  });

  it("is named PlaysetError", () => {
    expect(new PlaysetError("m").name).toBe("PlaysetError");
  });

  it("names a subclass after the subclass automatically, with no per-class name", () => {
    class SetlistNotFound extends PlaysetError {}
    const err = new SetlistNotFound("m");
    expect(err.name).toBe("SetlistNotFound");
    expect(err).toBeInstanceOf(SetlistNotFound);
    expect(err).toBeInstanceOf(PlaysetError);
  });

  it("names a class expression `class X extends PlaysetError {}` \"X\"", () => {
    const X = class X extends PlaysetError {};
    expect(new X("m").name).toBe("X");
  });

  it("names a subclass of a subclass after the most specific class", () => {
    class TokenFailure extends PlaysetError {}
    class RefreshFailure extends TokenFailure {}
    const err = new RefreshFailure("m", { hint: "h" });
    expect(err.name).toBe("RefreshFailure");
    expect(err).toBeInstanceOf(TokenFailure);
    expect(err.hint).toBe("h");
  });

  it("shows the subclass name and message when turned into text", () => {
    class MissingApiKey extends PlaysetError {}
    expect(String(new MissingApiKey("No setlist.fm API key"))).toBe("MissingApiKey: No setlist.fm API key");
  });

  it("subclasses pass hint and cause through the base constructor", () => {
    class Wrapped extends PlaysetError {
      constructor(message: string, cause: unknown) {
        super(message, { hint: "wrapped hint", cause });
      }
    }
    const cause = new Error("inner");
    const err = new Wrapped("outer", cause);
    expect(err.message).toBe("outer");
    expect(err.hint).toBe("wrapped hint");
    expect(err.cause).toBe(cause);
    expect(err.name).toBe("Wrapped");
  });
});

describe("HttpError", () => {
  it("is a PlaysetError named HttpError", () => {
    expect(HttpError.prototype).toBeInstanceOf(PlaysetError);
    expect(HttpError.name).toBe("HttpError");
  });
});
