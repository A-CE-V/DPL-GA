// FIX — this file previously had only 7 of the dashboard's 16 themes
// (missing forest, acid, jade, arctic, cobalt, lava, ultraviolet, rose,
// silver entirely) and no handling for "custom" theme mode at all. When a
// dev picked any of the 9 missing presets, OR picked Custom and configured
// their own colors, getTheme() couldn't find a match and silently fell
// back to THEMES[0] (Terminal — near-black background, green accents) —
// which is exactly "background always looks black" and "scrollbar always
// dark green regardless of what I set" (the scrollbar's color comes from
// --border-2, which Terminal sets to a dark green-tinted value). This file
// is now a straight port of the dashboard's copy (src/lib/themes.ts) so
// both sides agree on the full catalog and on how custom colors work —
// see SplashScreen.tsx for the other half of this fix (the branch that
// was missing entirely: checking themeId === "custom").
import type { CustomThemeColors } from "../types";

export interface LauncherTheme {
  id: string; name: string;
  category: "Green" | "Blue" | "Fire" | "Purple" | "Special";
  tag: string;
  bg: string; bgSurface: string; bgElev: string;
  a0: string; a1: string; a2: string; a3: string;
  glow: string; glow2: string;
  border: string; border2: string;
  textDim: string;
  font?: string;
}

export const THEMES: LauncherTheme[] = [
  { id:"terminal",   name:"Terminal",    category:"Green",   tag:"Default",
    bg:"#040704",    bgSurface:"#080d08",  bgElev:"#0c130c",
    a0:"#052010",    a1:"#0d3d1e",         a2:"#22c55e",  a3:"#86efac",
    glow:"#22c55e",  glow2:"#16a34a",
    border:"#111f11",border2:"#1a2e1a",    textDim:"#2a3d2a" },
  { id:"forest",     name:"Forest",      category:"Green",   tag:"Organic",
    bg:"#030604",    bgSurface:"#070c08",  bgElev:"#0b120c",
    a0:"#061a0c",    a1:"#0f3019",         a2:"#16a34a",  a3:"#4ade80",
    glow:"#16a34a",  glow2:"#15803d",
    border:"#0f1f10",border2:"#182a19",    textDim:"#253825" },
  { id:"acid",       name:"Acid",        category:"Green",   tag:"Neon",
    bg:"#040503",    bgSurface:"#080a05",  bgElev:"#0d0f08",
    a0:"#141c04",    a1:"#253408",         a2:"#84cc16",  a3:"#d9f99d",
    glow:"#84cc16",  glow2:"#65a30d",
    border:"#141a06",border2:"#1f280a",    textDim:"#2a3510" },
  { id:"jade",       name:"Jade",        category:"Green",   tag:"Luxury",
    bg:"#030605",    bgSurface:"#060d09",  bgElev:"#0a130e",
    a0:"#04180f",    a1:"#0b2d1c",         a2:"#10b981",  a3:"#6ee7b7",
    glow:"#10b981",  glow2:"#059669",
    border:"#0c1f12",border2:"#142d1c",    textDim:"#1e3828" },
  { id:"electric",   name:"Electric",    category:"Blue",    tag:"Classic",
    bg:"#030508",    bgSurface:"#06090f",  bgElev:"#0a0e18",
    a0:"#06102a",    a1:"#0f2050",         a2:"#3b82f6",  a3:"#93c5fd",
    glow:"#3b82f6",  glow2:"#1d4ed8",
    border:"#0d1528",border2:"#162040",    textDim:"#1e2e50" },
  { id:"arctic",     name:"Arctic",      category:"Blue",    tag:"Ice",
    bg:"#030708",    bgSurface:"#060d10",  bgElev:"#0a1318",
    a0:"#041420",    a1:"#082638",         a2:"#06b6d4",  a3:"#a5f3fc",
    glow:"#06b6d4",  glow2:"#0891b2",
    border:"#0d1e28",border2:"#142d38",    textDim:"#1a3040" },
  { id:"cobalt",     name:"Cobalt",      category:"Blue",    tag:"Deep",
    bg:"#030408",    bgSurface:"#06070f",  bgElev:"#090b18",
    a0:"#08082a",    a1:"#100f48",         a2:"#6366f1",  a3:"#a5b4fc",
    glow:"#6366f1",  glow2:"#4338ca",
    border:"#0f1030",border2:"#181848",    textDim:"#1e1e50" },
  { id:"ember",      name:"Ember",       category:"Fire",    tag:"Warm",
    bg:"#070302",    bgSurface:"#0e0604",  bgElev:"#140a06",
    a0:"#200a02",    a1:"#3d1206",         a2:"#f97316",  a3:"#fed7aa",
    glow:"#f97316",  glow2:"#ea580c",
    border:"#261006",border2:"#381808",    textDim:"#401c0a" },
  { id:"blood",      name:"Blood",       category:"Fire",    tag:"Intense",
    bg:"#070202",    bgSurface:"#0e0404",  bgElev:"#140606",
    a0:"#200404",    a1:"#3d0a0a",         a2:"#ef4444",  a3:"#fca5a5",
    glow:"#ef4444",  glow2:"#dc2626",
    border:"#260808",border2:"#380e0e",    textDim:"#401414" },
  { id:"lava",       name:"Lava",        category:"Fire",    tag:"Golden",
    bg:"#070402",    bgSurface:"#0e0804",  bgElev:"#140c06",
    a0:"#200e02",    a1:"#3d1c06",         a2:"#f59e0b",  a3:"#fde68a",
    glow:"#f59e0b",  glow2:"#d97706",
    border:"#281206",border2:"#3c1c08",    textDim:"#421e0c" },
  { id:"void",       name:"Void",        category:"Purple",  tag:"Dark",
    bg:"#040306",    bgSurface:"#080510",  bgElev:"#0c0818",
    a0:"#100828",    a1:"#1e1048",         a2:"#a855f7",  a3:"#e9d5ff",
    glow:"#a855f7",  glow2:"#7e22ce",
    border:"#180e38",border2:"#221850",    textDim:"#2c1c5a" },
  { id:"ultraviolet",name:"Ultraviolet", category:"Purple",  tag:"Neon",
    bg:"#050206",    bgSurface:"#0a040e",  bgElev:"#0f0618",
    a0:"#180528",    a1:"#2c0848",         a2:"#d946ef",  a3:"#f5d0fe",
    glow:"#d946ef",  glow2:"#a21caf",
    border:"#200838",border2:"#300e50",    textDim:"#3a1060" },
  { id:"gold",       name:"Gold",        category:"Special", tag:"Premium",
    bg:"#060500",    bgSurface:"#0c0a02",  bgElev:"#120e04",
    a0:"#1a1200",    a1:"#332200",         a2:"#eab308",  a3:"#fef08a",
    glow:"#eab308",  glow2:"#ca8a04",
    border:"#221800",border2:"#342600",    textDim:"#3a2a00" },
  { id:"rose",       name:"Rose",        category:"Special", tag:"Soft",
    bg:"#070304",    bgSurface:"#0e0508",  bgElev:"#14080e",
    a0:"#20061a",    a1:"#3d0c2a",         a2:"#f43f5e",  a3:"#fda4af",
    glow:"#f43f5e",  glow2:"#e11d48",
    border:"#281028",border2:"#3c1838",    textDim:"#481c40" },
  { id:"silver",     name:"Silver",      category:"Special", tag:"Minimal",
    bg:"#040406",    bgSurface:"#080810",  bgElev:"#0d0d18",
    a0:"#141420",    a1:"#202030",         a2:"#94a3b8",  a3:"#e2e8f0",
    glow:"#94a3b8",  glow2:"#64748b",
    border:"#181828",border2:"#222238",    textDim:"#282840" },
  { id:"matrix",     name:"Matrix",      category:"Special", tag:"Hacker",
    bg:"#000200",    bgSurface:"#010401",  bgElev:"#020802",
    a0:"#021402",    a1:"#042804",         a2:"#22c55e",  a3:"#bbf7d0",
    glow:"#22c55e",  glow2:"#16a34a",
    border:"#071407",border2:"#0e200e",    textDim:"#142814",
    font:"'Rajdhani', monospace" },
];

