// Every answer's headers, the body limit, unknown /api paths and the built client files (X2).
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { expectCatalogueError } from "./fixtures/catalogue";
import { A, ASSET_JS, INDEX_HTML, expectNoLeaks, makeClientDir, makeEmptyDir, makeHarness } from "./fixtures/harness";
import { genesisSearchPayload } from "./fixtures/setlists";

const CSP_DIRECTIVES: Record<string, string> = {
  "default-src": "'self'",
  "script-src": "'self'",
  "style-src": "'self'",
  "img-src": "'self' data:",
  "font-src": "'self'",
  "connect-src": "'self'",
  "object-src": "'none'",
  "base-uri": "'self'",
  "form-action": "'self'",
  "frame-ancestors": "'none'",
};

function directives(header: unknown): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of String(header).split(";")) {
    const trimmed = part.trim();
    if (trimmed === "") continue;
    const [name, ...values] = trimmed.split(/\s+/);
    map.set(name!, values.join(" "));
  }
  return map;
}

function expectSecurityHeaders(res: { headers: Record<string, unknown> }) {
  const csp = res.headers["content-security-policy"];
  expect(typeof csp).toBe("string");
  const parsed = directives(csp);
  for (const [name, value] of Object.entries(CSP_DIRECTIVES)) expect(parsed.get(name), name).toBe(value);
  expect(String(csp)).not.toContain("'unsafe-inline'");
  expect(String(csp)).not.toContain("'unsafe-eval'");
  expect(String(csp)).not.toContain("upgrade-insecure-requests");
  expect(res.headers["x-content-type-options"]).toBe("nosniff");
  expect(res.headers["referrer-policy"]).toBe("no-referrer");
  expect(res.headers["x-powered-by"]).toBeUndefined();
  expect(res.headers["access-control-allow-origin"]).toBeUndefined();
}

// ---------------------------------------------------------------- AC-3

