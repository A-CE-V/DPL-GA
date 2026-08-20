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

  // NOTE — TitleBar (custom drag/minimize/maximize/close for the rounded-
  // window look) is pulled out for now while that feature gets debugged
  // separately — see CHANGES.md. decorations:true is back in
  // tauri.conf.json, so the native title bar handles all of that again;
  // rendering TitleBar on top of it would show two.
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
          onConfigUpdate={setConfig}
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

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Fatal: #root element not found in index.html");
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
