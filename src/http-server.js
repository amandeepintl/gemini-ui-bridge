import http from "node:http";
import {
  archiveIndexPath,
  cleanupArchives,
  latestArchive,
  listArchives,
  openLocalTarget,
  readBridgeGuide,
  updateArchiveIndex
} from "./archive-tools.js";
import { config } from "./config.js";
import {
  cleanupGeminiChat,
  closeGemini,
  GEMINI_TOOL_PATHS,
  openGemini,
  openGeminiTool,
  promptGemini,
  setGeminiBrowserVisibility,
  uploadFileToGemini
} from "./gemini-ui.js";

const MAX_BODY_BYTES = 1024 * 1024;

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("Request body is too large");
    chunks.push(chunk);
  }

  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function isAuthorized(req) {
  if (!config.bridgeToken) return true;
  const header = req.headers.authorization || "";
  return header === `Bearer ${config.bridgeToken}`;
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || `${config.host}:${config.port}`}`);

  if (url.pathname === "/health") {
    return sendJson(res, 200, {
      ok: true,
      mode: "gemini-web-ui",
      auth: config.bridgeToken ? "token-required" : "open-localhost",
      tools: Object.keys(GEMINI_TOOL_PATHS),
      lowResourceMode: config.lowResourceMode,
      temporaryChats: config.useTemporaryChats,
      autoDeleteCreatedChats: config.autoDeleteCreatedChats,
      responsePollMs: config.responsePollMs,
      mediaPollMs: config.mediaPollMs,
      captureMediaRefsForText: config.captureMediaRefsForText,
      saveStuff: config.saveStuff,
      stuffDir: config.stuffDir,
      gallery: archiveIndexPath(),
      archiveIndexLimit: config.archiveIndexLimit,
      defaultRetries: config.defaultRetries,
      browserVisibility: config.browserVisibility,
      browserBringToFront: config.browserBringToFront
    });
  }

  if (!isAuthorized(req)) {
    return sendJson(res, 401, { ok: false, error: "Unauthorized" });
  }

  if (req.method === "POST" && url.pathname === "/v1/open") {
    const body = await readJson(req);
    return sendJson(res, 200, await openGemini(body));
  }

  if (req.method === "POST" && url.pathname === "/v1/browser/visibility") {
    const body = await readJson(req);
    return sendJson(res, 200, await setGeminiBrowserVisibility(body));
  }

  if (req.method === "POST" && url.pathname === "/v1/prompt") {
    const body = await readJson(req);
    return sendJson(res, 200, await promptGemini(body));
  }

  if (req.method === "POST" && url.pathname === "/v1/tool") {
    const body = await readJson(req);
    return sendJson(res, 200, await openGeminiTool(body));
  }

  if (req.method === "POST" && url.pathname === "/v1/upload") {
    const body = await readJson(req);
    return sendJson(res, 200, await uploadFileToGemini(body));
  }

  if (req.method === "POST" && url.pathname === "/v1/cleanup") {
    return sendJson(res, 200, await cleanupGeminiChat());
  }

  if (req.method === "POST" && url.pathname === "/v1/close") {
    return sendJson(res, 200, await closeGemini());
  }

  if (req.method === "GET" && url.pathname === "/v1/guide") {
    const guide = await readBridgeGuide();
    res.writeHead(200, {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Length": Buffer.byteLength(guide)
    });
    return res.end(guide);
  }

  if (req.method === "GET" && url.pathname === "/v1/archives") {
    return sendJson(res, 200, {
      ok: true,
      stuffDir: config.stuffDir,
      archives: await listArchives({
        limit: Number.parseInt(url.searchParams.get("limit") || "25", 10),
        includeErrors: url.searchParams.get("includeErrors") !== "false"
      })
    });
  }

  if (req.method === "GET" && url.pathname === "/v1/archives/latest") {
    await updateArchiveIndex();
    return sendJson(res, 200, {
      ok: true,
      stuffDir: config.stuffDir,
      gallery: archiveIndexPath(),
      latest: await latestArchive()
    });
  }

  if (req.method === "POST" && url.pathname === "/v1/archives/open") {
    const body = await readJson(req);
    return sendJson(res, 200, await openLocalTarget(body.folderName || body.target || "gallery"));
  }

  if (req.method === "POST" && url.pathname === "/v1/archives/cleanup") {
    const body = await readJson(req);
    return sendJson(res, 200, await cleanupArchives({
      ...body,
      dryRun: body.dryRun !== false
    }));
  }

  return sendJson(res, 404, {
    ok: false,
    error: "Not found",
    routes: [
      "GET /health",
      "POST /v1/open",
      "POST /v1/browser/visibility",
      "POST /v1/prompt",
      "POST /v1/tool",
      "POST /v1/upload",
      "POST /v1/cleanup",
      "POST /v1/close",
      "GET /v1/guide",
      "GET /v1/archives",
      "GET /v1/archives/latest",
      "POST /v1/archives/open",
      "POST /v1/archives/cleanup"
    ]
  });
}

const server = http.createServer((req, res) => {
  route(req, res).catch((error) => {
    sendJson(res, 500, {
      ok: false,
      error: error.message,
      archive: error.archive,
      hint: "If Gemini is asking for login/consent, run npm run open and finish it in the browser."
    });
  });
});

server.listen(config.port, config.host, () => {
  console.log(`Gemini UI bridge listening on http://${config.host}:${config.port}`);
  console.log("Run POST /v1/open first if you need to sign in to Gemini.");
});
