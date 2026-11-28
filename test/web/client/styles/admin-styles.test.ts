// The admin page's own style sheets: each one its screens import is a client style sheet the
// style checks scan, and none of them uses a raw colour, raw px or a banned text style.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Vitest runs from the repository root (jsdom gives import.meta.url a non-file scheme).
const CLIENT_DIR = join(process.cwd(), "src", "web", "client");
const SCREENS_DIR = join(CLIENT_DIR, "screens");

/** The module style sheets the admin screen files import, as paths under the client folder. */
function adminStyleSheets(): string[] {
  const screens = readdirSync(SCREENS_DIR).filter((name) => /^Admin\w*\.tsx$/.test(name));
  const sheets = new Set<string>();
  for (const name of screens) {
    const source = readFileSync(join(SCREENS_DIR, name), "utf8");
    for (const match of source.matchAll(/from "(\.{1,2}\/[\w./-]+\.module\.css)"/g)) {
      sheets.add(relative(CLIENT_DIR, join(SCREENS_DIR, match[1] ?? "")).split("\\").join("/"));
    }
  }
  return [...sheets].sort();
}

function declarations(css: string): Array<{ property: string; value: string }> {
  const list: Array<{ property: string; value: string }> = [];
  const pattern = /([-a-zA-Z]+)\s*:\s*([^;{}]+)(?=[;}])/g;
  for (let match = pattern.exec(css); match; match = pattern.exec(css)) {
    list.push({ property: (match[1] ?? "").toLowerCase(), value: (match[2] ?? "").trim() });
  }
  return list;
}

function problems(css: string): string[] {
  const found: string[] = [];
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const { property, value } of declarations(text)) {
    const line = `${property}: ${value}`;
    if (/#[0-9a-fA-F]{3,8}\b/.test(value)) found.push(`hex colour in "${line}"`);
    if (/\b(rgba?|hsla?)\(/i.test(value)) found.push(`rgb/hsl colour in "${line}"`);
    for (const px of value.matchAll(/(-?\d*\.?\d+)px\b/g)) {
      if (Number(px[1]) !== 0 && Number(px[1]) !== 1) found.push(`raw px in "${line}"`);
    }
  }
  if (/text-overflow\s*:\s*ellipsis/i.test(text)) found.push("text-overflow: ellipsis");
  if (/white-space\s*:\s*nowrap/i.test(text)) found.push("white-space: nowrap");
  if (/text-align\s*:\s*(center|justify)/i.test(text)) found.push("text-align: center/justify");
  return found;
}

describe("admin style sheets", () => {
  it("AC-21: the admin screens import their own module style sheets, all in the client's screens folder", () => {
    const sheets = adminStyleSheets();
    expect(sheets.length).toBeGreaterThan(0);
    for (const sheet of sheets) {
      expect(sheet.startsWith("screens/"), sheet).toBe(true);
      expect(existsSync(join(CLIENT_DIR, sheet)), sheet).toBe(true);
    }
  });

  it("AC-21: no admin style sheet uses a raw colour, raw px or a banned text style", () => {
    const found = adminStyleSheets().flatMap((sheet) =>
      problems(readFileSync(join(CLIENT_DIR, sheet), "utf8")).map((problem) => `${sheet}: ${problem}`),
    );
    expect(found).toEqual([]);
  });
});
