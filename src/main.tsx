import { useState } from "react";
import { SplashScreen }   from "./screens/SplashScreen";
import { HomeScreen }     from "./screens/HomeScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import type { GameConfig, GameVersion } from "./types";

type Screen = "splash" | "home" | "settings";

export default function App() {
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
