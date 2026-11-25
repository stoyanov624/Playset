/// <reference types="vitest/config" />
import { builtinModules } from "node:module";
import { defineConfig } from "vite";

// Vite builds the CLI as a single Node ESM bundle (dist/cli.js).
// The same toolchain will be reused by a future web front-end on top of src/core.
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
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    passWithNoTests: true,
  },
});
