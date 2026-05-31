import { config } from "./config.js";

export function normalizeBrowserVisibility(value = config.browserVisibility) {
  const mode = String(value || "visible").toLowerCase();
  if (["hide", "hidden", "offscreen", "background"].includes(mode)) return "offscreen";
  if (["minimize", "minimized"].includes(mode)) return "minimized";
  return "visible";
}

export function browserLaunchWindowArgs(visibility = config.browserVisibility) {
  const mode = normalizeBrowserVisibility(visibility);
  const sizeArg = `--window-size=${config.browserWindowWidth},${config.browserWindowHeight}`;

  if (mode === "offscreen") {
    return [
      sizeArg,
      `--window-position=${config.browserHiddenX},${config.browserHiddenY}`
    ];
  }

  if (mode === "minimized") {
    return [
      sizeArg,
      "--start-minimized"
    ];
  }

  return [
    sizeArg,
    `--window-position=${config.browserVisibleX},${config.browserVisibleY}`
  ];
}

export function shouldBringBrowserToFront(visibility = config.browserVisibility) {
  return normalizeBrowserVisibility(visibility) === "visible" && config.browserBringToFront;
}

function boundsForMode(visibility = config.browserVisibility) {
  const mode = normalizeBrowserVisibility(visibility);

  if (mode === "offscreen") {
    return {
      windowState: "normal",
      left: config.browserHiddenX,
      top: config.browserHiddenY,
      width: config.browserWindowWidth,
      height: config.browserWindowHeight
    };
  }

  if (mode === "minimized") {
    return {
      windowState: "minimized"
    };
  }

  return {
    windowState: "normal",
    left: config.browserVisibleX,
    top: config.browserVisibleY,
    width: config.browserWindowWidth,
    height: config.browserWindowHeight
  };
}

export async function applyWindowVisibilityToPage(page, visibility = config.browserVisibility) {
  if (!page || page.isClosed()) {
    return { ok: false, reason: "No open Gemini page." };
  }

  const mode = normalizeBrowserVisibility(visibility);
  const session = await page.context().newCDPSession(page);

  try {
    const { windowId } = await session.send("Browser.getWindowForTarget");
    await session.send("Browser.setWindowBounds", {
      windowId,
      bounds: boundsForMode(mode)
    });

    if (shouldBringBrowserToFront(mode)) {
      await page.bringToFront().catch(() => undefined);
    }

    const current = await session.send("Browser.getWindowBounds", { windowId }).catch(() => undefined);
    return {
      ok: true,
      visibility: mode,
      bringToFront: shouldBringBrowserToFront(mode),
      windowId,
      bounds: current?.bounds || boundsForMode(mode)
    };
  } finally {
    await session.detach().catch(() => undefined);
  }
}

function cdpBaseUrl() {
  return (config.chromeCdpUrl || `http://127.0.0.1:${config.realBrowserDebugPort}`).replace(/\/$/, "");
}

async function sendRawCdp(webSocketUrl, method, params = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(webSocketUrl);
    const id = 1;
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error(`Timed out waiting for CDP method ${method}.`));
    }, 10000);

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ id, method, params }));
    });

    ws.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id !== id) return;
      clearTimeout(timeout);
      ws.close();
      if (message.error) {
        reject(new Error(message.error.message || JSON.stringify(message.error)));
      } else {
        resolve(message.result || {});
      }
    });

    ws.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("Could not connect to Chrome DevTools websocket."));
    });
  });
}

export async function applyWindowVisibilityViaCdp(visibility = config.browserVisibility) {
  const response = await fetch(`${cdpBaseUrl()}/json/list`);
  if (!response.ok) {
    throw new Error(`Chrome DevTools is not ready at ${cdpBaseUrl()}.`);
  }

  const targets = await response.json();
  const target = targets.find((item) => item.type === "page" && /gemini\.google\.com/.test(item.url || "")) ||
    targets.find((item) => item.type === "page" && item.webSocketDebuggerUrl);

  if (!target?.webSocketDebuggerUrl) {
    throw new Error("Could not find a browser page target to move.");
  }

  const mode = normalizeBrowserVisibility(visibility);
  const { windowId } = await sendRawCdp(target.webSocketDebuggerUrl, "Browser.getWindowForTarget");
  await sendRawCdp(target.webSocketDebuggerUrl, "Browser.setWindowBounds", {
    windowId,
    bounds: boundsForMode(mode)
  });
  const current = await sendRawCdp(target.webSocketDebuggerUrl, "Browser.getWindowBounds", { windowId }).catch(() => undefined);

  return {
    ok: true,
    visibility: mode,
    windowId,
    bounds: current?.bounds || boundsForMode(mode),
    targetUrl: target.url || ""
  };
}
