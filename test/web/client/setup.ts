// Test setup for the web client: axe matchers for the accessibility checks, and a fresh DOM per test.
import { cleanup } from "@testing-library/react";
import { afterEach, expect } from "vitest";
import type { AxeMatchers } from "vitest-axe";
import * as axeMatchers from "vitest-axe/matchers";

expect.extend(axeMatchers);

// vitest-axe still declares its matcher on the old global `Vi` namespace; this tells Vitest's own types.
declare module "vitest" {
  interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown> extends AxeMatchers {}
}

afterEach(() => {
  cleanup();
});
