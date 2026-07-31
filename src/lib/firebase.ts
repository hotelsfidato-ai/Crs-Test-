import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, connectAuthEmulator, type Auth } from "firebase/auth";
import {
  initializeFirestore,
  connectFirestoreEmulator,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import { getStorage, connectStorageEmulator, type FirebaseStorage } from "firebase/storage";

/* ══════════════════════════════════════════════════════════════════
   FIREBASE CLIENT

   A Firebase *web* API key is not a secret — Google documents it as
   safe to expose. It identifies the project; it authorises nothing.
   All security comes from firestore.rules, which is why that file is
   the most important one in Phase 2.

   Config still comes from .env so a fork or a second environment does
   not silently inherit this project's ids.
   ══════════════════════════════════════════════════════════════════ */

function required(name: string): string {
  const value = import.meta.env[name as keyof ImportMetaEnv] as string | undefined;
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env and fill it in from the ` +
        `Firebase console → Project settings → Your apps.`,
    );
  }
  return value;
}

const config = {
  apiKey: required("VITE_FIREBASE_API_KEY"),
  authDomain: required("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: required("VITE_FIREBASE_PROJECT_ID"),
  storageBucket: required("VITE_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: required("VITE_FIREBASE_MESSAGING_SENDER_ID"),
  appId: required("VITE_FIREBASE_APP_ID"),
};

export const app: FirebaseApp = initializeApp(config);

export const auth: Auth = getAuth(app);

/* Offline cache, shared across tabs.

   This matters more than it looks on the Spark plan: the daily read
   quota is 50k, and a cache hit costs nothing. Multi-tab support means
   a user with the app open twice does not double their reads. */
export const db: Firestore = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

export const storage: FirebaseStorage = getStorage(app);

/* ── Emulators ─────────────────────────────────────────────────────
   Set VITE_USE_FIREBASE_EMULATOR=1 in .env to develop offline against
   the emulator suite instead of the live project.                   */

if (import.meta.env.VITE_USE_FIREBASE_EMULATOR) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
  // eslint-disable-next-line no-console
  console.info("[firebase] using local emulator suite");
}

export const PROJECT_ID = config.projectId;
