import { contextBridge, ipcRenderer } from "electron";

// ─── Expose a safe, typed API to the renderer ─────────────────────────────────
// The renderer (React) never touches Node/Electron APIs directly.
// All communication goes through this bridge.

contextBridge.exposeInMainWorld("electron", {
  getGameId:      ()               => ipcRenderer.invoke("get-game-id"),
  launchGame:     (path: string)   => ipcRenderer.invoke("launch-game", path),
  windowMinimize: ()               => ipcRenderer.send("window-minimize"),
  windowMaximize: ()               => ipcRenderer.send("window-maximize"),
  windowClose:    ()               => ipcRenderer.send("window-close"),
});

// ─── TypeScript types for the renderer ───────────────────────────────────────
// Add this to a .d.ts file in the launcher/src so React components can use it.
//
// declare global {
//   interface Window {
//     electron: {
//       getGameId: () => Promise<string>;
//       launchGame: (path: string) => Promise<{ pid: number }>;
//       windowMinimize: () => void;
//       windowMaximize: () => void;
//       windowClose: () => void;
//     };
//   }
// }
