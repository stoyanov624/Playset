// Static checks of the client's style sheets and HTML page: only design tokens in component
// styles, the token values of the design lock in light and dark, motion off when asked, none
// of the banned text styles, nothing loaded from another origin, and the page's head.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Vitest runs from the repository root (jsdom gives import.meta.url a non-file scheme).
const CLIENT_DIR = join(process.cwd(), "src", "web", "client");
const TOKENS_FILE = join(CLIENT_DIR, "styles", "tokens.css");
const INDEX_HTML = join(CLIENT_DIR, "index.html");

function filesUnder(dir: string, keep: (file: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return filesUnder(path, keep);
    return keep(path) ? [path] : [];
  });
}

function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** The bodies of every block opened by a match of `opener`, braces balanced. */
function blocks(css: string, opener: RegExp): string[] {
  const found: string[] = [];
  const pattern = new RegExp(opener.source, "gi");
  for (let match = pattern.exec(css); match; match = pattern.exec(css)) {
    const open = css.indexOf("{", match.index + match[0].length);
    if (open === -1) continue;
    let depth = 0;
    for (let i = open; i < css.length; i++) {
      if (css[i] === "{") depth += 1;
      if (css[i] === "}") depth -= 1;
      if (depth === 0) {
        found.push(css.slice(open + 1, i));
        break;
      }
    }
  }
  return found;
}

/** The declarations (property and value) in a style sheet. */
function declarations(css: string): Array<{ property: string; value: string }> {
  const list: Array<{ property: string; value: string }> = [];
  const pattern = /([-a-zA-Z]+)\s*:\s*([^;{}]+)(?=[;}])/g;
  for (let match = pattern.exec(css); match; match = pattern.exec(css)) {
    list.push({ property: (match[1] ?? "").toLowerCase(), value: (match[2] ?? "").trim() });
  }
  return list;
}

