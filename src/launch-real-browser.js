import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { browserLaunchWindowArgs, normalizeBrowserVisibility } from "./browser-window.js";
import { config } from "./config.js";

const chromeCdpUrl = config.chromeCdpUrl || `http://127.0.0.1:${config.realBrowserDebugPort}`;

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
    const response = await fetch(`${chromeCdpUrl}/json/version`);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForCdp(timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await cdpIsReady()) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

const existingBrowserReady = await cdpIsReady();
if (!existingBrowserReady) {
  const browserPath = candidateBrowserPaths().find((candidate) => existsSync(candidate));
  if (!browserPath) {
    console.error("Could not find Google Chrome or Microsoft Edge.");
    console.error("Install Chrome or Edge, then run this again.");
    process.exit(1);
  }

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

  const args = [
    `--remote-debugging-port=${config.realBrowserDebugPort}`,
    `--user-data-dir=${config.realBrowserProfileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    ...lowResourceArgs,
    ...browserLaunchWindowArgs(),
    "--new-window",
    config.geminiUrl
  ];

  const child = spawn(browserPath, args, {
    detached: true,
    stdio: "ignore"
  });

  child.unref();
  console.log(`Opened real browser: ${browserPath}`);
  console.log(`Profile: ${config.realBrowserProfileDir}`);
  console.log(`Visibility: ${normalizeBrowserVisibility()}`);
} else {
  console.log(`Real browser debug port is already available: ${chromeCdpUrl}`);
}

if (await waitForCdp()) {
  console.log(`Bridge can attach at: ${chromeCdpUrl}`);
  console.log("Sign in to Gemini in the browser window if needed.");
} else {
  console.error(`Browser opened, but ${chromeCdpUrl} did not become ready in time.`);
  process.exit(1);
}