export const getTheme = (id: string): LauncherTheme =>
  THEMES.find((t) => t.id === id) ?? THEMES[0];

export function applyTheme(theme: LauncherTheme | CustomThemeColors, root: HTMLElement = document.documentElement) {
  const isCustom = !("name" in theme);
  const c = isCustom ? theme as CustomThemeColors : theme as LauncherTheme;
  root.style.setProperty("--bg-base",     c.bg);
  root.style.setProperty("--bg-surface",  c.bgSurface);
  root.style.setProperty("--bg-elevated", c.bgElev);
  root.style.setProperty("--accent-0",    c.a0);
  root.style.setProperty("--accent-1",    c.a1);
  root.style.setProperty("--accent",      c.a2);
  root.style.setProperty("--accent-3",    c.a3);
  root.style.setProperty("--glow",        c.glow);
  root.style.setProperty("--border",      c.border);
  root.style.setProperty("--border-2",    c.border2);
}

// ─── Build a custom LauncherTheme-compatible object from CustomThemeColors ────
export function buildCustomTheme(colors: CustomThemeColors): LauncherTheme {
  return {
    id: "custom", name: "Custom", category: "Special", tag: "Custom",
    bg: colors.bg, bgSurface: colors.bgSurface, bgElev: colors.bgElev,
    a0: colors.a0, a1: colors.a1, a2: colors.a2, a3: colors.a3,
    glow: colors.glow, glow2: colors.glow,
    border: colors.border, border2: colors.border2,
    textDim: colors.bg,
  };
}

// ─── Default custom theme (starts as Terminal) ────────────────────────────────
export const DEFAULT_CUSTOM_THEME: CustomThemeColors = {
  bg: "#040704", bgSurface: "#080d08", bgElev: "#0c130c",
  a0: "#052010", a1: "#0d3d1e", a2: "#22c55e", a3: "#86efac",
  glow: "#22c55e", border: "#111f11", border2: "#1a2e1a",
};

// NEW — shared by SplashScreen (initial load) and HomeScreen (re-applied
// after a manual/auto refresh, so a theme change on the dashboard doesn't
// require restarting the launcher to show up). Branches on custom vs.
// preset theme mode — see the top of this file for why that branch
// existing at all is the actual fix, not just the expanded theme catalog.
export function applyProfileTheme(profile: { themeId?: string; customTheme?: CustomThemeColors } | undefined) {
  if (!profile) { applyTheme(getTheme("terminal")); return; }
  if (profile.themeId === "custom" && profile.customTheme) {
    applyTheme(buildCustomTheme(profile.customTheme));
  } else {
    applyTheme(getTheme(profile.themeId ?? "terminal"));
  }
}
