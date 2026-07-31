/* ══════════════════════════════════════════════════════════════════
   THE SEAM

   The only import path any screen uses. Phase 2 changed this one line
   from `./mock` to `./firestore`; the 34 screens above it did not move.

   ⚠️ Never import from `./firestore` directly in a component. Doing so
   breaks the seam that makes the backend replaceable.
   ══════════════════════════════════════════════════════════════════ */

export * from "./firestore";
