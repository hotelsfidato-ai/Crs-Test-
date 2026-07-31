import { defineConfig } from "vitest/config";
import path from "node:path";

/* ══════════════════════════════════════════════════════════════════
   UNIT TESTS

   Fast, no dependencies. Run on every change.

   ⚠️ tests/rules/ is excluded deliberately. Those tests need the
   Firestore emulator running, and a suite that fails when a background
   process is not up stops being run at all — which is how the rules
   ended up untested in the first place. `npm run test:rules` runs them.
   ══════════════════════════════════════════════════════════════════ */

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["tests/rules/**", "node_modules/**"],
  },
});
