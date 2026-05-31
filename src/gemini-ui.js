import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { updateArchiveIndex } from "./archive-tools.js";
import {
  applyWindowVisibilityToPage,
  browserLaunchWindowArgs,
  normalizeBrowserVisibility,
  shouldBringBrowserToFront
} from "./browser-window.js";
import { config } from "./config.js";

const PROMPT_SELECTORS = [
  'textarea[aria-label*="prompt" i]',
  'textarea[aria-label*="message" i]',
  'div[contenteditable="true"][aria-label*="prompt" i]',
  'div[contenteditable="true"][aria-label*="message" i]',
  'div[role="textbox"][contenteditable="true"]',
  'rich-textarea div[contenteditable="true"]',
  'textarea',
  '[contenteditable="true"]'
];

const SEND_SELECTORS = [
  'button[aria-label="Send message"]',
  'button[aria-label*="send message" i]',
  'button[data-test-id*="send" i]',
  'button[aria-label*="submit" i]',
  'button:has-text("Send")'
];

const RESPONSE_SELECTORS = [
  "model-response message-content",
  "structured-content-container.model-response-text message-content",
  "message-content",
  "structured-content-container.model-response-text",
  "model-response",
  '[data-test-id*="response" i]',
  '[data-response-index]',
  ".model-response-text"
];

export const GEMINI_TOOL_PATHS = {
  chat: [],
  upload_files: ["Upload files"],
  add_from_drive: ["Add from Drive"],
  photos: ["More uploads", "Photos"],
  avatar: ["More uploads", "Avatar"],
  import_code: ["More uploads", "Import code"],
  notebooks: ["More uploads", "Notebooks"],
  create_image: ["Create image"],
  create_video: ["Create video"],
  canvas: ["Canvas"],
  create_music: ["More tools", "Create music"],
  guided_learning: ["More tools", "Guided Learning"]
};

const MEDIA_TOOLS = new Set(["create_image", "create_video", "create_music"]);

let browserContext;
let cdpBrowser;
let page;
let attachedToRealBrowser = false;
let queue = Promise.resolve();
let lastPromptAt = 0;
let idleCloseTimer;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clearIdleCloseTimer() {
  if (idleCloseTimer) {
    clearTimeout(idleCloseTimer);
    idleCloseTimer = undefined;
  }
}

function candidateBrowserPaths() {
  const programFiles = process.env.ProgramFiles;
  const programFilesX86 = process.env["ProgramFiles(x86)"];
  const localAppData = process.env.LOCALAPPDATA;

  return [
    programFiles && path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
    programFilesX86 && path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
    localAppData && path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
    programFiles && path.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
    programFilesX86 && path.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
    localAppData && path.join(localAppData, "Microsoft", "Edge", "Application", "msedge.exe")
  ].filter(Boolean);
}

async function cdpIsReady() {
  try {
    const baseUrl = (config.chromeCdpUrl || `http://127.0.0.1:${config.realBrowserDebugPort}`).replace(/\/$/, "");
    const response = await fetch(`${baseUrl}/json/version`);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForCdp(timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await cdpIsReady()) return true;
    await sleep(500);
  }
  return false;
}

