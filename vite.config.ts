/// <reference types="vitest/config" />
import { builtinModules } from "node:module";
import { defineConfig } from "vite";

// Vite builds the CLI as a single Node ESM bundle (dist/cli.js). The web client has its own
// build config (vite.client.config.ts); this file also holds the test setup for both.
export default defineConfig({
  build: {
    ssr: "src/cli/index.ts",
    target: "node22",
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      external: [...builtinModules, ...builtinModules.map((m) => `node:${m}`)],
      output: {
        entryFileNames: "cli.js",
        banner: "#!/usr/bin/env node",
      },
    },
  },
  test: {
    globals: true,
    passWithNoTests: true,
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          include: ["src/**/*.test.ts", "test/**/*.test.ts"],
          exclude: ["test/web/client/**"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "client",
          include: ["test/web/client/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          setupFiles: ["test/web/client/setup.ts"],
        },
      },
    ],
  },
});
