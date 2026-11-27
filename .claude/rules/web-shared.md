---
paths:
  - "src/web/shared/**"
  - "test/web/shared/**"
---

# Web shared contract rules

- `src/web/shared/` holds the API contract only: zod schemas for every request and response, the types inferred from them (`z.infer`), the route paths, and the error `code` list. Server and client both import from here; neither re-declares a shape.
- No runtime logic beyond schemas and constants; no imports from `src/web/server/`, `src/web/client/` or Node-only modules (it ships to the browser).
- The error body is always `{ error: { code, message, hint? } }`; `code` is one of the shared codes. `message`/`hint` are human-readable sentences for visitors, written by the server.
- Domain words follow `GLOSSARY.md` in field names too (`setlistId`, `performances`, `match`, `miss`), never "tracklist"/"gig".
- A contract change is a change to both sides: the PRD names it, and server and client tests cover it.
