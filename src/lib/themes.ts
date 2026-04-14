export interface LauncherTheme {
  id: string; name: string;
  bg: string; bgSurface: string; bgElev: string;
  a0: string; a1: string; a2: string; a3: string;
  glow: string; border: string; border2: string;
}

export const THEMES: LauncherTheme[] = [
  { id:"terminal", name:"Terminal",  bg:"#040704", bgSurface:"#080d08", bgElev:"#0c130c", a0:"#052010", a1:"#0d3d1e", a2:"#22c55e", a3:"#86efac", glow:"#22c55e", border:"#111f11", border2:"#1a2e1a" },
  { id:"electric", name:"Electric",  bg:"#030508", bgSurface:"#06090f", bgElev:"#0a0e18", a0:"#06102a", a1:"#0f2050", a2:"#3b82f6", a3:"#93c5fd", glow:"#3b82f6", border:"#0d1528", border2:"#162040" },
  { id:"ember",    name:"Ember",     bg:"#070302", bgSurface:"#0e0604", bgElev:"#140a06", a0:"#200a02", a1:"#3d1206", a2:"#f97316", a3:"#fed7aa", glow:"#f97316", border:"#261006", border2:"#381808" },
  { id:"blood",    name:"Blood",     bg:"#070202", bgSurface:"#0e0404", bgElev:"#140606", a0:"#200404", a1:"#3d0a0a", a2:"#ef4444", a3:"#fca5a5", glow:"#ef4444", border:"#260808", border2:"#380e0e" },
  { id:"void",     name:"Void",      bg:"#040306", bgSurface:"#080510", bgElev:"#0c0818", a0:"#100828", a1:"#1e1048", a2:"#a855f7", a3:"#e9d5ff", glow:"#a855f7", border:"#180e38", border2:"#221850" },
  { id:"gold",     name:"Gold",      bg:"#060500", bgSurface:"#0c0a02", bgElev:"#120e04", a0:"#1a1200", a1:"#332200", a2:"#eab308", a3:"#fef08a", glow:"#eab308", border:"#221800", border2:"#342600" },
  { id:"matrix",   name:"Matrix",    bg:"#000200", bgSurface:"#010401", bgElev:"#020802", a0:"#021402", a1:"#042804", a2:"#22c55e", a3:"#bbf7d0", glow:"#22c55e", border:"#071407", border2:"#0e200e" },
];

export const getTheme = (id: string) => THEMES.find(t => t.id === id) ?? THEMES[0];

export function applyTheme(theme: LauncherTheme, root = document.documentElement) {
  root.style.setProperty("--bg-base",     theme.bg);
  root.style.setProperty("--bg-surface",  theme.bgSurface);
  root.style.setProperty("--bg-elevated", theme.bgElev);
  root.style.setProperty("--accent-0",    theme.a0);
  root.style.setProperty("--accent-1",    theme.a1);
  root.style.setProperty("--accent",      theme.a2);
  root.style.setProperty("--accent-3",    theme.a3);
  root.style.setProperty("--glow",        theme.glow);
  root.style.setProperty("--border",      theme.border);
  root.style.setProperty("--border-2",    theme.border2);
}