describe("headers on every answer (AC-3)", () => {
  it("AC-3: an Artist search from another origin → 200 with the strict CSP, nosniff, no-referrer, no-store; no X-Powered-By, no CORS", async () => {
    const h = makeHarness();
    h.artistSearches.Genesis = genesisSearchPayload();
    const res = await h.get("/api/artists?name=Genesis").set("Origin", "https://evil.example");
    expect(res.status).toBe(200);
    expectSecurityHeaders(res);
    expect(res.headers["cache-control"]).toBe("no-store");
    expectNoLeaks(res);
  });

  it("AC-3: a CORS preflight from another origin gets no Access-Control-Allow-Origin either", async () => {
    const h = makeHarness();
    const res = await request(h.app)
      .options("/api/artists?name=Genesis")
      .set("Origin", "https://evil.example")
      .set("Access-Control-Request-Method", "GET")
      .set("X-Forwarded-For", A);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    expect(res.headers["access-control-allow-methods"]).toBeUndefined();
  });

  it("AC-3: an error answer, the client page, a static file and an unknown /api path all carry the same headers", async () => {
    const h = makeHarness();
    const answers = [
      await h.get("/api/artists"),
      await h.get("/api/nope"),
      await h.get("/"),
      await h.get("/setlists/2bf1c8e4"),
      await h.get("/assets/index-4f2a9c1b.js"),
      await h.get("/assets/missing-00000000.js"),
    ];
    for (const res of answers) expectSecurityHeaders(res);
    expect(answers[0]!.headers["cache-control"]).toBe("no-store");
    expect(answers[1]!.headers["cache-control"]).toBe("no-store");
  });

  it("AC-3: the preview stream carries the security headers and Cache-Control: no-store", async () => {
    const h = makeHarness();
    const res = await h.getStream("/api/setlists/73a1b2c5/preview");
    expect(res.status).toBe(200);
    expectSecurityHeaders(res);
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});

// ---------------------------------------------------------------- AC-4

describe("request bodies (AC-4)", () => {
  it("AC-4: a JSON body over 10 kB → 413 E-6; no core step, no Host token, no request", async () => {
    const h = makeHarness();
    const body = `{"versionId":"g4bd1a2f6","pad":"${"x".repeat(10_300)}"}`;
    const res = await request(h.app)
      .post("/api/setlists/2bf1c8e4/playlist")
      .set("X-Forwarded-For", A)
      .set("Content-Type", "application/json")
      .send(body);
    expectCatalogueError(res, "E-6");
    expect(res.body).toStrictEqual({ error: { code: "INVALID_INPUT", message: "That request is too large." } });
    expect(h.http.requests).toEqual([]);
    expect(h.host.asked).toBe(0);
    expect(h.usage.recorded).toEqual([]);
    expectNoLeaks(res);
  });

  it("AC-4: a body of exactly 10 240 bytes is not too large (it is checked as a body, not refused for size)", async () => {
    const h = makeHarness();
    const prefix = '{"versionId":"g4bd1a2f6","pad":"';
    const body = `${prefix}${"x".repeat(10_240 - prefix.length - 2)}"}`;
    expect(Buffer.byteLength(body)).toBe(10_240);
    const res = await request(h.app)
      .post("/api/setlists/2bf1c8e4/playlist")
      .set("X-Forwarded-For", A)
      .set("Content-Type", "application/json")
      .send(body);
    expectCatalogueError(res, "E-5");
  });

  it("AC-4: malformed JSON → 400 E-5", async () => {
    const h = makeHarness();
    const res = await request(h.app)
      .post("/api/setlists/2bf1c8e4/playlist")
      .set("X-Forwarded-For", A)
      .set("Content-Type", "application/json")
      .send('{"versionId":');
    expectCatalogueError(res, "E-5");
    expect(h.http.requests).toEqual([]);
    expectNoLeaks(res);
  });

  it("AC-4: a text/plain body → 400 E-5", async () => {
    const h = makeHarness();
    const res = await request(h.app)
      .post("/api/setlists/2bf1c8e4/playlist")
      .set("X-Forwarded-For", A)
      .set("Content-Type", "text/plain")
      .send("versionId=g4bd1a2f6");
    expectCatalogueError(res, "E-5");
    expect(h.http.requests).toEqual([]);
  });

  it("AC-4: a form-encoded body → 400 E-5", async () => {
    const h = makeHarness();
    const res = await request(h.app)
      .post("/api/setlists/2bf1c8e4/playlist")
      .set("X-Forwarded-For", A)
      .type("form")
      .send("versionId=g4bd1a2f6");
    expectCatalogueError(res, "E-5");
    expect(h.http.requests).toEqual([]);
  });
});

// ---------------------------------------------------------------- AC-5

describe("unknown /api paths (AC-5)", () => {
  it.each([
    ["GET", "/api/nope"],
    ["GET", "/api"],
    ["DELETE", "/api/setlists/2bf1c8e4"],
    ["GET", "/api/setlists/2bf1c8e4/playlist"],
    ["POST", "/api/artists"],
    ["PUT", "/api/setlists/2bf1c8e4/playlist"],
  ])("AC-5: %s %s → 404 E-10, JSON (never the client page)", async (method, path) => {
    const h = makeHarness();
    const res = await request(h.app)[method.toLowerCase() as "get" | "delete" | "post" | "put"](path).set("X-Forwarded-For", A);
    expectCatalogueError(res, "E-10");
    expect(res.body).toStrictEqual({ error: { code: "NOT_FOUND", message: "There's nothing here." } });
    expect(h.http.requests).toEqual([]);
    expectNoLeaks(res);
  });
});

// ---------------------------------------------------------------- AC-6

describe("the built client (AC-6)", () => {
  it("AC-6: GET /assets/index-4f2a9c1b.js → the file, JavaScript, cached for a year", async () => {
    const h = makeHarness({ clientDir: makeClientDir() });
    const res = await h.get("/assets/index-4f2a9c1b.js");
    expect(res.status).toBe(200);
    expect(String(res.headers["content-type"])).toMatch(/javascript/);
    expect(res.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(res.text).toBe(ASSET_JS);
  });

  it.each(["/", "/artists/83b9cbe7-9857-49e2-ab8e-b57b01038103", "/setlists/2bf1c8e4", "/admin"])(
    "AC-6: GET %s → index.html, text/html, Cache-Control: no-cache",
    async (path) => {
      const h = makeHarness({ clientDir: makeClientDir() });
      const res = await h.get(path);
      expect(res.status).toBe(200);
      expect(String(res.headers["content-type"])).toMatch(/^text\/html/);
      expect(res.headers["cache-control"]).toBe("no-cache");
      expect(res.text).toBe(INDEX_HTML);
      expect(h.http.requests).toEqual([]);
    },
  );

  it("AC-6: a missing file under /assets/ → 404, not index.html", async () => {
    const h = makeHarness({ clientDir: makeClientDir() });
    const res = await h.get("/assets/missing-00000000.js");
    expect(res.status).toBe(404);
    expect(res.text).not.toContain("<div id=\"root\">");
  });

  it("AC-6: a client folder without index.html → 503 text/plain for pages; one warning when the app was built", async () => {
    const empty = makeEmptyDir();
    const h = makeHarness({ clientDir: empty });
    expect(h.log.of("warn")).toHaveLength(1);
    for (const path of ["/", "/setlists/2bf1c8e4", "/admin"]) {
      const res = await h.get(path);
      expect(res.status).toBe(503);
      expect(String(res.headers["content-type"])).toMatch(/^text\/plain/);
      expect(res.text).toBe("Playset's web page isn't available right now.");
      expectNoLeaks(res);
      expect(res.text).not.toContain(empty);
    }
    expect(h.log.of("warn")).toHaveLength(1);
  });

  it("AC-6: without index.html the /api routes still answer", async () => {
    const h = makeHarness({ clientDir: makeEmptyDir() });
    const res = await h.get("/api/setlist-links?url=https://www.setlist.fm/setlist/pearl-jam/2026/moda-center-portland-or-2bf1c8e4.html");
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({ setlistId: "2bf1c8e4" });
  });
});

describe("a client folder under a dot-folder (AC-6)", () => {
  it("AC-6: the client is served when its folder sits under a dot-folder (e.g. ~/.local/…)", async () => {
    const root = await mkdtemp(join(tmpdir(), "playset-"));
    try {
      const clientDir = join(root, ".hidden", "web");
      const indexHtml = '<!doctype html><html><body><div id="root">dot-folder client</div></body></html>';
      const assetJs = 'console.log("dot-folder asset")';
      await mkdir(join(clientDir, "assets"), { recursive: true });
      await writeFile(join(clientDir, "index.html"), indexHtml);
      await writeFile(join(clientDir, "assets", "app.js"), assetJs);

      const h = makeHarness({ clientDir });
      for (const path of ["/", "/setlists/abc12345"]) {
        const res = await h.get(path);
        expect(res.status, path).toBe(200);
        expect(String(res.headers["content-type"])).toMatch(/^text\/html/);
        expect(res.text).toBe(indexHtml);
      }
      const asset = await h.get("/assets/app.js");
      expect(asset.status).toBe(200);
      expect(String(asset.headers["content-type"])).toMatch(/javascript/);
      expect(asset.text).toBe(assetJs);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("a malformed asset path (AC-6)", () => {
  it("AC-6: GET /assets/%E0%A4%A (malformed percent-encoding) → 404 text/plain \"Not found.\"; nothing logged as an error or warning", async () => {
    const h = makeHarness({ clientDir: makeClientDir() });
    const atBuild = h.log.calls.length;
    const res = await h.get("/assets/%E0%A4%A");
    expect(res.status).toBe(404);
    expect(String(res.headers["content-type"])).toMatch(/^text\/plain/);
    expect(res.text).toBe("Not found.");
    expect(h.log.calls.slice(atBuild).filter((c) => c.level !== "info")).toEqual([]);
    expectNoLeaks(res);
  });
});

describe("headers on body errors (AC-3, AC-4)", () => {
  it.each([
    ["a body over 10 kB (E-6)", `{"versionId":"g4bd1a2f6","pad":"${"x".repeat(10_300)}"}`, "E-6"],
    ["malformed JSON (E-5)", '{"versionId":', "E-5"],
  ] as const)("AC-3: %s still carries the strict CSP, nosniff, no-referrer and no-store", async (_why, body, id) => {
    const h = makeHarness();
    const res = await request(h.app)
      .post("/api/setlists/2bf1c8e4/playlist")
      .set("X-Forwarded-For", A)
      .set("Origin", "https://evil.example")
      .set("Content-Type", "application/json")
      .send(body);
    expectCatalogueError(res, id);
    expectSecurityHeaders(res);
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});

describe("paths that try to leave the client folder (AC-6)", () => {
  it.each([
    "/assets/..%2f..%2fpackage.json",
    "/assets/..%2findex.html",
    "/assets/%2e%2e/%2e%2e/package.json",
  ])("AC-6: GET %s → 404 text/plain, no file outside assets/, nothing logged", async (path) => {
    const h = makeHarness({ clientDir: makeClientDir() });
    const atBuild = h.log.calls.length;
    const res = await h.get(path);
    expect(res.status).toBe(404);
    expect(String(res.headers["content-type"])).toMatch(/^text\/plain/);
    expect(res.text).toBe("Not found.");
    expect(res.text).not.toContain("<div id=\"root\">");
    expect(res.text).not.toContain('"name"');
    expectSecurityHeaders(res);
    expect(h.log.calls.slice(atBuild)).toEqual([]);
  });
});

describe("HEAD and OPTIONS on /api (AC-3, AC-5)", () => {
  it("AC-5: HEAD on a GET route is answered as that GET (200, no body), with the same headers", async () => {
    const h = makeHarness();
    const res = await request(h.app)
      .head("/api/setlist-links?url=https://www.setlist.fm/setlist/pearl-jam/2026/moda-center-portland-or-2bf1c8e4.html")
      .set("X-Forwarded-For", A);
    expect(res.status).toBe(200);
    expect(String(res.headers["content-type"])).toMatch(/^application\/json/);
    expect(res.text ?? "").toBe("");
    expectSecurityHeaders(res);
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("AC-5: OPTIONS on an /api route is a method no route answers → 404 E-10, no Allow or CORS headers", async () => {
    const h = makeHarness();
    const res = await request(h.app)
      .options("/api/artists?name=Genesis")
      .set("Origin", "https://evil.example")
      .set("Access-Control-Request-Method", "GET")
      .set("X-Forwarded-For", A);
    expectCatalogueError(res, "E-10");
    expectSecurityHeaders(res);
    expect(res.headers["access-control-allow-methods"]).toBeUndefined();
    expect(h.http.requests).toEqual([]);
  });
});
