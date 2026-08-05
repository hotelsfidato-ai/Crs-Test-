import { defineConfig } from "vitest/config";
import path from "node:path";

/* ══════════════════════════════════════════════════════════════════
   AUTH FLOW TESTS

       npm run test:auth        starts the emulators and runs them

   ⚠️ Separate from the unit suite because these need the Auth AND
   Firestore emulators running, and separate from the rules suite
   because those use @firebase/rules-unit-testing, which fakes auth
   contexts rather than exercising a real sign-in.

   ⚠️ Serial. Every test signs in and out of a shared Auth instance;
   in parallel they would sign each other out.
   ══════════════════════════════════════════════════════════════════ */

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: {
    include: ["tests/auth/**/*.test.ts"],
    fileParallelism: false,
    pool: "forks",
    /* Vitest 4 moved these to the top level. */
    maxForks: 1,
    minForks: 1,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: {
      VITE_USE_FIREBASE_EMULATOR: "1",
      VITE_FIREBASE_API_KEY: "demo-key",
      VITE_FIREBASE_AUTH_DOMAIN: "demo.firebaseapp.com",
      VITE_FIREBASE_PROJECT_ID: "fidato-rules-test",
      VITE_FIREBASE_STORAGE_BUCKET: "demo.appspot.com",
      VITE_FIREBASE_MESSAGING_SENDER_ID: "0",
      VITE_FIREBASE_APP_ID: "demo",
    },
  },
});