/** What a component style sheet may not contain: raw colours, raw px, raw shadows or font names. */
function componentStyleProblems(css: string): string[] {
  const problems: string[] = [];
  for (const { property, value } of declarations(withoutComments(css))) {
    const line = `${property}: ${value}`;
    if (/#[0-9a-fA-F]{3,8}\b/.test(value)) problems.push(`hex colour in "${line}"`);
    if (/\b(rgba?|hsla?)\(/i.test(value)) problems.push(`rgb/hsl colour in "${line}"`);
    for (const px of value.matchAll(/(-?\d*\.?\d+)px\b/g)) {
      const amount = Number(px[1]);
      if (amount !== 0 && amount !== 1) problems.push(`raw px in "${line}"`);
    }
    if (property === "box-shadow" && !/^(none|var\(--[-\w]+\))$/.test(value)) problems.push(`raw shadow in "${line}"`);
    if (property === "font-family" && !/^(inherit|var\(--[-\w]+\))$/.test(value)) problems.push(`raw font in "${line}"`);
  }
  return problems;
}

/** What no style sheet may contain: banned text styles and anything from another origin. */
function anyStyleProblems(css: string): string[] {
  const problems: string[] = [];
  const text = withoutComments(css);
  if (/text-overflow\s*:\s*ellipsis/i.test(text)) problems.push("text-overflow: ellipsis");
  if (/-webkit-line-clamp/i.test(text)) problems.push("-webkit-line-clamp");
  if (/white-space\s*:\s*nowrap/i.test(text)) problems.push("white-space: nowrap");
  if (/text-align\s*:\s*(center|justify)/i.test(text)) problems.push("text-align: center/justify");
  if (/url\(\s*['"]?\s*(https?:)?\/\//i.test(text)) problems.push("url() from another origin");
  if (/@import\s+(url\()?\s*['"]?\s*(https?:)?\/\//i.test(text)) problems.push("@import from another origin");
  return problems;
}

function componentStyleSheets(): string[] {
  return filesUnder(CLIENT_DIR, (file) => file.endsWith(".css") && file !== TOKENS_FILE);
}

/** Every style rule (selector list and body), looking inside @media, @supports and @layer blocks. */
function ruleSets(css: string): Array<{ selectors: string[]; body: string }> {
  const rules: Array<{ selectors: string[]; body: string }> = [];
  const text = withoutComments(css);
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "{") continue;
    const prelude = text.slice(start, i).trim();
    let depth = 0;
    let end = i;
    for (; end < text.length; end++) {
      if (text[end] === "{") depth += 1;
      if (text[end] === "}") depth -= 1;
      if (depth === 0) break;
    }
    const body = text.slice(i + 1, end);
    if (/^@(media|supports|layer|container)\b/i.test(prelude)) rules.push(...ruleSets(body));
    else if (!prelude.startsWith("@")) rules.push({ selectors: prelude.split(",").map((part) => part.trim()), body });
    start = end + 1;
    i = end;
  }
  return rules;
}

/** Specificity [ids, classes/attributes/pseudo-classes, elements] of one selector. */
function specificity(selector: string): [number, number, number] {
  let rest = selector.replace(/:where\([^)]*\)/g, "").replace(/:(not|is|has)\(([^)]*)\)/g, " $2");
  const ids = (rest.match(/#[-\w]+/g) ?? []).length;
  rest = rest.replace(/#[-\w]+/g, "");
  const pseudoElements = (rest.match(/::[-\w]+/g) ?? []).length;
  rest = rest.replace(/::[-\w]+/g, "");
  const classes = (rest.match(/\.[-\w]+|\[[^\]]*\]|:[-\w]+/g) ?? []).length;
  rest = rest.replace(/\.[-\w]+|\[[^\]]*\]|:[-\w]+/g, "");
  const elements = (rest.match(/(^|[\s>+~])[a-zA-Z][-\w]*/g) ?? []).length + pseudoElements;
  return [ids, classes, elements];
}

function beats(a: [number, number, number], b: [number, number, number]): boolean {
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}

function setsColour(body: string): string | undefined {
  return declarations(body).find((d) => d.property === "color")?.value;
}

// ---------------------------------------------------------------- the checks themselves

describe("style sheet checks", () => {
  it.each([
    ["a hex colour", ".row { color: #B5135F; }"],
    ["a px padding", ".row { padding: 16px; }"],
    ["a px radius", ".button { border-radius: 4px; }"],
    ["an rgb colour", ".row { background: rgb(0 0 0 / 50%); }"],
    ["a raw shadow", ".bar { box-shadow: 4px 4px 0 black; }"],
  ])("AC-55: %s in a component style sheet fails", (_kind, css) => {
    expect(componentStyleProblems(css)).not.toEqual([]);
  });

  it("AC-55: tokens, 0 and 1px hairlines pass in a component style sheet", () => {
    expect(
      componentStyleProblems(
        ".row { padding: var(--space-4); border-bottom: 1px solid var(--color-rule); margin: 0; box-shadow: var(--shadow-bar); font-family: var(--font-text); }",
      ),
    ).toEqual([]);
  });

  it("AC-55: the rule scanner reads rules inside media blocks and ranks selectors by specificity", () => {
    const rules = ruleSets(".a:hover { color: var(--color-on-spike); } @media (hover: hover) { main a:hover, .x { color: red; } }");
    expect(rules.map((rule) => rule.selectors)).toEqual([[".a:hover"], ["main a:hover", ".x"]]);
    expect(specificity(".primary:hover")).toEqual([0, 2, 0]);
    expect(specificity("a:hover")).toEqual([0, 1, 1]);
    expect(specificity(".content a:hover")).toEqual([0, 2, 1]);
    expect(beats(specificity(".content a:hover"), specificity(".primary:hover"))).toBe(true);
    expect(beats(specificity("a:hover"), specificity(".primary:hover"))).toBe(false);
  });

  it.each([
    ["ellipsis", ".name { text-overflow: ellipsis; }"],
    ["a line clamp", ".name { -webkit-line-clamp: 2; }"],
    ["nowrap", ".name { white-space: nowrap; }"],
    ["centred text", ".body { text-align: center; }"],
    ["a font from Google", '@import url("https://fonts.googleapis.com/css2?family=Inter");'],
  ])("AC-55: %s fails in any style sheet", (_kind, css) => {
    expect(anyStyleProblems(css)).not.toEqual([]);
  });
});

// ---------------------------------------------------------------- the client's style sheets

const LIGHT_AND_DARK: Array<[string, string, string]> = [
  ["--color-paper", "#F2F4F7", "#1B2130"],
  ["--color-ink", "#1A2233", "#E9EDF3"],
  ["--color-ink-soft", "#4B5568", "#A9B2C1"],
  ["--color-rule", "#C9CFD8", "#3A4356"],
  ["--color-spike", "#B5135F", "#FF7EB8"],
  ["--color-caution", "#8A5300", "#F2B455"],
  ["--color-on-spike", "#FFFFFF", "#1B2130"],
  ["--color-spike-hover", "#961656", "#FF9ECA"],
  ["--color-sunk", "#E7E9ED", "#252B3A"],
  ["--color-caution-tint", "#E8E4DE", "#303034"],
  ["--color-spike-tint", "#EDE2EB", "#2D283B"],
];

function declares(css: string, token: string, value: string): boolean {
  const escaped = token.replace(/[-]/g, "\\-");
  return new RegExp(`${escaped}\\s*:\\s*${value}\\s*[;}]`, "i").test(css);
}

describe("the client's style sheets", () => {
  it("AC-55: the tokens file holds every colour token's light value outside the dark-scheme block", () => {
    const css = withoutComments(readFileSync(TOKENS_FILE, "utf8"));
    const dark = blocks(css, /@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)/);
    const light = dark.reduce((rest, block) => rest.replace(block, ""), css);
    for (const [token, lightValue] of LIGHT_AND_DARK) {
      expect(declares(light, token, lightValue), `${token}: ${lightValue}`).toBe(true);
    }
  });

  it("AC-55: the tokens file holds every colour token's dark value under prefers-color-scheme: dark", () => {
    const css = withoutComments(readFileSync(TOKENS_FILE, "utf8"));
    const dark = blocks(css, /@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)/).join("\n");
    expect(dark).not.toBe("");
    for (const [token, , darkValue] of LIGHT_AND_DARK) {
      expect(declares(dark, token, darkValue), `${token}: ${darkValue}`).toBe(true);
    }
  });

  it("AC-55: the tokens file turns both durations to 0ms under prefers-reduced-motion: reduce", () => {
    const css = withoutComments(readFileSync(TOKENS_FILE, "utf8"));
    const reduced = blocks(css, /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/).join("\n");
    expect(declares(reduced, "--dur-quick", "0ms")).toBe(true);
    expect(declares(reduced, "--dur-reveal", "0ms")).toBe(true);
    expect(declares(css, "--dur-quick", "120ms")).toBe(true);
    expect(declares(css, "--dur-reveal", "240ms")).toBe(true);
  });

  it("AC-55: component style sheets use only tokens for colours, sizes, shadows and fonts", () => {
    const sheets = componentStyleSheets();
    expect(sheets.length).toBeGreaterThan(0);
    const problems = sheets.flatMap((file) =>
      componentStyleProblems(readFileSync(file, "utf8")).map((problem) => `${relative(CLIENT_DIR, file)}: ${problem}`),
    );
    expect(problems).toEqual([]);
  });

  it("AC-55: no style sheet truncates, centres or justifies text, or loads from another origin", () => {
    const sheets = [TOKENS_FILE, ...componentStyleSheets()];
    expect(existsSync(TOKENS_FILE)).toBe(true);
    const problems = sheets.flatMap((file) =>
      anyStyleProblems(readFileSync(file, "utf8")).map((problem) => `${relative(CLIENT_DIR, file)}: ${problem}`),
    );
    expect(problems).toEqual([]);
  });

  it("AC-55: the primary button keeps on-spike text on hover, and no link hover rule outranks it", () => {
    const rules = [TOKENS_FILE, ...componentStyleSheets()].flatMap((file) =>
      ruleSets(readFileSync(file, "utf8")).map((rule) => ({ ...rule, file: relative(CLIENT_DIR, file) })),
    );
    const primaryHover = rules.flatMap((rule) =>
      rule.selectors
        .filter((selector) => /primary/i.test(selector) && /:hover/.test(selector))
        .map((selector) => ({ selector, colour: setsColour(rule.body), file: rule.file })),
    );
    expect(primaryHover.length, "a hover rule for the primary button variant").toBeGreaterThan(0);
    for (const { selector, colour, file } of primaryHover) {
      expect(colour, `${file}: ${selector}`).toBe("var(--color-on-spike)");
    }

    const weakest = primaryHover.map(({ selector }) => specificity(selector)).reduce((a, b) => (beats(a, b) ? b : a));
    const linkHoverOverrides = rules.flatMap((rule) => {
      const colour = setsColour(rule.body);
      if (colour === undefined || colour === "var(--color-on-spike)") return [];
      return rule.selectors
        .filter((selector) => /(^|[\s>+~])a(?![-\w])[^\s>+~]*:hover/.test(selector) && !/primary/i.test(selector))
        .filter((selector) => !beats(weakest, specificity(selector)))
        .map((selector) => `${rule.file}: ${selector} { color: ${colour} }`);
    });
    expect(linkHoverOverrides).toEqual([]);
  });

  it("AC-55: the fonts come from the bundled Fontsource packages", () => {
    const sources = filesUnder(CLIENT_DIR, (file) => /\.(tsx?|css)$/.test(file)).map((file) => readFileSync(file, "utf8"));
    const all = sources.join("\n");
    expect(all).toMatch(/['"]@fontsource-variable\/big-shoulders-display['"]/);
    expect(all).toMatch(/['"]@fontsource-variable\/atkinson-hyperlegible-next['"]/);
    expect(all).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
  });
});

// ---------------------------------------------------------------- HTML page

describe("HTML page", () => {
  function page(): Document {
    return new DOMParser().parseFromString(readFileSync(INDEX_HTML, "utf8"), "text/html");
  }

  it("AC-56: html is lang en with the viewport meta and the title Playset", () => {
    const doc = page();
    expect(doc.documentElement.getAttribute("lang")).toBe("en");
    const viewport = doc.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? "";
    expect(viewport.split(",").map((part) => part.trim())).toEqual(
      expect.arrayContaining(["width=device-width", "initial-scale=1"]),
    );
    expect(doc.title).toBe("Playset");
  });

  it("AC-56: has a light and a dark theme-color", () => {
    const metas = Array.from(page().querySelectorAll('meta[name="theme-color"]')).map((meta) => ({
      content: meta.getAttribute("content")?.toUpperCase(),
      media: meta.getAttribute("media")?.replace(/\s+/g, ""),
    }));
    expect(metas).toHaveLength(2);
    expect(metas).toEqual(
      expect.arrayContaining([
        { content: "#F2F4F7", media: "(prefers-color-scheme:light)" },
        { content: "#1B2130", media: "(prefers-color-scheme:dark)" },
      ]),
    );
  });

  it("AC-56: the theme-color values in index.html match the paper colour tokens", () => {
    const themeColour = (scheme: string): string | undefined =>
      Array.from(page().querySelectorAll('meta[name="theme-color"]'))
        .find((meta) => meta.getAttribute("media")?.replace(/\s+/g, "") === `(prefers-color-scheme:${scheme})`)
        ?.getAttribute("content")
        ?.trim()
        .toUpperCase();
    const paperIn = (css: string): string | undefined =>
      /--color-paper\s*:\s*([^;}]+)/i.exec(css)?.[1]?.trim().toUpperCase();

    const css = withoutComments(readFileSync(TOKENS_FILE, "utf8"));
    const darkBlocks = blocks(css, /@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)/);
    const lightCss = darkBlocks.reduce((rest, block) => rest.replace(block, ""), css);
    const lightPaper = paperIn(lightCss);
    const darkPaper = paperIn(darkBlocks.join("\n"));

    expect(lightPaper).toMatch(/^#[0-9A-F]{3,8}$/);
    expect(darkPaper).toMatch(/^#[0-9A-F]{3,8}$/);
    expect(themeColour("light")).toBe(lightPaper);
    expect(themeColour("dark")).toBe(darkPaper);
  });

  it("AC-56: loads no script or style sheet from another origin, and its entry is main.tsx", () => {
    const doc = page();
    const sources = [
      ...Array.from(doc.querySelectorAll("script[src]")).map((el) => el.getAttribute("src") ?? ""),
      ...Array.from(doc.querySelectorAll("link[href]")).map((el) => el.getAttribute("href") ?? ""),
    ];
    for (const source of sources) expect(source).not.toMatch(/^(https?:)?\/\//i);
    const entry = Array.from(doc.querySelectorAll('script[type="module"]')).map((el) => el.getAttribute("src") ?? "");
    expect(entry.some((src) => /(^|\/)main\.tsx$/.test(src))).toBe(true);
  });
});
