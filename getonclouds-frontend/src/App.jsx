import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  registerUser, loginUser,
  uploadFile, listFiles, deleteFile, downloadFile, getStorage,
} from "./api";

// ─── Helpers ─────────────────────────────────────────────────────────────────
const formatBytes = (bytes) => {
  if (!bytes) return "0 B";
  const k = 1024, sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const FILE_TYPES = {
  image: { exts: ["png","jpg","jpeg","gif","svg","webp","bmp"], icon: "🖼️", label: "Images", color: "#f59e0b" },
  video: { exts: ["mp4","mov","avi","mkv","webm"], icon: "🎬", label: "Videos", color: "#8b5cf6" },
  audio: { exts: ["mp3","wav","flac","aac","ogg"], icon: "🎵", label: "Audio", color: "#ec4899" },
  doc:   { exts: ["pdf","doc","docx","txt","md","rtf"], icon: "📄", label: "Docs", color: "#3b82f6" },
  sheet: { exts: ["xls","xlsx","csv"], icon: "📊", label: "Sheets", color: "#22c55e" },
  code:  { exts: ["js","ts","jsx","tsx","py","java","cpp","html","css","json","xml"], icon: "💻", label: "Code", color: "#06b6d4" },
  archive: { exts: ["zip","rar","7z","tar","gz"], icon: "📦", label: "Archives", color: "#f97316" },
};

const getFileCategory = (name = "") => {
  const ext = name.split(".").pop()?.toLowerCase();
  for (const [key, val] of Object.entries(FILE_TYPES)) {
    if (val.exts.includes(ext)) return key;
  }
  return "other";
};

const fileIcon = (name = "") => {
  const cat = getFileCategory(name);
  return FILE_TYPES[cat]?.icon || "📁";
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

// ─── CSS ──────────────────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #f0f4f8; --bg2: #e8edf3; --bg3: #dde3ec;
    --surface: #fff; --surface2: #f7f9fc;
    --border: #dde3ec; --border2: #c8d0dc;
    --focus: #3b82f6;
    --blue: #3b82f6; --blue-d: #2563eb; --blue-dim: rgba(59,130,246,0.1); --blue-glow: rgba(59,130,246,0.25);
    --text: #0f172a; --text2: #334155; --text3: #64748b;
    --muted: #94a3b8;
    --danger: #ef4444; --danger-dim: rgba(239,68,68,0.08);
    --success: #22c55e; --success-dim: rgba(34,197,94,0.1);
    --warning: #f59e0b; --warning-dim: rgba(245,158,11,0.1);
    --purple: #8b5cf6; --purple-dim: rgba(139,92,246,0.1);
    --font: 'Plus Jakarta Sans', sans-serif;
    --mono: 'JetBrains Mono', monospace;
    --r: 10px; --r2: 12px;
    --sh: 0 1px 3px rgba(15,23,42,0.08),0 1px 2px rgba(15,23,42,0.05);
    --sh2: 0 4px 16px rgba(15,23,42,0.08),0 2px 6px rgba(15,23,42,0.04);
    --sh3: 0 20px 48px rgba(15,23,42,0.12),0 8px 20px rgba(15,23,42,0.07);
  }

  html, body, #root { height: 100%; width: 100%; }
  body { background: var(--bg); color: var(--text); font-family: var(--font); overflow: hidden; -webkit-font-smoothing: antialiased; }

  .shell { display: flex; width: 100vw; height: 100vh; overflow: hidden; position: relative; z-index: 1; }

  /* ── Sidebar ── */
  .sidebar { width: 248px; flex-shrink: 0; height: 100vh; display: flex; flex-direction: column; background: var(--surface); border-right: 1px solid var(--border); overflow-y: auto; }
  .logo { padding: 20px 18px 16px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 10px; }
  .logo-icon { width: 32px; height: 32px; background: linear-gradient(135deg, var(--blue), #818cf8); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
  .logo-text { font-size: 17px; font-weight: 800; color: var(--text); letter-spacing: -0.4px; }
  .logo-text span { color: var(--blue); }
  .logo-sub { font-family: var(--mono); font-size: 9px; color: var(--muted); text-transform: uppercase; letter-spacing: 1.5px; margin-top: 1px; }

  .nav-wrap { padding: 12px 10px; flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .nav-section-label { font-family: var(--mono); font-size: 9px; text-transform: uppercase; letter-spacing: 2px; color: var(--muted); padding: 8px 8px 4px; margin-top: 4px; }
  .nav-item { display: flex; align-items: center; gap: 9px; padding: 8px 10px; font-size: 13px; font-weight: 500; color: var(--text2); cursor: pointer; border-radius: 8px; transition: all 0.14s; user-select: none; }
  .nav-item:hover { background: var(--bg2); color: var(--text); }
  .nav-item.active { background: var(--blue-dim); color: var(--blue-d); font-weight: 600; }
  .nav-icon { font-size: 15px; width: 20px; text-align: center; flex-shrink: 0; }
  .nav-badge { margin-left: auto; background: var(--bg2); color: var(--text3); font-family: var(--mono); font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 99px; }
  .nav-item.active .nav-badge { background: var(--blue-dim); color: var(--blue); }

  .sidebar-user { padding: 14px 16px; border-top: 1px solid var(--border); display: flex; align-items: center; gap: 10px; }
  .user-avatar { width: 32px; height: 32px; background: linear-gradient(135deg, var(--blue), #818cf8); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: white; flex-shrink: 0; }
  .user-name { font-size: 12.5px; font-weight: 600; color: var(--text); }
  .user-email { font-size: 11px; color: var(--muted); margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px; }
  .signout-btn { margin-left: auto; background: none; border: none; cursor: pointer; font-size: 14px; padding: 4px; border-radius: 6px; color: var(--muted); transition: all 0.14s; }
  .signout-btn:hover { background: var(--danger-dim); color: var(--danger); }

  .storage-wrap { padding: 14px 16px; border-top: 1px solid var(--border); background: var(--surface2); }
  .storage-top { display: flex; justify-content: space-between; margin-bottom: 6px; }
  .storage-lbl { font-size: 11px; font-weight: 600; color: var(--text2); }
  .storage-pct { font-family: var(--mono); font-size: 10px; color: var(--blue); font-weight: 600; }
  .storage-bar { height: 5px; background: var(--bg2); border-radius: 99px; overflow: hidden; }
  .storage-fill { height: 100%; background: linear-gradient(90deg, var(--blue), #818cf8); border-radius: 99px; transition: width 0.6s ease; }
  .storage-info { font-size: 11px; color: var(--muted); margin-top: 5px; font-family: var(--mono); }

  /* ── Main ── */
  .main { flex: 1; display: flex; flex-direction: column; height: 100vh; overflow: hidden; min-width: 0; }

  /* ── Topbar ── */
  .topbar { display: flex; align-items: center; gap: 12px; padding: 0 24px; height: 58px; flex-shrink: 0; background: var(--surface); border-bottom: 1px solid var(--border); box-shadow: var(--sh); z-index: 20; }
  .topbar-title { font-size: 15px; font-weight: 700; color: var(--text); margin-right: 4px; }
  .topbar-crumb { font-size: 13px; color: var(--muted); }
  .topbar-spacer { flex: 1; }
  .search-wrap { position: relative; }
  .search-icon-pos { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--muted); font-size: 13px; pointer-events: none; }
  .search-input { background: var(--bg2); border: 1.5px solid var(--border); border-radius: 8px; padding: 7px 12px 7px 32px; color: var(--text); font-family: var(--font); font-size: 13px; outline: none; width: 220px; transition: all 0.14s; }
  .search-input:focus { border-color: var(--focus); background: var(--surface); box-shadow: 0 0 0 3px var(--blue-dim); width: 260px; }
  .search-input::placeholder { color: var(--muted); }

  /* ── Buttons ── */
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 14px; border: none; border-radius: 8px; font-family: var(--font); font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.14s; white-space: nowrap; }
  .btn-primary { background: var(--blue); color: white; box-shadow: var(--sh); }
  .btn-primary:hover { background: var(--blue-d); box-shadow: 0 4px 12px var(--blue-glow); transform: translateY(-1px); }
  .btn-primary:active { transform: translateY(0); }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
  .btn-ghost { background: var(--surface); border: 1px solid var(--border); color: var(--text2); box-shadow: var(--sh); }
  .btn-ghost:hover { background: var(--bg2); color: var(--text); }
  .btn-danger { background: var(--danger-dim); border: 1px solid rgba(239,68,68,0.2); color: var(--danger); }
  .btn-danger:hover { background: rgba(239,68,68,0.15); }

  /* ── Scrollable content ── */
  .content { flex: 1; overflow-y: auto; padding: 24px; }

  /* ── Type filter tabs ── */
  .filter-tabs { display: flex; gap: 6px; margin-bottom: 20px; flex-wrap: wrap; }
  .filter-tab { display: flex; align-items: center; gap: 5px; padding: 6px 12px; border: 1.5px solid var(--border); border-radius: 99px; background: var(--surface); font-size: 12px; font-weight: 600; color: var(--text2); cursor: pointer; transition: all 0.14s; user-select: none; }
  .filter-tab:hover { border-color: var(--blue); color: var(--blue); }
  .filter-tab.active { background: var(--blue-dim); border-color: var(--blue); color: var(--blue-d); }
  .filter-tab-count { font-family: var(--mono); font-size: 10px; background: var(--bg2); color: var(--muted); padding: 1px 5px; border-radius: 99px; }
  .filter-tab.active .filter-tab-count { background: var(--blue-dim); color: var(--blue); }

  /* ── Sort bar ── */
  .sort-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
  .sort-btn { display: flex; align-items: center; gap: 4px; padding: 5px 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); font-family: var(--font); font-size: 12px; font-weight: 500; color: var(--text2); cursor: pointer; transition: all 0.14s; }
  .sort-btn:hover { border-color: var(--blue); color: var(--blue); }
  .sort-btn.active { background: var(--blue-dim); border-color: var(--blue); color: var(--blue-d); font-weight: 600; }

  /* ── Bulk action bar ── */
  .bulk-bar { display: flex; align-items: center; gap: 10px; padding: 10px 16px; background: var(--blue-dim); border: 1.5px solid var(--blue); border-radius: var(--r); margin-bottom: 14px; animation: slideDown 0.2s ease; }
  @keyframes slideDown { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
  .bulk-count { font-size: 13px; font-weight: 600; color: var(--blue-d); }
  .bulk-spacer { flex: 1; }

  /* ── Stats ── */
  .stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 22px; }
  .stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r2); padding: 18px; box-shadow: var(--sh); transition: all 0.14s; cursor: default; }
  .stat-card:hover { box-shadow: var(--sh2); transform: translateY(-1px); }
  .stat-icon-wrap { width: 36px; height: 36px; border-radius: 9px; display: flex; align-items: center; justify-content: center; font-size: 16px; margin-bottom: 12px; }
  .stat-val { font-size: 22px; font-weight: 700; letter-spacing: -0.5px; color: var(--text); line-height: 1; }
  .stat-label { font-size: 11.5px; color: var(--muted); font-weight: 500; margin-top: 3px; }

  /* ── Upload zone ── */
  .upload-zone { border: 2px dashed var(--border); border-radius: var(--r2); padding: 28px 32px; text-align: center; cursor: pointer; transition: all 0.18s; margin-bottom: 22px; background: var(--surface); box-shadow: var(--sh); }
  .upload-zone.dragging { border-color: var(--blue); background: var(--blue-dim); box-shadow: 0 0 0 4px rgba(59,130,246,0.1); }
  .upload-zone:hover { border-color: rgba(59,130,246,0.5); background: #fafbff; }
  .upload-icon-box { width: 52px; height: 52px; background: var(--blue-dim); border-radius: 13px; display: flex; align-items: center; justify-content: center; font-size: 24px; margin: 0 auto 12px; transition: transform 0.18s; }
  .upload-zone.dragging .upload-icon-box { transform: scale(1.12) rotate(-5deg); }
  .upload-title { font-size: 14px; font-weight: 700; color: var(--text); margin-bottom: 3px; }
  .upload-sub { font-size: 12px; color: var(--muted); }
  .upload-sub b { color: var(--blue); font-weight: 600; cursor: pointer; }

  /* ── Upload queue ── */
  .upload-queue { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r); margin-bottom: 20px; overflow: hidden; box-shadow: var(--sh); }
  .upload-queue-header { padding: 10px 14px; background: var(--surface2); border-bottom: 1px solid var(--border); font-size: 12px; font-weight: 600; color: var(--text2); display: flex; align-items: center; gap: 6px; }
  .upload-item { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid var(--border); }
  .upload-item:last-child { border-bottom: none; }
  .upload-file-icon { font-size: 18px; flex-shrink: 0; }
  .upload-file-name { font-size: 12.5px; font-weight: 500; color: var(--text); flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .upload-file-size { font-family: var(--mono); font-size: 10px; color: var(--muted); flex-shrink: 0; }
  .upload-progress-wrap { margin-top: 4px; }
  .upload-bar { height: 3px; background: var(--bg2); border-radius: 99px; overflow: hidden; }
  .upload-bar-fill { height: 100%; background: linear-gradient(90deg, var(--blue), #818cf8); border-radius: 99px; transition: width 0.2s; }
  .upload-status { font-family: var(--mono); font-size: 10px; color: var(--blue); margin-top: 2px; }
  .upload-status.done { color: var(--success); }
  .upload-status.error { color: var(--danger); }
  .upload-file-col { flex: 1; min-width: 0; }

  /* ── Section card ── */
  .section-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r2); box-shadow: var(--sh); overflow: hidden; }
  .section-head { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-bottom: 1px solid var(--border); background: var(--surface2); flex-wrap: wrap; gap: 8px; }
  .section-title { font-size: 13px; font-weight: 700; color: var(--text); }
  .section-actions { display: flex; gap: 5px; align-items: center; margin-left: auto; }
  .icon-btn { background: none; border: 1px solid var(--border); color: var(--text2); padding: 5px 9px; border-radius: 6px; cursor: pointer; font-size: 12.5px; transition: all 0.14s; font-family: var(--font); font-weight: 500; display: inline-flex; align-items: center; gap: 4px; }
  .icon-btn:hover { background: var(--bg2); color: var(--text); border-color: var(--border2); }
  .icon-btn.active { background: var(--blue-dim); color: var(--blue-d); border-color: rgba(59,130,246,0.3); font-weight: 600; }

  /* ── File table ── */
  .file-table { width: 100%; border-collapse: collapse; }
  .file-table th { font-size: 10.5px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.7px; padding: 9px 14px; text-align: left; border-bottom: 1px solid var(--border); background: var(--surface2); white-space: nowrap; }
  .file-table th.sortable { cursor: pointer; user-select: none; }
  .file-table th.sortable:hover { color: var(--text); }
  .file-table td { padding: 10px 14px; border-bottom: 1px solid rgba(221,227,236,0.6); font-size: 12.5px; color: var(--text2); vertical-align: middle; }
  .file-table tr:last-child td { border-bottom: none; }
  .file-table tbody tr { transition: background 0.1s; }
  .file-table tbody tr:hover { background: #f8fafc; }
  .file-table tbody tr.selected { background: var(--blue-dim); }

  .check-col { width: 36px; }
  .checkbox { width: 15px; height: 15px; cursor: pointer; accent-color: var(--blue); }
  .file-name-cell { display: flex; align-items: center; gap: 10px; }
  .file-icon-box { width: 32px; height: 32px; border-radius: 7px; display: flex; align-items: center; justify-content: center; font-size: 15px; flex-shrink: 0; background: var(--bg2); }
  .file-name-text { font-size: 13px; font-weight: 500; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px; }
  .file-name-input { font-size: 13px; font-weight: 500; color: var(--text); background: var(--surface); border: 1.5px solid var(--focus); border-radius: 5px; padding: 2px 6px; outline: none; width: 180px; font-family: var(--font); }
  .file-meta { font-size: 10.5px; color: var(--muted); margin-top: 1px; font-family: var(--mono); }

  .star-btn { background: none; border: none; cursor: pointer; font-size: 14px; padding: 2px 4px; border-radius: 4px; transition: transform 0.15s; line-height: 1; }
  .star-btn:hover { transform: scale(1.2); }

  .action-btn { background: none; border: none; cursor: pointer; padding: 5px 7px; border-radius: 6px; transition: all 0.12s; color: var(--muted); display: inline-flex; align-items: center; justify-content: center; font-size: 13px; }
  .action-btn:hover { background: var(--bg2); color: var(--text); }
  .action-btn.danger:hover { background: var(--danger-dim); color: var(--danger); }
  .action-btn:disabled { opacity: 0.3; cursor: not-allowed; }
  .action-btn.success-color { color: var(--success); }

  /* ── Grid view ── */
  .file-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(148px, 1fr)); gap: 10px; padding: 14px; }
  .file-card { background: var(--surface2); border: 1.5px solid var(--border); border-radius: var(--r); padding: 16px 12px; text-align: center; cursor: default; transition: all 0.14s; position: relative; }
  .file-card:hover { border-color: rgba(59,130,246,0.35); background: var(--surface); box-shadow: var(--sh2); transform: translateY(-2px); }
  .file-card.selected { border-color: var(--blue); background: var(--blue-dim); }
  .file-card-check { position: absolute; top: 8px; left: 8px; }
  .file-card-star { position: absolute; top: 6px; right: 6px; }
  .file-card-icon { font-size: 30px; margin-bottom: 8px; margin-top: 4px; }
  .file-card-name { font-size: 11.5px; font-weight: 600; word-break: break-word; color: var(--text); line-height: 1.3; margin-bottom: 2px; }
  .file-card-meta { font-family: var(--mono); font-size: 9.5px; color: var(--muted); }
  .file-card-actions { display: flex; justify-content: center; gap: 2px; margin-top: 8px; }

  /* ── Empty / Loading ── */
  .state-box { text-align: center; padding: 56px 20px; }
  .state-icon { width: 64px; height: 64px; border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 28px; margin: 0 auto 14px; }
  .state-title { font-size: 15px; font-weight: 700; color: var(--text); margin-bottom: 4px; }
  .state-sub { font-size: 13px; color: var(--muted); }
  .spinner { width: 18px; height: 18px; border: 2px solid var(--border); border-top-color: var(--blue); border-radius: 50%; animation: spin 0.6s linear infinite; display: inline-block; flex-shrink: 0; }
  .spinner.sm { width: 13px; height: 13px; border-width: 2px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes slideUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
  @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }

  /* ── Error banner ── */
  .error-banner { background: var(--danger-dim); border: 1px solid rgba(239,68,68,0.2); border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; font-size: 12.5px; color: #dc2626; display: flex; align-items: center; gap: 8px; }

  /* ── Detail panel ── */
  .detail-panel { position: fixed; right: 0; top: 0; bottom: 0; width: 300px; background: var(--surface); border-left: 1px solid var(--border); box-shadow: -4px 0 24px rgba(15,23,42,0.08); z-index: 50; display: flex; flex-direction: column; animation: slideLeft 0.2s ease; }
  @keyframes slideLeft { from { transform: translateX(300px); } to { transform: translateX(0); } }
  .detail-head { padding: 16px 18px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; background: var(--surface2); }
  .detail-title { font-size: 13px; font-weight: 700; color: var(--text); }
  .detail-close { background: none; border: none; cursor: pointer; font-size: 16px; color: var(--muted); padding: 3px; border-radius: 5px; transition: all 0.12s; }
  .detail-close:hover { background: var(--bg2); color: var(--text); }
  .detail-body { flex: 1; overflow-y: auto; padding: 18px; }
  .detail-icon { font-size: 48px; text-align: center; margin-bottom: 12px; }
  .detail-name { font-size: 14px; font-weight: 700; color: var(--text); text-align: center; word-break: break-all; margin-bottom: 16px; line-height: 1.4; }
  .detail-row { display: flex; justify-content: space-between; align-items: center; padding: 9px 0; border-bottom: 1px solid var(--border); }
  .detail-row:last-child { border-bottom: none; }
  .detail-key { font-size: 11.5px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; }
  .detail-val { font-size: 12.5px; color: var(--text2); font-family: var(--mono); text-align: right; max-width: 160px; word-break: break-all; }
  .detail-actions { padding: 14px 18px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 8px; }

  /* ── Share link box ── */
  .share-link-box { display: flex; gap: 6px; background: var(--bg2); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; align-items: center; margin-top: 10px; }
  .share-link-text { font-family: var(--mono); font-size: 10.5px; color: var(--text2); flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .copy-btn { background: var(--blue-dim); border: none; color: var(--blue-d); font-size: 11px; font-weight: 600; padding: 4px 8px; border-radius: 5px; cursor: pointer; white-space: nowrap; font-family: var(--font); transition: background 0.14s; }
  .copy-btn:hover { background: var(--blue); color: white; }
  .copy-btn.copied { background: var(--success-dim); color: #15803d; }

  /* ── Settings page ── */
  .settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .settings-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r2); padding: 20px; box-shadow: var(--sh); }
  .settings-card-title { font-size: 13px; font-weight: 700; color: var(--text); margin-bottom: 14px; display: flex; align-items: center; gap: 6px; }
  .settings-field { margin-bottom: 12px; }
  .settings-field label { display: block; font-size: 11.5px; font-weight: 600; color: var(--text2); margin-bottom: 4px; }
  .settings-field input { width: 100%; background: var(--bg2); border: 1.5px solid var(--border); border-radius: 7px; padding: 8px 10px; color: var(--text); font-family: var(--font); font-size: 13px; outline: none; transition: all 0.14s; }
  .settings-field input:focus { border-color: var(--focus); background: var(--surface); box-shadow: 0 0 0 3px var(--blue-dim); }
  .type-breakdown { display: flex; flex-direction: column; gap: 8px; }
  .type-row { display: flex; align-items: center; gap: 8px; }
  .type-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .type-name { font-size: 12px; font-weight: 500; color: var(--text2); flex: 1; }
  .type-size { font-family: var(--mono); font-size: 11px; color: var(--muted); }
  .type-bar { flex: 2; height: 4px; background: var(--bg2); border-radius: 99px; overflow: hidden; }
  .type-bar-fill { height: 100%; border-radius: 99px; transition: width 0.5s ease; }

  /* ── Auth ── */
  .auth-screen { position: fixed; inset: 0; background: linear-gradient(135deg,#eff6ff 0%,#f0f4f8 50%,#f5f3ff 100%); display: flex; align-items: center; justify-content: center; animation: fadeIn 0.3s; }
  .auth-card { width: 400px; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 36px; box-shadow: var(--sh3); animation: slideUp 0.35s ease; }
  .auth-brand { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
  .auth-brand-icon { width: 36px; height: 36px; background: linear-gradient(135deg,var(--blue),#818cf8); border-radius: 9px; display: flex; align-items: center; justify-content: center; font-size: 18px; }
  .auth-logo { font-size: 20px; font-weight: 800; color: var(--text); }
  .auth-logo span { color: var(--blue); }
  .auth-sub { font-size: 13px; color: var(--muted); margin-bottom: 24px; }
  .tab-row { display: flex; gap: 4px; background: var(--bg2); border-radius: 9px; padding: 4px; margin-bottom: 22px; }
  .tab-btn { flex: 1; padding: 8px; border: none; border-radius: 7px; background: none; color: var(--muted); font-family: var(--font); font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.14s; }
  .tab-btn.active { background: var(--surface); color: var(--blue-d); box-shadow: var(--sh); }
  .field { margin-bottom: 14px; }
  .field label { display: block; font-size: 12px; font-weight: 600; color: var(--text2); margin-bottom: 5px; }
  .field input { width: 100%; background: var(--surface); border: 1.5px solid var(--border); border-radius: 8px; padding: 10px 12px; color: var(--text); font-family: var(--font); font-size: 14px; outline: none; transition: all 0.14s; }
  .field input:focus { border-color: var(--focus); box-shadow: 0 0 0 3px var(--blue-dim); }
  .field input::placeholder { color: var(--muted); }
  .auth-msg { font-size: 12.5px; margin-top: 10px; padding: 9px 12px; border-radius: 7px; display: flex; align-items: center; gap: 6px; }
  .auth-msg.success { background: var(--success-dim); color: #15803d; border: 1px solid rgba(34,197,94,0.2); }
  .auth-msg.error { background: var(--danger-dim); color: #dc2626; border: 1px solid rgba(239,68,68,0.2); }

  /* ── Toast ── */
  .toast-wrap { position: fixed; bottom: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 7px; pointer-events: none; }
  .toast { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 10px 14px; font-size: 12.5px; font-weight: 500; box-shadow: var(--sh3); display: flex; align-items: center; gap: 8px; animation: slideUp 0.22s ease; max-width: 300px; color: var(--text); pointer-events: auto; }
  .toast.success { border-left: 3px solid var(--success); }
  .toast.error { border-left: 3px solid var(--danger); }
  .toast.warning { border-left: 3px solid var(--warning); }
  .toast.info { border-left: 3px solid var(--blue); }

  /* ── Misc ── */
  .divider { height: 1px; background: var(--border); margin: 8px 0; }
  .badge { display: inline-flex; align-items: center; font-family: var(--mono); font-size: 10px; font-weight: 500; padding: 2px 7px; border-radius: 99px; text-transform: uppercase; letter-spacing: 0.4px; }
  .badge-blue { background: var(--blue-dim); color: var(--blue-d); }
  .badge-gray { background: var(--bg2); color: var(--text3); border: 1px solid var(--border); }
  .badge-purple { background: var(--purple-dim); color: var(--purple); }

  @media (max-width: 960px) {
    .sidebar { width: 56px; }
    .logo-text, .logo-sub, .nav-item > span:not(.nav-icon), .nav-section-label, .nav-badge, .storage-wrap, .sidebar-user .user-name, .sidebar-user .user-email { display: none; }
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

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  // ── Auth ──
  const [token, setToken]           = useState(() => localStorage.getItem("goc_token") || "");
  const [user, setUser]             = useState(() => { try { return JSON.parse(localStorage.getItem("goc_user")); } catch { return null; } });
  const [authMode, setAuthMode]     = useState("login");
  const [authLoading, setAuthLoading] = useState(false);
  const [authMsg, setAuthMsg]       = useState(null);
  const [form, setForm]             = useState({ name: "", email: "", password: "" });

  // ── Files (server) ──
  const [files, setFiles]               = useState([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError]     = useState(null);
  const [storage, setStorage]           = useState({ storageUsed: 0, storageLimit: 5368709120 });

  // ── Local file state (client-side features) ──
  const [starred, setStarred]   = useState(() => { try { return JSON.parse(localStorage.getItem("goc_starred")) || []; } catch { return []; } });
  const [trashed, setTrashed]   = useState(() => { try { return JSON.parse(localStorage.getItem("goc_trashed")) || []; } catch { return []; } });
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal, setRenameVal]   = useState("");

  // ── Upload queue ──
  const [uploadQueue, setUploadQueue] = useState([]); // [{file, progress, status, id}]

  // ── UI ──
  const [view, setView]             = useState("list");
  const [navItem, setNavItem]       = useState("Files");
  const [search, setSearch]         = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortBy, setSortBy]         = useState("date");
  const [sortDir, setSortDir]       = useState("desc");
  const [selected, setSelected]     = useState(new Set());
  const [detailFile, setDetailFile] = useState(null);
  const [dragging, setDragging]     = useState(false);
  const [copiedId, setCopiedId]     = useState(null);
  const [toasts, setToasts]         = useState([]);
  const [downloadingId, setDownloadingId] = useState(null);
  const [deletingId, setDeletingId]       = useState(null);

  const fileInputRef = useRef();
  const renameInputRef = useRef();

  // ── Persist ──
  useEffect(() => { token ? localStorage.setItem("goc_token", token) : localStorage.removeItem("goc_token"); }, [token]);
  useEffect(() => { user ? localStorage.setItem("goc_user", JSON.stringify(user)) : localStorage.removeItem("goc_user"); }, [user]);
  useEffect(() => { localStorage.setItem("goc_starred", JSON.stringify(starred)); }, [starred]);
  useEffect(() => { localStorage.setItem("goc_trashed", JSON.stringify(trashed)); }, [trashed]);

  // ── Toast ──
  const addToast = useCallback((msg, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts((p) => [...p, { id, msg, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3500);
  }, []);

  // ── API helpers ──
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

  // ── Fetch files ──
  const refreshFiles = useCallback(async () => {
    setFilesLoading(true); setFilesError(null);
    try {
      const res = await listFiles();
      setFiles(res?.data?.data ?? []);
    } catch (err) {
      setFilesError(extractError(err, "Could not load files."));
    } finally { setFilesLoading(false); }
  }, []);

  const refreshStorage = useCallback(async () => {
    try {
      const res = await getStorage();
      const s = res?.data?.data;
      if (s) setStorage(s);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (token) { refreshFiles(); refreshStorage(); }
  }, [token]);

  // ── Auth ──
  const handleAuth = async () => {
    setAuthMsg(null);
    if (!form.email?.includes("@")) return setAuthMsg({ type: "error", text: "Enter a valid email." });
    if (!form.password || form.password.length < 6) return setAuthMsg({ type: "error", text: "Password must be at least 6 characters." });
    if (authMode === "register" && !form.name?.trim()) return setAuthMsg({ type: "error", text: "Name is required." });
    setAuthLoading(true);
    try {
      if (authMode === "register") {
        await registerUser({ name: form.name.trim(), email: form.email.trim(), password: form.password });
        try {
          const res = await loginUser({ email: form.email.trim(), password: form.password });
          const tok = extractToken(res);
          if (tok) { setToken(tok); setUser({ name: form.name.trim(), email: form.email.trim() }); addToast("Account created & signed in!"); return; }
        } catch { /* fall through */ }
        setAuthMode("login"); setAuthMsg({ type: "success", text: "Account created! Please sign in." });
      } else {
        const res = await loginUser({ email: form.email.trim(), password: form.password });
        console.log("Login response:", JSON.stringify(res?.data));
        const tok = extractToken(res);
        if (!tok) throw new Error("No token in response");
        setToken(tok); setUser({ name: form.email.split("@")[0], email: form.email.trim() });
        addToast("Welcome back!", "success");
      }
    } catch (err) {
      setAuthMsg({ type: "error", text: extractError(err, authMode === "login" ? "Login failed." : "Registration failed.") });
    } finally { setAuthLoading(false); }
  };

  const handleSignOut = () => {
    setToken(""); setUser(null); setFiles([]); setSelected(new Set()); setDetailFile(null);
    setStorage({ storageUsed: 0, storageLimit: 5368709120 });
    addToast("Signed out.");
  };

  // ── Upload (multi-file queue) ──
  const handleUploadFiles = async (fileList) => {
    const newItems = Array.from(fileList).map((f) => ({ id: Date.now() + Math.random(), file: f, progress: 0, status: "pending" }));
    setUploadQueue((q) => [...q, ...newItems]);

    for (const item of newItems) {
      setUploadQueue((q) => q.map((x) => x.id === item.id ? { ...x, status: "uploading" } : x));
      const tick = setInterval(() => {
        setUploadQueue((q) => q.map((x) => x.id === item.id ? { ...x, progress: Math.min(x.progress + Math.random() * 10, 85) } : x));
      }, 180);
      try {
        await uploadFile(item.file);
        clearInterval(tick);
        setUploadQueue((q) => q.map((x) => x.id === item.id ? { ...x, progress: 100, status: "done" } : x));
        addToast(`${item.file.name} uploaded!`, "success");
        await refreshFiles(); await refreshStorage();
      } catch (err) {
        clearInterval(tick);
        setUploadQueue((q) => q.map((x) => x.id === item.id ? { ...x, status: "error" } : x));
        addToast(extractError(err, "Upload failed."), "error");
      }
    }
    // Clear done/error items after delay
    setTimeout(() => setUploadQueue((q) => q.filter((x) => x.status === "uploading" || x.status === "pending")), 4000);
  };

  const handleDrop = (e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) handleUploadFiles(e.dataTransfer.files); };

  // ── Delete (move to trash) ──
  const handleTrash = (id, name) => {
    const file = files.find((f) => f.id === id);
    if (!file) return;
    setTrashed((p) => [...p, { ...file, trashedAt: new Date().toISOString() }]);
    setFiles((p) => p.filter((f) => f.id !== id));
    if (detailFile?.id === id) setDetailFile(null);
    addToast(`${name} moved to Trash.`, "warning");
  };

  // ── Permanent delete ──
  const handlePermDelete = async (id, name) => {
    setDeletingId(id);
    try {
      await deleteFile(id);
      setTrashed((p) => p.filter((f) => f.id !== id));
      addToast(`${name} permanently deleted.`, "error");
      await refreshStorage();
    } catch (err) {
      addToast(extractError(err, "Delete failed."), "error");
    } finally { setDeletingId(null); }
  };

  // ── Restore from trash ──
  const handleRestore = (id) => {
    const file = trashed.find((f) => f.id === id);
    if (!file) return;
    const { trashedAt, ...rest } = file;
    setFiles((p) => [rest, ...p]);
    setTrashed((p) => p.filter((f) => f.id !== id));
    addToast(`${getName(file)} restored.`, "success");
  };

  // ── Download ──
  const handleDownload = async (id, name) => {
    setDownloadingId(id);
    try {
      const res = await downloadFile(id);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a"); a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
      addToast(`Downloading ${name}`, "info");
    } catch (err) { addToast(extractError(err, "Download failed."), "error"); }
    finally { setDownloadingId(null); }
  };

  // ── Bulk actions ──
  const handleBulkDownload = async () => {
    for (const id of selected) {
      const f = files.find((x) => x.id === id);
      if (f) await handleDownload(id, getName(f));
    }
    setSelected(new Set());
  };

  const handleBulkTrash = () => {
    selected.forEach((id) => {
      const f = files.find((x) => x.id === id);
      if (f) handleTrash(id, getName(f));
    });
    setSelected(new Set());
  };

  // ── Star ──
  const toggleStar = (id) => {
    setStarred((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  };

  // ── Rename ──
  const startRename = (f) => { setRenamingId(f.id); setRenameVal(getName(f)); setTimeout(() => renameInputRef.current?.focus(), 50); };
  const commitRename = () => {
    if (!renameVal.trim()) { setRenamingId(null); return; }
    setFiles((p) => p.map((f) => f.id === renamingId ? { ...f, fileName: renameVal.trim(), name: renameVal.trim() } : f));
    if (detailFile?.id === renamingId) setDetailFile((p) => ({ ...p, fileName: renameVal.trim(), name: renameVal.trim() }));
    addToast("File renamed.", "info");
    setRenamingId(null);
  };

  // ── Copy share link ──
  const handleCopyLink = (id) => {
    const link = `${window.location.origin}/share/${id}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiedId(id); addToast("Share link copied!", "success");
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  // ── Select ──
  const toggleSelect = (id) => setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectAll = () => setSelected(new Set(displayFiles.map((f) => f.id)));
  const clearSelect = () => setSelected(new Set());

  // ── Sort ──
  const handleSort = (col) => {
    if (sortBy === col) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("asc"); }
  };

  // ── Derived data ──
  const getName = (f) => f.fileName || f.name || "Unknown";
  const getSize = (f) => f.fileSize ?? f.size ?? 0;
  const getDate = (f) => f.uploadedAt || f.createdAt || "";
  const getType = (f) => f.fileType || f.contentType || getName(f).split(".").pop()?.toUpperCase() || "—";

  const activeFiles = navItem === "Starred" ? files.filter((f) => starred.includes(f.id))
    : navItem === "Recent" ? [...files].sort((a, b) => new Date(getDate(b)) - new Date(getDate(a))).slice(0, 20)
    : files;

  const filteredByType = typeFilter === "all" ? activeFiles
    : activeFiles.filter((f) => getFileCategory(getName(f)) === typeFilter);

  const filteredBySearch = filteredByType.filter((f) =>
    getName(f).toLowerCase().includes(search.toLowerCase())
  );

  const displayFiles = useMemo(() => {
    return [...filteredBySearch].sort((a, b) => {
      let va, vb;
      if (sortBy === "name") { va = getName(a).toLowerCase(); vb = getName(b).toLowerCase(); }
      else if (sortBy === "size") { va = getSize(a); vb = getSize(b); }
      else { va = new Date(getDate(a)).getTime(); vb = new Date(getDate(b)).getTime(); }
      return sortDir === "asc" ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });
  }, [filteredBySearch, sortBy, sortDir]);

  const storagePercent = storage.storageLimit > 0
    ? Math.min((storage.storageUsed / storage.storageLimit) * 100, 100) : 0;

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts = { all: files.length };
    files.forEach((f) => {
      const c = getFileCategory(getName(f));
      counts[c] = (counts[c] || 0) + 1;
    });
    return counts;
  }, [files]);

  // Type breakdown for settings
  const typeBreakdown = useMemo(() => {
    const sizes = {};
    files.forEach((f) => {
      const c = getFileCategory(getName(f));
      sizes[c] = (sizes[c] || 0) + getSize(f);
    });
    const total = Object.values(sizes).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(sizes).map(([key, size]) => ({
      key, size, pct: (size / total) * 100,
      ...FILE_TYPES[key] || { label: "Other", color: "#94a3b8", icon: "📁" },
    })).sort((a, b) => b.size - a.size);
  }, [files]);

  const SortIcon = ({ col }) => sortBy === col ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  // ── AUTH WALL ──────────────────────────────────────────────────────────────
  if (!token) {
    return (
      <>
        <style>{css}</style>
        <div className="auth-screen">
          <div className="auth-card">
            <div className="auth-brand">
              <div className="auth-brand-icon">☁️</div>
              <div className="auth-logo">Get<span>On</span>Clouds</div>
            </div>
            <div className="auth-sub">Secure cloud file storage platform</div>
            <div className="tab-row">
              {["login","register"].map((m) => (
                <button key={m} className={`tab-btn ${authMode===m?"active":""}`}
                  onClick={() => { setAuthMode(m); setAuthMsg(null); }}>
                  {m === "login" ? "Sign In" : "Create Account"}
                </button>
              ))}
            </div>
            {authMode === "register" && (
              <div className="field"><label>Full Name</label>
                <input placeholder="Your name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
            )}
            <div className="field"><label>Email</label>
              <input type="email" placeholder="you@example.com" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="field"><label>Password</label>
              <input type="password" placeholder="Min. 6 characters" value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && handleAuth()} />
            </div>
            {authMsg && <div className={`auth-msg ${authMsg.type}`}>{authMsg.type==="success"?"✓":"⚠"} {authMsg.text}</div>}
            <button className="btn btn-primary" style={{width:"100%",marginTop:18,padding:"12px"}}
              onClick={handleAuth} disabled={authLoading}>
              {authLoading ? <><span className="spinner sm" style={{borderTopColor:"white"}} /> Please wait…</> : authMode==="login" ? "Sign In →" : "Create Account →"}
            </button>
          </div>
        </div>
      </>
    );
  }

  // ── SETTINGS PAGE ──────────────────────────────────────────────────────────
  const SettingsPage = () => (
    <div className="settings-grid">
      <div className="settings-card">
        <div className="settings-card-title">👤 Profile</div>
        <div className="settings-field"><label>Display Name</label>
          <input defaultValue={user?.name} placeholder="Your name" />
        </div>
        <div className="settings-field"><label>Email</label>
          <input defaultValue={user?.email} type="email" readOnly style={{opacity:0.7,cursor:"not-allowed"}} />
        </div>
        <button className="btn btn-primary" style={{marginTop:8}} onClick={() => addToast("Profile saved.", "success")}>Save Changes</button>
      </div>

      <div className="settings-card">
        <div className="settings-card-title">🔐 Security</div>
        <div className="settings-field"><label>Current Password</label>
          <input type="password" placeholder="••••••••" />
        </div>
        <div className="settings-field"><label>New Password</label>
          <input type="password" placeholder="Min. 6 characters" />
        </div>
        <div className="settings-field"><label>Confirm Password</label>
          <input type="password" placeholder="Repeat new password" />
        </div>
        <button className="btn btn-ghost" style={{marginTop:4}} onClick={() => addToast("Password updated.", "success")}>Update Password</button>
      </div>

      <div className="settings-card" style={{gridColumn:"1/-1"}}>
        <div className="settings-card-title">💾 Storage Breakdown</div>
        <div style={{marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
            <span style={{fontSize:13,color:"var(--text2)"}}>
              <b>{formatBytes(storage.storageUsed)}</b> used of {formatBytes(storage.storageLimit)}
            </span>
            <span style={{fontFamily:"var(--mono)",fontSize:12,color:"var(--blue)",fontWeight:600}}>{storagePercent.toFixed(1)}%</span>
          </div>
          <div className="storage-bar" style={{height:8}}>
            <div className="storage-fill" style={{width:`${storagePercent}%`}} />
          </div>
        </div>
        <div className="type-breakdown">
          {typeBreakdown.length === 0
            ? <p style={{fontSize:13,color:"var(--muted)"}}>No files yet.</p>
            : typeBreakdown.map(({ key, label, color, icon, size, pct }) => (
              <div className="type-row" key={key}>
                <div className="type-dot" style={{background:color}} />
                <span style={{fontSize:14}}>{icon}</span>
                <span className="type-name">{label}</span>
                <div className="type-bar"><div className="type-bar-fill" style={{width:`${pct}%`,background:color}} /></div>
                <span className="type-size">{formatBytes(size)}</span>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );

  // ── TRASH PAGE ─────────────────────────────────────────────────────────────
  const TrashPage = () => (
    <div>
      {trashed.length === 0 ? (
        <div className="section-card">
          <div className="state-box">
            <div className="state-icon" style={{background:"var(--danger-dim)"}}>🗑️</div>
            <div className="state-title">Trash is empty</div>
            <div className="state-sub">Deleted files will appear here</div>
          </div>
        </div>
      ) : (
        <>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <span style={{fontSize:13,color:"var(--muted)"}}>{trashed.length} item{trashed.length!==1?"s":""} in trash</span>
            <button className="btn btn-danger" onClick={() => { trashed.forEach((f) => handlePermDelete(f.id, getName(f))); }} style={{fontSize:12,padding:"6px 12px"}}>
              🗑️ Empty Trash
            </button>
          </div>
          <div className="section-card">
            <table className="file-table">
              <thead><tr>
                <th>Name</th><th>Size</th><th>Deleted</th><th>Actions</th>
              </tr></thead>
              <tbody>
                {trashed.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <div className="file-name-cell">
                        <div className="file-icon-box" style={{opacity:0.5}}>{fileIcon(getName(f))}</div>
                        <div>
                          <div className="file-name-text" style={{color:"var(--text3)"}}>{getName(f)}</div>
                          <div className="file-meta">{getType(f)}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{fontFamily:"var(--mono)",fontSize:12}}>{formatBytes(getSize(f))}</td>
                    <td style={{fontFamily:"var(--mono)",fontSize:12}}>{timeAgo(f.trashedAt)}</td>
                    <td>
                      <div style={{display:"flex",gap:4}}>
                        <button className="action-btn" title="Restore" onClick={() => handleRestore(f.id)}>↩️</button>
                        <button className="action-btn danger" title="Delete permanently" disabled={deletingId===f.id}
                          onClick={() => handlePermDelete(f.id, getName(f))}>
                          {deletingId===f.id ? <span className="spinner sm"/> : "🗑️"}
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

  // ── FILE DETAIL PANEL ──────────────────────────────────────────────────────
  const DetailPanel = () => {
    if (!detailFile) return null;
    const f = detailFile;
    const isStarred = starred.includes(f.id);
    return (
      <div className="detail-panel">
        <div className="detail-head">
          <div className="detail-title">File Details</div>
          <button className="detail-close" onClick={() => setDetailFile(null)}>✕</button>
        </div>
        <div className="detail-body">
          <div className="detail-icon">{fileIcon(getName(f))}</div>
          <div className="detail-name">{getName(f)}</div>
          {[
            { k: "Type", v: getType(f) },
            { k: "Size", v: formatBytes(getSize(f)) },
            { k: "Uploaded", v: getDate(f) ? new Date(getDate(f)).toLocaleDateString() : "—" },
            { k: "ID", v: `#${f.id}` },
          ].map(({ k, v }) => (
            <div className="detail-row" key={k}>
              <span className="detail-key">{k}</span>
              <span className="detail-val">{v}</span>
            </div>
          ))}
          <div style={{marginTop:14}}>
            <div style={{fontSize:11.5,fontWeight:600,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6}}>Share Link</div>
            <div className="share-link-box">
              <span className="share-link-text">{`${window.location.origin}/share/${f.id}`}</span>
              <button className={`copy-btn ${copiedId===f.id?"copied":""}`} onClick={() => handleCopyLink(f.id)}>
                {copiedId===f.id ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        </div>
        <div className="detail-actions">
          <button className="btn btn-primary" onClick={() => handleDownload(f.id, getName(f))} disabled={downloadingId===f.id}>
            {downloadingId===f.id ? <><span className="spinner sm" style={{borderTopColor:"white"}}/>Downloading…</> : "⬇️ Download"}
          </button>
          <button className="btn btn-ghost" onClick={() => { startRename(f); setDetailFile(null); }}>✏️ Rename</button>
          <button className="btn btn-ghost" onClick={() => toggleStar(f.id)}>
            {isStarred ? "★ Unstar" : "☆ Star"}
          </button>
          <button className="btn btn-danger" onClick={() => { handleTrash(f.id, getName(f)); setDetailFile(null); }}>
            🗑️ Move to Trash
          </button>
        </div>
      </div>
    );
  };

  // ── FILES PAGE CONTENT ─────────────────────────────────────────────────────
  const FilesPage = () => (
    <>
      {/* Stats */}
      <div className="stats-row">
        {[
          { icon: "📁", val: files.length, label: "Total Files", bg: "var(--blue-dim)" },
          { icon: "⭐", val: starred.length, label: "Starred", bg: "var(--warning-dim)" },
          { icon: "💾", val: formatBytes(storage.storageUsed), label: "Used Space", bg: "var(--success-dim)" },
          { icon: "📤", val: formatBytes(storage.storageLimit), label: "Capacity", bg: "var(--purple-dim)" },
        ].map(({ icon, val, label, bg }) => (
          <div className="stat-card" key={label}>
            <div className="stat-icon-wrap" style={{background:bg}}>{icon}</div>
            <div className="stat-val">{val}</div>
            <div className="stat-label">{label}</div>
          </div>
        ))}
      </div>

      {/* Upload zone */}
      <div
        className={`upload-zone ${dragging?"dragging":""}`}
        onClick={() => fileInputRef.current.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <div className="upload-icon-box">{dragging ? "⬇️" : "☁️"}</div>
        <div className="upload-title">{dragging ? "Release to upload" : "Drop files here to upload"}</div>
        <div className="upload-sub"><b>Click to browse</b> · Multiple files supported · Max 2 GB per file</div>
        <input ref={fileInputRef} type="file" hidden multiple
          onChange={(e) => { if (e.target.files.length) handleUploadFiles(e.target.files); e.target.value=""; }} />
      </div>

      {/* Upload queue */}
      {uploadQueue.length > 0 && (
        <div className="upload-queue">
          <div className="upload-queue-header">
            <span className="spinner sm" /> Uploading {uploadQueue.filter(x=>x.status==="uploading").length} file(s)…
          </div>
          {uploadQueue.map((item) => (
            <div className="upload-item" key={item.id}>
              <span className="upload-file-icon">{fileIcon(item.file.name)}</span>
              <div className="upload-file-col">
                <div style={{display:"flex",justifyContent:"space-between"}}>
                  <span className="upload-file-name">{item.file.name}</span>
                  <span className="upload-file-size">{formatBytes(item.file.size)}</span>
                </div>
                <div className="upload-progress-wrap">
                  <div className="upload-bar"><div className="upload-bar-fill" style={{width:`${item.progress}%`}}/></div>
                  <div className={`upload-status ${item.status}`}>
                    {item.status==="done" ? "✓ Done" : item.status==="error" ? "✕ Failed" : `${Math.round(item.progress)}%`}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {filesError && (
        <div className="error-banner">
          ⚠ {filesError}
          <button style={{marginLeft:"auto",background:"none",border:"none",color:"#dc2626",cursor:"pointer",fontSize:12,fontWeight:600}} onClick={refreshFiles}>Retry</button>
        </div>
      )}

      {/* Type filter tabs */}
      <div className="filter-tabs">
        <div className={`filter-tab ${typeFilter==="all"?"active":""}`} onClick={() => setTypeFilter("all")}>
          📁 All <span className="filter-tab-count">{categoryCounts.all || 0}</span>
        </div>
        {Object.entries(FILE_TYPES).filter(([k]) => categoryCounts[k] > 0).map(([key, { icon, label }]) => (
          <div key={key} className={`filter-tab ${typeFilter===key?"active":""}`} onClick={() => setTypeFilter(key)}>
            {icon} {label} <span className="filter-tab-count">{categoryCounts[key]}</span>
          </div>
        ))}
      </div>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="bulk-bar">
          <span className="bulk-count">{selected.size} selected</span>
          <div className="bulk-spacer" />
          <button className="btn btn-ghost" style={{fontSize:12,padding:"5px 10px"}} onClick={handleBulkDownload}>⬇️ Download All</button>
          <button className="btn btn-danger" style={{fontSize:12,padding:"5px 10px"}} onClick={handleBulkTrash}>🗑️ Move to Trash</button>
          <button className="btn btn-ghost" style={{fontSize:12,padding:"5px 10px"}} onClick={clearSelect}>✕ Clear</button>
        </div>
      )}

      {/* Files section */}
      <div className="section-card">
        <div className="section-head">
          <div className="section-title">
            {filesLoading ? "Loading…" : `${displayFiles.length} ${displayFiles.length===1?"file":"files"}`}
            {search && <span style={{fontSize:11,color:"var(--muted)",marginLeft:6}}>matching "{search}"</span>}
          </div>
          <div className="section-actions">
            {/* Sort buttons */}
            <div className="sort-bar" style={{margin:0}}>
              {[["name","Name"],["size","Size"],["date","Date"]].map(([col,lbl]) => (
                <button key={col} className={`sort-btn ${sortBy===col?"active":""}`} onClick={() => handleSort(col)}>
                  {lbl}<SortIcon col={col} />
                </button>
              ))}
            </div>
            <button className="icon-btn" onClick={refreshFiles}>↻</button>
            <button className={`icon-btn ${selected.size===displayFiles.length&&displayFiles.length>0?"active":""}`}
              onClick={() => selected.size===displayFiles.length ? clearSelect() : selectAll()}>
              {selected.size===displayFiles.length&&displayFiles.length>0 ? "☑ All" : "☐ All"}
            </button>
            <button className={`icon-btn ${view==="list"?"active":""}`} onClick={() => setView("list")}>≡</button>
            <button className={`icon-btn ${view==="grid"?"active":""}`} onClick={() => setView("grid")}>⊞</button>
          </div>
        </div>

        {/* Loading */}
        {filesLoading && (
          <div className="state-box">
            <div className="spinner" style={{margin:"0 auto 12px",width:24,height:24}} />
            <div className="state-sub">Loading your files…</div>
          </div>
        )}

        {/* Empty */}
        {!filesLoading && !filesError && displayFiles.length===0 && (
          <div className="state-box">
            <div className="state-icon" style={{background:"var(--blue-dim)"}}>
              {search || typeFilter!=="all" ? "🔍" : "☁️"}
            </div>
            <div className="state-title">{search||typeFilter!=="all" ? "No files found" : navItem==="Starred" ? "No starred files" : "No files yet"}</div>
            <div className="state-sub">{search ? `No results for "${search}"` : typeFilter!=="all" ? "Try a different file type filter" : navItem==="Starred" ? "Star files to find them quickly" : "Upload your first file above"}</div>
          </div>
        )}

        {/* List view */}
        {!filesLoading && view==="list" && displayFiles.length>0 && (
          <table className="file-table">
            <thead>
              <tr>
                <th className="check-col"><input type="checkbox" className="checkbox" checked={selected.size===displayFiles.length&&displayFiles.length>0} onChange={() => selected.size===displayFiles.length ? clearSelect() : selectAll()} /></th>
                <th className="sortable" onClick={() => handleSort("name")}>Name<SortIcon col="name"/></th>
                <th className="sortable" onClick={() => handleSort("size")}>Size<SortIcon col="size"/></th>
                <th className="sortable" onClick={() => handleSort("date")}>Uploaded<SortIcon col="date"/></th>
                <th>Type</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayFiles.map((f) => (
                <tr key={f.id} className={selected.has(f.id)?"selected":""}>
                  <td><input type="checkbox" className="checkbox" checked={selected.has(f.id)} onChange={() => toggleSelect(f.id)} /></td>
                  <td>
                    <div className="file-name-cell">
                      <div className="file-icon-box">{fileIcon(getName(f))}</div>
                      <div style={{flex:1,minWidth:0}}>
                        {renamingId===f.id ? (
                          <input ref={renameInputRef} className="file-name-input" value={renameVal}
                            onChange={(e) => setRenameVal(e.target.value)}
                            onBlur={commitRename}
                            onKeyDown={(e) => e.key==="Enter" ? commitRename() : e.key==="Escape" && setRenamingId(null)} />
                        ) : (
                          <div className="file-name-text" onDoubleClick={() => startRename(f)}
                            title="Double-click to rename">{getName(f)}</div>
                        )}
                        <div className="file-meta">{timeAgo(getDate(f))}</div>
                      </div>
                      <button className="star-btn" onClick={() => toggleStar(f.id)} title={starred.includes(f.id)?"Unstar":"Star"}>
                        {starred.includes(f.id) ? "★" : "☆"}
                      </button>
                    </div>
                  </td>
                  <td style={{fontFamily:"var(--mono)",fontSize:12,color:"var(--text3)"}}>{formatBytes(getSize(f))}</td>
                  <td style={{fontFamily:"var(--mono)",fontSize:12,color:"var(--text3)"}}>{getDate(f) ? new Date(getDate(f)).toLocaleDateString() : "—"}</td>
                  <td><span className="badge badge-gray">{getType(f)}</span></td>
                  <td>
                    <div style={{display:"flex",gap:2}}>
                      <button className="action-btn" title="View details" onClick={() => setDetailFile(f)}>ℹ️</button>
                      <button className="action-btn" title="Download" disabled={downloadingId===f.id}
                        onClick={() => handleDownload(f.id, getName(f))}>
                        {downloadingId===f.id ? <span className="spinner sm"/> : "⬇️"}
                      </button>
                      <button className="action-btn" title="Copy share link" onClick={() => handleCopyLink(f.id)}>
                        {copiedId===f.id ? <span style={{color:"var(--success)"}}>✓</span> : "🔗"}
                      </button>
                      <button className="action-btn" title="Rename" onClick={() => startRename(f)}>✏️</button>
                      <button className="action-btn danger" title="Move to trash"
                        onClick={() => handleTrash(f.id, getName(f))}>🗑️</button>
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
            {displayFiles.map((f) => (
              <div key={f.id} className={`file-card ${selected.has(f.id)?"selected":""}`}>
                <div className="file-card-check">
                  <input type="checkbox" className="checkbox" checked={selected.has(f.id)} onChange={() => toggleSelect(f.id)} />
                </div>
                <button className="star-btn file-card-star" onClick={() => toggleStar(f.id)}>
                  {starred.includes(f.id) ? "★" : "☆"}
                </button>
                <div className="file-card-icon" onClick={() => setDetailFile(f)} style={{cursor:"pointer"}}>{fileIcon(getName(f))}</div>
                <div className="file-card-name" title={getName(f)}>
                  {renamingId===f.id ? (
                    <input ref={renameInputRef} className="file-name-input" value={renameVal} style={{width:"100%",fontSize:11}}
                      onChange={(e) => setRenameVal(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => e.key==="Enter" ? commitRename() : e.key==="Escape" && setRenamingId(null)} />
                  ) : getName(f)}
                </div>
                <div className="file-card-meta">{formatBytes(getSize(f))} · {timeAgo(getDate(f))}</div>
                <div className="file-card-actions">
                  <button className="action-btn" title="Details" onClick={() => setDetailFile(f)}>ℹ️</button>
                  <button className="action-btn" disabled={downloadingId===f.id} onClick={() => handleDownload(f.id, getName(f))}>
                    {downloadingId===f.id ? <span className="spinner sm"/> : "⬇️"}
                  </button>
                  <button className="action-btn" onClick={() => handleCopyLink(f.id)}>
                    {copiedId===f.id ? <span style={{color:"var(--success)"}}>✓</span> : "🔗"}
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

  // ── MAIN RENDER ────────────────────────────────────────────────────────────
  return (
    <>
      <style>{css}</style>
      <Toasts toasts={toasts} />
      <DetailPanel />

      <div className="shell">
        {/* Sidebar */}
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
              { icon: "☁️", label: "Files", badge: files.length },
              { icon: "⭐", label: "Starred", badge: starred.length },
              { icon: "🕐", label: "Recent" },
            ].map(({ icon, label, badge }) => (
              <div key={label} className={`nav-item ${navItem===label?"active":""}`} onClick={() => { setNavItem(label); setTypeFilter("all"); setSearch(""); setSelected(new Set()); }}>
                <span className="nav-icon">{icon}</span>
                <span>{label}</span>
                {badge > 0 && <span className="nav-badge">{badge}</span>}
              </div>
            ))}

            <div className="nav-section-label">Manage</div>
            {[
              { icon: "🗑️", label: "Trash", badge: trashed.length },
              { icon: "⚙️", label: "Settings" },
            ].map(({ icon, label, badge }) => (
              <div key={label} className={`nav-item ${navItem===label?"active":""}`} onClick={() => { setNavItem(label); setSelected(new Set()); }}>
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
            <div className="storage-bar"><div className="storage-fill" style={{width:`${storagePercent}%`}} /></div>
            <div className="storage-info">{formatBytes(storage.storageUsed)} / {formatBytes(storage.storageLimit)}</div>
          </div>

          <div className="sidebar-user">
            <div className="user-avatar">{(user?.name||"U")[0].toUpperCase()}</div>
            <div style={{flex:1,minWidth:0}}>
              <div className="user-name">{user?.name || "User"}</div>
              <div className="user-email">{user?.email}</div>
            </div>
            <button className="signout-btn" title="Sign out" onClick={handleSignOut}>⏻</button>
          </div>
        </aside>

        {/* Main */}
        <div className="main" style={{marginRight: detailFile ? 300 : 0, transition:"margin 0.2s"}}>
          {/* Topbar */}
          <div className="topbar">
            <div className="topbar-title">{navItem}</div>
            {navItem==="Recent" && <span className="topbar-crumb">/ Last 20 files</span>}
            <div className="topbar-spacer" />
            <div className="search-wrap">
              <span className="search-icon-pos">🔍</span>
              <input className="search-input" placeholder="Search files…" value={search}
                onChange={(e) => setSearch(e.target.value)} />
            </div>
            <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()} style={{gap:6}}>
              ☁️ Upload
            </button>
          </div>

          {/* Content */}
          <div className="content">
            {(navItem==="Files"||navItem==="Starred"||navItem==="Recent") && <FilesPage />}
            {navItem==="Trash" && <TrashPage />}
            {navItem==="Settings" && <SettingsPage />}
          </div>
        </div>
      </div>
    </>
  );
}