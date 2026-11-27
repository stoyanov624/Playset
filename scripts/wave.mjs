#!/usr/bin/env node
// Prints the Slices of the current Wave, one `NNNN-slug` per line: every Slice in
// docs/PLAN.md that has a brief id, is not built yet, and whose dependencies are all built.
// "Built" is read from origin/main: the Slice's PRD says `Status: Implemented`
// (a design Slice: docs/design.md says `Status: Approved`).
import { execFileSync } from "node:child_process";

const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
const REF = process.env.RALPH_REF ?? "origin/main";
const onMain = (path) => { try { return git("show", `${REF}:${path}`); } catch { return null; } };

const plan = onMain("docs/PLAN.md");
if (!plan) { console.error(`docs/PLAN.md not found on ${REF}`); process.exit(2); }

// | # | Slice | Id | Depends on |
const rows = plan.split("\n")
  .map((l) => l.split("|").map((c) => c.trim()))
  .filter((c) => c.length >= 6 && /^\d+$/.test(c[1]))
  .map((c) => ({ n: c[1], id: c[3].replace(/`/g, ""), deps: (c[4].match(/\d+/g) ?? []) }));

const status = (text) => text?.match(/^Status:\s*(\w+)/m)?.[1];
const isBuilt = (row) => {
  if (!row.id) return false;
  const brief = onMain(`docs/briefs/${row.id}.md`);
  if (brief && /^Kind:\s*design/m.test(brief)) return status(onMain("docs/design.md")) === "Approved";
  return status(onMain(`docs/prd/${row.id}.md`)) === "Implemented";
};

const byN = new Map(rows.map((r) => [r.n, r]));
for (const row of rows) {
  if (!row.id || isBuilt(row)) continue;
  if (row.deps.every((d) => byN.has(d) && isBuilt(byN.get(d)))) console.log(row.id);
}
