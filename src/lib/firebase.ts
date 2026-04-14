import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getFirestore, type Firestore,
  doc, getDoc, collection, getDocs, query, orderBy, where,
  setDoc, serverTimestamp,
} from "firebase/firestore";
import type { GameConfig, GameVersion, GameMedia, ChangelogEntry } from "../types";
import { saveConfigCache } from "./cache";

// ─── GAME_ID baked at build time via VITE_GAME_ID ─────────────────────────────
export const GAME_ID: string = import.meta.env.VITE_GAME_ID ?? "dev";

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

let app: FirebaseApp;
let db:  Firestore;

if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}
db = getFirestore(app);
export { db };

// ─── Fetch full game config ────────────────────────────────────────────────────
export async function fetchGameConfig(): Promise<GameConfig | null> {
  try {
    const snap = await getDoc(doc(db, "games", GAME_ID));
    if (!snap.exists()) return null;
    const config = snap.data() as GameConfig;
    saveConfigCache(GAME_ID, config).catch(e =>
      console.warn("[firebase] cache write failed:", e)
    );
    return config;
  } catch { return null; }
}

// ─── Fetch version list ────────────────────────────────────────────────────────
export async function fetchVersions(): Promise<GameVersion[]> {
  try {
    const snap = await getDocs(
      query(collection(db, `games/${GAME_ID}/versions`), orderBy("date", "desc"))
    );
    return snap.docs.map(d => d.data() as GameVersion);
  } catch { return []; }
}

// ─── Fetch media list ─────────────────────────────────────────────────────────
export async function fetchMedia(): Promise<GameMedia[]> {
  try {
    const snap = await getDocs(
      query(collection(db, `games/${GAME_ID}/media`), orderBy("order", "asc"))
    );
    return snap.docs.map(d => d.data() as GameMedia);
  } catch { return []; }
}

// ─── Fetch changelog ──────────────────────────────────────────────────────────
export async function fetchChangelog(): Promise<ChangelogEntry[]> {
  try {
    const snap = await getDocs(
      query(collection(db, `games/${GAME_ID}/changelog`), orderBy("date", "desc"))
    );
    return snap.docs.map(d => d.data() as ChangelogEntry);
  } catch { return []; }
}

// ─── IP ban check ─────────────────────────────────────────────────────────────
export async function checkIPBan(ip: string): Promise<{ banned: boolean; reason?: string }> {
  if (!ip || ip === "unknown") return { banned: false };
  try {
    const q    = query(collection(db, "bannedIPs"), where("ip", "==", ip));
    const snap = await getDocs(q);
    if (!snap.empty) {
      return { banned: true, reason: snap.docs[0].data().reason };
    }
    return { banned: false };
  } catch { return { banned: false }; }
}

// ─── MAC ban check (Phase 6) ──────────────────────────────────────────────────
// Checks the raw lowercase hex MAC (e.g. "a1b2c3d4e5f6") against /bannedMACs.
// Stored without colons so queries work regardless of formatting.
export async function checkMACBan(mac: string): Promise<{ banned: boolean; reason?: string }> {
  if (!mac || mac === "unknown") return { banned: false };
  try {
    const normalized = mac.toLowerCase().replace(/[:\-]/g, "");
    const q    = query(collection(db, "bannedMACs"), where("mac", "==", normalized));
    const snap = await getDocs(q);
    if (!snap.empty) {
      return { banned: true, reason: snap.docs[0].data().reason };
    }
    return { banned: false };
  } catch { return { banned: false }; } // fail open — never block on check error
}

// ─── Log a session ────────────────────────────────────────────────────────────
export async function logSession(data: {
  platform: string; version: string; durationMin: number;
}) {
  try {
    const id = `session_${Date.now()}`;
    await setDoc(doc(db, `games/${GAME_ID}/sessions`, id), {
      ...data,
      date:      new Date().toISOString().split("T")[0],
      timestamp: serverTimestamp(),
    });
  } catch {}
}

// ─── Log a crash ─────────────────────────────────────────────────────────────
export async function logCrash(data: { message: string; version: string; stack?: string }) {
  try {
    const id = `crash_${Date.now()}`;
    await setDoc(doc(db, `games/${GAME_ID}/crashes`, id), {
      ...data,
      date:      new Date().toISOString().split("T")[0],
      timestamp: serverTimestamp(),
    });
  } catch {}
}

// ─── Get client IP ────────────────────────────────────────────────────────────
export async function getClientIP(): Promise<string> {
  try {
    const res = await fetch("https://ipapi.co/json/", { signal: AbortSignal.timeout(4000) });
    const d   = await res.json();
    return d.ip ?? "unknown";
  } catch { return "unknown"; }
}
