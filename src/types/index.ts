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
}

export interface GameProfile {
  title:       string;
  description: string;
  author:      string;
  version:     string;
  logoUrl:     string | null;
  accentColor: string;
  bannerColor: string;
  themeId:     string;
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
