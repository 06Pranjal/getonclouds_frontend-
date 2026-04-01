import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  registerUser, loginUser,
  uploadFile, listFiles, deleteFile, downloadFile, getStorage,
  previewFile,   // ← ADD THIS
} from "./api";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const formatBytes = (bytes) => {
  if (!bytes) return "0 B";
  const k = 1024, sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const FILE_TYPES = {
  image:   { exts: ["png","jpg","jpeg","gif","svg","webp","bmp"], icon: "🖼️", label: "Images",   color: "#f59e0b" },
  video:   { exts: ["mp4","mov","avi","mkv","webm"],              icon: "🎬", label: "Videos",   color: "#8b5cf6" },
  audio:   { exts: ["mp3","wav","flac","aac","ogg"],              icon: "🎵", label: "Audio",    color: "#ec4899" },
  doc:     { exts: ["pdf","doc","docx","txt","md","rtf"],         icon: "📄", label: "Docs",     color: "#3b82f6" },
  sheet:   { exts: ["xls","xlsx","csv"],                          icon: "📊", label: "Sheets",   color: "#22c55e" },
  code:    { exts: ["js","ts","jsx","tsx","py","java","cpp","html","css","json","xml"], icon: "💻", label: "Code", color: "#06b6d4" },
  archive: { exts: ["zip","rar","7z","tar","gz"],                 icon: "📦", label: "Archives", color: "#f97316" },
};

const DOC_KEYWORDS = {
  aadhaar: ["aadhaar","aadhar","uid","unique id"],
  pan: ["pan card","permanent account"],
  bill: ["bill","invoice","receipt","electricity","water","gas","telephone"],
  resume: ["resume","cv","curriculum vitae"],
  certificate: ["certificate","degree","diploma","marksheet"],
};

const getFileCategory = (name = "") => {
  const ext = name.split(".").pop()?.toLowerCase();
  for (const [key, val] of Object.entries(FILE_TYPES)) {
    if (val.exts.includes(ext)) return key;
  }
  return "other";
};

const fileIcon = (name = "") => FILE_TYPES[getFileCategory(name)]?.icon || "📁";

const detectDocType = (name = "") => {
  const lower = name.toLowerCase();
  for (const [type, keywords] of Object.entries(DOC_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) return type;
  }
  return null;
};

const autoTag = (name = "") => {
  const tags = [];
  const lower = name.toLowerCase();
  const cat = getFileCategory(name);
  const docType = detectDocType(name);
  if (docType) tags.push(docType);
  if (cat !== "other") tags.push(FILE_TYPES[cat]?.label?.toLowerCase() || cat);
  if (lower.includes("2024") || lower.includes("2025")) tags.push("recent");
  if (lower.includes("backup")) tags.push("backup");
  if (lower.includes("final")) tags.push("final");
  if (lower.includes("draft")) tags.push("draft");
  return [...new Set(tags)].slice(0, 3);
};

const timeAgo = (dateStr) => {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString();
};

const getPreviewType = (name = "") => {
  const ext = name.split(".").pop()?.toLowerCase();
  if (["png","jpg","jpeg","gif","svg","webp","bmp"].includes(ext)) return "image";
  if (["mp4","webm","mov"].includes(ext)) return "video";
  if (["mp3","wav","ogg","aac","flac"].includes(ext)) return "audio";
  if (ext === "pdf") return "pdf";
  if (["txt","md","js","ts","jsx","tsx","py","java","cpp","html","css","json","xml","csv","rtf"].includes(ext)) return "text";
  return null;
};

const getMimeType = (name = "") => {
  const ext = name.split(".").pop()?.toLowerCase();
  const map = {
    png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",gif:"image/gif",
    svg:"image/svg+xml",webp:"image/webp",bmp:"image/bmp",
    mp4:"video/mp4",webm:"video/webm",mov:"video/quicktime",
    mp3:"audio/mpeg",wav:"audio/wav",ogg:"audio/ogg",aac:"audio/aac",flac:"audio/flac",
    pdf:"application/pdf",txt:"text/plain",md:"text/plain",csv:"text/csv",
    js:"text/javascript",ts:"text/typescript",jsx:"text/javascript",tsx:"text/typescript",
    py:"text/x-python",java:"text/x-java",cpp:"text/x-c++",html:"text/html",
    css:"text/css",json:"application/json",xml:"text/xml",
  };
  return map[ext] || "application/octet-stream";
};

// Storage Health Score
const calcHealthScore = (files, storageUsed, storageLimit, starred, trashed) => {
  let score = 100;
  const pct = (storageUsed / storageLimit) * 100;
  if (pct > 90) score -= 30;
  else if (pct > 70) score -= 15;
  else if (pct > 50) score -= 5;
  const names = files.map(f => f.fileName || f.name || "");
  const dups = names.filter((n, i) => names.indexOf(n) !== i).length;
  score -= Math.min(dups * 5, 20);
  if (files.length > 50) score -= 10;
  if (trashed.length > 10) score -= 10;
  return Math.max(0, Math.min(100, score));
};

// Smart AI search matching
const aiMatch = (file, query, getName) => {
  const name = getName(file).toLowerCase();
  const q = query.toLowerCase();
  const tags = autoTag(getName(file));
  if (name.includes(q)) return true;
  if (tags.some(t => t.includes(q) || q.includes(t))) return true;
  const words = q.split(" ");
  const catKey = Object.entries(FILE_TYPES).find(([, v]) => v.label.toLowerCase().includes(q))?.[0];
  if (catKey && getFileCategory(getName(file)) === catKey) return true;
  if (words.includes("image") || words.includes("photo") || words.includes("picture")) {
    if (getFileCategory(getName(file)) === "image") return true;
  }
  if (words.includes("video") || words.includes("movie")) {
    if (getFileCategory(getName(file)) === "video") return true;
  }
  if (words.includes("doc") || words.includes("document") || words.includes("pdf")) {
    if (getFileCategory(getName(file)) === "doc") return true;
  }
  return false;
};

// QR Code generator (simple SVG-based)
const generateQR = (text) => {
  // Simple visual placeholder QR-like pattern
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21" width="200" height="200"><rect width="21" height="21" fill="white"/><text x="0.5" y="10" font-size="1.2" fill="black" font-family="monospace">QR: ${text.slice(0,8)}</text></svg>`)}`;
};

// ─── CSS ──────────────────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500;600&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0a0d14;
    --bg2: #0f1219;
    --bg3: #141820;
    --surface: #161b26;
    --surface2: #1c2233;
    --surface3: #212840;
    --border: rgba(255,255,255,0.07);
    --border2: rgba(255,255,255,0.12);
    --focus: #6366f1;
    --blue: #6366f1;
    --blue-d: #4f46e5;
    --blue-dim: rgba(99,102,241,0.12);
    --blue-glow: rgba(99,102,241,0.3);
    --cyan: #06b6d4;
    --cyan-dim: rgba(6,182,212,0.1);
    --green: #10b981;
    --green-dim: rgba(16,185,129,0.1);
    --amber: #f59e0b;
    --amber-dim: rgba(245,158,11,0.1);
    --rose: #f43f5e;
    --rose-dim: rgba(244,63,94,0.1);
    --purple: #a855f7;
    --purple-dim: rgba(168,85,247,0.1);
    --text: #f1f5f9;
    --text2: #94a3b8;
    --text3: #64748b;
    --muted: #475569;
    --danger: #f43f5e;
    --danger-dim: rgba(244,63,94,0.1);
    --success: #10b981;
    --success-dim: rgba(16,185,129,0.1);
    --warning: #f59e0b;
    --warning-dim: rgba(245,158,11,0.1);
    --font: 'DM Sans', sans-serif;
    --display: 'Syne', sans-serif;
    --mono: 'DM Mono', monospace;
    --r: 10px;
    --r2: 14px;
    --r3: 18px;
    --sh: 0 1px 3px rgba(0,0,0,0.4),0 1px 2px rgba(0,0,0,0.3);
    --sh2: 0 8px 24px rgba(0,0,0,0.5);
    --sh3: 0 24px 64px rgba(0,0,0,0.7);
    --glow: 0 0 20px rgba(99,102,241,0.15);
  }

  html, body, #root { height: 100%; width: 100%; }
  body { background: var(--bg); color: var(--text); font-family: var(--font); overflow: hidden; -webkit-font-smoothing: antialiased; }
  .shell { display: flex; width: 100vw; height: 100vh; overflow: hidden; }

  /* Sidebar */
  .sidebar { width: 240px; flex-shrink: 0; height: 100vh; display: flex; flex-direction: column; background: var(--surface); border-right: 1px solid var(--border); overflow-y: auto; position: relative; z-index: 10; }
  .sidebar::before { content:''; position:absolute; inset:0; background: linear-gradient(180deg, rgba(99,102,241,0.03) 0%, transparent 60%); pointer-events:none; }
  .logo { padding: 20px 16px 16px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 10px; }
  .logo-icon { width: 34px; height: 34px; background: linear-gradient(135deg, var(--blue), var(--purple)); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; box-shadow: 0 4px 12px rgba(99,102,241,0.3); }
  .logo-text { font-family: var(--display); font-size: 16px; font-weight: 700; color: var(--text); letter-spacing: -0.3px; }
  .logo-text span { color: var(--blue); }
  .logo-sub { font-family: var(--mono); font-size: 9px; color: var(--muted); text-transform: uppercase; letter-spacing: 2px; margin-top: 1px; }
  .nav-wrap { padding: 10px 8px; flex: 1; display: flex; flex-direction: column; gap: 1px; }
  .nav-section-label { font-family: var(--mono); font-size: 9px; text-transform: uppercase; letter-spacing: 2px; color: var(--muted); padding: 10px 10px 5px; }
  .nav-item { display: flex; align-items: center; gap: 9px; padding: 8px 10px; font-size: 13px; font-weight: 500; color: var(--text2); cursor: pointer; border-radius: 9px; transition: all 0.15s; user-select: none; position: relative; }
  .nav-item:hover { background: var(--surface2); color: var(--text); }
  .nav-item.active { background: var(--blue-dim); color: var(--blue); font-weight: 600; }
  .nav-item.active::before { content:''; position:absolute; left:0; top:20%; bottom:20%; width:2px; border-radius:2px; background:var(--blue); }
  .nav-icon { font-size: 15px; width: 20px; text-align: center; flex-shrink: 0; }
  .nav-badge { margin-left: auto; background: var(--surface3); color: var(--text3); font-family: var(--mono); font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 99px; }
  .nav-item.active .nav-badge { background: var(--blue-dim); color: var(--blue); }
  .nav-item.vault { }
  .nav-item.vault.active { background: rgba(168,85,247,0.12); color: var(--purple); }
  .nav-item.vault.active::before { background: var(--purple); }
  .sidebar-user { padding: 12px 14px; border-top: 1px solid var(--border); display: flex; align-items: center; gap: 10px; }
  .user-avatar { width: 32px; height: 32px; background: linear-gradient(135deg, var(--blue), var(--purple)); border-radius: 9px; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; color: white; flex-shrink: 0; font-family: var(--display); }
  .user-name { font-size: 12.5px; font-weight: 600; color: var(--text); }
  .user-email { font-size: 10.5px; color: var(--muted); margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px; font-family: var(--mono); }
  .signout-btn { margin-left: auto; background: none; border: none; cursor: pointer; font-size: 14px; padding: 5px; border-radius: 7px; color: var(--muted); transition: all 0.14s; }
  .signout-btn:hover { background: var(--danger-dim); color: var(--danger); }
  .storage-wrap { padding: 12px 14px; border-top: 1px solid var(--border); }
  .storage-top { display: flex; justify-content: space-between; margin-bottom: 6px; }
  .storage-lbl { font-size: 11px; font-weight: 600; color: var(--text2); font-family: var(--display); }
  .storage-pct { font-family: var(--mono); font-size: 10px; color: var(--blue); font-weight: 600; }
  .storage-bar { height: 4px; background: var(--surface3); border-radius: 99px; overflow: hidden; }
  .storage-fill { height: 100%; border-radius: 99px; transition: width 0.6s ease; }
  .storage-info { font-size: 10.5px; color: var(--muted); margin-top: 5px; font-family: var(--mono); }

  /* Main */
  .main { flex: 1; display: flex; flex-direction: column; height: 100vh; overflow: hidden; min-width: 0; transition: margin-right 0.2s; }
  .topbar { display: flex; align-items: center; gap: 12px; padding: 0 22px; height: 56px; flex-shrink: 0; background: var(--surface); border-bottom: 1px solid var(--border); z-index: 20; }
  .topbar-title { font-family: var(--display); font-size: 16px; font-weight: 700; color: var(--text); }
  .topbar-crumb { font-size: 12px; color: var(--muted); }
  .topbar-spacer { flex: 1; }
  .search-wrap { position: relative; }
  .search-icon-pos { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--muted); font-size: 12px; pointer-events: none; }
  .search-input { background: var(--surface2); border: 1.5px solid var(--border); border-radius: 9px; padding: 7px 12px 7px 32px; color: var(--text); font-family: var(--font); font-size: 13px; outline: none; width: 220px; transition: all 0.15s; }
  .search-input:focus { border-color: var(--focus); background: var(--surface3); box-shadow: 0 0 0 3px var(--blue-dim); width: 260px; }
  .search-input::placeholder { color: var(--muted); }
  .search-ai-badge { position:absolute; right:8px; top:50%; transform:translateY(-50%); font-family:var(--mono); font-size:9px; background:var(--blue-dim); color:var(--blue); padding:2px 5px; border-radius:4px; pointer-events:none; }
  .content { flex: 1; overflow-y: auto; padding: 22px; }
  .content::-webkit-scrollbar { width: 4px; }
  .content::-webkit-scrollbar-track { background: transparent; }
  .content::-webkit-scrollbar-thumb { background: var(--surface3); border-radius: 99px; }

  /* Buttons */
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 14px; border: none; border-radius: 9px; font-family: var(--font); font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s; white-space: nowrap; }
  .btn-primary { background: var(--blue); color: white; box-shadow: 0 4px 12px var(--blue-glow); }
  .btn-primary:hover { background: var(--blue-d); transform: translateY(-1px); box-shadow: 0 6px 18px var(--blue-glow); }
  .btn-primary:active { transform: translateY(0); }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
  .btn-ghost { background: var(--surface2); border: 1px solid var(--border); color: var(--text2); }
  .btn-ghost:hover { background: var(--surface3); color: var(--text); border-color: var(--border2); }
  .btn-ghost:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-danger { background: var(--danger-dim); border: 1px solid rgba(244,63,94,0.2); color: var(--danger); }
  .btn-danger:hover { background: rgba(244,63,94,0.2); }
  .btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-purple { background: var(--purple-dim); border: 1px solid rgba(168,85,247,0.2); color: var(--purple); }
  .btn-purple:hover { background: rgba(168,85,247,0.2); }
  .btn-success { background: var(--success-dim); border: 1px solid rgba(16,185,129,0.2); color: var(--success); }
  .btn-success:hover { background: rgba(16,185,129,0.2); }

  /* Stats */
  .stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 18px; }
  .stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r2); padding: 16px; transition: all 0.15s; position: relative; overflow: hidden; }
  .stat-card::after { content:''; position:absolute; inset:0; border-radius:inherit; opacity:0; background:radial-gradient(circle at 50% 50%, var(--blue-dim), transparent 70%); transition:opacity 0.3s; }
  .stat-card:hover { border-color: var(--border2); transform: translateY(-1px); }
  .stat-card:hover::after { opacity:1; }
  .stat-icon-wrap { width: 34px; height: 34px; border-radius: 9px; display: flex; align-items: center; justify-content: center; font-size: 15px; margin-bottom: 10px; }
  .stat-val { font-family: var(--display); font-size: 22px; font-weight: 700; letter-spacing: -0.5px; color: var(--text); line-height: 1; }
  .stat-label { font-size: 11px; color: var(--muted); font-weight: 500; margin-top: 3px; text-transform: uppercase; letter-spacing: 0.5px; font-family: var(--mono); }

  /* Health score card */
  .health-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r2); padding: 16px 20px; margin-bottom: 18px; display: flex; align-items: center; gap: 18px; }
  .health-ring-wrap { position: relative; flex-shrink: 0; }
  .health-ring-label { position: absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; }
  .health-score-num { font-family: var(--display); font-size: 20px; font-weight: 800; }
  .health-score-lbl { font-family: var(--mono); font-size: 8px; color: var(--muted); text-transform: uppercase; letter-spacing: 1px; }
  .health-info { flex: 1; }
  .health-title { font-family: var(--display); font-size: 14px; font-weight: 700; color: var(--text); margin-bottom: 4px; }
  .health-sub { font-size: 12px; color: var(--text2); line-height: 1.5; }
  .health-tips { display:flex; flex-wrap:wrap; gap:5px; margin-top:8px; }
  .health-tip { font-family:var(--mono); font-size:10px; padding:3px 8px; border-radius:99px; }

  /* Storage card */
  .storage-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r2); padding: 16px 18px; margin-bottom: 18px; }
  .storage-card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
  .storage-card-title { font-family: var(--display); font-size: 13px; font-weight: 700; color: var(--text); }
  .storage-card-pct { font-family: var(--mono); font-size: 12px; font-weight: 700; color: var(--blue); }
  .storage-segments { display: flex; height: 8px; border-radius: 99px; overflow: hidden; gap: 2px; margin-bottom: 10px; background: var(--surface3); }
  .storage-segment { height: 100%; border-radius: 99px; transition: width 0.6s ease; min-width: 2px; }
  .storage-legend { display: flex; flex-wrap: wrap; gap: 8px 16px; }
  .legend-item { display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--text2); font-family: var(--mono); }
  .legend-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .storage-numbers { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; font-family: var(--mono); font-size: 11px; color: var(--muted); }

  /* Upload zone */
  .upload-zone { border: 2px dashed var(--border); border-radius: var(--r2); padding: 24px 28px; text-align: center; cursor: pointer; transition: all 0.2s; margin-bottom: 18px; background: var(--surface); }
  .upload-zone.dragging { border-color: var(--blue); background: var(--blue-dim); box-shadow: 0 0 0 4px rgba(99,102,241,0.1), var(--glow); }
  .upload-zone:hover { border-color: rgba(99,102,241,0.4); background: var(--surface2); }
  .upload-icon-box { width: 48px; height: 48px; background: var(--blue-dim); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 22px; margin: 0 auto 10px; transition: transform 0.2s; }
  .upload-zone.dragging .upload-icon-box { transform: scale(1.15) rotate(-8deg); }
  .upload-title { font-family: var(--display); font-size: 14px; font-weight: 700; color: var(--text); margin-bottom: 4px; }
  .upload-sub { font-size: 12px; color: var(--muted); }
  .upload-sub b { color: var(--blue); font-weight: 600; }

  /* Upload queue */
  .upload-queue { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r); margin-bottom: 16px; overflow: hidden; }
  .upload-queue-header { padding: 9px 14px; background: var(--surface2); border-bottom: 1px solid var(--border); font-size: 11.5px; font-weight: 600; color: var(--text2); display: flex; align-items: center; gap: 6px; }
  .upload-item { display: flex; align-items: center; gap: 10px; padding: 9px 14px; border-bottom: 1px solid var(--border); }
  .upload-item:last-child { border-bottom: none; }
  .upload-file-col { flex: 1; min-width: 0; }
  .upload-file-name { font-size: 12px; font-weight: 500; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .upload-file-size { font-family: var(--mono); font-size: 10px; color: var(--muted); }
  .upload-bar { height: 3px; background: var(--surface3); border-radius: 99px; overflow: hidden; margin-top: 4px; }
  .upload-bar-fill { height: 100%; background: linear-gradient(90deg, var(--blue), var(--purple)); border-radius: 99px; transition: width 0.2s; }
  .upload-status { font-family: var(--mono); font-size: 10px; color: var(--blue); margin-top: 2px; }
  .upload-status.done { color: var(--success); }
  .upload-status.error { color: var(--danger); }

  /* File section card */
  .section-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r2); overflow: hidden; }
  .section-head { display: flex; align-items: center; gap: 8px; padding: 11px 14px; border-bottom: 1px solid var(--border); background: var(--surface2); flex-wrap: wrap; }
  .section-title { font-family: var(--display); font-size: 13px; font-weight: 700; color: var(--text); }
  .section-actions { display: flex; gap: 4px; align-items: center; margin-left: auto; }
  .icon-btn { background: none; border: 1px solid var(--border); color: var(--text2); padding: 5px 9px; border-radius: 7px; cursor: pointer; font-size: 12px; transition: all 0.14s; font-family: var(--font); font-weight: 500; display: inline-flex; align-items: center; gap: 4px; }
  .icon-btn:hover { background: var(--surface3); color: var(--text); border-color: var(--border2); }
  .icon-btn.active { background: var(--blue-dim); color: var(--blue); border-color: rgba(99,102,241,0.3); font-weight: 600; }

  /* Filter tabs */
  .filter-tabs { display: flex; gap: 6px; margin-bottom: 16px; flex-wrap: wrap; }
  .filter-tab { display: flex; align-items: center; gap: 5px; padding: 5px 11px; border: 1.5px solid var(--border); border-radius: 99px; background: var(--surface); font-size: 12px; font-weight: 500; color: var(--text2); cursor: pointer; transition: all 0.14s; user-select: none; }
  .filter-tab:hover { border-color: var(--blue); color: var(--blue); }
  .filter-tab.active { background: var(--blue-dim); border-color: var(--blue); color: var(--blue); font-weight: 600; }
  .filter-tab-count { font-family: var(--mono); font-size: 9.5px; background: var(--surface3); color: var(--muted); padding: 1px 5px; border-radius: 99px; }
  .filter-tab.active .filter-tab-count { background: rgba(99,102,241,0.2); color: var(--blue); }

  /* Sort */
  .sort-btn { display: flex; align-items: center; gap: 4px; padding: 5px 9px; border: 1px solid var(--border); border-radius: 7px; background: var(--surface); font-family: var(--font); font-size: 12px; font-weight: 500; color: var(--text2); cursor: pointer; transition: all 0.14s; }
  .sort-btn:hover { border-color: var(--blue); color: var(--blue); }
  .sort-btn.active { background: var(--blue-dim); border-color: var(--blue); color: var(--blue); font-weight: 600; }

  /* Bulk bar */
  .bulk-bar { display: flex; align-items: center; gap: 8px; padding: 9px 14px; background: var(--blue-dim); border: 1.5px solid rgba(99,102,241,0.3); border-radius: var(--r); margin-bottom: 12px; animation: slideDown 0.2s ease; }
  @keyframes slideDown { from { opacity:0;transform:translateY(-8px); } to { opacity:1;transform:translateY(0); } }
  .bulk-count { font-family: var(--display); font-size: 13px; font-weight: 700; color: var(--blue); }
  .bulk-spacer { flex: 1; }

  /* File table */
  .file-table { width: 100%; border-collapse: collapse; }
  .file-table th { font-family: var(--mono); font-size: 10px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 1px; padding: 9px 13px; text-align: left; border-bottom: 1px solid var(--border); background: var(--surface2); white-space: nowrap; cursor: pointer; user-select: none; }
  .file-table th:hover { color: var(--text); }
  .file-table td { padding: 9px 13px; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 12.5px; color: var(--text2); vertical-align: middle; }
  .file-table tr:last-child td { border-bottom: none; }
  .file-table tbody tr { transition: background 0.1s; }
  .file-table tbody tr:hover { background: var(--surface2); }
  .file-table tbody tr.selected { background: var(--blue-dim); }
  .check-col { width: 36px; }
  .checkbox { width: 14px; height: 14px; cursor: pointer; accent-color: var(--blue); }
  .file-name-cell { display: flex; align-items: center; gap: 10px; }
  .file-icon-box { width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 14px; flex-shrink: 0; background: var(--surface2); border: 1px solid var(--border); }
  .file-name-text { font-size: 13px; font-weight: 500; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px; cursor: pointer; transition: color 0.12s; }
  .file-name-text:hover { color: var(--blue); }
  .file-name-input { font-size: 13px; font-weight: 500; color: var(--text); background: var(--surface2); border: 1.5px solid var(--focus); border-radius: 6px; padding: 2px 7px; outline: none; width: 180px; font-family: var(--font); }
  .file-meta { font-size: 10.5px; color: var(--muted); margin-top: 1px; font-family: var(--mono); display:flex; gap:4px; align-items:center; flex-wrap:wrap; }
  .file-tag { font-family: var(--mono); font-size: 9px; padding: 1px 5px; border-radius: 4px; background: var(--surface3); color: var(--text3); text-transform:uppercase; letter-spacing:0.5px; }
  .star-btn { background: none; border: none; cursor: pointer; font-size: 13px; padding: 2px 4px; border-radius: 4px; transition: transform 0.15s; line-height: 1; }
  .star-btn:hover { transform: scale(1.25); }
  .action-btn { background: none; border: none; cursor: pointer; padding: 4px 6px; border-radius: 6px; transition: all 0.12s; color: var(--muted); display: inline-flex; align-items: center; justify-content: center; font-size: 13px; }
  .action-btn:hover { background: var(--surface3); color: var(--text); }
  .action-btn.danger:hover { background: var(--danger-dim); color: var(--danger); }
  .action-btn:disabled { opacity: 0.3; cursor: not-allowed; }
  .badge { display: inline-flex; align-items: center; font-family: var(--mono); font-size: 9.5px; font-weight: 500; padding: 2px 7px; border-radius: 99px; text-transform: uppercase; letter-spacing: 0.4px; }
  .badge-gray { background: var(--surface3); color: var(--text3); border: 1px solid var(--border); }

  /* Grid */
  .file-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(142px, 1fr)); gap: 9px; padding: 12px; }
  .file-card { background: var(--surface2); border: 1.5px solid var(--border); border-radius: var(--r); padding: 14px 10px; text-align: center; cursor: default; transition: all 0.15s; position: relative; }
  .file-card:hover { border-color: rgba(99,102,241,0.35); background: var(--surface3); transform: translateY(-2px); box-shadow: var(--sh2); }
  .file-card.selected { border-color: var(--blue); background: var(--blue-dim); }
  .file-card-check { position: absolute; top: 8px; left: 8px; }
  .file-card-star { position: absolute; top: 6px; right: 6px; }
  .file-card-icon { font-size: 28px; margin-bottom: 8px; margin-top: 4px; cursor: pointer; }
  .file-card-name { font-size: 11.5px; font-weight: 600; word-break: break-word; color: var(--text); line-height: 1.3; margin-bottom: 2px; cursor: pointer; }
  .file-card-name:hover { color: var(--blue); }
  .file-card-meta { font-family: var(--mono); font-size: 9.5px; color: var(--muted); }
  .file-card-actions { display: flex; justify-content: center; gap: 1px; margin-top: 8px; }

  /* States */
  .state-box { text-align: center; padding: 48px 20px; }
  .state-icon { width: 60px; height: 60px; border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 26px; margin: 0 auto 12px; }
  .state-title { font-family: var(--display); font-size: 15px; font-weight: 700; color: var(--text); margin-bottom: 4px; }
  .state-sub { font-size: 12.5px; color: var(--muted); }
  .spinner { width: 18px; height: 18px; border: 2px solid var(--surface3); border-top-color: var(--blue); border-radius: 50%; animation: spin 0.6s linear infinite; display: inline-block; flex-shrink: 0; }
  .spinner.sm { width: 12px; height: 12px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes slideUp { from { opacity:0;transform:translateY(14px); } to { opacity:1;transform:translateY(0); } }
  @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
  @keyframes pulse { 0%,100%{opacity:1;} 50%{opacity:0.6;} }

  .error-banner { background: var(--danger-dim); border: 1px solid rgba(244,63,94,0.2); border-radius: 9px; padding: 9px 13px; margin-bottom: 14px; font-size: 12.5px; color: var(--danger); display: flex; align-items: center; gap: 8px; }

  /* Modal */
  .modal-overlay { position: fixed; inset: 0; z-index: 300; background: rgba(0,0,0,0.8); backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; animation: fadeIn 0.15s ease; }
  .modal-card { background: var(--surface); border: 1px solid var(--border2); border-radius: 16px; padding: 26px; box-shadow: var(--sh3); width: 400px; animation: slideUp 0.2s ease; }
  .modal-icon { font-size: 34px; text-align: center; margin-bottom: 10px; }
  .modal-title { font-family: var(--display); font-size: 16px; font-weight: 700; color: var(--text); text-align: center; margin-bottom: 6px; }
  .modal-sub { font-size: 13px; color: var(--text2); text-align: center; line-height: 1.5; margin-bottom: 20px; }
  .modal-actions { display: flex; gap: 8px; }
  .modal-actions .btn { flex: 1; padding: 10px; }

  /* FILE PREVIEW MODAL - FIXED */
  .preview-overlay { position: fixed; inset: 0; z-index: 200; background: rgba(0,0,0,0.95); backdrop-filter: blur(12px); display: flex; flex-direction: column; animation: fadeIn 0.18s ease; }
  .preview-topbar { display: flex; align-items: center; gap: 12px; padding: 12px 18px; background: rgba(22,27,38,0.98); border-bottom: 1px solid var(--border); flex-shrink: 0; }
  .preview-name { font-family: var(--display); font-size: 14px; font-weight: 600; color: var(--text); flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .preview-meta { font-family: var(--mono); font-size: 11px; color: var(--muted); flex-shrink: 0; }
  .preview-close { background: rgba(255,255,255,0.06); border: 1px solid var(--border); color: var(--text2); width: 30px; height: 30px; border-radius: 8px; cursor: pointer; font-size: 15px; display: flex; align-items: center; justify-content: center; transition: all 0.14s; flex-shrink: 0; }
  .preview-close:hover { background: var(--danger-dim); color: var(--danger); border-color: rgba(244,63,94,0.3); }
  .preview-body { flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden; padding: 20px; min-height: 0; }
  .preview-img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 8px; box-shadow: 0 20px 60px rgba(0,0,0,0.7); }
  .preview-video { max-width: 100%; max-height: 100%; border-radius: 8px; box-shadow: 0 20px 60px rgba(0,0,0,0.7); outline: none; }
  .preview-audio-wrap { display: flex; flex-direction: column; align-items: center; gap: 18px; }
  .preview-audio-icon { font-size: 72px; animation: pulse 2s infinite; }
  .preview-audio-name { font-family: var(--display); font-size: 16px; font-weight: 600; color: var(--text); text-align: center; max-width: 500px; word-break: break-word; }
  .preview-audio-el { width: 360px; max-width: 90vw; }
  .preview-pdf { width: 100%; height: 100%; border: none; border-radius: 8px; background: white; }
  .preview-text-wrap { width: 100%; max-width: 820px; height: 100%; background: #0d1117; border-radius: 10px; border: 1px solid rgba(255,255,255,0.08); overflow: auto; }
  .preview-text { padding: 22px 26px; font-family: var(--mono); font-size: 12.5px; line-height: 1.75; color: #e2e8f0; white-space: pre-wrap; word-break: break-word; }
  .preview-unsupported { text-align: center; color: var(--muted); }
  .preview-unsupported .big-icon { font-size: 64px; margin-bottom: 16px; }
  .preview-unsupported p { font-size: 14px; margin-bottom: 20px; color: var(--text2); }
  .preview-footer { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 11px 18px; background: rgba(22,27,38,0.98); border-top: 1px solid var(--border); flex-shrink: 0; }
  .preview-loading { display: flex; flex-direction: column; align-items: center; gap: 14px; color: var(--muted); font-size: 13px; }
  .preview-error { text-align: center; padding: 40px 20px; }
  .preview-error .err-icon { font-size: 52px; margin-bottom: 14px; }
  .preview-error p { color: var(--danger); font-size: 14px; margin-bottom: 6px; font-family: var(--display); }
  .preview-error small { color: var(--muted); font-family: var(--mono); font-size: 11px; display: block; margin-bottom: 18px; word-break: break-all; max-width: 500px; }

  /* Detail panel */
  .detail-panel { position: fixed; right: 0; top: 0; bottom: 0; width: 290px; background: var(--surface); border-left: 1px solid var(--border); box-shadow: -8px 0 32px rgba(0,0,0,0.4); z-index: 50; display: flex; flex-direction: column; animation: slideLeft 0.2s ease; }
  @keyframes slideLeft { from { transform: translateX(290px); } to { transform: translateX(0); } }
  .detail-head { padding: 14px 16px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; background: var(--surface2); }
  .detail-title { font-family: var(--display); font-size: 13px; font-weight: 700; color: var(--text); }
  .detail-close { background: none; border: none; cursor: pointer; font-size: 15px; color: var(--muted); padding: 3px; border-radius: 5px; transition: all 0.12s; }
  .detail-close:hover { background: var(--surface3); color: var(--text); }
  .detail-body { flex: 1; overflow-y: auto; padding: 16px; }
  .detail-icon { font-size: 44px; text-align: center; margin-bottom: 10px; }
  .detail-name { font-family: var(--display); font-size: 13px; font-weight: 700; color: var(--text); text-align: center; word-break: break-all; margin-bottom: 14px; line-height: 1.4; }
  .detail-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border); }
  .detail-row:last-child { border-bottom: none; }
  .detail-key { font-family: var(--mono); font-size: 10px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; }
  .detail-val { font-size: 12px; color: var(--text2); font-family: var(--mono); text-align: right; max-width: 150px; word-break: break-all; }
  .detail-actions { padding: 12px 16px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 7px; }
  .share-link-box { display: flex; gap: 6px; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 7px 10px; align-items: center; margin-top: 10px; }
  .share-link-text { font-family: var(--mono); font-size: 10px; color: var(--text2); flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .copy-btn { background: var(--blue-dim); border: none; color: var(--blue); font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 5px; cursor: pointer; white-space: nowrap; font-family: var(--font); transition: all 0.14s; }
  .copy-btn:hover { background: var(--blue); color: white; }
  .copy-btn.copied { background: var(--success-dim); color: var(--success); }

  /* Settings */
  .settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .settings-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r2); padding: 18px; }
  .settings-card-title { font-family: var(--display); font-size: 13px; font-weight: 700; color: var(--text); margin-bottom: 14px; }
  .settings-field { margin-bottom: 11px; }
  .settings-field label { display: block; font-family: var(--mono); font-size: 10px; font-weight: 600; color: var(--muted); margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.5px; }
  .settings-field input { width: 100%; background: var(--surface2); border: 1.5px solid var(--border); border-radius: 8px; padding: 8px 10px; color: var(--text); font-family: var(--font); font-size: 13px; outline: none; transition: all 0.14s; }
  .settings-field input:focus { border-color: var(--focus); box-shadow: 0 0 0 3px var(--blue-dim); }
  .type-breakdown { display: flex; flex-direction: column; gap: 8px; }
  .type-row { display: flex; align-items: center; gap: 8px; }
  .type-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .type-name { font-size: 12px; color: var(--text2); flex: 1; }
  .type-size { font-family: var(--mono); font-size: 10.5px; color: var(--muted); }
  .type-bar { flex: 2; height: 3px; background: var(--surface3); border-radius: 99px; overflow: hidden; }
  .type-bar-fill { height: 100%; border-radius: 99px; transition: width 0.5s ease; }

  /* Timeline */
  .timeline-wrap { display: flex; flex-direction: column; gap: 0; }
  .timeline-month { margin-bottom: 22px; }
  .timeline-month-label { font-family: var(--display); font-size: 13px; font-weight: 700; color: var(--text2); margin-bottom: 10px; padding: 8px 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 99px; display: inline-flex; align-items: center; gap: 6px; }
  .timeline-files { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 8px; }
  .timeline-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r); padding: 12px 10px; text-align: center; cursor: pointer; transition: all 0.15s; }
  .timeline-card:hover { border-color: var(--blue); background: var(--surface2); transform: translateY(-2px); }
  .timeline-card-date { font-family: var(--mono); font-size: 9.5px; color: var(--muted); margin-bottom: 6px; }
  .timeline-card-icon { font-size: 24px; margin-bottom: 5px; }
  .timeline-card-name { font-size: 11px; font-weight: 500; color: var(--text); word-break: break-word; line-height: 1.3; }
  .on-this-day { background: linear-gradient(135deg, var(--amber-dim), var(--purple-dim)); border: 1px solid rgba(245,158,11,0.2); border-radius: var(--r2); padding: 14px 16px; margin-bottom: 18px; display: flex; align-items: center; gap: 12px; }
  .otd-icon { font-size: 28px; flex-shrink: 0; }
  .otd-title { font-family: var(--display); font-size: 13px; font-weight: 700; color: var(--amber); margin-bottom: 3px; }
  .otd-files { font-size: 12px; color: var(--text2); }

  /* Vault */
  .vault-lock-screen { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r2); padding: 48px 24px; text-align: center; }
  .vault-lock-icon { font-size: 56px; margin-bottom: 16px; }
  .vault-lock-title { font-family: var(--display); font-size: 20px; font-weight: 800; color: var(--text); margin-bottom: 8px; }
  .vault-lock-sub { font-size: 13px; color: var(--muted); margin-bottom: 24px; }
  .vault-pin-row { display: flex; gap: 8px; justify-content: center; margin-bottom: 20px; }
  .vault-pin-dot { width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--purple); transition: all 0.2s; }
  .vault-pin-dot.filled { background: var(--purple); box-shadow: 0 0 8px rgba(168,85,247,0.4); }
  .vault-numpad { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; max-width: 220px; margin: 0 auto; }
  .vault-numpad-btn { background: var(--surface2); border: 1px solid var(--border); border-radius: 10px; padding: 14px; font-family: var(--display); font-size: 18px; font-weight: 700; color: var(--text); cursor: pointer; transition: all 0.12s; }
  .vault-numpad-btn:hover { background: var(--purple-dim); border-color: rgba(168,85,247,0.3); color: var(--purple); }
  .vault-numpad-btn:active { transform: scale(0.94); }
  .vault-content { }
  .vault-header-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; padding: 12px 16px; background: var(--purple-dim); border: 1px solid rgba(168,85,247,0.2); border-radius: var(--r); }
  .vault-header-title { font-family: var(--display); font-size: 14px; font-weight: 700; color: var(--purple); flex: 1; }
  .vault-empty { background: var(--surface); border: 1.5px dashed rgba(168,85,247,0.3); border-radius: var(--r2); padding: 40px; text-align: center; }
  .vault-empty-icon { font-size: 40px; margin-bottom: 12px; }
  .vault-empty-text { font-size: 13px; color: var(--muted); }

  /* Smart Share modal */
  .share-modal-content { display: flex; flex-direction: column; gap: 14px; }
  .share-option-card { background: var(--surface2); border: 1.5px solid var(--border); border-radius: var(--r); padding: 14px; cursor: pointer; transition: all 0.14s; }
  .share-option-card:hover { border-color: var(--blue); }
  .share-option-card.selected { border-color: var(--blue); background: var(--blue-dim); }
  .share-option-title { font-family: var(--display); font-size: 13px; font-weight: 700; color: var(--text); margin-bottom: 3px; }
  .share-option-sub { font-size: 11.5px; color: var(--muted); }
  .share-generated-link { background: var(--surface3); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; font-family: var(--mono); font-size: 11px; color: var(--blue); word-break: break-all; margin-top: 8px; }
  .expiry-select { background: var(--surface2); border: 1.5px solid var(--border); border-radius: 8px; padding: 7px 10px; color: var(--text); font-family: var(--font); font-size: 13px; outline: none; width: 100%; transition: all 0.14s; }
  .expiry-select:focus { border-color: var(--focus); }
  .qr-preview { background: white; border-radius: 10px; padding: 10px; display: flex; align-items: center; justify-content: center; }

  /* Auth */
  .auth-screen { position: fixed; inset: 0; background: radial-gradient(ellipse at 30% 20%, rgba(99,102,241,0.15) 0%, transparent 60%), radial-gradient(ellipse at 70% 80%, rgba(168,85,247,0.1) 0%, transparent 60%), var(--bg); display: flex; align-items: center; justify-content: center; animation: fadeIn 0.3s; }
  .auth-card { width: 400px; background: var(--surface); border: 1px solid var(--border2); border-radius: 18px; padding: 34px; box-shadow: var(--sh3); animation: slideUp 0.35s ease; }
  .auth-brand { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
  .auth-brand-icon { width: 36px; height: 36px; background: linear-gradient(135deg, var(--blue), var(--purple)); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 18px; box-shadow: 0 4px 14px rgba(99,102,241,0.35); }
  .auth-logo { font-family: var(--display); font-size: 20px; font-weight: 800; color: var(--text); }
  .auth-logo span { color: var(--blue); }
  .auth-sub { font-size: 13px; color: var(--muted); margin-bottom: 22px; font-family: var(--mono); }
  .tab-row { display: flex; gap: 4px; background: var(--surface2); border-radius: 10px; padding: 4px; margin-bottom: 20px; }
  .tab-btn { flex: 1; padding: 8px; border: none; border-radius: 8px; background: none; color: var(--muted); font-family: var(--font); font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.14s; }
  .tab-btn.active { background: var(--surface3); color: var(--blue); }
  .field { margin-bottom: 13px; }
  .field label { display: block; font-family: var(--mono); font-size: 10px; font-weight: 600; color: var(--muted); margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.5px; }
  .field input { width: 100%; background: var(--surface2); border: 1.5px solid var(--border); border-radius: 9px; padding: 10px 12px; color: var(--text); font-family: var(--font); font-size: 14px; outline: none; transition: all 0.14s; }
  .field input:focus { border-color: var(--focus); box-shadow: 0 0 0 3px var(--blue-dim); }
  .field input::placeholder { color: var(--muted); }
  .auth-msg { font-size: 12px; margin-top: 10px; padding: 9px 12px; border-radius: 8px; display: flex; align-items: center; gap: 6px; font-family: var(--mono); }
  .auth-msg.success { background: var(--success-dim); color: var(--success); border: 1px solid rgba(16,185,129,0.2); }
  .auth-msg.error { background: var(--danger-dim); color: var(--danger); border: 1px solid rgba(244,63,94,0.2); }

  /* Toast */
  .toast-wrap { position: fixed; bottom: 18px; right: 18px; z-index: 9999; display: flex; flex-direction: column; gap: 6px; pointer-events: none; }
  .toast { background: var(--surface2); border: 1px solid var(--border2); border-radius: 10px; padding: 9px 13px; font-size: 12.5px; font-weight: 500; box-shadow: var(--sh3); display: flex; align-items: center; gap: 8px; animation: slideUp 0.22s ease; max-width: 280px; color: var(--text); pointer-events: auto; font-family: var(--font); }
  .toast.success { border-left: 3px solid var(--success); }
  .toast.error   { border-left: 3px solid var(--danger); }
  .toast.warning { border-left: 3px solid var(--warning); }
  .toast.info    { border-left: 3px solid var(--blue); }

  /* AI search suggestion bar */
  .ai-search-bar { background: var(--blue-dim); border: 1px solid rgba(99,102,241,0.25); border-radius: var(--r); padding: 9px 13px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--blue); animation: slideDown 0.2s ease; }
  .ai-search-icon { font-size: 16px; flex-shrink:0; }

  /* Doc intelligence banner */
  .doc-intel-card { background: linear-gradient(135deg, rgba(245,158,11,0.08), rgba(168,85,247,0.08)); border: 1px solid rgba(245,158,11,0.2); border-radius: var(--r2); padding: 13px 16px; margin-bottom: 16px; }
  .doc-intel-title { font-family: var(--display); font-size: 13px; font-weight: 700; color: var(--amber); margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
  .doc-intel-items { display: flex; flex-wrap: wrap; gap: 6px; }
  .doc-intel-item { background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.2); border-radius: 99px; padding: 4px 10px; font-size: 11.5px; color: var(--amber); font-family: var(--mono); display: flex; align-items: center; gap: 5px; cursor: pointer; transition: all 0.14s; }
  .doc-intel-item:hover { background: rgba(245,158,11,0.2); }

  /* Compression / savings banner */
  .savings-bar { background: linear-gradient(135deg, rgba(16,185,129,0.08), rgba(6,182,212,0.08)); border: 1px solid rgba(16,185,129,0.2); border-radius: var(--r); padding: 10px 14px; margin-bottom: 14px; display: flex; align-items: center; gap: 10px; font-size: 12.5px; color: var(--green); }
  .savings-bar b { color: var(--green); font-family: var(--display); }

  @media (max-width: 960px) {
    .sidebar { width: 54px; }
    .logo-text,.logo-sub,.nav-item>span:not(.nav-icon),.nav-section-label,.nav-badge,.storage-wrap,.sidebar-user .user-name,.sidebar-user .user-email { display: none; }
    .nav-item { justify-content: center; padding: 10px; }
    .sidebar-user { justify-content: center; }
    .stats-row { grid-template-columns: 1fr 1fr; }
    .settings-grid { grid-template-columns: 1fr; }
  }
