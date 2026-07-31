import { defineConfig } from "vitest/config";

/* ══════════════════════════════════════════════════════════════════
   SECURITY RULES TESTS

   These execute firestore.rules in the real rules engine, against the
   Firestore emulator.

       npm run test:rules        starts the emulator and runs them

   ⚠️ Single-threaded and serial. Every test calls clearFirestore() and
   re-seeds, so two files running in parallel would delete each other's
   fixtures and fail in ways that look like rule bugs.

   ⚠️ Long timeout. The first run downloads the emulator jar.
   ══════════════════════════════════════════════════════════════════ */

export default defineConfig({
  test: {
    include: ["tests/rules/**/*.test.ts"],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    fileParallelism: false,
    pool: "threads",
    maxWorkers: 1,
  },
});
