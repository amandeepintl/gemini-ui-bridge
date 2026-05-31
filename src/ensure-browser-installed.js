import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const executablePath = chromium.executablePath();

if (existsSync(executablePath)) {
  console.log(`Playwright Chromium is ready: ${executablePath}`);
  process.exit(0);
}

console.log("Playwright Chromium is missing. Downloading it now...");

const child = spawn("npx", ["playwright", "install", "chromium"], {
  stdio: "inherit",
  shell: true
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
