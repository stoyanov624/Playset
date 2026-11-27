---
paths:
  - "test/**"
---

# Test rules (all domains)

- Vitest. No network, ever: setlist.fm and Spotify are faked through the injected services or fixture JSON under `test/<module>/fixtures/`. Shared fixture Fixture A (Arctic Monkeys) is an Incomplete Setlist with medleys — reuse it rather than inventing a new one.
- Tests are written first from the PRD by `test-writer`, who never reads `src/` while writing red tests, and import only the public entry point (`src/core/<module>`, `src/core/index.ts`, `createApp`, the client's app root). Tests describe behaviour, not implementation details.
- Every test name starts with the AC it covers: `it("AC-3: leaves Tapes out when the user says no", …)`. Every AC has at least one test.
- Assertions check values: the exact playlist name, the exact Performances in order, the exact error `code` and message. No `toBeTruthy()`/`toBeDefined()` where a value is known; no snapshot-only tests.
- Cover the unhappy paths each AC implies: invalid input, upstream 404/429/5xx, empty results, Unknown Songs, cancellation.
- Fakes are realistic (shapes from real API responses or the shared zod schemas) and only replace injected services — never mock modules of the code under test.
- Tests are independent: no shared mutable state, no order dependence, fake timers/clock when time matters.
- Domain words in names and data follow `GLOSSARY.md`.
- An existing test changes only when a PRD supersedes it or the test quality gate strengthens it; every such change is listed in the PR.
- Web specifics: server tests per `.claude/rules/web-server.md` (supertest on `createApp(fakes)`), client tests per `.claude/rules/web-client.md` (Testing Library, role/label queries, axe per screen).
