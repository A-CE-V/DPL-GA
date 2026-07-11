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

  if (screen === "settings") {
    return (
      <SettingsScreen
        config={config}
        versions={versions}
        fromCache={fromCache}
        onBack={() => setScreen("home")}
      />
    );
  }

  return (
    <HomeScreen
      config={config}
      fromCache={fromCache}
      onOpenSettings={() => setScreen("settings")}
    />
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
