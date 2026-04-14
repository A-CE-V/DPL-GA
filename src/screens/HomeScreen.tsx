import { useState, useEffect, useRef } from "react";
import {
  Play, Download, ChevronDown, X, Check,
  Globe, MessageCircle, Twitter, Github, Trash2, Settings, WifiOff,
  ArrowUpCircle, Loader,
} from "lucide-react";
import { FaItchIo, FaYoutube } from "react-icons/fa";
import {
  startDownload, getProgress, cancelDownload, launchGame,
  getInstalledVersion, deleteVersion, checkUrl, isTauri,
  type DownloadProgress,
} from "../lib/ipc";
import { fetchVersions, fetchChangelog, fetchMedia, GAME_ID, logSession } from "../lib/firebase";
import { checkForLauncherUpdate, type LauncherUpdate } from "../lib/updater";
import { loadPrefs } from "./SettingsScreen";
import type { GameConfig, GameVersion, ChangelogEntry, GameMedia, Platform, CanvasComponent } from "../types";

// ─── Platform detection ───────────────────────────────────────────────────────
function getCurrentPlatform(): Platform {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win"))    return "windows";
  if (ua.includes("mac"))    return "mac";
  if (ua.includes("linux"))  return "linux";
  if (ua.includes("android") || ua.includes("iphone")) return "mobile";
  return "windows";
}

// ─── Inject a custom font from a URL via @font-face ──────────────────────────
// Removes any previously injected custom font style to avoid accumulation.
const CUSTOM_FONT_STYLE_ID = "deploy-launcher-custom-font";

function injectCustomFont(fontName: string, fontUrl: string): void {
  // Remove existing
  document.getElementById(CUSTOM_FONT_STYLE_ID)?.remove();

  // Detect format from URL extension
  const ext     = fontUrl.split("?")[0].split(".").pop()?.toLowerCase() ?? "ttf";
  const fmtMap: Record<string, string> = {
    ttf:   "truetype",
    otf:   "opentype",
    woff:  "woff",
    woff2: "woff2",
  };
  const format = fmtMap[ext] ?? "truetype";

  const style   = document.createElement("style");
  style.id      = CUSTOM_FONT_STYLE_ID;
  style.textContent = `
    @font-face {
      font-family: '${fontName}';
      src: url('${fontUrl}') format('${format}');
      font-weight: 100 900;
      font-style: normal;
      font-display: swap;
    }
  `;
  document.head.appendChild(style);
}

function removeCustomFont(): void {
  document.getElementById(CUSTOM_FONT_STYLE_ID)?.remove();
}

// ─── Shared sub-components ────────────────────────────────────────────────────
function ProgressBar({ progress, accent }: { progress: DownloadProgress; accent: string }) {
  const pct   = Math.round(progress.percent);
  const speed = progress.speed_kbps > 0 ? progress.speed_kbps > 1024 ? `${(progress.speed_kbps/1024).toFixed(1)} MB/s` : `${Math.round(progress.speed_kbps)} KB/s` : "";
  const mb    = (n: number) => `${(n/1_048_576).toFixed(1)} MB`;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>{progress.status==="extracting"?"Extracting...":`${pct}% · ${speed}`}</span>
        {progress.total > 0 && <span style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "'DM Mono',monospace" }}>{mb(progress.downloaded)} / {mb(progress.total)}</span>}
      </div>
      <div style={{ height: 5, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: 3, transition: "width 0.3s ease", width: progress.status==="extracting"?"100%":`${pct}%`, background: `linear-gradient(90deg, ${accent}99, ${accent})`, animation: progress.status==="extracting"?"shimmer 1.2s ease infinite":"none" }} />
      </div>
    </div>
  );
}

