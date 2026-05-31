import { chromium } from "playwright";
import { config } from "./config.js";

const chromeCdpUrl = config.chromeCdpUrl || `http://127.0.0.1:${config.realBrowserDebugPort}`;

try {
  const browser = await chromium.connectOverCDP(chromeCdpUrl);
  await browser.close();
  console.log("Closed the Gemini bridge browser.");
} catch (error) {
  console.log(`Gemini bridge browser was not running or could not be closed: ${error.message}`);
}
