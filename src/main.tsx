import { StrictMode } from "react";
import { createRoot }  from "react-dom/client";
import { useState } from "react";
import { SplashScreen }   from "./screens/SplashScreen";
import { HomeScreen }     from "./screens/HomeScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import type { GameConfig, GameVersion } from "./types";
import "./styles/global.css";

type Screen = "splash" | "home" | "settings";

function App() {
  const [screen,    setScreen]    = useState<Screen>("splash");
  const [config,    setConfig]    = useState<GameConfig | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [versions,  setVersions]  = useState<GameVersion[]>([]);

  if (screen === "splash") {
    return (
      <SplashScreen
        onReady={(cfg, cached = false) => {
          setConfig(cfg);
          setFromCache(cached);
          setScreen("home");
        }}
      />
    );
  }

  if (!config) return null;

  // FIX — this used to be `if (screen === "settings") return <SettingsScreen/>;
  // return <HomeScreen/>;` — a conditional return, which fully unmounts
  // whichever screen isn't active and mounts the other fresh. Every time a
  // player opened Settings and came back, HomeScreen remounted from
  // scratch: installed/installing/running all reset to empty, and there
  // was a real window — while the fresh getInstalledVersion checks were
  // still in flight — where an already-installed game briefly showed the
  // Download button instead of Launch. Clicking during that window kicked
  // off a redundant full re-download over an install that was already
  // there. Both screens now stay mounted permanently once reached; the
  // inactive one is hidden via CSS (display: contents on the active
  // wrapper keeps it fully transparent to layout) rather than destroyed.
  // This also means HomeScreen's running-process poll keeps working while
  // Settings is open, which the auto-refresh-after-game-closes feature
  // depends on.
  return (
    <>
      <div style={{ display: screen === "home" ? "contents" : "none" }}>
        <HomeScreen
          config={config}
          fromCache={fromCache}
          onOpenSettings={() => setScreen("settings")}
          onVersionsUpdate={setVersions}
        />
      </div>
      <div style={{ display: screen === "settings" ? "contents" : "none" }}>
        <SettingsScreen
          config={config}
          versions={versions}
          fromCache={fromCache}
          onBack={() => setScreen("home")}
        />
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// FIX — the actual white-screen cause.
//
// This file defined the App component but never mounted it into the DOM.
// index.html loads this file directly as the entry module — with no
// ReactDOM.createRoot(...).render(...) call anywhere in the codebase
// (verified via a full search across the entire src/ directory), the
// component was defined but literally never rendered. No error, no crash,
// nothing to see in the console — the page just stays blank forever,
// which matches exactly what you were seeing.
// ═══════════════════════════════════════════════════════════════════════════
const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Fatal: #root element not found in index.html");
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