async function launchRealBrowserIfNeeded() {
  if (await cdpIsReady()) return true;

  const browserPath = candidateBrowserPaths().find((candidate) => existsSync(candidate));
  if (!browserPath) return false;

  mkdirSync(config.realBrowserProfileDir, { recursive: true });

  const lowResourceArgs = config.lowResourceMode ? [
    "--disable-extensions",
    "--disable-default-apps",
    "--disable-sync",
    "--disable-notifications",
    "--disable-background-networking",
    "--disable-component-update",
    "--process-per-site",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding"
  ] : [];

  const child = spawn(browserPath, [
    `--remote-debugging-port=${config.realBrowserDebugPort}`,
    `--user-data-dir=${config.realBrowserProfileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    ...lowResourceArgs,
    ...browserLaunchWindowArgs(),
    "--new-window",
    config.geminiUrl
  ], {
    detached: true,
    stdio: "ignore"
  });

  child.unref();
  return waitForCdp();
}

function scheduleIdleClose() {
  clearIdleCloseTimer();
  if (!config.idleCloseBrowserMinutes || config.idleCloseBrowserMinutes <= 0) return;

  idleCloseTimer = setTimeout(async () => {
    try {
      if (cdpBrowser && cdpBrowser.isConnected()) {
        await cdpBrowser.close();
      }
    } catch {
      // Best-effort idle cleanup.
    } finally {
      cdpBrowser = undefined;
      browserContext = undefined;
      page = undefined;
      attachedToRealBrowser = false;
      idleCloseTimer = undefined;
    }
  }, config.idleCloseBrowserMinutes * 60 * 1000);
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function timestampForFolder(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("-") + "_" + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
    String(date.getMilliseconds()).padStart(3, "0")
  ].join("-");
}

function safeName(value, fallback = "gemini") {
  const cleaned = String(value || fallback)
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return cleaned || fallback;
}

function retryCount(value) {
  const parsed = Number.parseInt(String(value ?? config.defaultRetries), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(parsed, 3);
}

async function setCurrentBrowserVisibility(visibility = config.browserVisibility) {
  if (!page || page.isClosed()) {
    return { ok: false, reason: "No open Gemini page." };
  }
  return applyWindowVisibilityToPage(page, visibility);
}

async function prepareForInteraction() {
  const mode = normalizeBrowserVisibility();
  if (shouldBringBrowserToFront(mode)) {
    await page.bringToFront().catch(() => undefined);
  } else {
    await setCurrentBrowserVisibility(mode).catch(() => undefined);
  }
}

function extensionFromContentType(contentType = "", url = "") {
  const normalized = contentType.split(";")[0].trim().toLowerCase();
  const fromType = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/webm": "webm",
    "application/pdf": "pdf",
    "text/plain": "txt",
    "application/json": "json"
  }[normalized];
  if (fromType) return fromType;

  try {
    const parsed = new URL(url);
    const ext = path.extname(parsed.pathname).replace(".", "").toLowerCase();
    if (ext && ext.length <= 8) return ext;
  } catch {
    // Ignore non-URL values.
  }
  return "bin";
}

function uniqueTexts(texts) {
  const seen = new Set();
  const out = [];
  for (const raw of texts) {
    const text = normalizeText(raw);
    if (!text || text.length < 2 || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

async function firstVisibleLocator(selectors, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    for (const selector of selectors) {
      try {
        const locator = page.locator(selector).last();
        if ((await locator.count()) > 0 && (await locator.isVisible({ timeout: 500 }))) {
          return locator;
        }
      } catch (error) {
        lastError = error;
      }
    }
    await sleep(500);
  }

  const suffix = lastError ? ` Last selector error: ${lastError.message}` : "";
  throw new Error(`Could not find Gemini prompt box. If the browser is open, finish login and try again.${suffix}`);
}

function resolveBridgePath(filePath) {
  if (!filePath || typeof filePath !== "string") return "";
  return path.isAbsolute(filePath) ? filePath : path.resolve(config.rootDir, filePath);
}

async function clickVisibleText(label, timeoutMs = 7000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const exact = page.getByText(label, { exact: true }).last();
      if ((await exact.count()) > 0 && (await exact.isVisible({ timeout: 500 }))) {
        await exact.hover({ timeout: 1000 }).catch(() => undefined);
        await exact.click({ timeout: 1500, force: true });
        return true;
      }
    } catch (error) {
      lastError = error;
    }

    try {
      const clicked = await page.evaluate((text) => {
        function visible(el) {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
        }

        const root = document.querySelector(".cdk-overlay-container") || document;
        const elements = Array.from(root.querySelectorAll("button, a, [role='menuitem'], gem-menu-item, .gem-menu-item-label"))
          .filter(visible)
          .filter((el) => (el.innerText || el.textContent || "").trim() === text);

        const target = elements.at(-1);
        if (!target) return false;
        const clickable = target.closest("button, a, [role='menuitem'], gem-menu-item") || target;
        clickable.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true, view: window }));
        clickable.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
        clickable.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
        clickable.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
        return true;
      }, label);
      if (clicked) return true;
    } catch (error) {
      lastError = error;
    }

    await sleep(300);
  }

  const suffix = lastError ? ` Last error: ${lastError.message}` : "";
  throw new Error(`Could not click Gemini menu item "${label}".${suffix}`);
}

async function hasVisibleText(label) {
  return page.evaluate((text) => {
    function visible(el) {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    }

    const overlay = document.querySelector(".cdk-overlay-container");
    if (overlay && (overlay.innerText || overlay.textContent || "").includes(text)) return true;

    return Array.from(document.querySelectorAll("button, a, [role='menuitem'], gem-menu-item, .gem-menu-item-label"))
      .some((el) => visible(el) && (el.innerText || el.textContent || "").trim() === text);
  }, label).catch(() => false);
}

async function dismissInterruptions() {
  await page.keyboard.press("Escape").catch(() => undefined);
  for (const label of ["Dismiss", "Not now", "Maybe later", "Cancel"]) {
    try {
      const button = page.getByText(label, { exact: true }).last();
      if ((await button.count()) > 0 && (await button.isVisible({ timeout: 300 }))) {
        await button.click({ timeout: 1000, force: true });
        await page.waitForTimeout(300);
      }
    } catch {
      // Ignore optional popups.
    }
  }
}

async function startFreshBridgeChat({ temporary = config.useTemporaryChats } = {}) {
  await ensureBrowser();
  await prepareForInteraction();
  await dismissInterruptions();

  const canReuseCurrentPage = config.reuseBlankHome && await page.evaluate(() => {
    const box = document.querySelector('[role="textbox"][contenteditable="true"]') ||
      document.querySelector('rich-textarea div[contenteditable="true"]') ||
      document.querySelector('textarea');
    const boxText = box ? (box.innerText || box.textContent || box.value || "").trim() : "";
    return /^https:\/\/gemini\.google\.com\/app\/?$/.test(location.href) &&
      !boxText &&
      !document.querySelector("model-response, message-content");
  }).catch(() => false);

  if (!canReuseCurrentPage) {
    await page.goto(config.geminiUrl, { waitUntil: "domcontentloaded" });
    await dismissInterruptions();
  }

  await firstVisibleLocator(PROMPT_SELECTORS, 30000);

  if (temporary) {
    try {
      const temporaryButton = page.locator('button[aria-label="Temporary chat"]').last();
      if ((await temporaryButton.count()) > 0 && (await temporaryButton.isVisible({ timeout: 1000 }))) {
        await temporaryButton.click({ timeout: 1500, force: true });
        await page.waitForTimeout(500);
      }
    } catch {
      // If temporary mode is unavailable, the bridge still starts a fresh chat and deletes it later.
    }
  }

  await dismissInterruptions();
}

async function openToolsMenu() {
  await ensureBrowser();
  await firstVisibleLocator(PROMPT_SELECTORS, 30000);
  await dismissInterruptions();

  if (await hasVisibleText("Create image")) {
    return;
  }

  let buttonBox = null;
  const deadline = Date.now() + 10000;
  while (!buttonBox && Date.now() < deadline) {
    buttonBox = await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll("button"))
        .find((node) => /upload and tools/i.test(node.getAttribute("aria-label") || ""));
      if (!button) return null;
      const rect = button.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    if (!buttonBox) await sleep(300);
  }

  if (buttonBox) {
    await page.mouse.click(buttonBox.x + buttonBox.width / 2, buttonBox.y + buttonBox.height / 2);
    await page.waitForTimeout(1000);
  }

  if ((await hasVisibleText("Create image")) || (await hasVisibleText("Upload files"))) {
    return;
  }

  const clicked = await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll("button"))
      .find((node) => /upload and tools/i.test(node.getAttribute("aria-label") || ""));
    if (!button) return false;
    button.click();
    return true;
  });
  if (clicked) {
    await page.waitForTimeout(1000);
  }

  if ((await hasVisibleText("Create image")) || (await hasVisibleText("Upload files"))) {
    return;
  }

  throw new Error("Could not open Gemini's Upload and tools menu.");
}

async function selectGeminiTool(toolOrPath) {
  const toolPath = Array.isArray(toolOrPath) ? toolOrPath : GEMINI_TOOL_PATHS[toolOrPath];
  if (!toolPath) {
    throw new Error(`Unknown Gemini tool "${toolOrPath}".`);
  }
  if (toolPath.length === 0) return { selectedTool: "chat", toolPath };

  await openToolsMenu();
  for (const label of toolPath) {
    await clickVisibleText(label);
    await page.waitForTimeout(600);
  }

  return { selectedTool: Array.isArray(toolOrPath) ? toolPath.join(" > ") : toolOrPath, toolPath };
}

async function deleteActiveConversation() {
  await ensureBrowser();
  await dismissInterruptions();

  const activeResponseCount = (await page.locator("model-response, message-content").count().catch(() => 0));
  const hasConversationUrl = /\/app\/[^/?#]+/.test(page.url());
  if (!activeResponseCount && !hasConversationUrl) {
    return { deleted: false, reason: "no active bridge conversation to delete" };
  }

  const menu = page.locator('button[aria-label="Open menu for conversation actions."]').last();
  if ((await menu.count()) === 0 || !(await menu.isVisible({ timeout: 1000 }).catch(() => false))) {
    return { deleted: false, reason: "conversation menu not visible, likely temporary/no-history chat" };
  }

  await menu.click({ timeout: 1500, force: true });
  await page.waitForTimeout(500);
  await clickVisibleText("Delete", 5000);
  await page.waitForTimeout(700);

  const confirmSelectors = [
    'button:has-text("Delete")',
    '[role="button"]:has-text("Delete")',
    'button[aria-label*="delete" i]'
  ];
  for (const selector of confirmSelectors) {
    const button = page.locator(selector).last();
    if ((await button.count()) > 0 && (await button.isVisible({ timeout: 500 }).catch(() => false))) {
      await button.click({ timeout: 1500, force: true });
      await page.waitForTimeout(1500);
      return { deleted: true };
    }
  }

  return { deleted: false, reason: "delete confirmation button not found" };
}

async function ensureBrowser() {
  clearIdleCloseTimer();
  if (browserContext && page && !page.isClosed()) return page;

  if (config.chromeCdpUrl) {
    try {
      cdpBrowser = await chromium.connectOverCDP(config.chromeCdpUrl);
    } catch (error) {
      if (config.autoLaunchRealBrowser && await launchRealBrowserIfNeeded()) {
        cdpBrowser = await chromium.connectOverCDP(config.chromeCdpUrl);
      } else {
        throw new Error(
          `Could not connect to real Chrome/Edge at ${config.chromeCdpUrl}. ` +
          `Run LAUNCH_REAL_BROWSER_FOR_GEMINI.bat first, sign in there, then try again. ` +
          `Original error: ${error.message}`
        );
      }
    }

    browserContext = cdpBrowser.contexts()[0];
    if (!browserContext) {
      throw new Error("Connected to Chrome/Edge, but could not find a browser context.");
    }
    attachedToRealBrowser = true;
  } else {
    browserContext = await chromium.launchPersistentContext(config.profileDir, {
      headless: config.headless,
      viewport: { width: config.browserWindowWidth, height: config.browserWindowHeight },
      acceptDownloads: true
    });
    attachedToRealBrowser = false;
  }

  page = browserContext.pages()[0] || (await browserContext.newPage());
  page.setDefaultTimeout(15000);
  await page.goto(config.geminiUrl, { waitUntil: "domcontentloaded" });
  await setCurrentBrowserVisibility().catch(() => undefined);
  return page;
}

export async function openGemini({ visibility = config.browserVisibility } = {}) {
  const openedPage = await ensureBrowser();
  const window = await applyWindowVisibilityToPage(openedPage, visibility).catch((error) => ({
    ok: false,
    error: error.message
  }));
  scheduleIdleClose();
  return {
    ok: true,
    url: openedPage.url(),
    profileDir: attachedToRealBrowser ? config.realBrowserProfileDir : config.profileDir,
    mode: attachedToRealBrowser ? "real-browser-cdp" : "playwright-browser",
    visibility: normalizeBrowserVisibility(visibility),
    window,
    note: "If Gemini asks you to sign in, complete it in the opened browser window."
  };
}

export async function setGeminiBrowserVisibility({ visibility = config.browserVisibility } = {}) {
  return enqueue(async () => {
    await ensureBrowser();
    const window = await setCurrentBrowserVisibility(visibility);
    return {
      ok: true,
      visibility: normalizeBrowserVisibility(visibility),
      pageUrl: page.url(),
      window
    };
  });
}

export async function closeGemini() {
  clearIdleCloseTimer();
  if (browserContext && !attachedToRealBrowser) {
    await browserContext.close();
  }
  if (cdpBrowser && !attachedToRealBrowser) {
    await cdpBrowser.close();
  }
  cdpBrowser = undefined;
  browserContext = undefined;
  page = undefined;
  attachedToRealBrowser = false;
  return { ok: true };
}

async function getCandidateTexts() {
  await ensureBrowser();
  return page.evaluate(({ selectors }) => {
    function visible(el) {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    }

    function clean(text) {
      return String(text || "").replace(/\s+\n/g, "\n").trim();
    }

    for (const selector of selectors) {
      const nodes = Array.from(document.querySelectorAll(selector)).slice(-8).filter(visible);
      const texts = nodes.map((node) => clean(node.innerText || node.textContent)).filter(Boolean);
      if (texts.length) return texts;
    }

    return [];
  }, { selectors: RESPONSE_SELECTORS });
}

async function getMediaRefs() {
  await ensureBrowser();
  return page.evaluate(({ maxMediaRefs }) => {
    const images = Array.from(document.querySelectorAll("img"))
      .map((img) => ({
        src: img.currentSrc || img.src || "",
        alt: img.alt || "",
        width: img.naturalWidth || img.width || 0,
        height: img.naturalHeight || img.height || 0
      }))
      .filter((item) => item.src && !item.src.startsWith("data:image/svg"))
      .slice(-maxMediaRefs);

    const videos = Array.from(document.querySelectorAll("video"))
      .map((video) => ({
        src: video.currentSrc || video.src || "",
        width: video.videoWidth || video.clientWidth || 0,
        height: video.videoHeight || video.clientHeight || 0
      }))
      .filter((item) => item.src)
      .slice(-maxMediaRefs);

    const audio = Array.from(document.querySelectorAll("audio"))
      .map((node) => ({ src: node.currentSrc || node.src || "" }))
      .filter((item) => item.src)
      .slice(-maxMediaRefs);

    const downloads = Array.from(document.querySelectorAll("a[download], a[href^='blob:']"))
      .map((node) => ({
        href: node.href || "",
        download: node.getAttribute("download") || "",
        text: (node.innerText || node.textContent || "").trim()
      }))
      .filter((item) => item.href)
      .slice(-maxMediaRefs);

    return { images, videos, audio, downloads };
  }, { maxMediaRefs: config.maxMediaRefs });
}

function mediaCount(media) {
  return (media?.images?.length || 0) +
    (media?.videos?.length || 0) +
    (media?.audio?.length || 0) +
    (media?.downloads?.length || 0);
}

function emptyMediaRefs() {
  return { images: [], videos: [], audio: [], downloads: [] };
}

function promptEcho(prompt) {
  return config.returnPromptInResponse
    ? { prompt }
    : { promptLength: prompt.length };
}

function mediaItemsForArchive(media) {
  const items = [];
  for (const item of media?.images || []) {
    if ((item.width || 0) < config.minImageArtifactSize && (item.height || 0) < config.minImageArtifactSize) continue;
    items.push({ kind: "image", url: item.src, meta: item });
  }
  for (const item of media?.videos || []) {
    items.push({ kind: "video", url: item.src, meta: item });
  }
  for (const item of media?.audio || []) {
    items.push({ kind: "audio", url: item.src, meta: item });
  }
  for (const item of media?.downloads || []) {
    items.push({ kind: "download", url: item.href, meta: item });
  }
  return items.filter((item) => item.url).slice(0, config.maxMediaRefs);
}

function bufferFromDataUrl(dataUrl) {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/i.exec(dataUrl);
  if (!match) throw new Error("Invalid data URL");
  const isBase64 = !!match[2];
  const body = match[3] || "";
  const bytes = isBase64 ? Buffer.from(body, "base64") : Buffer.from(decodeURIComponent(body), "utf8");
  return { buffer: bytes, contentType: match[1] || "application/octet-stream" };
}

async function fetchAssetViaPage(url) {
  const dataUrl = await page.evaluate(async ({ assetUrl, maxBytes }) => {
    const response = await fetch(assetUrl);
    const blob = await response.blob();
    if (blob.size > maxBytes) {
      throw new Error(`Asset is larger than MAX_ARTIFACT_BYTES (${blob.size} bytes)`);
    }
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Could not read asset blob"));
      reader.readAsDataURL(blob);
    });
  }, { assetUrl: url, maxBytes: config.maxArtifactBytes });

  return bufferFromDataUrl(dataUrl);
}

async function fetchAsset(url) {
  if (url.startsWith("data:")) {
    const asset = bufferFromDataUrl(url);
    if (asset.buffer.length > config.maxArtifactBytes) {
      throw new Error(`Asset is larger than MAX_ARTIFACT_BYTES (${asset.buffer.length} bytes)`);
    }
    return asset;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > config.maxArtifactBytes) {
      throw new Error(`Asset is larger than MAX_ARTIFACT_BYTES (${contentLength} bytes)`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length > config.maxArtifactBytes) {
      throw new Error(`Asset is larger than MAX_ARTIFACT_BYTES (${buffer.length} bytes)`);
    }
    return {
      buffer,
      contentType: response.headers.get("content-type") || "application/octet-stream"
    };
  } catch {
    return fetchAssetViaPage(url);
  }
}

async function saveMediaArtifacts(media, runDir) {
  if (!config.saveMediaArtifacts) return [];

  const mediaDir = path.join(runDir, "media");
  await mkdir(mediaDir, { recursive: true });
  const saved = [];
  const items = mediaItemsForArchive(media);

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const record = {
      kind: item.kind,
      url: item.url,
      meta: item.meta,
      saved: false
    };

    try {
      const asset = await fetchAsset(item.url);
      const ext = extensionFromContentType(asset.contentType, item.url);
      const fileName = `${String(index + 1).padStart(2, "0")}-${item.kind}.${ext}`;
      const filePath = path.join(mediaDir, fileName);
      await writeFile(filePath, asset.buffer);
      record.saved = true;
      record.file = filePath;
      record.bytes = asset.buffer.length;
      record.contentType = asset.contentType;
    } catch (error) {
      record.error = error.message;
    }

    saved.push(record);
  }

  await writeFile(path.join(runDir, "media-downloads.json"), JSON.stringify(saved, null, 2), "utf8");
  return saved;
}

async function archiveGeminiRun({
  tool,
  toolPath = [],
  prompt = "",
  response = "",
  media = emptyMediaRefs(),
  pageUrl = "",
  temporaryChat = false,
  uploaded = ""
} = {}) {
  if (!config.saveStuff) return { saved: false, reason: "SAVE_STUFF=false" };

  const runName = `${timestampForFolder()}_${safeName(tool || "gemini")}`;
  const runDir = path.join(config.stuffDir, runName);
  await mkdir(runDir, { recursive: true });

  await writeFile(path.join(runDir, "prompt.txt"), prompt || "", "utf8");
  await writeFile(path.join(runDir, "response.md"), response || "", "utf8");
  await writeFile(path.join(runDir, "media-refs.json"), JSON.stringify(media || emptyMediaRefs(), null, 2), "utf8");

  const archive = {
    ok: true,
    saved: true,
    folder: runDir,
    createdAt: new Date().toISOString(),
    tool,
    toolPath,
    pageUrl,
    temporaryChat,
    uploaded
  };

  if (config.savePageScreenshot) {
    try {
      const screenshotPath = path.join(runDir, "page.png");
      await page.screenshot({ path: screenshotPath, fullPage: false });
      archive.screenshot = screenshotPath;
    } catch (error) {
      archive.screenshotError = error.message;
    }
  }

  archive.mediaDownloads = await saveMediaArtifacts(media, runDir);
  await writeFile(path.join(runDir, "result.json"), JSON.stringify({
    ...archive,
    prompt,
    response
  }, null, 2), "utf8");

  await updateArchiveIndex().catch(() => undefined);
  return archive;
}

async function archiveGeminiError({
  tool = "gemini",
  toolPath = [],
  prompt = "",
  error,
  attempt = 1,
  pageUrl = ""
} = {}) {
  if (!config.saveStuff) return { saved: false, reason: "SAVE_STUFF=false" };

  const runName = `${timestampForFolder()}_error_${safeName(tool || "gemini")}`;
  const runDir = path.join(config.stuffDir, runName);
  await mkdir(runDir, { recursive: true });

  const errorText = [
    `Message: ${error?.message || String(error)}`,
    error?.stack ? `\nStack:\n${error.stack}` : ""
  ].filter(Boolean).join("\n");

  await writeFile(path.join(runDir, "prompt.txt"), prompt || "", "utf8");
  await writeFile(path.join(runDir, "response.md"), "", "utf8");
  await writeFile(path.join(runDir, "error.txt"), errorText, "utf8");
  await writeFile(path.join(runDir, "media-refs.json"), JSON.stringify(emptyMediaRefs(), null, 2), "utf8");

  const archive = {
    ok: false,
    saved: true,
    folder: runDir,
    createdAt: new Date().toISOString(),
    tool,
    toolPath,
    pageUrl,
    attempt,
    error: error?.message || String(error)
  };

  if (config.savePageScreenshot && page && !page.isClosed()) {
    try {
      const screenshotPath = path.join(runDir, "page.png");
      await page.screenshot({ path: screenshotPath, fullPage: false });
      archive.screenshot = screenshotPath;
    } catch (screenshotError) {
      archive.screenshotError = screenshotError.message;
    }
  }

  await writeFile(path.join(runDir, "result.json"), JSON.stringify({
    ...archive,
    prompt,
    response: "",
    errorStack: error?.stack || ""
  }, null, 2), "utf8");

  await updateArchiveIndex().catch(() => undefined);
  return archive;
}

async function pastePrompt(prompt, timeoutMs) {
  await ensureBrowser();
  const promptBox = await firstVisibleLocator(PROMPT_SELECTORS, timeoutMs);
  const promptMarker = normalizeText(prompt).slice(0, 40);

  async function promptWasSent() {
    const remaining = normalizeText(await page.evaluate(() => {
      const box = document.querySelector('[role="textbox"][contenteditable="true"]') ||
        document.querySelector('rich-textarea div[contenteditable="true"]') ||
        document.querySelector('textarea');
      return box ? (box.innerText || box.textContent || box.value || "") : "";
    }).catch(() => ""));
    return !remaining || !remaining.includes(promptMarker);
  }

  await promptBox.click({ timeout: 5000 });
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.insertText(prompt);
  await page.waitForTimeout(500);

  await page.waitForFunction(() => {
    const button = document.querySelector('button[aria-label="Send message"]');
    return button && !button.disabled && button.getAttribute("aria-disabled") !== "true";
  }, null, { timeout: Math.min(timeoutMs, 10000) });

  for (const selector of SEND_SELECTORS) {
    const button = page.locator(selector).last();
    if ((await button.count()) > 0) {
      try {
        if (await button.isVisible({ timeout: 500 })) {
          await button.click({ timeout: 1500, force: true });
          await page.waitForTimeout(800);
          if (await promptWasSent()) {
            return;
          }
        }
      } catch {
        // Try the next selector.
      }
    }
  }

  for (let i = 0; i < 3; i++) {
    const clicked = await page.evaluate(() => {
      const button = document.querySelector('button[aria-label="Send message"]');
      if (!button || button.disabled || button.getAttribute("aria-disabled") === "true") return false;
      button.click();
      return true;
    });
    if (clicked) {
      await page.waitForTimeout(800);
      if (await promptWasSent()) {
        return;
      }
    }
  }

  const dispatched = await page.evaluate(() => {
    const button = document.querySelector('button[aria-label="Send message"]');
    if (!button || button.disabled || button.getAttribute("aria-disabled") === "true") return false;
    button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
    button.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    return true;
  });
  if (dispatched) {
    await page.waitForTimeout(800);
    if (await promptWasSent()) {
      return;
    }
  }

  try {
    const sendButton = page.locator('button[aria-label="Send message"]').last();
    const box = await sendButton.boundingBox({ timeout: 1000 });
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(800);
      if (await promptWasSent()) {
        return;
      }
    }
  } catch {
    // Try keyboard fallback below.
  }

  await page.keyboard.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Enter");
  await page.waitForTimeout(800);
  if (await promptWasSent()) {
    return;
  }

  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
  if (!(await promptWasSent())) {
    throw new Error("Gemini prompt was pasted but the Send message button did not submit it.");
  }
}

async function waitForResponse(beforeTexts, timeoutMs, { watchMedia = false } = {}) {
  const beforeLast = normalizeText(beforeTexts.at(-1));
  const beforeMedia = watchMedia ? await getMediaRefs() : emptyMediaRefs();
  const beforeMediaCount = mediaCount(beforeMedia);
  const deadline = Date.now() + timeoutMs;
  let best = "";
  let stableSince = 0;
  let lastMediaPollAt = 0;
  let lastMedia = beforeMedia;

  while (Date.now() < deadline) {
    const texts = uniqueTexts(await getCandidateTexts());
    const newest = normalizeText(texts.at(-1));
    let media = lastMedia;
    if (watchMedia && Date.now() - lastMediaPollAt >= config.mediaPollMs) {
      media = await getMediaRefs();
      lastMedia = media;
      lastMediaPollAt = Date.now();
    }
    const hasNewMedia = mediaCount(media) > beforeMediaCount;

    if ((newest && newest !== beforeLast) || hasNewMedia) {
      const candidate = newest && newest !== beforeLast ? newest : best;
      if (newest === best) {
        if (!stableSince) stableSince = Date.now();
        if (Date.now() - stableSince > config.stableResponseMs) {
          return { text: candidate || "", allTexts: texts, media };
        }
      } else {
        best = candidate;
        stableSince = 0;
      }
    }

    await sleep(config.responsePollMs);
  }

  if (best) {
    return {
      text: best,
      allTexts: uniqueTexts(await getCandidateTexts()),
      media: watchMedia ? await getMediaRefs() : emptyMediaRefs()
    };
  }
  throw new Error("Timed out waiting for a Gemini response.");
}

async function respectCooldown() {
  const waitMs = Math.max(0, config.minSecondsBetweenPrompts * 1000 - (Date.now() - lastPromptAt));
  if (waitMs > 0) await sleep(waitMs);
  lastPromptAt = Date.now();
}

export function enqueue(task) {
  const run = queue.then(task, task).finally(scheduleIdleClose);
  queue = run.catch(() => undefined);
  return run;
}

export async function promptGemini({
  prompt,
  timeoutMs = config.defaultTimeoutMs,
  tool = "chat",
  temporary = config.useTemporaryChats,
  freshChat = config.freshChatEachPrompt,
  autoDelete = config.autoDeleteCreatedChats,
  retries = config.defaultRetries
} = {}) {
  if (!prompt || typeof prompt !== "string") {
    throw new Error("prompt is required");
  }

  const attempts = retryCount(retries) + 1;
  let currentSelection = { selectedTool: tool, toolPath: GEMINI_TOOL_PATHS[tool] || [] };

  return enqueue(async () => {
    let lastError;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        await respectCooldown();
        await ensureBrowser();
        await prepareForInteraction();

        let selected = { selectedTool: tool, toolPath: GEMINI_TOOL_PATHS[tool] || [] };
        let cleanup = { deleted: false, reason: "cleanup not requested" };

        if (freshChat) {
          await startFreshBridgeChat({ temporary });
        }

        if (tool && tool !== "chat") {
          selected = await selectGeminiTool(tool);
        }
        currentSelection = selected;

        const watchMedia = MEDIA_TOOLS.has(selected.selectedTool) || config.captureMediaRefsForText;
        const beforeTexts = uniqueTexts(await getCandidateTexts());
        await pastePrompt(prompt, timeoutMs);
        const response = await waitForResponse(beforeTexts, timeoutMs, { watchMedia });
        const media = response.media || (watchMedia ? await getMediaRefs() : emptyMediaRefs());
        const archive = await archiveGeminiRun({
          tool: selected.selectedTool,
          toolPath: selected.toolPath,
          prompt,
          response: response.text,
          media,
          pageUrl: page.url(),
          temporaryChat: temporary
        });

        if (autoDelete) {
          cleanup = await deleteActiveConversation();
        }

        return {
          ok: true,
          ...promptEcho(prompt),
          tool: selected.selectedTool,
          toolPath: selected.toolPath,
          response: response.text,
          media,
          pageUrl: page.url(),
          archive,
          cleanup,
          temporaryChat: temporary,
          attempt,
          retriesAllowed: attempts - 1
        };
      } catch (error) {
        lastError = error;
        const errorArchive = await archiveGeminiError({
          tool: currentSelection.selectedTool || tool,
          toolPath: currentSelection.toolPath || [],
          prompt,
          error,
          attempt,
          pageUrl: page && !page.isClosed() ? page.url() : ""
        }).catch(() => undefined);
        if (errorArchive) error.archive = errorArchive;
        if (autoDelete) {
          await deleteActiveConversation().catch(() => undefined);
        }
        if (attempt < attempts) {
          await sleep(config.retryDelayMs);
          continue;
        }
        throw error;
      }
    }

    throw lastError || new Error("Gemini prompt failed.");
  });
}

export async function openGeminiTool({ tool, freshChat = config.freshChatEachPrompt, temporary = config.useTemporaryChats } = {}) {
  if (!tool) throw new Error("tool is required");

  return enqueue(async () => {
    await ensureBrowser();
    await prepareForInteraction();
    if (freshChat) {
      await startFreshBridgeChat({ temporary });
    }
    const selected = await selectGeminiTool(tool);
    return {
      ok: true,
      tool: selected.selectedTool,
      toolPath: selected.toolPath,
      pageUrl: page.url(),
      note: "Tool opened in Gemini. Some picker-based tools require manual selection in the browser."
    };
  });
}

export async function uploadFileToGemini({
  filePath,
  prompt = "",
  timeoutMs = config.defaultTimeoutMs,
  temporary = config.useTemporaryChats,
  freshChat = config.freshChatEachPrompt,
  autoDelete = config.autoDeleteCreatedChats,
  retries = config.defaultRetries
} = {}) {
  const resolvedPath = resolveBridgePath(filePath);
  if (!resolvedPath || !existsSync(resolvedPath)) {
    throw new Error(`filePath does not exist: ${filePath}`);
  }

  const attempts = retryCount(retries) + 1;

  return enqueue(async () => {
    let lastError;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        await respectCooldown();
        await ensureBrowser();
        await prepareForInteraction();

        let cleanup = { deleted: false, reason: "cleanup not requested" };
        if (freshChat) {
          await startFreshBridgeChat({ temporary });
        }

        await openToolsMenu();
        const fileChooserPromise = page.waitForEvent("filechooser", { timeout: 15000 });
        await clickVisibleText("Upload files");
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles(resolvedPath);
        await page.waitForTimeout(2500);

        if (!prompt) {
          const note = "File was selected. Add a prompt with this tool if you want Gemini to process it automatically.";
          const archive = await archiveGeminiRun({
            tool: "upload_files",
            toolPath: GEMINI_TOOL_PATHS.upload_files,
            prompt: "",
            response: note,
            media: emptyMediaRefs(),
            pageUrl: page.url(),
            temporaryChat: temporary,
            uploaded: resolvedPath
          });

          if (autoDelete) {
            cleanup = await deleteActiveConversation();
          }

          return {
            ok: true,
            tool: "upload_files",
            uploaded: resolvedPath,
            pageUrl: page.url(),
            note,
            archive,
            cleanup,
            temporaryChat: temporary,
            attempt,
            retriesAllowed: attempts - 1
          };
        }

        const watchMedia = config.captureMediaRefsForText;
        const beforeTexts = uniqueTexts(await getCandidateTexts());
        await pastePrompt(prompt, timeoutMs);
        const response = await waitForResponse(beforeTexts, timeoutMs, { watchMedia });
        const media = response.media || (watchMedia ? await getMediaRefs() : emptyMediaRefs());
        const archive = await archiveGeminiRun({
          tool: "upload_files",
          toolPath: GEMINI_TOOL_PATHS.upload_files,
          prompt,
          response: response.text,
          media,
          pageUrl: page.url(),
          temporaryChat: temporary,
          uploaded: resolvedPath
        });

        if (autoDelete) {
          cleanup = await deleteActiveConversation();
        }

        return {
          ok: true,
          tool: "upload_files",
          uploaded: resolvedPath,
          ...promptEcho(prompt),
          response: response.text,
          media,
          pageUrl: page.url(),
          archive,
          cleanup,
          temporaryChat: temporary,
          attempt,
          retriesAllowed: attempts - 1
        };
      } catch (error) {
        lastError = error;
        const errorArchive = await archiveGeminiError({
          tool: "upload_files",
          toolPath: GEMINI_TOOL_PATHS.upload_files,
          prompt,
          error,
          attempt,
          pageUrl: page && !page.isClosed() ? page.url() : ""
        }).catch(() => undefined);
        if (errorArchive) error.archive = errorArchive;
        if (autoDelete) {
          await deleteActiveConversation().catch(() => undefined);
        }
        if (attempt < attempts) {
          await sleep(config.retryDelayMs);
          continue;
        }
        throw error;
      }
    }

    throw lastError || new Error("Gemini file upload failed.");
  });
}

export async function cleanupGeminiChat() {
  return enqueue(async () => {
    const cleanup = await deleteActiveConversation();
    return { ok: true, cleanup, pageUrl: page.url() };
  });
}
