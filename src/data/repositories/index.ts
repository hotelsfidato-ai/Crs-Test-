/* ══════════════════════════════════════════════════════════════════
   REPOSITORY LAYER — the Phase 2 swap point

   Components never import a concrete implementation. They import
   from here. In Phase 2 this file re-points at ./firestore and
   nothing else in the app changes.
   ══════════════════════════════════════════════════════════════════ */

export * from "./mock";