function UpdateBanner({ update, accent, onDismiss }: { update: LauncherUpdate; accent: string; onDismiss: () => void }) {
  const [installing, setInstalling] = useState(false);
  return (
    <div style={{ margin: "12px 20px 0", padding: "10px 14px", borderRadius: 10, background: `${accent}0d`, border: `1px solid ${accent}30`, display: "flex", alignItems: "center", gap: 10 }}>
      <ArrowUpCircle size={15} color={accent} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 12, fontFamily: "'Syne',sans-serif", fontWeight: 700, color: "var(--text-primary)" }}>Launcher update available — v{update.version}</p>
        {update.notes && <p style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{update.notes}</p>}
      </div>
      <button onClick={async () => { setInstalling(true); try { await update.download(); } catch { setInstalling(false); } }} disabled={installing} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 7, border: "none", background: accent, color: "#000", fontFamily: "'Syne',sans-serif", fontSize: 11, fontWeight: 700, cursor: installing?"default":"pointer", flexShrink: 0, opacity: installing?0.7:1 }}>
        {installing ? <><Loader size={11} style={{ animation: "spin 0.65s linear infinite" }} /> Installing...</> : <><ArrowUpCircle size={11} /> Install</>}
      </button>
      {!installing && <button onClick={onDismiss} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-faint)", display: "flex", padding: 2 }}><X size={13} /></button>}
    </div>
  );
}

