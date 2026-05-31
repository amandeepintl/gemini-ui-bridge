import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function boolFromEnv(value, fallback = false) {
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function intFromEnv(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resolveFromRoot(value, fallback) {
  const raw = value || fallback;
  return path.isAbsolute(raw) ? raw : path.resolve(rootDir, raw);
}

const browserVisibility = String(
  process.env.GEMINI_BROWSER_VISIBILITY ||
  (boolFromEnv(process.env.GEMINI_HIDE_BROWSER, false) ? "offscreen" : "visible")
).toLowerCase();

export const config = {
  rootDir,
  host: process.env.HOST || "127.0.0.1",
  port: intFromEnv(process.env.PORT, 8787),
  bridgeToken: process.env.BRIDGE_TOKEN || "",
  geminiUrl: process.env.GEMINI_URL || "https://gemini.google.com/app",
  profileDir: resolveFromRoot(process.env.GEMINI_PROFILE_DIR, "./profiles/gemini"),
  realBrowserProfileDir: resolveFromRoot(process.env.REAL_BROWSER_PROFILE_DIR, "./profiles/real-browser"),
  realBrowserDebugPort: intFromEnv(process.env.REAL_BROWSER_DEBUG_PORT, 9222),
  chromeCdpUrl: process.env.CHROME_CDP_URL || "",
  autoLaunchRealBrowser: boolFromEnv(process.env.AUTO_LAUNCH_REAL_BROWSER, true),
  headless: boolFromEnv(process.env.HEADLESS, false),
  stuffDir: resolveFromRoot(process.env.STUFF_DIR, "./stuff"),
  saveStuff: boolFromEnv(process.env.SAVE_STUFF, true),
  savePageScreenshot: boolFromEnv(process.env.SAVE_PAGE_SCREENSHOT, true),
  saveMediaArtifacts: boolFromEnv(process.env.SAVE_MEDIA_ARTIFACTS, true),
  maxArtifactBytes: intFromEnv(process.env.MAX_ARTIFACT_BYTES, 100 * 1024 * 1024),
  minImageArtifactSize: intFromEnv(process.env.MIN_IMAGE_ARTIFACT_SIZE, 180),
  lowResourceMode: boolFromEnv(process.env.LOW_RESOURCE_MODE, true),
  browserWindowWidth: intFromEnv(process.env.BROWSER_WINDOW_WIDTH, 1100),
  browserWindowHeight: intFromEnv(process.env.BROWSER_WINDOW_HEIGHT, 740),
  browserVisibility,
  browserBringToFront: boolFromEnv(process.env.GEMINI_BRING_TO_FRONT, browserVisibility === "visible"),
  browserVisibleX: intFromEnv(process.env.GEMINI_BROWSER_VISIBLE_X, 80),
  browserVisibleY: intFromEnv(process.env.GEMINI_BROWSER_VISIBLE_Y, 80),
  browserHiddenX: intFromEnv(process.env.GEMINI_BROWSER_HIDDEN_X, -32000),
  browserHiddenY: intFromEnv(process.env.GEMINI_BROWSER_HIDDEN_Y, -32000),
  useTemporaryChats: boolFromEnv(process.env.GEMINI_USE_TEMPORARY_CHATS, true),
  freshChatEachPrompt: boolFromEnv(process.env.GEMINI_FRESH_CHAT_EACH_PROMPT, true),
  autoDeleteCreatedChats: boolFromEnv(process.env.GEMINI_AUTO_DELETE_CREATED_CHATS, true),
  reuseBlankHome: boolFromEnv(process.env.GEMINI_REUSE_BLANK_HOME, true),
  captureMediaRefsForText: boolFromEnv(process.env.GEMINI_CAPTURE_MEDIA_REFS_FOR_TEXT, false),
  returnPromptInResponse: boolFromEnv(process.env.GEMINI_RETURN_PROMPT_IN_RESPONSE, false),
  minSecondsBetweenPrompts: intFromEnv(process.env.GEMINI_MIN_SECONDS_BETWEEN_PROMPTS, 8),
  defaultTimeoutMs: intFromEnv(process.env.GEMINI_DEFAULT_TIMEOUT_MS, 180000),
  defaultRetries: intFromEnv(process.env.GEMINI_DEFAULT_RETRIES, 0),
  retryDelayMs: intFromEnv(process.env.GEMINI_RETRY_DELAY_MS, 2500),
  responsePollMs: intFromEnv(process.env.GEMINI_RESPONSE_POLL_MS, 1500),
  mediaPollMs: intFromEnv(process.env.GEMINI_MEDIA_POLL_MS, 3500),
  stableResponseMs: intFromEnv(process.env.GEMINI_STABLE_RESPONSE_MS, 2200),
  maxMediaRefs: intFromEnv(process.env.GEMINI_MAX_MEDIA_REFS, 12),
  idleCloseBrowserMinutes: intFromEnv(process.env.GEMINI_IDLE_CLOSE_BROWSER_MINUTES, 0),
  archiveIndexLimit: intFromEnv(process.env.ARCHIVE_INDEX_LIMIT, 200)
};
