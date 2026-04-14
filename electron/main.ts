import { app, BrowserWindow, ipcMain } from "electron";
import { autoUpdater } from "electron-updater";
import path from "path";

// ─── The launcher API key is baked in at build time ───────────────────────────
// When a dev generates a launcher from the dashboard, the build pipeline
// injects their GAME_ID as an env var before compiling the executable.
const GAME_ID = process.env.LAUNCHKIT_GAME_ID ?? "dev-mode";
const IS_DEV = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 560,
    minWidth: 760,
    minHeight: 480,
    frame: false,          // Custom titlebar in React
    transparent: false,
    backgroundColor: "#080b14",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, "../assets/icon.png"),
  });

  if (IS_DEV) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();

  // Pass the game ID to the renderer via IPC
  ipcMain.handle("get-game-id", () => GAME_ID);

  // Auto-updater (updates the launcher itself, not the game)
  if (!IS_DEV) {
    autoUpdater.checkForUpdatesAndNotify();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

// Window controls (custom titlebar)
ipcMain.on("window-minimize", () => mainWindow?.minimize());
ipcMain.on("window-maximize", () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on("window-close", () => mainWindow?.close());

// Launch game process
ipcMain.handle("launch-game", async (_event, execPath: string) => {
  const { spawn } = await import("child_process");
  const child = spawn(execPath, [], { detached: true, stdio: "ignore" });
  child.unref();
  return { pid: child.pid };
});