const SMALL_BTN: React.CSSProperties = { display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 7, background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", fontSize: 11, cursor: "pointer" };

function buildSocials(socials: GameConfig["socials"]) {
  return [
    { key: "discord", url: socials.discord, Icon: MessageCircle, label: "Discord"   },
    { key: "twitter", url: socials.twitter, Icon: Twitter,       label: "X/Twitter" },
    { key: "youtube", url: socials.youtube, Icon: FaYoutube,     label: "YouTube"   },
    { key: "github",  url: socials.github,  Icon: Github,        label: "GitHub"    },
    { key: "itch",    url: socials.itch,    Icon: FaItchIo,      label: "Itch.io"   },
    { key: "website", url: socials.website, Icon: Globe,         label: "Website"   },
  ].filter(s => !!s.url);
}

interface LayoutProps {
  config: GameConfig; fromCache: boolean; platform: Platform;
  versions: GameVersion[]; changelog: ChangelogEntry[]; media: GameMedia[];
  installing: Record<string, DownloadProgress>; installed: Record<string, boolean>;
  launching: boolean; expanded: string | null; mediaIdx: number;
  launcherUpdate: LauncherUpdate | null; updateDismissed: boolean;
  onDownload: (v: GameVersion) => void; onCancel: (tag: string) => void;
  onDelete: (tag: string) => void; onLaunch: (tag?: string) => void;
  onSettings: () => void;
  setExpanded: (id: string | null) => void; setMediaIdx: (i: number) => void;
  setUpdateDismissed: (v: boolean) => void;
}

// ════════════════════════════════════════════════════════════════════════════
// CANVAS LAYOUT RENDERER
// ════════════════════════════════════════════════════════════════════════════
function LayoutCanvas(p: LayoutProps) {
  const { config, fromCache, versions, media, changelog, installing, installed, launching, launcherUpdate, updateDismissed, expanded } = p;
  const { profile, settings, socials } = config;
  const accent  = profile.accentColor;
  const latest  = versions[0];
  const canLaunch = latest && installed[latest.tag] && !launching;
  const SOCIALS = buildSocials(socials);
  const layout  = profile.canvasLayout ?? [];
  const sorted  = [...layout].sort((a, b) => a.zIndex - b.zIndex);

  const renderComponent = (comp: CanvasComponent) => {
    const style: React.CSSProperties = { position: "absolute", left: comp.x, top: comp.y, width: comp.w, height: comp.h, zIndex: comp.zIndex, overflow: "hidden" };
    switch (comp.type) {
      case "game-title":
        return <div key={comp.id} style={style}><p style={{ fontFamily: "var(--launcher-font,'Syne',sans-serif)", fontSize: Math.max(12, comp.h * 0.55), fontWeight: 900, color: "var(--text-primary)", letterSpacing: "-0.02em", lineHeight: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile.title}</p></div>;
      case "author-label":
        return <div key={comp.id} style={style}><p style={{ fontFamily: "'DM Mono',monospace", fontSize: Math.max(9, comp.h * 0.45), color: "var(--text-faint)" }}>by {profile.author} · v{profile.version}</p></div>;
      case "game-description":
        return <div key={comp.id} style={{ ...style, overflowY: "auto" }}><p style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>{profile.description}</p></div>;
      case "launch-button":
        return <div key={comp.id} style={style}>{installing[latest?.tag??""] ? (
          <div style={{ width:"100%",height:"100%",background:"var(--bg-surface)",borderRadius:8,padding:"8px 12px",display:"flex",flexDirection:"column",justifyContent:"center",gap:6 }}>
            <div style={{ display:"flex",justifyContent:"space-between" }}><span style={{ fontSize:10,color:"var(--text-muted)",fontFamily:"'DM Mono',monospace" }}>Downloading...</span><button onClick={() => latest&&p.onCancel(latest.tag)} style={{ background:"none",border:"none",cursor:"pointer",color:"var(--text-faint)",display:"flex" }}><X size={11}/></button></div>
            {latest&&<ProgressBar progress={installing[latest.tag]} accent={accent}/>}
          </div>
        ) : (
          <button onClick={() => canLaunch?p.onLaunch():latest&&p.onDownload(latest)} disabled={launching} style={{ width:"100%",height:"100%",borderRadius:8,border:"none",background:canLaunch?accent:`${accent}22`,color:canLaunch?"#000":accent,fontFamily:"var(--launcher-font,'Syne',sans-serif)",fontSize:Math.max(11,comp.h*0.3),fontWeight:800,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8 }}>
            {launching?"Launching...":canLaunch?<><Play size={Math.min(18,comp.h*0.35)} fill="currentColor"/> Launch</>:<><Download size={Math.min(16,comp.h*0.3)}/> Download</>}
          </button>
        )}</div>;
      case "version-badge":
        return latest?<div key={comp.id} style={{ ...style,display:"flex",alignItems:"center" }}><span style={{ fontSize:10,padding:"3px 10px",borderRadius:99,background:`${accent}18`,color:accent,fontFamily:"'DM Mono',monospace",fontWeight:700,border:`1px solid ${accent}33`,whiteSpace:"nowrap" }}>{latest.status==="stable"?"✓":"⚠"} v{latest.tag}</span></div>:null;
      case "media-carousel":
        return <div key={comp.id} style={{ ...style,borderRadius:8,overflow:"hidden",background:"var(--bg-elevated)",border:"1px solid var(--border)",position:"relative" }}>
          {media[p.mediaIdx]?<img src={media[p.mediaIdx].url} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} onError={e=>{(e.currentTarget as HTMLImageElement).style.display="none";}}/>:<div style={{ width:"100%",height:"100%",background:`linear-gradient(135deg, var(--accent-1), var(--bg-base))` }}/>}
          {media.length>1&&<div style={{ position:"absolute",bottom:6,left:0,right:0,display:"flex",justifyContent:"center",gap:4 }}>{media.map((_,i)=><button key={i} onClick={()=>p.setMediaIdx(i)} style={{ width:i===p.mediaIdx?14:5,height:5,borderRadius:3,border:"none",background:i===p.mediaIdx?accent:"rgba(255,255,255,0.3)",cursor:"pointer",transition:"all 0.2s" }}/>)}</div>}
        </div>;
      case "social-links":
        return <div key={comp.id} style={{ ...style,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap" }}>
          {SOCIALS.map(({key,url,Icon,label})=><a key={key} href={url} target="_blank" rel="noopener noreferrer" title={label} style={{ display:"flex",alignItems:"center",justifyContent:"center",width:Math.min(30,comp.h*0.8),height:Math.min(30,comp.h*0.8),borderRadius:7,background:"var(--bg-elevated)",border:"1px solid var(--border)",color:"var(--text-muted)",textDecoration:"none",transition:"all 0.12s" }} onMouseEnter={e=>{e.currentTarget.style.borderColor=`${accent}44`;e.currentTarget.style.color=accent;}} onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border)";e.currentTarget.style.color="var(--text-muted)";}}><Icon size={12}/></a>)}
        </div>;
      case "settings-button":
        return <div key={comp.id} style={style}><button onClick={p.onSettings} style={{ width:"100%",height:"100%",borderRadius:7,background:"var(--bg-elevated)",border:"1px solid var(--border)",color:"var(--text-faint)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.12s" }} onMouseEnter={e=>{e.currentTarget.style.borderColor=`${accent}44`;e.currentTarget.style.color=accent;}} onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border)";e.currentTarget.style.color="var(--text-faint);";}}><Settings size={Math.min(16,comp.w*0.4)}/></button></div>;
      case "offline-badge":
        return fromCache?<div key={comp.id} style={{ ...style,display:"flex",alignItems:"center" }}><div style={{ display:"flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:99,background:"rgba(234,179,8,0.08)",border:"1px solid rgba(234,179,8,0.2)" }}><WifiOff size={9} color="#eab308"/><span style={{ fontSize:9,color:"#eab308",fontFamily:"'DM Mono',monospace" }}>offline</span></div></div>:null;
      case "progress-bar":
        return latest&&installing[latest.tag]?<div key={comp.id} style={{ ...style,background:"var(--bg-surface)",borderRadius:8,padding:"8px 12px",display:"flex",flexDirection:"column",justifyContent:"center",gap:6 }}><div style={{ display:"flex",justifyContent:"space-between" }}><span style={{ fontSize:10,color:"var(--text-muted)",fontFamily:"'DM Mono',monospace" }}>Downloading...</span><button onClick={()=>p.onCancel(latest.tag)} style={{ background:"none",border:"none",cursor:"pointer",color:"var(--text-faint)",display:"flex" }}><X size={11}/></button></div><ProgressBar progress={installing[latest.tag]} accent={accent}/></div>:null;
      case "changelog":
        return <div key={comp.id} style={{ ...style,overflowY:"auto",display:"flex",flexDirection:"column",gap:4 }}>
          {changelog.map(e=>{const tc:Record<string,string>={feature:"#22c55e",fix:"#60a5fa",breaking:"#f87171",other:"#94a3b8"};const color=tc[e.type]??"#94a3b8";return<div key={e.id} style={{ background:"var(--bg-surface)",border:"1px solid var(--border)",borderRadius:8,overflow:"hidden" }}><button onClick={()=>p.setExpanded(expanded===e.id?null:e.id)} style={{ width:"100%",padding:"8px 10px",background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:8 }}><div style={{ width:3,height:22,borderRadius:2,background:color,flexShrink:0 }}/><div style={{ flex:1,minWidth:0 }}><p style={{ fontSize:11,fontFamily:"var(--launcher-font,'Syne',sans-serif)",fontWeight:700,color:"var(--text-primary)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{e.title}</p><p style={{ fontSize:9,color:"var(--text-faint)" }}>v{e.version}·{e.date}</p></div><ChevronDown size={11} color="var(--text-faint)" style={{ transform:expanded===e.id?"rotate(180deg)":"none",transition:"transform 0.15s",flexShrink:0 }}/></button>{expanded===e.id&&e.body&&<div style={{ padding:"0 10px 8px 21px",fontSize:11,color:"var(--text-muted)",lineHeight:1.7 }}>{e.body}</div>}</div>;})}
        </div>;
      case "divider":
        return <div key={comp.id} style={style}><div style={{ width:"100%",height:1,background:"var(--border)" }}/></div>;
      case "spacer":
        return <div key={comp.id} style={style}/>;
      default:
        return null;
    }
  };

  return (
    <div style={{ position:"relative",width:"100%",height:"100vh",background:"var(--bg-base)",overflow:"hidden",fontFamily:"'DM Mono',monospace" }}>
      {launcherUpdate&&!updateDismissed&&<div style={{ position:"absolute",top:10,left:10,right:10,zIndex:99999 }}><UpdateBanner update={launcherUpdate} accent={accent} onDismiss={()=>p.setUpdateDismissed(true)}/></div>}
      {sorted.map(comp=>renderComponent(comp))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// LAYOUT 1 — CLASSIC
// ════════════════════════════════════════════════════════════════════════════
function LayoutClassic(p: LayoutProps) {
  const { config, fromCache, versions, changelog, media, installing, installed, launching, expanded, mediaIdx, launcherUpdate, updateDismissed } = p;
  const { profile, settings, socials } = config;
  const accent = profile.accentColor;
  const latest = versions[0];
  const canLaunch = latest && installed[latest.tag] && !launching;
  const SOCIALS = buildSocials(socials);
  const [tab, setTab] = useState<"home"|"versions"|"changelog">("home");

  return (
    <div style={{ minHeight:"100vh",background:"var(--bg-base)",display:"flex",flexDirection:"column",fontFamily:"'DM Mono',monospace" }}>
      <header style={{ background:"var(--bg-surface)",borderBottom:"1px solid var(--border)",padding:"10px 20px",display:"flex",alignItems:"center",gap:14 }}>
        <div style={{ flex:1 }}>
          {profile.logoUrl && <img src={profile.logoUrl} alt="" style={{ width:28,height:28,borderRadius:7,objectFit:"contain",marginRight:8,verticalAlign:"middle" }} onError={e=>{(e.currentTarget as HTMLImageElement).style.display="none";}}/>}
          <p style={{ fontFamily:"var(--launcher-font,'Syne',sans-serif)",fontSize:16,fontWeight:800,color:"var(--text-primary)",lineHeight:1,display:"inline" }}>{profile.title}</p>
          <p style={{ fontSize:10,color:"var(--text-faint)",marginTop:2 }}>by {profile.author} · v{profile.version}</p>
        </div>
        {fromCache&&<div style={{ display:"flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:99,background:"rgba(234,179,8,0.08)",border:"1px solid rgba(234,179,8,0.2)" }}><WifiOff size={10} color="#eab308"/><span style={{ fontSize:9,color:"#eab308" }}>offline</span></div>}
        <button onClick={p.onSettings} style={{ display:"flex",alignItems:"center",justifyContent:"center",width:32,height:32,borderRadius:8,background:"var(--bg-elevated)",border:"1px solid var(--border)",color:"var(--text-faint)",cursor:"pointer" }} onMouseEnter={e=>{e.currentTarget.style.borderColor=`${accent}44`;e.currentTarget.style.color=accent;}} onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border)";e.currentTarget.style.color="var(--text-faint);";}}><Settings size={14}/></button>
      </header>
      {launcherUpdate&&!updateDismissed&&<UpdateBanner update={launcherUpdate} accent={accent} onDismiss={()=>p.setUpdateDismissed(true)}/>}
      <div style={{ display:"flex",gap:2,padding:"0 20px",background:"var(--bg-surface)",borderBottom:"1px solid var(--border)",marginTop:launcherUpdate&&!updateDismissed?12:0 }}>
        {(["home","versions","changelog"] as const).map(t=><button key={t} onClick={()=>setTab(t)} style={{ padding:"10px 14px",fontSize:11,fontFamily:"'DM Mono',monospace",background:"none",border:"none",cursor:"pointer",color:tab===t?accent:"var(--text-muted)",borderBottom:`2px solid ${tab===t?accent:"transparent"}`,fontWeight:tab===t?600:400,textTransform:"capitalize",transition:"all 0.12s" }}>{t}</button>)}
      </div>
      <div style={{ flex:1,overflow:"auto",padding:"20px" }}>
        {tab==="home"&&(
          <div style={{ display:"flex",flexDirection:"column",gap:16,maxWidth:600 }}>
            {profile.description&&<p style={{ fontSize:13,color:"var(--text-muted)",lineHeight:1.7 }}>{profile.description}</p>}
            {media.length>0&&(
              <div style={{ borderRadius:10,overflow:"hidden",background:"var(--bg-surface)",border:"1px solid var(--border)",aspectRatio:"16/9",position:"relative" }}>
                <img src={media[mediaIdx]?.url} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} onError={e=>{(e.currentTarget as HTMLImageElement).style.display="none";}}/>
                {media.length>1&&<div style={{ position:"absolute",bottom:8,left:0,right:0,display:"flex",justifyContent:"center",gap:4 }}>{media.map((_,i)=><button key={i} onClick={()=>p.setMediaIdx(i)} style={{ width:i===mediaIdx?18:6,height:6,borderRadius:3,border:"none",background:i===mediaIdx?accent:"rgba(255,255,255,0.3)",cursor:"pointer",transition:"all 0.2s" }}/>)}</div>}
              </div>
            )}
            {latest&&(installing[latest.tag]?(
              <div style={{ background:"var(--bg-surface)",border:"1px solid var(--border)",borderRadius:10,padding:"12px 16px" }}>
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8 }}><span style={{ fontSize:11,color:"var(--text-muted)" }}>Downloading v{latest.tag}...</span><button onClick={()=>p.onCancel(latest.tag)} style={{ background:"none",border:"none",cursor:"pointer",color:"var(--text-faint)",display:"flex" }}><X size={13}/></button></div>
                <ProgressBar progress={installing[latest.tag]} accent={accent}/>
              </div>
            ):(
              <button onClick={()=>canLaunch?p.onLaunch():p.onDownload(latest)} disabled={launching} style={{ height:44,borderRadius:10,border:"none",background:canLaunch?accent:`${accent}22`,color:canLaunch?"#000":accent,fontFamily:"var(--launcher-font,'Syne',sans-serif)",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,transition:"all 0.12s" }}>
                {launching?"Launching...":canLaunch?<><Play size={15} fill="currentColor"/> Launch v{latest.tag}</>:<><Download size={14}/> Download v{latest.tag}</>}
              </button>
            ))}
            {SOCIALS.length>0&&<div style={{ display:"flex",gap:7,flexWrap:"wrap",paddingTop:4 }}>{SOCIALS.map(({key,url,Icon,label})=><a key={key} href={url} target="_blank" rel="noopener noreferrer" style={{ display:"flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:8,background:"var(--bg-surface)",border:"1px solid var(--border)",color:"var(--text-muted)",fontSize:11,textDecoration:"none",transition:"all 0.12s" }} onMouseEnter={e=>{e.currentTarget.style.borderColor=`${accent}44`;e.currentTarget.style.color=accent;}} onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border)";e.currentTarget.style.color="var(--text-muted)";}}><Icon size={12}/> {label}</a>)}</div>}
          </div>
        )}
        {tab==="versions"&&(
          <div style={{ display:"flex",flexDirection:"column",gap:8,maxWidth:600 }}>
            {versions.map(v=>{const inProg=installing[v.tag];const isInst=installed[v.tag];const isLatest=v.id===versions[0]?.id;const hasMirrors=v[p.platform].length>0;return<div key={v.id} style={{ background:"var(--bg-surface)",border:`1px solid ${isLatest?accent+"33":"var(--border)"}`,borderRadius:10,padding:"12px 16px" }}><div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:inProg?10:0 }}><div style={{ flex:1 }}><div style={{ display:"flex",alignItems:"center",gap:8 }}><span style={{ fontFamily:"var(--launcher-font,'Syne',sans-serif)",fontSize:14,fontWeight:700,color:"var(--text-primary)" }}>v{v.tag}</span>{isLatest&&<span style={{ fontSize:9,padding:"2px 6px",borderRadius:4,background:`${accent}20`,color:accent,fontWeight:700 }}>LATEST</span>}{v.status==="bugged"&&<span style={{ fontSize:9,padding:"2px 6px",borderRadius:4,background:"rgba(239,68,68,0.12)",color:"#f87171",fontWeight:700 }}>BUGGED</span>}{isInst&&<Check size={12} color={accent}/>}</div><span style={{ fontSize:10,color:"var(--text-faint)",marginTop:2,display:"block" }}>{v.date}</span></div><div style={{ display:"flex",gap:6 }}>{isInst?<>{(settings.allowVersionRollback||isLatest)&&<button onClick={()=>p.onLaunch(v.tag)} style={{ ...SMALL_BTN,background:`${accent}20`,color:accent,border:`1px solid ${accent}33` }}><Play size={11} fill="currentColor"/> Launch</button>}<button onClick={()=>p.onDelete(v.tag)} style={{ ...SMALL_BTN,background:"rgba(239,68,68,0.07)",color:"#f87171",border:"1px solid rgba(239,68,68,0.15)" }}><Trash2 size={11}/></button></>:inProg?<button onClick={()=>p.onCancel(v.tag)} style={SMALL_BTN}><X size={11}/> Cancel</button>:hasMirrors?<button onClick={()=>p.onDownload(v)} style={{ ...SMALL_BTN,background:`${accent}20`,color:accent,border:`1px solid ${accent}33` }}><Download size={11}/> Download</button>:<span style={{ fontSize:10,color:"var(--text-faint)" }}>No {p.platform} build</span>}</div></div>{inProg&&<ProgressBar progress={inProg} accent={accent}/>}</div>;})}
          </div>
        )}
        {tab==="changelog"&&(
          <div style={{ display:"flex",flexDirection:"column",gap:6,maxWidth:600 }}>
            {changelog.map(e=>{const tc:Record<string,string>={feature:"#22c55e",fix:"#60a5fa",breaking:"#f87171",other:"#94a3b8"};const color=tc[e.type]??"#94a3b8";return<div key={e.id} style={{ background:"var(--bg-surface)",border:"1px solid var(--border)",borderRadius:10,overflow:"hidden" }}><button onClick={()=>p.setExpanded(expanded===e.id?null:e.id)} style={{ width:"100%",padding:"11px 14px",background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:10 }}><div style={{ width:3,height:28,borderRadius:2,background:color,flexShrink:0 }}/><div style={{ flex:1,minWidth:0 }}><p style={{ fontSize:12,fontFamily:"var(--launcher-font,'Syne',sans-serif)",fontWeight:700,color:"var(--text-primary)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{e.title}</p><p style={{ fontSize:10,color:"var(--text-faint)",marginTop:1 }}>v{e.version} · {e.date}</p></div><span style={{ fontSize:9,padding:"2px 6px",borderRadius:4,background:`${color}18`,color,fontFamily:"'DM Mono',monospace",fontWeight:700,textTransform:"uppercase" }}>{e.type}</span><ChevronDown size={13} color="var(--text-faint)" style={{ transform:expanded===e.id?"rotate(180deg)":"none",transition:"transform 0.15s" }}/></button>{expanded===e.id&&e.body&&<div style={{ padding:"0 14px 12px 27px",fontSize:12,color:"var(--text-muted)",lineHeight:1.7 }}>{e.body}</div>}</div>;})}
            {changelog.length===0&&<p style={{ fontSize:12,color:"var(--text-faint)",textAlign:"center",padding:"32px 0" }}>No changelog entries yet.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// LAYOUT 2-5 placeholders (same as Phase C — omitted for brevity, keep from phaseC)
// The real implementations are in phaseC/launcher/src/screens/HomeScreen.tsx
// Phase D only adds font injection logic to the main HomeScreen orchestrator
// ════════════════════════════════════════════════════════════════════════════
// NOTE: Copy LayoutMinimal, LayoutMediaHero, LayoutSplit, LayoutArcade
// from phaseC/launcher/src/screens/HomeScreen.tsx — they are unchanged.
// Only LayoutClassic above is updated (adds logo to header).
// The font injection logic below is the Phase D addition.

// ════════════════════════════════════════════════════════════════════════════
// MAIN HomeScreen — Phase D font injection
// ════════════════════════════════════════════════════════════════════════════
interface Props {
  config: GameConfig; fromCache?: boolean; onOpenSettings: () => void;
}

export function HomeScreen({ config, fromCache = false, onOpenSettings }: Props) {
  const { profile, settings } = config;
  const platform = getCurrentPlatform();
  const prefs    = loadPrefs();

  const [versions,        setVersions]        = useState<GameVersion[]>([]);
  const [changelog,       setChangelog]        = useState<ChangelogEntry[]>([]);
  const [media,           setMedia]            = useState<GameMedia[]>([]);
  const [mediaIdx,        setMediaIdx]         = useState(0);
  const [installing,      setInstalling]       = useState<Record<string, DownloadProgress>>({});
  const [installed,       setInstalled]        = useState<Record<string, boolean>>({});
  const [launching,       setLaunching]        = useState(false);
  const [expanded,        setExpanded]         = useState<string | null>(null);
  const [launcherUpdate,  setLauncherUpdate]   = useState<LauncherUpdate | null>(null);
  const [updateDismissed, setUpdateDismissed]  = useState(false);
  const sessionStart = useRef(Date.now());

  // ── Phase D — Font injection ──────────────────────────────────────────────
  // Priority: customFontUrl (uploaded file) > fontFamily (Google Font) > default
  useEffect(() => {
    if (profile.customFontUrl && profile.fontFamily) {
      // Custom uploaded font — inject @font-face from Storage URL
      injectCustomFont(profile.fontFamily, profile.customFontUrl);
      document.documentElement.style.setProperty("--launcher-font", `'${profile.fontFamily}', sans-serif`);
    } else if (profile.fontFamily) {
      // Google Font — load via CDN link injection
      removeCustomFont();
      const existing = document.querySelector(`link[data-gf="${profile.fontFamily}"]`);
      if (!existing) {
        const safeName = profile.fontFamily.replace(/ /g, "+");
        const link     = document.createElement("link");
        link.rel        = "stylesheet";
        link.href       = `https://fonts.googleapis.com/css2?family=${safeName}:wght@400;700;800;900&display=swap`;
        link.dataset.gf = profile.fontFamily;
        document.head.appendChild(link);
      }
      document.documentElement.style.setProperty("--launcher-font", `'${profile.fontFamily}', sans-serif`);
    } else {
      // Default — remove everything
      removeCustomFont();
      document.documentElement.style.removeProperty("--launcher-font");
    }
  }, [profile.fontFamily, profile.customFontUrl]);

  useEffect(() => { fetchVersions().then(setVersions); fetchChangelog().then(setChangelog); fetchMedia().then(setMedia); }, []);
  useEffect(() => { checkForLauncherUpdate().then(u => { if (u) setLauncherUpdate(u); }); }, []);
  useEffect(() => {
    if (!isTauri() || !versions.length) return;
    Promise.all(versions.map(v => getInstalledVersion(GAME_ID, v.tag).then(r => [v.tag, !!r] as const))).then(r => setInstalled(Object.fromEntries(r)));
  }, [versions]);
  useEffect(() => {
    const latest = versions[0];
    if (!latest || !settings.autoUpdateOnLaunch || prefs.disableAutoUpdate) return;
    if (!installed[latest.tag] && !installing[latest.tag]) handleDownload(latest);
  }, [versions, installed]);
  useEffect(() => {
    const activeKeys = Object.keys(installing).filter(k => installing[k].status==="downloading"||installing[k].status==="extracting");
    if (!activeKeys.length) return;
    const timer = setInterval(async () => {
      const updates: Record<string, DownloadProgress> = {};
      await Promise.all(activeKeys.map(async tag => { const pr = await getProgress(GAME_ID, tag).catch(() => null); if (pr) updates[tag] = pr; }));
      setInstalling(prev => {
        const next = { ...prev, ...updates };
        for (const k of Object.keys(next)) {
          if (next[k].status==="done") { setInstalled(ins => ({ ...ins, [k]: true })); delete next[k]; }
          else if (next[k].status==="error"||next[k].status==="cancelled") { delete next[k]; }
        }
        return next;
      });
    }, 800);
    return () => clearInterval(timer);
  }, [installing]);
  useEffect(() => {
    return () => {
      if (!prefs.analyticsOptOut && settings.collectAnalytics) {
        const min = Math.round((Date.now() - sessionStart.current) / 60_000);
        if (min > 0) logSession({ platform, version: profile.version, durationMin: min });
      }
    };
  }, []);

  const handleDownload = async (v: GameVersion) => {
    const mirrors = v[platform]; if (!mirrors.length) return;
    let url = mirrors[0].url;
    if (isTauri()) { for (const m of mirrors) { const ok = await checkUrl(m.url).catch(() => false); if (ok) { url = m.url; break; } } }
    setInstalling(prev => ({ ...prev, [v.tag]: { downloaded: 0, total: 0, percent: 0, speed_kbps: 0, status: "downloading" } }));
    await startDownload(GAME_ID, v.tag, url).catch(console.error);
  };
  const handleCancel = async (tag: string) => { await cancelDownload(GAME_ID, tag).catch(console.error); setInstalling(prev => { const n={...prev}; delete n[tag]; return n; }); };
  const handleDelete = async (tag: string) => { await deleteVersion(GAME_ID, tag).catch(console.error); setInstalled(prev => ({ ...prev, [tag]: false })); };
  const handleLaunch = async (tag?: string) => { const t = tag??versions[0]?.tag; if (!t) return; setLaunching(true); await launchGame(GAME_ID, t).catch(console.error); setTimeout(() => setLaunching(false), 3000); };

  const layoutProps: LayoutProps = {
    config, fromCache, platform, versions, changelog, media,
    installing, installed, launching, expanded, mediaIdx,
    launcherUpdate, updateDismissed,
    onDownload: handleDownload, onCancel: handleCancel,
    onDelete: handleDelete, onLaunch: handleLaunch,
    onSettings: onOpenSettings,
    setExpanded, setMediaIdx, setUpdateDismissed,
  };

  const template = profile.layoutTemplate ?? "classic";

  // Canvas layout takes priority if canvasLayout is set
  if (profile.canvasLayout?.length) return <LayoutCanvas {...layoutProps} />;

  // All templates fall through to LayoutClassic in this file.
  // For Minimal/MediaHero/Split/Arcade, copy those functions from phaseC.
  return <LayoutClassic {...layoutProps} />;
}