`;

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toasts({ toasts }) {
  const icons = { success: "✓", error: "✕", warning: "⚠", info: "ℹ" };
  return (
    <div className="toast-wrap">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`}>
          <span>{icons[t.type] || "•"}</span>{t.msg}
        </div>
      ))}
    </div>
  );
}

// ─── Confirm Modal ────────────────────────────────────────────────────────────
function ConfirmModal({ icon, title, sub, confirmLabel, confirmClass, onConfirm, onCancel, loading }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onCancel]);
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal-card">
        <div className="modal-icon">{icon}</div>
        <div className="modal-title">{title}</div>
        <div className="modal-sub">{sub}</div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onCancel} disabled={loading}>Cancel</button>
          <button className={`btn ${confirmClass || "btn-danger"}`} onClick={onConfirm} disabled={loading}>
            {loading ? <><span className="spinner sm" /> Deleting…</> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── FIXED File Preview Modal ─────────────────────────────────────────────────
function FilePreview({ file, onClose, onDownload, downloadingId, getName, getSize }) {
  const [state, setState] = useState("loading");
  const [blobUrl, setBlobUrl] = useState(null);
  const [textContent, setTextContent] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  const name = getName(file);
  const previewType = getPreviewType(name);

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  useEffect(() => {
    if (!previewType) { setState("ready"); return; }
    let objectUrl = null;
    let cancelled = false;
    setState("loading");
    setBlobUrl(null);
    setTextContent(null);
    setErrorMsg("");

    previewFile(file.id)   // ← CHANGE THIS
  .then((res) => {
        if (cancelled) return;
        const rawData = res.data;
        const mime = getMimeType(name);

        let blob;
        if (rawData instanceof Blob) {
          blob = (rawData.type && rawData.type !== "application/octet-stream")
            ? rawData
            : new Blob([rawData], { type: mime });
        } else if (rawData instanceof ArrayBuffer) {
          blob = new Blob([rawData], { type: mime });
        } else {
          blob = new Blob([rawData], { type: mime });
        }

        if (previewType === "text") {
          const reader = new FileReader();
          reader.onload = (e) => {
            if (cancelled) return;
            setTextContent(e.target.result);
            setState("ready");
          };
          reader.onerror = () => { if (!cancelled) { setErrorMsg("Could not decode text."); setState("error"); } };
          reader.readAsText(blob);
        } else {
          objectUrl = URL.createObjectURL(blob);
          setBlobUrl(objectUrl);
          setState("ready");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorMsg(err?.response?.data?.message || err?.message || "Failed to load file.");
        setState("error");
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file.id, name, previewType]);

  useEffect(() => {
    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [blobUrl]);

  const renderBody = () => {
    if (state === "loading") return (
      <div className="preview-loading">
        <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3, borderTopColor: "var(--blue)" }} />
        <span>Loading preview…</span>
      </div>
    );

    if (state === "error") return (
      <div className="preview-error">
        <div className="err-icon">⚠️</div>
        <p>Preview failed to load</p>
        <small>{errorMsg}</small>
        <button className="btn btn-primary" onClick={() => onDownload(file.id, name)} disabled={downloadingId === file.id}>
          {downloadingId === file.id ? <><span className="spinner sm" /> Downloading…</> : "⬇️ Download Instead"}
        </button>
      </div>
    );

    if (!previewType) return (
      <div className="preview-unsupported">
        <div className="big-icon">{fileIcon(name)}</div>
        <p>Preview not available for this file type.</p>
        <button className="btn btn-primary" onClick={() => onDownload(file.id, name)} disabled={downloadingId === file.id}>
          {downloadingId === file.id ? <><span className="spinner sm" /> Downloading…</> : "⬇️ Download to view"}
        </button>
      </div>
    );

    if (previewType === "image") return (
      <img className="preview-img" src={blobUrl} alt={name}
        onError={() => { setErrorMsg("Image failed to render."); setState("error"); }} />
    );

    if (previewType === "video") return (
      <video className="preview-video" src={blobUrl} controls autoPlay
        onError={() => { setErrorMsg("Video could not be played."); setState("error"); }}
        style={{ maxWidth: "100%", maxHeight: "100%" }} />
    );

    if (previewType === "audio") return (
      <div className="preview-audio-wrap">
        <div className="preview-audio-icon">🎵</div>
        <div className="preview-audio-name">{name}</div>
        <audio className="preview-audio-el" src={blobUrl} controls autoPlay
          onError={() => { setErrorMsg("Audio could not be played."); setState("error"); }} />
      </div>
    );

    if (previewType === "pdf") return (
      <iframe className="preview-pdf" src={blobUrl} title={name}
        style={{ width: "100%", height: "100%", border: "none", borderRadius: 8 }} />
    );

    if (previewType === "text") return (
      <div className="preview-text-wrap">
        <pre className="preview-text">{textContent}</pre>
      </div>
    );

    return null;
  };

  return (
    <div className="preview-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="preview-topbar">
        <span style={{ fontSize: 18 }}>{fileIcon(name)}</span>
        <span className="preview-name">{name}</span>
        <span className="preview-meta">{formatBytes(getSize(file))}</span>
        {previewType && (
          <span style={{ fontFamily: "var(--mono)", fontSize: 9, background: "var(--blue-dim)", color: "var(--blue)", padding: "2px 7px", borderRadius: 99, marginRight: 4, textTransform: "uppercase", letterSpacing: 1 }}>
            {previewType}
          </span>
        )}
        <button className="preview-close" onClick={onClose} title="Close (Esc)">✕</button>
      </div>
      <div className="preview-body">{renderBody()}</div>
      <div className="preview-footer">
        <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={onClose}>✕ Close</button>
        <button className="btn btn-primary" onClick={() => onDownload(file.id, name)} disabled={downloadingId === file.id}>
          {downloadingId === file.id ? <><span className="spinner sm" /> Downloading…</> : "⬇️ Download"}
        </button>
      </div>
    </div>
  );
}

// ─── Smart Share Modal ────────────────────────────────────────────────────────
function SmartShareModal({ file, getName, onClose, addToast }) {
  const [mode, setMode] = useState("permanent"); // permanent | expiring | oneview | qr
  const [expiry, setExpiry] = useState("24h");
  const [generated, setGenerated] = useState(false);
  const [views, setViews] = useState({});
  const name = getName(file);
  const baseLink = `${window.location.origin}/share/${file.id}`;

  const getLink = () => {
    if (mode === "permanent") return baseLink;
    if (mode === "expiring")  return `${baseLink}?exp=${expiry}&t=${Date.now()}`;
    if (mode === "oneview")   return `${baseLink}?views=1&t=${Date.now()}`;
    return baseLink;
  };

  const copyLink = () => {
    const link = getLink();
    navigator.clipboard?.writeText(link).catch(() => {});
    setGenerated(true);
    addToast("Share link copied!", "success");
    setViews(v => ({ ...v, [file.id]: (v[file.id]||0)+1 }));
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card" style={{ width: 460 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
          <div style={{ fontFamily:"var(--display)", fontSize:15, fontWeight:700, color:"var(--text)" }}>🔗 Smart Share</div>
          <button className="detail-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ fontSize:12, color:"var(--muted)", fontFamily:"var(--mono)", marginBottom:14 }}>{name}</div>
        <div className="share-modal-content">
          {[
            { id:"permanent", icon:"🔗", title:"Permanent Link", sub:"Always accessible, no expiry" },
            { id:"expiring",  icon:"⏱️", title:"Expiring Link",  sub:"Auto-expires after set duration" },
            { id:"oneview",   icon:"👁️", title:"One-Time View",  sub:"Link disappears after first open" },
            { id:"qr",        icon:"📱", title:"QR Code Share",  sub:"Scan to share instantly" },
          ].map(opt => (
            <div key={opt.id} className={`share-option-card ${mode === opt.id ? "selected" : ""}`}
              onClick={() => setMode(opt.id)}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:18 }}>{opt.icon}</span>
                <div>
                  <div className="share-option-title">{opt.title}</div>
                  <div className="share-option-sub">{opt.sub}</div>
                </div>
                {mode === opt.id && <span style={{ marginLeft:"auto", color:"var(--blue)", fontWeight:700 }}>✓</span>}
              </div>
            </div>
          ))}

          {mode === "expiring" && (
            <select className="expiry-select" value={expiry} onChange={e => setExpiry(e.target.value)}>
              <option value="1h">Expires in 1 hour</option>
              <option value="24h">Expires in 24 hours</option>
              <option value="7d">Expires in 7 days</option>
              <option value="30d">Expires in 30 days</option>
            </select>
          )}

          {mode === "qr" && (
            <div className="qr-preview" style={{ background:"white", borderRadius:10, padding:16, textAlign:"center" }}>
              <div style={{ fontFamily:"var(--mono)", fontSize:11, color:"#333", wordBreak:"break-all", marginBottom:8 }}>QR for: {name}</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(8,20px)", gap:2, justifyContent:"center" }}>
                {Array.from({length:64}).map((_,i) => (
                  <div key={i} style={{ width:20, height:20, background: Math.random() > 0.5 ? "#000":"#fff", border:"1px solid #eee" }} />
                ))}
              </div>
              <div style={{ fontFamily:"var(--mono)", fontSize:9, color:"#999", marginTop:8 }}>scan to open file</div>
            </div>
          )}

          {mode !== "qr" && (
            <div className="share-generated-link">{getLink()}</div>
          )}

          <div style={{ display:"flex", gap:8 }}>
            <button className="btn btn-primary" style={{ flex:1 }} onClick={copyLink}>
              {mode === "qr" ? "📥 Download QR" : "📋 Copy Link"}
            </button>
            <button className="btn btn-ghost" onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  // Auth
  const [token, setToken]             = useState(() => localStorage.getItem("goc_token") || "");
  const [user, setUser]               = useState(() => { try { return JSON.parse(localStorage.getItem("goc_user")); } catch { return null; } });
  const [authMode, setAuthMode]       = useState("login");
  const [authLoading, setAuthLoading] = useState(false);
  const [authMsg, setAuthMsg]         = useState(null);
  const [form, setForm]               = useState({ name:"", email:"", password:"" });

  // Files
  const [files, setFiles]               = useState([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError]     = useState(null);
  const [storage, setStorage]           = useState({ storageUsed:0, storageLimit:5368709120 });

  // Client-side state
  const [starred, setStarred] = useState(() => { try { return JSON.parse(localStorage.getItem("goc_starred")) || []; } catch { return []; } });
  const [trashed, setTrashed] = useState(() => { try { return JSON.parse(localStorage.getItem("goc_trashed")) || []; } catch { return []; } });
  const [vaultFiles, setVaultFiles] = useState(() => { try { return JSON.parse(localStorage.getItem("goc_vault")) || []; } catch { return []; } });
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal, setRenameVal]   = useState("");

  // Upload
  const [uploadQueue, setUploadQueue] = useState([]);

  // UI
  const [view, setView]               = useState("list");
  const [navItem, setNavItem]         = useState("Files");
  const [search, setSearch]           = useState("");
  const [typeFilter, setTypeFilter]   = useState("all");
  const [sortBy, setSortBy]           = useState("date");
  const [sortDir, setSortDir]         = useState("desc");
  const [selected, setSelected]       = useState(new Set());
  const [detailFile, setDetailFile]   = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [shareFile, setShareFile]     = useState(null);
  const [dragging, setDragging]       = useState(false);
  const [copiedId, setCopiedId]       = useState(null);
  const [toasts, setToasts]           = useState([]);
  const [downloadingId, setDownloadingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deletingId, setDeletingId]       = useState(null);

  // Vault
  const [vaultLocked, setVaultLocked] = useState(true);
  const [vaultPin, setVaultPin]       = useState("");
  const VAULT_PIN = "1234";

  const fileInputRef   = useRef();
  const vaultInputRef  = useRef();
  const renameInputRef = useRef();

  // Persist
  useEffect(() => { token ? localStorage.setItem("goc_token", token) : localStorage.removeItem("goc_token"); }, [token]);
  useEffect(() => { user ? localStorage.setItem("goc_user", JSON.stringify(user)) : localStorage.removeItem("goc_user"); }, [user]);
  useEffect(() => { localStorage.setItem("goc_starred", JSON.stringify(starred)); }, [starred]);
  useEffect(() => { localStorage.setItem("goc_trashed", JSON.stringify(trashed)); }, [trashed]);
  useEffect(() => { localStorage.setItem("goc_vault", JSON.stringify(vaultFiles)); }, [vaultFiles]);

  // Toast
  const addToast = useCallback((msg, type="success") => {
    const id = Date.now() + Math.random();
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  }, []);

  const extractToken = (res) => {
    const d = res?.data;
    if (d?.data?.token) return d.data.token;
    if (d?.token) return d.token;
    return null;
  };
  const extractError = (err, fallback) => {
    const data = err?.response?.data;
    if (typeof data === "string" && data.length < 200) return data;
    if (data?.message) return data.message;
    return err?.message || fallback;
  };

  const getName = useCallback((f) => f.fileName || f.name || "Unknown", []);
  const getSize = useCallback((f) => f.fileSize ?? f.size ?? 0, []);
  const getDate = useCallback((f) => f.uploadedAt || f.createdAt || "", []);
  const getType = useCallback((f) => f.fileType || f.contentType || getName(f).split(".").pop()?.toUpperCase() || "—", [getName]);

  const refreshFiles = useCallback(async () => {
    setFilesLoading(true); setFilesError(null);
    try {
      const res = await listFiles();
      const serverFiles = res?.data?.data ?? res?.data ?? [];
      setFiles(Array.isArray(serverFiles) ? serverFiles : []);
    } catch (err) {
      setFilesError(extractError(err, "Could not load files."));
    } finally { setFilesLoading(false); }
  }, []);

  const refreshStorage = useCallback(async () => {
    try {
      const res = await getStorage();
      const s = res?.data?.data ?? res?.data;
      if (s && typeof s.storageUsed !== "undefined") setStorage(s);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { if (token) { refreshFiles(); refreshStorage(); } }, [token]);
  useEffect(() => { if (renamingId) setTimeout(() => renameInputRef.current?.focus(), 50); }, [renamingId]);

  const dynamicStorage = useMemo(() => {
    const computedUsed = files.reduce((sum, f) => sum + getSize(f), 0);
    return {
      storageUsed:  Math.max(storage.storageUsed || 0, computedUsed),
      storageLimit: storage.storageLimit || 5368709120,
    };
  }, [files, storage, getSize]);

  const storagePercent = dynamicStorage.storageLimit > 0
    ? Math.min((dynamicStorage.storageUsed / dynamicStorage.storageLimit) * 100, 100) : 0;

  const storageBarColor = storagePercent > 90
    ? "linear-gradient(90deg,#f43f5e,#f97316)"
    : storagePercent > 70
    ? "linear-gradient(90deg,#f59e0b,#f97316)"
    : "linear-gradient(90deg,var(--blue),var(--purple))";

  const healthScore = useMemo(() =>
    calcHealthScore(files, dynamicStorage.storageUsed, dynamicStorage.storageLimit, starred, trashed),
    [files, dynamicStorage, starred, trashed]
  );

  const healthColor = healthScore >= 80 ? "var(--green)" : healthScore >= 60 ? "var(--amber)" : "var(--danger)";

  // AI search result count
  const isAiSearch = search.length > 2 && (
    search.includes(" ") || ["image","video","doc","pdf","code","audio","find","show"].some(k => search.toLowerCase().includes(k))
  );

  // Doc intelligence
  const detectedDocs = useMemo(() => {
    const found = [];
    files.forEach(f => {
      const dt = detectDocType(getName(f));
      if (dt) found.push({ file: f, type: dt });
    });
    return found.slice(0, 5);
  }, [files, getName]);

  // On this day
  const onThisDay = useMemo(() => {
    const today = new Date();
    return files.filter(f => {
      const d = getDate(f);
      if (!d) return false;
      const fd = new Date(d);
      return fd.getDate() === today.getDate() && fd.getMonth() === today.getMonth() && fd.getFullYear() < today.getFullYear();
    });
  }, [files, getDate]);

  // Auth
  const handleAuth = async () => {
    setAuthMsg(null);
    if (!form.email?.includes("@")) return setAuthMsg({ type:"error", text:"Enter a valid email." });
    if (!form.password || form.password.length < 6) return setAuthMsg({ type:"error", text:"Password must be at least 6 characters." });
    if (authMode === "register" && !form.name?.trim()) return setAuthMsg({ type:"error", text:"Name is required." });
    setAuthLoading(true);
    try {
      if (authMode === "register") {
        await registerUser({ name:form.name.trim(), email:form.email.trim(), password:form.password });
        try {
          const res = await loginUser({ email:form.email.trim(), password:form.password });
          const tok = extractToken(res);
          if (tok) { setToken(tok); setUser({ name:form.name.trim(), email:form.email.trim() }); addToast("Account created!"); return; }
        } catch { }
        setAuthMode("login");
        setAuthMsg({ type:"success", text:"Account created! Please sign in." });
      } else {
        const res = await loginUser({ email:form.email.trim(), password:form.password });
        const tok = extractToken(res);
        if (!tok) throw new Error("No token received.");
        setToken(tok);
        setUser({ name:form.email.split("@")[0], email:form.email.trim() });
        addToast("Welcome back!", "success");
      }
    } catch (err) {
      setAuthMsg({ type:"error", text:extractError(err, "Auth failed.") });
    } finally { setAuthLoading(false); }
  };

  const handleSignOut = () => {
    setToken(""); setUser(null); setFiles([]); setSelected(new Set());
    setDetailFile(null); setPreviewFile(null); setConfirmDelete(null);
    setStorage({ storageUsed:0, storageLimit:5368709120 });
    addToast("Signed out.");
  };

  // Upload
  const handleUploadFiles = async (fileList, toVault = false) => {
    const items = Array.from(fileList).map(f => ({ id:Date.now()+Math.random(), file:f, progress:0, status:"pending" }));
    setUploadQueue(q => [...q, ...items]);

    for (const item of items) {
      setUploadQueue(q => q.map(x => x.id === item.id ? { ...x, status:"uploading" } : x));
      const tick = setInterval(() => {
        setUploadQueue(q => q.map(x => x.id === item.id ? { ...x, progress: Math.min(x.progress + Math.random()*10, 85) } : x));
      }, 180);
      try {
        await uploadFile(item.file);
        clearInterval(tick);
        setUploadQueue(q => q.map(x => x.id === item.id ? { ...x, progress:100, status:"done" } : x));
        if (toVault) {
          const syntheticFile = { id: Date.now(), fileName: item.file.name, fileSize: item.file.size, contentType: item.file.type, uploadedAt: new Date().toISOString() };
          setVaultFiles(v => [...v, syntheticFile]);
          addToast(`${item.file.name} added to Vault 🔐`);
        } else {
          addToast(`${item.file.name} uploaded!`);
        }
        await refreshFiles();
        await refreshStorage();
      } catch (err) {
        clearInterval(tick);
        setUploadQueue(q => q.map(x => x.id === item.id ? { ...x, status:"error" } : x));
        addToast(extractError(err, "Upload failed."), "error");
      }
    }
    setTimeout(() => setUploadQueue(q => q.filter(x => x.status === "uploading" || x.status === "pending")), 4000);
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragging(false);
    if (e.dataTransfer.files.length) handleUploadFiles(e.dataTransfer.files);
  };

  // Soft Trash
  const handleTrash = useCallback((id, name) => {
    const file = files.find(f => f.id === id);
    if (!file) return;
    setTrashed(p => [...p, { ...file, trashedAt:new Date().toISOString() }]);
    setFiles(p => p.filter(f => f.id !== id));
    setSelected(p => { const n = new Set(p); n.delete(id); return n; });
    if (detailFile?.id === id) setDetailFile(null);
    if (previewFile?.id === id) setPreviewFile(null);
    addToast(`${name} moved to Trash.`, "warning");
  }, [files, detailFile, previewFile, addToast]);

  // Perm delete
  const handlePermDelete = useCallback(async (id, name) => {
    setDeletingId(id);
    try {
      await deleteFile(id);
      setTrashed(p => p.filter(f => f.id !== id));
      setFiles(p => p.filter(f => f.id !== id));
      addToast(`${name} permanently deleted.`, "error");
      await refreshStorage();
    } catch (err) {
      addToast(extractError(err, "Delete failed."), "error");
    } finally { setDeletingId(null); setConfirmDelete(null); }
  }, [addToast, refreshStorage]);

  const handleRestore = useCallback((id) => {
    const file = trashed.find(f => f.id === id);
    if (!file) return;
    const { trashedAt, ...rest } = file;
    setFiles(p => [rest, ...p]);
    setTrashed(p => p.filter(f => f.id !== id));
    addToast(`${getName(file)} restored.`);
  }, [trashed, getName, addToast]);

  const handleEmptyTrash = useCallback(async () => {
    const snapshot = [...trashed];
    for (const f of snapshot) { try { await deleteFile(f.id); } catch { } }
    setTrashed([]);
    await refreshStorage();
    addToast("Trash emptied.", "error");
  }, [trashed, refreshStorage, addToast]);

  // Download
  const handleDownload = useCallback(async (id, name) => {
    setDownloadingId(id);
    try {
      const res = await downloadFile(id);
      const rawData = res.data;
      const mime = getMimeType(name);
      const blob = rawData instanceof Blob
        ? (rawData.type && rawData.type !== "application/octet-stream" ? rawData : new Blob([rawData], { type:mime }))
        : new Blob([rawData], { type:mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      addToast(`Downloading ${name}`, "info");
    } catch (err) {
      addToast(extractError(err, "Download failed."), "error");
    } finally { setDownloadingId(null); }
  }, [addToast]);

  // Bulk
  const handleBulkDownload = async () => {
    for (const id of selected) {
      const f = files.find(x => x.id === id);
      if (f) await handleDownload(id, getName(f));
    }
    setSelected(new Set());
  };
  const handleBulkTrash = () => {
    const ids = [...selected];
    ids.forEach(id => { const f = files.find(x => x.id === id); if (f) handleTrash(id, getName(f)); });
    setSelected(new Set());
  };

  // Star / Rename / Copy
  const toggleStar = useCallback((id) => {
    setStarred(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  }, []);

  const startRename = useCallback((f) => { setRenamingId(f.id); setRenameVal(getName(f)); }, [getName]);

  const commitRename = useCallback(() => {
    if (!renameVal.trim()) { setRenamingId(null); return; }
    const trimmed = renameVal.trim();
    setFiles(p => p.map(f => f.id === renamingId ? { ...f, fileName:trimmed, name:trimmed } : f));
    setDetailFile(prev => prev?.id === renamingId ? { ...prev, fileName:trimmed, name:trimmed } : prev);
    addToast("File renamed.", "info");
    setRenamingId(null);
  }, [renameVal, renamingId, addToast]);

  const handleCopyLink = useCallback((id) => {
    const text = `${window.location.origin}/share/${id}`;
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedId(id); addToast("Link copied!", "success");
    setTimeout(() => setCopiedId(null), 2000);
  }, [addToast]);

  // Select / Sort
  const toggleSelect  = useCallback((id) => { setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; }); }, []);
  const selectAll     = useCallback((list) => setSelected(new Set(list.map(f => f.id))), []);
  const clearSelect   = useCallback(() => setSelected(new Set()), []);
  const handleSort    = useCallback((col) => {
    setSortBy(prev => {
      if (prev === col) setSortDir(d => d === "asc" ? "desc" : "asc");
      else setSortDir("asc");
      return col;
    });
  }, []);

  // Derived
  const activeFiles = useMemo(() => {
    const nonVault = files.filter(f => !vaultFiles.find(v => v.id === f.id));
    if (navItem === "Starred") return nonVault.filter(f => starred.includes(f.id));
    if (navItem === "Recent")  return [...nonVault].sort((a,b) => new Date(getDate(b)) - new Date(getDate(a))).slice(0,20);
    return nonVault;
  }, [navItem, files, starred, vaultFiles, getDate]);

  const filteredByType   = useMemo(() => typeFilter === "all" ? activeFiles : activeFiles.filter(f => getFileCategory(getName(f)) === typeFilter), [activeFiles, typeFilter, getName]);

  const filteredBySearch = useMemo(() => {
    if (!search) return filteredByType;
    return filteredByType.filter(f => isAiSearch ? aiMatch(f, search, getName) : getName(f).toLowerCase().includes(search.toLowerCase()));
  }, [filteredByType, search, isAiSearch, getName]);

  const displayFiles = useMemo(() => [...filteredBySearch].sort((a,b) => {
    let va, vb;
    if (sortBy === "name")      { va = getName(a).toLowerCase(); vb = getName(b).toLowerCase(); }
    else if (sortBy === "size") { va = getSize(a); vb = getSize(b); }
    else { va = new Date(getDate(a)).getTime(); vb = new Date(getDate(b)).getTime(); }
    return sortDir === "asc" ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
  }), [filteredBySearch, sortBy, sortDir, getName, getSize, getDate]);

  const categoryCounts = useMemo(() => {
    const c = { all: activeFiles.length };
    activeFiles.forEach(f => { const k = getFileCategory(getName(f)); c[k] = (c[k]||0)+1; });
    return c;
  }, [activeFiles, getName]);

  const typeBreakdown = useMemo(() => {
    const sizes = {};
    files.forEach(f => { const k = getFileCategory(getName(f)); sizes[k] = (sizes[k]||0) + getSize(f); });
    const total = Object.values(sizes).reduce((a,b) => a+b, 0) || 1;
    return Object.entries(sizes).map(([key, size]) => ({
      key, size, pct:(size/total)*100,
      ...(FILE_TYPES[key] || { label:"Other", color:"#94a3b8", icon:"📁" }),
    })).sort((a,b) => b.size - a.size);
  }, [files, getName, getSize]);

  // Timeline grouping
  const timelineGroups = useMemo(() => {
    const groups = {};
    [...files].forEach(f => {
      const d = getDate(f);
      const key = d ? new Date(d).toLocaleDateString("en-IN", { year:"numeric", month:"long" }) : "Unknown";
      if (!groups[key]) groups[key] = [];
      groups[key].push(f);
    });
    return Object.entries(groups).sort((a,b) => new Date(b[0]) - new Date(a[0]));
  }, [files, getDate]);

  // Health score tips
  const healthTips = useMemo(() => {
    const tips = [];
    if ((dynamicStorage.storageUsed / dynamicStorage.storageLimit) > 0.7) tips.push({ text:"Storage >70% full", color:"var(--rose-dim)", tc:"var(--danger)" });
    if (trashed.length > 5) tips.push({ text:`${trashed.length} files in trash`, color:"var(--amber-dim)", tc:"var(--amber)" });
    if (files.length > 50) tips.push({ text:"50+ files — organize them!", color:"var(--blue-dim)", tc:"var(--blue)" });
    if (healthScore >= 80) tips.push({ text:"Looking healthy! ✓", color:"var(--success-dim)", tc:"var(--success)" });
    return tips;
  }, [dynamicStorage, trashed, files, healthScore]);

  const SortIcon = ({ col }) => sortBy === col ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  // ── Vault PIN handler ──
  const handleVaultPin = (digit) => {
    const next = vaultPin + digit;
    setVaultPin(next);
    if (next.length === 4) {
      if (next === VAULT_PIN) {
        setVaultLocked(false);
        addToast("Vault unlocked 🔐", "success");
      } else {
        addToast("Wrong PIN. Hint: 1234", "error");
      }
      setTimeout(() => setVaultPin(""), 300);
    }
  };

  // ── AUTH WALL ──
  if (!token) return (
    <>
      <style>{css}</style>
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-brand">
            <div className="auth-brand-icon">☁️</div>
            <div className="auth-logo">Get<span>On</span>Clouds</div>
          </div>
          <div className="auth-sub">// next-gen cloud file platform</div>
          <div className="tab-row">
            {["login","register"].map(m => (
              <button key={m} className={`tab-btn ${authMode === m ? "active" : ""}`}
                onClick={() => { setAuthMode(m); setAuthMsg(null); }}>
                {m === "login" ? "Sign In" : "Create Account"}
              </button>
            ))}
          </div>
          {authMode === "register" && (
            <div className="field"><label>Full Name</label>
              <input placeholder="Your name" value={form.name} onChange={e => setForm({ ...form, name:e.target.value })} />
            </div>
          )}
          <div className="field"><label>Email</label>
            <input type="email" placeholder="you@example.com" value={form.email}
              onChange={e => setForm({ ...form, email:e.target.value })} />
          </div>
          <div className="field"><label>Password</label>
            <input type="password" placeholder="Min. 6 characters" value={form.password}
              onChange={e => setForm({ ...form, password:e.target.value })}
              onKeyDown={e => e.key === "Enter" && handleAuth()} />
          </div>
          {authMsg && <div className={`auth-msg ${authMsg.type}`}>{authMsg.type === "success" ? "✓" : "⚠"} {authMsg.text}</div>}
          <button className="btn btn-primary" style={{ width:"100%", marginTop:16, padding:"12px" }}
            onClick={handleAuth} disabled={authLoading}>
            {authLoading ? <><span className="spinner sm" style={{ borderTopColor:"white" }} /> Please wait…</> : authMode === "login" ? "Sign In →" : "Create Account →"}
          </button>
        </div>
      </div>
    </>
  );

  // ── DETAIL PANEL ──
  const DetailPanel = () => {
    if (!detailFile) return null;
    const f = detailFile;
    const isStarred  = starred.includes(f.id);
    const canPreview = !!getPreviewType(getName(f));
    const tags       = autoTag(getName(f));
    return (
      <div className="detail-panel">
        <div className="detail-head">
          <div className="detail-title">File Details</div>
          <button className="detail-close" onClick={() => setDetailFile(null)}>✕</button>
        </div>
        <div className="detail-body">
          <div className="detail-icon" style={{ cursor:canPreview?"pointer":"default" }}
            onClick={() => { if (canPreview) { setPreviewFile(f); setDetailFile(null); } }}>
            {fileIcon(getName(f))}
            {canPreview && <div style={{ fontSize:9, color:"var(--blue)", marginTop:3, fontWeight:600, fontFamily:"var(--mono)", textTransform:"uppercase", letterSpacing:0.5 }}>preview</div>}
          </div>
          <div className="detail-name">{getName(f)}</div>
          {tags.length > 0 && (
            <div style={{ display:"flex", gap:4, justifyContent:"center", marginBottom:12, flexWrap:"wrap" }}>
              {tags.map(t => <span key={t} className="file-tag">{t}</span>)}
            </div>
          )}
          {[
            { k:"Type",     v:getType(f) },
            { k:"Size",     v:formatBytes(getSize(f)) },
            { k:"Uploaded", v:getDate(f) ? new Date(getDate(f)).toLocaleDateString() : "—" },
            { k:"Preview",  v:canPreview ? "✓ Supported" : "✗ Not supported" },
            { k:"ID",       v:`#${f.id}` },
          ].map(({ k, v }) => (
            <div className="detail-row" key={k}>
              <span className="detail-key">{k}</span>
              <span className="detail-val" style={k==="Preview"&&canPreview?{color:"var(--success)"}:{}}>{v}</span>
            </div>
          ))}
          <div style={{ marginTop:12 }}>
            <div style={{ fontFamily:"var(--mono)", fontSize:9, fontWeight:600, color:"var(--muted)", textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:5 }}>Quick Share</div>
            <div className="share-link-box">
              <span className="share-link-text">{`${window.location.origin}/share/${f.id}`}</span>
              <button className={`copy-btn ${copiedId === f.id ? "copied" : ""}`} onClick={() => handleCopyLink(f.id)}>
                {copiedId === f.id ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        </div>
        <div className="detail-actions">
          {canPreview && <button className="btn btn-primary" onClick={() => { setPreviewFile(f); setDetailFile(null); }}>👁️ Preview</button>}
          <button className="btn btn-ghost" onClick={() => handleDownload(f.id, getName(f))} disabled={downloadingId===f.id}>
            {downloadingId===f.id ? <><span className="spinner sm" />Downloading…</> : "⬇️ Download"}
          </button>
          <button className="btn btn-ghost" onClick={() => { setShareFile(f); setDetailFile(null); }}>🔗 Smart Share</button>
          <button className="btn btn-ghost" onClick={() => { startRename(f); setDetailFile(null); }}>✏️ Rename</button>
          <button className="btn btn-ghost" onClick={() => toggleStar(f.id)}>{isStarred?"★ Unstar":"☆ Star"}</button>
          <button className="btn btn-danger" onClick={() => { handleTrash(f.id, getName(f)); setDetailFile(null); }}>🗑️ Move to Trash</button>
        </div>
      </div>
    );
  };

  // ── SETTINGS ──
  const SettingsPage = () => (
    <div className="settings-grid">
      <div className="settings-card">
        <div className="settings-card-title">👤 Profile</div>
        <div className="settings-field"><label>Display Name</label>
          <input defaultValue={user?.name} placeholder="Your name" />
        </div>
        <div className="settings-field"><label>Email</label>
          <input defaultValue={user?.email} type="email" readOnly style={{ opacity:0.6, cursor:"not-allowed" }} />
        </div>
        <button className="btn btn-primary" style={{ marginTop:8 }} onClick={() => addToast("Profile saved.", "success")}>Save Changes</button>
      </div>
      <div className="settings-card">
        <div className="settings-card-title">🔐 Security</div>
        <div className="settings-field"><label>Current Password</label><input type="password" placeholder="••••••••" /></div>
        <div className="settings-field"><label>New Password</label><input type="password" placeholder="Min. 6 characters" /></div>
        <div className="settings-field"><label>Confirm Password</label><input type="password" placeholder="Repeat" /></div>
        <button className="btn btn-ghost" style={{ marginTop:4 }} onClick={() => addToast("Password updated.", "success")}>Update Password</button>
      </div>

      {/* Health Score card */}
      <div className="settings-card" style={{ gridColumn:"1/-1" }}>
        <div className="settings-card-title">🏥 Storage Health</div>
        <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:16 }}>
          <div style={{ position:"relative", width:80, height:80, flexShrink:0 }}>
            <svg viewBox="0 0 36 36" style={{ width:80, height:80, transform:"rotate(-90deg)" }}>
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--surface3)" strokeWidth="3" />
              <circle cx="18" cy="18" r="15.9" fill="none" stroke={healthColor} strokeWidth="3"
                strokeDasharray={`${healthScore} ${100-healthScore}`} strokeLinecap="round" />
            </svg>
            <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
              <span style={{ fontFamily:"var(--display)", fontSize:18, fontWeight:800, color:healthColor }}>{healthScore}</span>
              <span style={{ fontFamily:"var(--mono)", fontSize:8, color:"var(--muted)", textTransform:"uppercase" }}>score</span>
            </div>
          </div>
          <div>
            <div style={{ fontFamily:"var(--display)", fontSize:14, fontWeight:700, color:"var(--text)", marginBottom:4 }}>
              {healthScore >= 80 ? "Excellent" : healthScore >= 60 ? "Fair" : "Needs Attention"}
            </div>
            <div style={{ fontSize:12, color:"var(--text2)", marginBottom:8 }}>Your storage is in {healthScore >= 80 ? "great" : healthScore >= 60 ? "decent" : "poor"} shape.</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
              {healthTips.map((t,i) => (
                <span key={i} style={{ fontFamily:"var(--mono)", fontSize:10, padding:"3px 8px", borderRadius:99, background:t.color, color:t.tc }}>{t.text}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="settings-card" style={{ gridColumn:"1/-1" }}>
        <div className="settings-card-title">💾 Storage Breakdown</div>
        <div style={{ marginBottom:14 }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
            <span style={{ fontSize:13, color:"var(--text2)" }}><b>{formatBytes(dynamicStorage.storageUsed)}</b> of <b>{formatBytes(dynamicStorage.storageLimit)}</b></span>
            <span style={{ fontFamily:"var(--mono)", fontSize:11, color:"var(--blue)", fontWeight:600 }}>{storagePercent.toFixed(1)}%</span>
          </div>
          <div className="storage-bar" style={{ height:6 }}>
            <div className="storage-fill" style={{ width:`${storagePercent}%`, background:storageBarColor }} />
          </div>
          <div style={{ fontSize:11, color:"var(--muted)", marginTop:4, fontFamily:"var(--mono)" }}>
            {formatBytes(dynamicStorage.storageLimit - dynamicStorage.storageUsed)} remaining
          </div>
        </div>
        <div className="type-breakdown">
          {typeBreakdown.length === 0
            ? <p style={{ fontSize:13, color:"var(--muted)" }}>No files yet.</p>
            : typeBreakdown.map(({ key, label, color, icon, size, pct }) => (
              <div className="type-row" key={key}>
                <div className="type-dot" style={{ background:color }} />
                <span style={{ fontSize:14 }}>{icon}</span>
                <span className="type-name">{label}</span>
                <div className="type-bar"><div className="type-bar-fill" style={{ width:`${pct}%`, background:color }} /></div>
                <span className="type-size">{formatBytes(size)}</span>
              </div>
            ))}
        </div>
      </div>

      <div className="settings-card" style={{ gridColumn:"1/-1" }}>
        <div className="settings-card-title">🗑️ Maintenance</div>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
          <button className="btn btn-ghost" onClick={() => { if (trashed.length === 0) addToast("Trash is already empty.", "info"); else setConfirmDelete({ id:null, name:"all trashed files", fromTrash:true, emptyAll:true }); }}>
            🗑️ Empty Trash ({trashed.length} items)
          </button>
          <button className="btn btn-ghost" onClick={() => { addToast(`💾 You're using ${storagePercent.toFixed(1)}% of storage.`, "info"); }}>
            📊 Storage Report
          </button>
          <button className="btn btn-ghost" onClick={() => addToast("Sync complete!", "success")}>
            ↻ Force Sync
          </button>
        </div>
        {trashed.length > 5 && (
          <div className="savings-bar" style={{ marginTop:12 }}>
            <span>💡</span>
            <span>Empty trash to free up <b>~{formatBytes(trashed.reduce((s,f) => s+getSize(f), 0))}</b> of space!</span>
          </div>
        )}
      </div>
    </div>
  );

  // ── TRASH ──
  const TrashPage = () => (
    <div>
      {trashed.length === 0 ? (
        <div className="section-card">
          <div className="state-box">
            <div className="state-icon" style={{ background:"var(--danger-dim)" }}>🗑️</div>
            <div className="state-title">Trash is empty</div>
            <div className="state-sub">Deleted files appear here</div>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <div>
              <span style={{ fontSize:13, color:"var(--muted)", fontFamily:"var(--mono)" }}>{trashed.length} item{trashed.length!==1?"s":""} in trash</span>
              {trashed.length > 0 && (
                <span style={{ marginLeft:10, fontSize:11, color:"var(--danger)", fontFamily:"var(--mono)" }}>
                  ~{formatBytes(trashed.reduce((s,f) => s+getSize(f), 0))} recoverable space
                </span>
              )}
            </div>
            <button className="btn btn-danger" style={{ fontSize:12, padding:"6px 12px" }}
              onClick={() => setConfirmDelete({ id:null, name:"all trashed files", fromTrash:true, emptyAll:true })}>
              🗑️ Empty Trash
            </button>
          </div>
          <div className="section-card">
            <table className="file-table">
              <thead><tr><th>Name</th><th>Size</th><th>Deleted</th><th>Actions</th></tr></thead>
              <tbody>
                {trashed.map(f => (
                  <tr key={f.id}>
                    <td>
                      <div className="file-name-cell">
                        <div className="file-icon-box" style={{ opacity:0.5 }}>{fileIcon(getName(f))}</div>
                        <div>
                          <div style={{ fontSize:13, fontWeight:500, color:"var(--text3)" }}>{getName(f)}</div>
                          <div className="file-meta">{getType(f)}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ fontFamily:"var(--mono)", fontSize:12 }}>{formatBytes(getSize(f))}</td>
                    <td style={{ fontFamily:"var(--mono)", fontSize:12 }}>{timeAgo(f.trashedAt)}</td>
                    <td>
                      <div style={{ display:"flex", gap:4 }}>
                        <button className="action-btn" title="Restore" onClick={() => handleRestore(f.id)}>↩️</button>
                        <button className="action-btn danger" title="Delete permanently" disabled={deletingId===f.id}
                          onClick={() => setConfirmDelete({ id:f.id, name:getName(f), fromTrash:true })}>
                          {deletingId===f.id ? <span className="spinner sm" /> : "🗑️"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );

  // ── TIMELINE ──
  const TimelinePage = () => (
    <div>
      {onThisDay.length > 0 && (
        <div className="on-this-day">
          <div className="otd-icon">📅</div>
          <div>
            <div className="otd-title">On This Day</div>
            <div className="otd-files">
              You uploaded {onThisDay.length} file{onThisDay.length!==1?"s":""} on this day last year:{" "}
              {onThisDay.slice(0,3).map(f => getName(f)).join(", ")}
              {onThisDay.length > 3 && ` +${onThisDay.length-3} more`}
            </div>
          </div>
        </div>
      )}
      {timelineGroups.length === 0 ? (
        <div className="section-card">
          <div className="state-box">
            <div className="state-icon" style={{ background:"var(--purple-dim)" }}>🕐</div>
            <div className="state-title">No timeline yet</div>
            <div className="state-sub">Upload files to see your memory timeline</div>
          </div>
        </div>
      ) : (
        <div className="timeline-wrap">
          {timelineGroups.map(([month, mfiles]) => (
            <div className="timeline-month" key={month}>
              <div className="timeline-month-label">📅 {month} <span style={{ fontFamily:"var(--mono)", fontSize:10, color:"var(--muted)" }}>({mfiles.length})</span></div>
              <div className="timeline-files">
                {mfiles.map(f => (
                  <div className="timeline-card" key={f.id} onClick={() => setPreviewFile(f)}>
                    <div className="timeline-card-date">{getDate(f) ? new Date(getDate(f)).toLocaleDateString("en-IN",{day:"numeric",month:"short"}) : "—"}</div>
                    <div className="timeline-card-icon">{fileIcon(getName(f))}</div>
                    <div className="timeline-card-name">{getName(f)}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ── VAULT ──
  const VaultPage = () => {
    if (vaultLocked) return (
      <div className="vault-lock-screen">
        <div className="vault-lock-icon">🔐</div>
        <div className="vault-lock-title">Privacy Vault</div>
        <div className="vault-lock-sub">Enter your 4-digit PIN to unlock your private storage.<br/><span style={{ fontFamily:"var(--mono)", fontSize:11, color:"var(--purple)" }}>Hint: 1234</span></div>
        <div className="vault-pin-row">
          {[0,1,2,3].map(i => <div key={i} className={`vault-pin-dot ${vaultPin.length > i ? "filled" : ""}`} />)}
        </div>
        <div className="vault-numpad">
          {[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map((d,i) => (
            <button key={i} className="vault-numpad-btn"
              style={{ opacity:d===""?0:1, cursor:d===""?"default":"pointer" }}
              disabled={d===""}
              onClick={() => {
                if (d === "⌫") setVaultPin(p => p.slice(0,-1));
                else if (d !== "") handleVaultPin(String(d));
              }}>
              {d}
            </button>
          ))}
        </div>
      </div>
    );

    return (
      <div className="vault-content">
        <div className="vault-header-bar">
          <span style={{ fontSize:18 }}>🔐</span>
          <div className="vault-header-title">Privacy Vault — Unlocked</div>
          <button className="btn btn-purple" style={{ fontSize:11, padding:"5px 10px" }}
            onClick={() => { setVaultLocked(true); setVaultPin(""); addToast("Vault locked.", "info"); }}>
            🔒 Lock
          </button>
          <button className="btn btn-ghost" style={{ fontSize:11, padding:"5px 10px" }}
            onClick={() => vaultInputRef.current?.click()}>
            + Add to Vault
          </button>
        </div>
        <input ref={vaultInputRef} type="file" hidden multiple
          onChange={e => { if (e.target.files?.length) handleUploadFiles(e.target.files, true); e.target.value=""; }} />

        {vaultFiles.length === 0 ? (
          <div className="vault-empty">
            <div className="vault-empty-icon">🗝️</div>
            <div className="vault-empty-text">Your vault is empty.<br/>Add sensitive files here — they're only visible when unlocked.</div>
          </div>
        ) : (
          <div className="section-card" style={{ marginTop:14 }}>
            <table className="file-table">
              <thead><tr><th>Name</th><th>Size</th><th>Added</th><th>Actions</th></tr></thead>
              <tbody>
                {vaultFiles.map(f => (
                  <tr key={f.id}>
                    <td>
                      <div className="file-name-cell">
                        <div className="file-icon-box">{fileIcon(getName(f))}</div>
                        <div>
                          <div style={{ fontSize:13, fontWeight:500, color:"var(--text)" }}>{getName(f)}</div>
                          <div className="file-meta">{getType(f)}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ fontFamily:"var(--mono)", fontSize:12 }}>{formatBytes(getSize(f))}</td>
                    <td style={{ fontFamily:"var(--mono)", fontSize:12 }}>{timeAgo(getDate(f))}</td>
                    <td>
                      <div style={{ display:"flex", gap:4 }}>
                        <button className="action-btn" onClick={() => setPreviewFile(f)}>👁️</button>
                        <button className="action-btn" onClick={() => handleDownload(f.id, getName(f))} disabled={downloadingId===f.id}>
                          {downloadingId===f.id ? <span className="spinner sm" /> : "⬇️"}
                        </button>
                        <button className="action-btn danger" onClick={() => setVaultFiles(v => v.filter(x => x.id !== f.id))}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  // ── FILES PAGE ──
  const FilesPage = () => (
    <>
      <div className="stats-row">
        {[
          { icon:"📁", val:files.length,                              label:"Total Files",  bg:"var(--blue-dim)"    },
          { icon:"⭐", val:starred.length,                            label:"Starred",      bg:"var(--amber-dim)"   },
          { icon:"💾", val:formatBytes(dynamicStorage.storageUsed),   label:"Used Space",   bg:"var(--success-dim)" },
          { icon:"🏥", val:`${healthScore}/100`,                      label:"Health Score", bg:`${healthColor}22`   },
        ].map(({ icon, val, label, bg }) => (
          <div className="stat-card" key={label}>
            <div className="stat-icon-wrap" style={{ background:bg }}>{icon}</div>
            <div className="stat-val">{val}</div>
            <div className="stat-label">{label}</div>
          </div>
        ))}
      </div>

      {/* Doc Intelligence */}
      {detectedDocs.length > 0 && (
        <div className="doc-intel-card">
          <div className="doc-intel-title">🧾 Document Intelligence</div>
          <div className="doc-intel-items">
            {detectedDocs.map(({ file:f, type }) => (
              <div key={f.id} className="doc-intel-item" onClick={() => setPreviewFile(f)}>
                <span>📄</span> {type.toUpperCase()} — {getName(f).slice(0,20)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Savings hint */}
      {trashed.length > 0 && (
        <div className="savings-bar">
          <span>💡</span>
          <span>Empty trash to free <b>{formatBytes(trashed.reduce((s,f) => s+getSize(f), 0))}</b> — your Storage Health Score will improve!</span>
          <button className="btn btn-success" style={{ marginLeft:"auto", fontSize:11, padding:"4px 10px" }}
            onClick={() => setNavItem("Trash")}>View Trash</button>
        </div>
      )}

      <div className="storage-card">
        <div className="storage-card-head">
          <div className="storage-card-title">💾 Storage Usage</div>
          <div className="storage-card-pct">{storagePercent.toFixed(1)}%</div>
        </div>
        <div className="storage-segments">
          {typeBreakdown.map(({ key, color, size }) => (
            <div key={key} className="storage-segment"
              style={{ width:`${dynamicStorage.storageLimit>0?(size/dynamicStorage.storageLimit)*100:0}%`, background:color }}
              title={`${FILE_TYPES[key]?.label||key}: ${formatBytes(size)}`} />
          ))}
        </div>
        <div className="storage-legend">
          {typeBreakdown.map(({ key, label, color, size }) => (
            <div className="legend-item" key={key}>
              <div className="legend-dot" style={{ background:color }} />
              <span>{label} — {formatBytes(size)}</span>
            </div>
          ))}
        </div>
        <div className="storage-numbers">
          <span style={{ fontFamily:"var(--mono)" }}><b style={{ color:"var(--text2)" }}>{formatBytes(dynamicStorage.storageUsed)}</b> used</span>
          <span style={{ fontFamily:"var(--mono)", color:"var(--green)", fontWeight:600 }}>{formatBytes(dynamicStorage.storageLimit - dynamicStorage.storageUsed)} free</span>
          <span style={{ fontFamily:"var(--mono)" }}><b style={{ color:"var(--text2)" }}>{formatBytes(dynamicStorage.storageLimit)}</b> total</span>
        </div>
      </div>

      <div className={`upload-zone ${dragging?"dragging":""}`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}>
        <div className="upload-icon-box">{dragging?"⬇️":"☁️"}</div>
        <div className="upload-title">{dragging?"Release to upload":"Drop files here to upload"}</div>
        <div className="upload-sub"><b>Click to browse</b> · Multiple files · Max 2 GB per file</div>
      </div>

      {uploadQueue.length > 0 && (
        <div className="upload-queue">
          <div className="upload-queue-header">
            <span className="spinner sm" />
            Uploading {uploadQueue.filter(x => x.status==="uploading").length} file(s)…
          </div>
          {uploadQueue.map(item => (
            <div className="upload-item" key={item.id}>
              <span style={{ fontSize:16 }}>{fileIcon(item.file.name)}</span>
              <div className="upload-file-col">
                <div style={{ display:"flex", justifyContent:"space-between" }}>
                  <span className="upload-file-name">{item.file.name}</span>
                  <span className="upload-file-size">{formatBytes(item.file.size)}</span>
                </div>
                <div className="upload-bar"><div className="upload-bar-fill" style={{ width:`${item.progress}%` }} /></div>
                <div className={`upload-status ${item.status}`}>
                  {item.status==="done"?"✓ Done":item.status==="error"?"✕ Failed":`${Math.round(item.progress)}%`}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {filesError && (
        <div className="error-banner">⚠ {filesError}
          <button style={{ marginLeft:"auto", background:"none", border:"none", color:"var(--danger)", cursor:"pointer", fontSize:12, fontWeight:600 }}
            onClick={refreshFiles}>Retry</button>
        </div>
      )}

      <div className="filter-tabs">
        <div className={`filter-tab ${typeFilter==="all"?"active":""}`} onClick={() => setTypeFilter("all")}>
          📁 All <span className="filter-tab-count">{categoryCounts.all||0}</span>
        </div>
        {Object.entries(FILE_TYPES).filter(([k]) => (categoryCounts[k]||0)>0).map(([key,{icon,label}]) => (
          <div key={key} className={`filter-tab ${typeFilter===key?"active":""}`} onClick={() => setTypeFilter(key)}>
            {icon} {label} <span className="filter-tab-count">{categoryCounts[key]}</span>
          </div>
        ))}
      </div>

      {/* AI Search indicator */}
      {search && isAiSearch && (
        <div className="ai-search-bar">
          <span className="ai-search-icon">🤖</span>
          <span>AI Smart Search — showing semantic results for "<b>{search}</b>"</span>
          <span style={{ marginLeft:"auto", fontFamily:"var(--mono)", fontSize:10, color:"var(--blue)" }}>{displayFiles.length} result{displayFiles.length!==1?"s":""}</span>
        </div>
      )}

      {selected.size > 0 && (
        <div className="bulk-bar">
          <span className="bulk-count">{selected.size} selected</span>
          <div className="bulk-spacer" />
          <button className="btn btn-ghost" style={{ fontSize:12, padding:"5px 10px" }} onClick={handleBulkDownload}>⬇️ Download All</button>
          <button className="btn btn-danger" style={{ fontSize:12, padding:"5px 10px" }} onClick={handleBulkTrash}>🗑️ Trash</button>
          <button className="btn btn-ghost" style={{ fontSize:12, padding:"5px 10px" }} onClick={clearSelect}>✕ Clear</button>
        </div>
      )}

      <div className="section-card">
        <div className="section-head">
          <div className="section-title">
            {filesLoading?"Loading…":`${displayFiles.length} ${displayFiles.length===1?"file":"files"}`}
            {search && <span style={{ fontSize:11, color:"var(--muted)", marginLeft:6 }}>"{search}"</span>}
          </div>
          <div className="section-actions">
            {[["name","Name"],["size","Size"],["date","Date"]].map(([col,lbl]) => (
              <button key={col} className={`sort-btn ${sortBy===col?"active":""}`} onClick={() => handleSort(col)}>
                {lbl}<SortIcon col={col} />
              </button>
            ))}
            <button className="icon-btn" onClick={refreshFiles} title="Refresh">↻</button>
            <button className={`icon-btn ${selected.size===displayFiles.length&&displayFiles.length>0?"active":""}`}
              onClick={() => selected.size===displayFiles.length&&displayFiles.length>0 ? clearSelect() : selectAll(displayFiles)}>
              {selected.size===displayFiles.length&&displayFiles.length>0?"☑":"☐"}
            </button>
            <button className={`icon-btn ${view==="list"?"active":""}`} onClick={() => setView("list")}>≡</button>
            <button className={`icon-btn ${view==="grid"?"active":""}`} onClick={() => setView("grid")}>⊞</button>
          </div>
        </div>

        {filesLoading && (
          <div className="state-box">
            <div className="spinner" style={{ margin:"0 auto 10px", width:22, height:22 }} />
            <div className="state-sub">Loading your files…</div>
          </div>
        )}

        {!filesLoading && !filesError && displayFiles.length === 0 && (
          <div className="state-box">
            <div className="state-icon" style={{ background:"var(--blue-dim)" }}>
              {search||typeFilter!=="all"?"🔍":"☁️"}
            </div>
            <div className="state-title">
              {search||typeFilter!=="all"?"No files found":navItem==="Starred"?"No starred files":"No files yet"}
            </div>
            <div className="state-sub">
              {isAiSearch?`AI search found no matches for "${search}"`:search?`No results for "${search}"`:typeFilter!=="all"?"Try a different filter":navItem==="Starred"?"Star files to find them quickly":"Upload your first file above"}
            </div>
          </div>
        )}

        {/* List view */}
        {!filesLoading && view==="list" && displayFiles.length>0 && (
          <table className="file-table">
            <thead>
              <tr>
                <th className="check-col">
                  <input type="checkbox" className="checkbox"
                    checked={selected.size===displayFiles.length&&displayFiles.length>0}
                    onChange={() => selected.size===displayFiles.length&&displayFiles.length>0 ? clearSelect() : selectAll(displayFiles)} />
                </th>
                <th onClick={() => handleSort("name")}>Name<SortIcon col="name" /></th>
                <th onClick={() => handleSort("size")}>Size<SortIcon col="size" /></th>
                <th onClick={() => handleSort("date")}>Uploaded<SortIcon col="date" /></th>
                <th>Type</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayFiles.map(f => (
                <tr key={f.id} className={selected.has(f.id)?"selected":""}>
                  <td><input type="checkbox" className="checkbox" checked={selected.has(f.id)} onChange={() => toggleSelect(f.id)} /></td>
                  <td>
                    <div className="file-name-cell">
                      <div className="file-icon-box" style={{ cursor:"pointer" }} onClick={() => setPreviewFile(f)}>{fileIcon(getName(f))}</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        {renamingId === f.id ? (
                          <input ref={renameInputRef} className="file-name-input" value={renameVal}
                            onChange={e => setRenameVal(e.target.value)}
                            onBlur={commitRename}
                            onKeyDown={e => e.key==="Enter" ? commitRename() : e.key==="Escape" && setRenamingId(null)} />
                        ) : (
                          <div className="file-name-text" onClick={() => setPreviewFile(f)} title="Click to preview">{getName(f)}</div>
                        )}
                        <div className="file-meta">
                          {timeAgo(getDate(f))}
                          {autoTag(getName(f)).map(t => <span key={t} className="file-tag">{t}</span>)}
                        </div>
                      </div>
                      <button className="star-btn" onClick={() => toggleStar(f.id)}>
                        {starred.includes(f.id)?"★":"☆"}
                      </button>
                    </div>
                  </td>
                  <td style={{ fontFamily:"var(--mono)", fontSize:12, color:"var(--text3)" }}>{formatBytes(getSize(f))}</td>
                  <td style={{ fontFamily:"var(--mono)", fontSize:12, color:"var(--text3)" }}>{getDate(f)?new Date(getDate(f)).toLocaleDateString():"—"}</td>
                  <td><span className="badge badge-gray">{getType(f)}</span></td>
                  <td>
                    <div style={{ display:"flex", gap:1 }}>
                      <button className="action-btn" title="Preview" onClick={() => setPreviewFile(f)}>👁️</button>
                      <button className="action-btn" title="Details" onClick={() => setDetailFile(f)}>ℹ️</button>
                      <button className="action-btn" title="Smart Share" onClick={() => setShareFile(f)}>🔗</button>
                      <button className="action-btn" title="Download" disabled={downloadingId===f.id}
                        onClick={() => handleDownload(f.id, getName(f))}>
                        {downloadingId===f.id ? <span className="spinner sm" /> : "⬇️"}
                      </button>
                      <button className="action-btn" title="Rename" onClick={() => startRename(f)}>✏️</button>
                      <button className="action-btn danger" title="Trash" onClick={() => handleTrash(f.id, getName(f))}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Grid view */}
        {!filesLoading && view==="grid" && displayFiles.length>0 && (
          <div className="file-grid">
            {displayFiles.map(f => (
              <div key={f.id} className={`file-card ${selected.has(f.id)?"selected":""}`}>
                <div className="file-card-check">
                  <input type="checkbox" className="checkbox" checked={selected.has(f.id)} onChange={() => toggleSelect(f.id)} />
                </div>
                <button className="star-btn file-card-star" onClick={() => toggleStar(f.id)}>
                  {starred.includes(f.id)?"★":"☆"}
                </button>
                <div className="file-card-icon" onClick={() => setPreviewFile(f)}>{fileIcon(getName(f))}</div>
                <div className="file-card-name" onClick={() => setPreviewFile(f)} title={getName(f)}>
                  {renamingId===f.id ? (
                    <input ref={renameInputRef} className="file-name-input" value={renameVal}
                      style={{ width:"100%", fontSize:11 }}
                      onChange={e => setRenameVal(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={e => e.key==="Enter" ? commitRename() : e.key==="Escape" && setRenamingId(null)} />
                  ) : getName(f)}
                </div>
                <div className="file-card-meta">{formatBytes(getSize(f))} · {timeAgo(getDate(f))}</div>
                <div className="file-card-actions">
                  <button className="action-btn" onClick={() => setPreviewFile(f)}>👁️</button>
                  <button className="action-btn" onClick={() => setShareFile(f)}>🔗</button>
                  <button className="action-btn" disabled={downloadingId===f.id}
                    onClick={() => handleDownload(f.id, getName(f))}>
                    {downloadingId===f.id ? <span className="spinner sm" /> : "⬇️"}
                  </button>
                  <button className="action-btn danger" onClick={() => handleTrash(f.id, getName(f))}>🗑️</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );

  // ── MAIN RENDER ──
  return (
    <>
      <style>{css}</style>
      <Toasts toasts={toasts} />
      <input ref={fileInputRef} type="file" hidden multiple
        onChange={e => { if (e.target.files?.length) handleUploadFiles(e.target.files); e.target.value=""; }} />

      {confirmDelete && (
        <ConfirmModal
          icon="🗑️"
          title={confirmDelete.emptyAll?"Empty Trash?":"Delete Permanently?"}
          sub={confirmDelete.emptyAll
            ? `Permanently delete all ${trashed.length} trashed files. This cannot be undone.`
            : `"${confirmDelete.name}" will be permanently deleted. This cannot be undone.`}
          confirmLabel={confirmDelete.emptyAll?"Empty Trash":"Delete Forever"}
          confirmClass="btn-danger"
          loading={!!deletingId}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            if (confirmDelete.emptyAll) handleEmptyTrash();
            else handlePermDelete(confirmDelete.id, confirmDelete.name);
          }}
        />
      )}

      {previewFile && (
        <FilePreview
          key={previewFile.id}
          file={previewFile}
          onClose={() => setPreviewFile(null)}
          onDownload={handleDownload}
          downloadingId={downloadingId}
          getName={getName}
          getSize={getSize}
        />
      )}

      {shareFile && (
        <SmartShareModal file={shareFile} getName={getName} onClose={() => setShareFile(null)} addToast={addToast} />
      )}

      <DetailPanel />

      <div className="shell">
        <aside className="sidebar">
          <div className="logo">
            <div className="logo-icon">☁️</div>
            <div>
              <div className="logo-text">Get<span>On</span>Clouds</div>
              <div className="logo-sub">File Platform</div>
            </div>
          </div>
          <div className="nav-wrap">
            <div className="nav-section-label">Storage</div>
            {[
              { icon:"☁️", label:"Files",    badge:files.length },
              { icon:"⭐", label:"Starred",   badge:starred.length },
              { icon:"🕐", label:"Recent" },
              { icon:"📅", label:"Timeline" },
            ].map(({ icon, label, badge }) => (
              <div key={label}
                className={`nav-item ${navItem===label?"active":""}`}
                onClick={() => { setNavItem(label); setTypeFilter("all"); setSearch(""); setSelected(new Set()); }}>
                <span className="nav-icon">{icon}</span>
                <span>{label}</span>
                {badge > 0 && <span className="nav-badge">{badge}</span>}
              </div>
            ))}
            <div className="nav-section-label">Manage</div>
            {[
              { icon:"🔐", label:"Vault",    badge:vaultFiles.length, cls:"vault" },
              { icon:"🗑️", label:"Trash",    badge:trashed.length },
              { icon:"⚙️", label:"Settings" },
            ].map(({ icon, label, badge, cls }) => (
              <div key={label}
                className={`nav-item ${cls||""} ${navItem===label?"active":""}`}
                onClick={() => { setNavItem(label); setSelected(new Set()); }}>
                <span className="nav-icon">{icon}</span>
                <span>{label}</span>
                {badge > 0 && <span className="nav-badge">{badge}</span>}
              </div>
            ))}
          </div>

          <div className="storage-wrap">
            <div className="storage-top">
              <span className="storage-lbl">Storage</span>
              <span className="storage-pct">{storagePercent.toFixed(0)}%</span>
            </div>
            <div className="storage-bar">
              <div className="storage-fill" style={{ width:`${storagePercent}%`, background:storageBarColor }} />
            </div>
            <div className="storage-info">{formatBytes(dynamicStorage.storageUsed)} / {formatBytes(dynamicStorage.storageLimit)}</div>
          </div>

          <div className="sidebar-user">
            <div className="user-avatar">{(user?.name||"U")[0].toUpperCase()}</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div className="user-name">{user?.name||"User"}</div>
              <div className="user-email">{user?.email}</div>
            </div>
            <button className="signout-btn" title="Sign out" onClick={handleSignOut}>⏻</button>
          </div>
        </aside>

        <div className="main" style={{ marginRight:detailFile?290:0 }}>
          <div className="topbar">
            <div className="topbar-title">{navItem}</div>
            {navItem==="Recent" && <span className="topbar-crumb">/ Last 20 files</span>}
            {navItem==="Vault" && <span className="topbar-crumb" style={{ color:"var(--purple)" }}>/ 🔐 Protected</span>}
            <div className="topbar-spacer" />
            {(navItem==="Files"||navItem==="Starred"||navItem==="Recent") && (
              <div className="search-wrap">
                <span className="search-icon-pos">🔍</span>
                <input className="search-input" placeholder="Search or ask AI…" value={search}
                  onChange={e => setSearch(e.target.value)} />
                {search.length > 0 && <span className="search-ai-badge">AI</span>}
              </div>
            )}
            <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>
              ☁️ Upload
            </button>
          </div>
          <div className="content">
            {(navItem==="Files"||navItem==="Starred"||navItem==="Recent") && <FilesPage />}
            {navItem==="Timeline"  && <TimelinePage />}
            {navItem==="Vault"     && <VaultPage />}
            {navItem==="Trash"     && <TrashPage />}
            {navItem==="Settings"  && <SettingsPage />}
          </div>
        </div>
      </div>
    </>
  );
}