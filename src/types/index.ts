export type Platform      = "windows" | "mac" | "linux" | "mobile";
export type VersionStatus = "stable"  | "bugged";
export type MediaType     = "image"   | "video";
export type ChangelogType = "feature" | "fix" | "breaking" | "other";
export type UrlSource     = "github"  | "mega" | "itch" | "gdrive" | "dropbox" | "mediafire" | "direct";

export interface MirrorUrl {
  url:       string;
  label?:    string;
  source:    UrlSource;
  fileType?: string;
  // NEW — SHA-256 checksum of the file this mirror points to, set by the
  // dashboard when a build is uploaded. Used by the launcher's download
  // system to verify integrity after download completes. Optional so
  // existing mirror URLs (added before this feature existed) don't break.
  sha256?:   string;
}

export interface GameVersion {
  id:        string;
  tag:       string;
  status:    VersionStatus;
  date:      string;
  downloads: number;
  windows:   MirrorUrl[];
  mac:       MirrorUrl[];
  linux:     MirrorUrl[];
  mobile:    MirrorUrl[];
  // NEW — optional executable path (relative to the extracted build's root)
  // the launcher should run for this platform. When unset, launch_game
  // falls back to auto-detecting the first matching file it finds (see
  // find_executable in launch.rs) — which can pick the wrong one for games
  // that ship more than one .exe/binary (crash handlers, redistributable
  // installers, uninstallers, etc). Not applicable to "mobile" since the
  // desktop launcher never spawns those itself.
  windowsExeName?: string;
  macExeName?:     string;
  linuxExeName?:   string;
}

// NEW — matches the dashboard's LicenseType. Duplicated here (not imported)
// since the launcher and dashboard are separate deployable apps with
// separate build pipelines.
export type LicenseType = "solo" | "indie" | "studio";

// NEW — where the dev has positioned the mandatory watermark for
// non-Solo tiers. Configured in the dashboard, read here at runtime.
export type WatermarkPosition = "bottom-left" | "bottom-right" | "top-left" | "top-right";

export interface GameProfile {
  title:           string;
  description:     string;
  author:          string;
  version:         string;
  logoUrl:         string | null;
  accentColor:     string;
  bannerColor:     string;
  themeId:         string;
  // FIX: these five fields were already being read at runtime in
  // HomeScreen.tsx (profile.fontFamily, profile.customFontUrl, etc.) but
  // were never declared here — a real type/runtime mismatch, now fixed.
  fontFamily?:     string;
  customFontUrl?:  string | null;
  customTheme?:    CustomThemeColors;
  layoutTemplate?: string;
  canvasLayout?:   CanvasComponent[];
  // NEW — snapshot of the owner's license tier, stamped onto this public
  // doc by the dashboard on every save. The launcher has no way to read
  // the private devs/{uid} doc directly, so this snapshot is how it knows
  // which watermark behavior applies. Defaults to "solo" (most
  // restrictive/safe) if missing, so an old game doc without this field
  // never accidentally skips the watermark.
  licenseType?:    LicenseType;
  // NEW — lets a dev rely on their logo image instead of the text title
  // (e.g. when the logo already contains the game's name as artwork).
  // Optional and defaults to showing the title (undefined = false) so
  // existing games are unaffected.
  hideTitle?:      boolean;
  // NEW — media display customization. "carousel" (default) is one image
  // at a time with arrows + dots; "big-row" is one big image with
  // thumbnails in a row below it; "big-left" is the same but thumbnails
  // stacked on the left. autoAdvance cycles through images on a timer
  // (mediaAutoAdvanceSeconds, default 5) in addition to manual arrows/dots
  // — it doesn't replace them.
  mediaDisplayMode?:        "carousel" | "big-row" | "big-left";
  mediaAutoAdvance?:        boolean;
  mediaAutoAdvanceSeconds?: number;
}

// NEW — mirrors the dashboard's CustomThemeColors shape so
// profile.customTheme is fully typed instead of implicitly any.
export interface CustomThemeColors {
  bg: string; bgSurface: string; bgElev: string;
  a0: string; a1: string; a2: string; a3: string;
  glow: string; border: string; border2: string;
}

// NEW — mirrors the dashboard's CanvasComponent shape.
export interface CanvasComponent {
  id:        string;
  type:      string;
  x:         number;
  y:         number;
  w:         number;
  h:         number;
  zIndex:    number;
  locked:    boolean;
  essential: boolean;
  htmlContent?: string;
  htmlLabel?:   string;
}

export interface GameMedia {
  id:     string;
  type:   MediaType;
  url:    string;
  label?: string;
  order:  number;
}

export interface ChangelogEntry {
  id:      string;
  version: string;
  date:    string;
  title:   string;
  body:    string;
  type:    ChangelogType;
}

export interface LauncherSettings {
  autoUpdateOnLaunch:   boolean;
  allowVersionRollback: boolean;
  hideLauncherUI:       boolean;
  collectAnalytics:     boolean;
  collectCrashes:       boolean;
  enabledPlatforms:     Platform[];
  // NEW — dev-configurable position for the mandatory non-Solo watermark.
  // Defaults to "bottom-left" if unset.
  watermarkPosition?:   WatermarkPosition;
}

export interface GameSocials {
  discord?:  string;
  twitter?:  string;
  youtube?:  string;
  itch?:     string;
  github?:   string;
  website?:  string;
}

export interface GameConfig {
  profile:   GameProfile;
  settings:  LauncherSettings;
  socials:   GameSocials;
}
