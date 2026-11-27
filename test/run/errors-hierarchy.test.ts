// Every error the core can raise is a PlaysetError, so a front-end can tell a "friendly" error
// (message + hint) from an unexpected one with one instanceof check instead of a hand-kept list
// of error classes. Checked by walking the core module's own exports.
import { describe, expect, it } from "vitest";
import * as core from "../../src/core/index.js";

const exported = core as unknown as Record<string, unknown>;

/** Every exported class whose name ends in "Error", except PlaysetError itself. */
const errorClasses = Object.entries(exported).filter(
  ([name, value]) => name.endsWith("Error") && name !== "PlaysetError" && typeof value === "function",
) as [string, abstract new (...args: never[]) => unknown][];

describe("core errors — one base class", () => {
  it("the core exports PlaysetError", () => {
    expect(typeof exported.PlaysetError).toBe("function");
  });

  for (const name of ["SetlistLinkError", "RunInputError", "RunCancelledError"]) {
    it(`the core exports ${name}`, () => {
      expect(typeof exported[name]).toBe("function");
    });
  }

  it("finds the core's error classes by name (sanity check of the walk)", () => {
    expect(errorClasses.length).toBeGreaterThan(10);
  });

  for (const [name, ErrorClass] of errorClasses) {
    it(`${name} is a subclass of PlaysetError`, () => {
      const base = exported.PlaysetError as abstract new (...args: never[]) => unknown;
      expect(ErrorClass.prototype instanceof base, `${name} extends PlaysetError`).toBe(true);
    });
  }

  for (const name of ["SetlistLinkError", "RunInputError", "RunCancelledError"]) {
    it(`${name} (named explicitly) is a subclass of PlaysetError`, () => {
      const ErrorClass = exported[name] as { prototype: unknown } | undefined;
      const base = exported.PlaysetError as abstract new (...args: never[]) => unknown;
      expect(ErrorClass?.prototype instanceof base).toBe(true);
    });
  }

  it("a RunCancelledError and a RunInputError are named after their class", () => {
    const RunInputError = exported.RunInputError as new (message: string) => Error;
    const RunCancelledError = exported.RunCancelledError as new (message?: string) => Error;
    expect(new RunInputError("Please give a setlist.fm link or an Artist name.").name).toBe("RunInputError");
    expect(new RunCancelledError().name).toBe("RunCancelledError");
  });
});
