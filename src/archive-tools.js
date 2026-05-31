import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { config } from "./config.js";

const ARCHIVE_FOLDER_RE = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}_.+/;
const ARCHIVE_PREFIX_RE = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}_/;

function clampLimit(value, fallback = 25, max = 500) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function preview(value, length = 220) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= length) return text;
  return `${text.slice(0, length - 3)}...`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isInside(parent, child) {
  const root = path.resolve(parent);
  const target = path.resolve(child);
  return target === root || target.startsWith(root + path.sep);
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return undefined;
  }
}

async function readTextIfExists(filePath, maxChars = 2000) {
  try {
    const text = await readFile(filePath, "utf8");
    return text.length > maxChars ? `${text.slice(0, maxChars)}...` : text;
  } catch {
    return "";
  }
}

function countMediaDownloads(records = []) {
  const saved = records.filter((record) => record?.saved).length;
  const failed = records.filter((record) => record && record.saved === false).length;
  return { total: records.length, saved, failed };
}

export function guidePath() {
  return path.join(config.rootDir, "MCP_GUIDE.md");
}

export function archiveIndexPath() {
  return path.join(config.stuffDir, "index.html");
}

export async function readBridgeGuide() {
  return readFile(guidePath(), "utf8");
}

export function pathAsFileUrl(filePath) {
  return pathToFileURL(filePath).href;
}

export async function summarizeArchive(folderPath) {
  const resolvedFolder = path.resolve(folderPath);
  if (!isInside(config.stuffDir, resolvedFolder)) {
    throw new Error("Archive path must stay inside STUFF_DIR.");
  }

  const folderName = path.basename(resolvedFolder);
  const result = await readJsonIfExists(path.join(resolvedFolder, "result.json"));
  const mediaDownloads = await readJsonIfExists(path.join(resolvedFolder, "media-downloads.json"));
  const prompt = await readTextIfExists(path.join(resolvedFolder, "prompt.txt"));
  const response = await readTextIfExists(path.join(resolvedFolder, "response.md"));
  const stats = await stat(resolvedFolder);
  const screenshotPath = path.join(resolvedFolder, "page.png");

  return {
    folderName,
    folder: resolvedFolder,
    createdAt: result?.createdAt || stats.birthtime.toISOString(),
    modifiedAt: stats.mtime.toISOString(),
    ok: result?.ok !== false && !folderName.includes("_error_"),
    tool: result?.tool || result?.archive?.tool || folderName.replace(ARCHIVE_PREFIX_RE, ""),
    pageUrl: result?.pageUrl || result?.archive?.pageUrl || "",
    promptPreview: preview(result?.prompt || prompt),
    responsePreview: preview(result?.response || response || result?.error),
    files: {
      prompt: path.join(resolvedFolder, "prompt.txt"),
      response: path.join(resolvedFolder, "response.md"),
      result: path.join(resolvedFolder, "result.json"),
      screenshot: existsSync(screenshotPath) ? screenshotPath : ""
    },
    media: countMediaDownloads(Array.isArray(mediaDownloads) ? mediaDownloads : [])
  };
}

export async function listArchives({ limit = 25, includeErrors = true } = {}) {
  await mkdir(config.stuffDir, { recursive: true });
  const entries = await readdir(config.stuffDir, { withFileTypes: true });
  const folders = entries
    .filter((entry) => entry.isDirectory() && ARCHIVE_FOLDER_RE.test(entry.name))
    .map((entry) => path.join(config.stuffDir, entry.name));

  const summaries = [];
  for (const folder of folders) {
    try {
      const summary = await summarizeArchive(folder);
      if (includeErrors || summary.ok) summaries.push(summary);
    } catch {
      // Ignore malformed archive folders and keep the gallery useful.
    }
  }

  return summaries
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, clampLimit(limit));
}

export async function latestArchive() {
  const [latest] = await listArchives({ limit: 1, includeErrors: true });
  return latest || null;
}

