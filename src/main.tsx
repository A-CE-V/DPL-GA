import { StrictMode } from "react";
import { createRoot }  from "react-dom/client";
import { useState } from "react";
import { SplashScreen }   from "./screens/SplashScreen";
import { HomeScreen }     from "./screens/HomeScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { TitleBar }       from "./components/TitleBar";
import type { GameConfig, GameVersion } from "./types";
import "./styles/global.css";

type Screen = "splash" | "home" | "settings";

function App() {
  const [screen,    setScreen]    = useState<Screen>("splash");
  const [config,    setConfig]    = useState<GameConfig | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [versions,  setVersions]  = useState<GameVersion[]>([]);

  // Re-enabled — the black screen turned out to be an unrelated JS import
  // error (see CHANGES.md), not this. TitleBar renders here, once, above
  // everything else, rather than per-screen — the window needs a
  // replacement for native drag-to-move/minimize/close from the moment
  // it's visible, which includes the splash screen, not just after config
  // loads.
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <TitleBar />
      <div style={{ flex: 1, minHeight: 0 }}>
        {screen === "splash" ? (
          <SplashScreen
            onReady={(cfg, cached = false) => {
              setConfig(cfg);
              setFromCache(cached);
              setScreen("home");
            }}
          />
        ) : !config ? null : (
          // FIX — this used to be `if (screen === "settings") return
          // <SettingsScreen/>; return <HomeScreen/>;` — a conditional
          // return, which fully unmounts whichever screen isn't active.
          // Every time a player opened Settings and came back, HomeScreen
          // remounted from scratch: installed/installing/running all reset
          // to empty, and there was a real window — while the fresh
          // getInstalledVersion checks were still in flight — where an
          // already-installed game briefly showed the Download button
          // instead of Launch. Clicking during that window kicked off a
          // redundant full re-download over an install that was already
          // there. Both screens now stay mounted permanently once reached;
          // the inactive one is hidden via CSS (display: contents on the
          // active wrapper keeps it fully transparent to layout) rather
          // than destroyed. This also means HomeScreen's running-process
          // poll keeps working while Settings is open, which the
          // auto-refresh-after-game-closes feature depends on.
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
        )}
      </div>
    </div>
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
