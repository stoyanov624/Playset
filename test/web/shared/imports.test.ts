// The contract ships to the browser: each of its files imports only zod or another file of
// the contract. This is the one test that reads the contract's source text (its import lines).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const contractDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../src/web/shared");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(?:[cm]?[jt]sx?)$/.test(entry) ? [full] : [];
  });
}

/** Every module specifier in static imports, re-exports, side-effect imports, import() and require(). */
function importSpecifiers(source: string): string[] {
  const patterns = [
    /\b(?:import|export)\s[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
    /\brequire\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
  ];
  return patterns.flatMap((pattern) => [...source.matchAll(pattern)].map((m) => m[1] ?? ""));
}

function isAllowed(file: string, specifier: string): boolean {
  if (specifier === "zod" || specifier.startsWith("zod/")) return true;
  if (!specifier.startsWith(".")) return false;
  const target = resolve(dirname(file), specifier);
  const inside = relative(contractDir, target);
  return inside !== "" && !inside.startsWith("..");
}

describe("contract imports", () => {
  it("AC-26: the contract has an index file", () => {
    const names = sourceFiles(contractDir).map((f) => relative(contractDir, f));
    expect(names).toContain("index.ts");
  });

  it("AC-26: each file imports only zod or another file of the contract", () => {
    const files = sourceFiles(contractDir);
    expect(files.length).toBeGreaterThan(0);
    const offending: string[] = [];
    for (const file of files) {
      for (const specifier of importSpecifiers(readFileSync(file, "utf8"))) {
        if (!isAllowed(file, specifier)) offending.push(`${relative(contractDir, file)} → ${specifier}`);
      }
    }
    expect(offending).toEqual([]);
  });

  it("AC-26: the import check catches Node built-ins, the server, the client and the core", () => {
    const file = join(contractDir, "schemas.ts");
    const source = [
      'import { randomUUID } from "node:crypto";',
      "import fs from 'fs';",
      'import express from "express";',
      'import { createApp } from "../server/index.js";',
      'export { App } from "../client/app.js";',
      'import type { Performance } from "../../core/performances/index.js";',
      'const lazy = await import("node:path");',
      'import { z } from "zod";',
      'import { ROUTES } from "./routes.js";',
    ].join("\n");
    const rejected = importSpecifiers(source).filter((s) => !isAllowed(file, s));
    expect(rejected).toEqual([
      "node:crypto",
      "fs",
      "express",
      "../server/index.js",
      "../client/app.js",
      "../../core/performances/index.js",
      "node:path",
    ]);
  });
});