export async function updateArchiveIndex({ limit = config.archiveIndexLimit } = {}) {
  await mkdir(config.stuffDir, { recursive: true });
  const archives = await listArchives({ limit, includeErrors: true });
  const generatedAt = new Date().toLocaleString();

  const rows = archives.map((archive) => {
    const folderHref = encodeURIComponent(archive.folderName) + "/";
    const screenshot = archive.files.screenshot
      ? `<a href="${folderHref}page.png"><img src="${folderHref}page.png" alt=""></a>`
      : `<div class="empty">No screenshot</div>`;
    const statusClass = archive.ok ? "ok" : "error";
    const statusText = archive.ok ? "saved" : "error";

    return `
      <article class="run">
        <div class="thumb">${screenshot}</div>
        <div class="body">
          <div class="meta">
            <span class="status ${statusClass}">${statusText}</span>
            <span>${escapeHtml(archive.tool || "gemini")}</span>
            <span>${escapeHtml(new Date(archive.createdAt).toLocaleString())}</span>
          </div>
          <h2>${escapeHtml(archive.folderName)}</h2>
          <p class="prompt">${escapeHtml(archive.promptPreview || "No prompt text saved.")}</p>
          <p class="response">${escapeHtml(archive.responsePreview || "No response text saved yet.")}</p>
          <div class="links">
            <a href="${folderHref}prompt.txt">prompt</a>
            <a href="${folderHref}response.md">response</a>
            <a href="${folderHref}result.json">result</a>
            <a href="${folderHref}media-downloads.json">media</a>
            <a href="${folderHref}">folder</a>
          </div>
          <div class="media">media saved ${archive.media.saved}/${archive.media.total}</div>
        </div>
      </article>`;
  }).join("\n");

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Gemini UI Bridge Stuff</title>
  <style>
    :root { color-scheme: light dark; font-family: Inter, Segoe UI, Arial, sans-serif; }
    body { margin: 0; background: #f4f6f8; color: #16181d; }
    header { padding: 28px clamp(18px, 4vw, 44px); background: #ffffff; border-bottom: 1px solid #d9dee7; }
    h1 { margin: 0; font-size: clamp(26px, 4vw, 42px); letter-spacing: 0; }
    header p { margin: 8px 0 0; color: #5b6574; max-width: 780px; line-height: 1.5; }
    main { display: grid; gap: 16px; padding: 18px clamp(14px, 4vw, 44px) 44px; }
    .run { display: grid; grid-template-columns: minmax(190px, 320px) 1fr; gap: 16px; background: #fff; border: 1px solid #d9dee7; border-radius: 8px; overflow: hidden; }
    .thumb { min-height: 180px; background: #e9edf3; display: grid; place-items: center; }
    .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .empty { color: #6d7684; font-size: 14px; }
    .body { padding: 16px; min-width: 0; }
    .meta, .links { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .meta { color: #647085; font-size: 13px; }
    .status { color: #fff; border-radius: 999px; padding: 3px 9px; font-size: 12px; font-weight: 700; }
    .status.ok { background: #19715c; }
    .status.error { background: #a23b3b; }
    h2 { margin: 10px 0; font-size: 18px; letter-spacing: 0; overflow-wrap: anywhere; }
    p { line-height: 1.5; overflow-wrap: anywhere; }
    .prompt { color: #252b34; }
    .response { color: #4c5564; }
    .links a { color: #1358b8; text-decoration: none; font-weight: 650; }
    .links a:hover { text-decoration: underline; }
    .media { margin-top: 10px; color: #647085; font-size: 13px; }
    @media (prefers-color-scheme: dark) {
      body { background: #111418; color: #f2f4f7; }
      header, .run { background: #181c22; border-color: #2a3039; }
      header p, .meta, .response, .media, .empty { color: #aab3c1; }
      .prompt { color: #e7ebf1; }
      .thumb { background: #222832; }
      .links a { color: #8db7ff; }
    }
    @media (max-width: 760px) {
      .run { grid-template-columns: 1fr; }
      .thumb { aspect-ratio: 16 / 9; min-height: auto; }
    }
  </style>
</head>
<body>
  <header>
    <h1>Gemini UI Bridge Stuff</h1>
    <p>Generated ${escapeHtml(generatedAt)}. Every saved Gemini run gets its own dated folder with prompt, response, screenshot, JSON metadata, and downloaded media when Gemini exposes it.</p>
  </header>
  <main>
    ${rows || "<p>No archived Gemini runs yet.</p>"}
  </main>
</body>
</html>`;

  const indexPath = archiveIndexPath();
  await writeFile(indexPath, html, "utf8");
  return {
    ok: true,
    indexPath,
    indexUrl: pathAsFileUrl(indexPath),
    count: archives.length
  };
}

export async function openLocalTarget(target = "gallery") {
  await updateArchiveIndex();
  let targetPath = archiveIndexPath();

  if (target === "latest") {
    const latest = await latestArchive();
    if (!latest) throw new Error("No archived Gemini runs exist yet.");
    targetPath = latest.folder;
  } else if (target && target !== "gallery") {
    const resolved = path.resolve(config.stuffDir, target);
    if (!isInside(config.stuffDir, resolved)) {
      throw new Error("Target must stay inside STUFF_DIR.");
    }
    targetPath = resolved;
  }

  if (process.platform === "win32") {
    spawn("cmd.exe", ["/c", "start", "", targetPath], { detached: true, stdio: "ignore" }).unref();
  } else {
    const opener = process.platform === "darwin" ? "open" : "xdg-open";
    spawn(opener, [targetPath], { detached: true, stdio: "ignore" }).unref();
  }

  return {
    ok: true,
    opened: target,
    path: targetPath,
    url: pathAsFileUrl(targetPath)
  };
}

export async function cleanupArchives({ olderThanDays, keepLatest = 100, dryRun = true } = {}) {
  const archives = await listArchives({ limit: 500, includeErrors: true });
  const keepCount = Math.max(0, Number.parseInt(String(keepLatest ?? 100), 10) || 0);
  const cutoffMs = Number.isFinite(Number(olderThanDays))
    ? Date.now() - Number(olderThanDays) * 24 * 60 * 60 * 1000
    : null;
  const root = path.resolve(config.stuffDir);

  const candidates = archives.filter((archive, index) => {
    if (index < keepCount) return false;
    if (cutoffMs == null) return true;
    return new Date(archive.createdAt).getTime() < cutoffMs;
  });

  const deleted = [];
  for (const archive of candidates) {
    const resolved = path.resolve(archive.folder);
    if (!ARCHIVE_FOLDER_RE.test(path.basename(resolved)) || !isInside(root, resolved)) {
      continue;
    }
    if (!dryRun) {
      await rm(resolved, { recursive: true, force: true });
    }
    deleted.push({
      folder: resolved,
      createdAt: archive.createdAt,
      tool: archive.tool
    });
  }

  if (!dryRun) await updateArchiveIndex();

  return {
    ok: true,
    dryRun: !!dryRun,
    stuffDir: config.stuffDir,
    keptLatest: keepCount,
    olderThanDays: cutoffMs == null ? null : Number(olderThanDays),
    matched: deleted.length,
    deleted
  };
}

export function folderPathFromFileUrl(uri) {
  return fileURLToPath(uri);
}
