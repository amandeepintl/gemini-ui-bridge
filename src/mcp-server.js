import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  archiveIndexPath,
  cleanupArchives,
  guidePath,
  latestArchive,
  listArchives,
  openLocalTarget,
  pathAsFileUrl,
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

const server = new McpServer({
  name: "gemini-ui-bridge",
  version: "0.1.0"
});

const READ_GUIDE_FIRST = "First call gemini_read_guide once in a new MCP session so you understand the bridge, archives, cleanup, and limits.";

function jsonContent(payload) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }]
  };
}

async function jsonTool(callback) {
  try {
    return jsonContent(await callback());
  } catch (error) {
    return jsonContent({
      ok: false,
      error: error.message,
      archive: error.archive,
      hint: "If Gemini is asking for login/consent, call gemini_open and finish it in the browser."
    });
  }
}

server.registerResource(
  "gemini-ui-bridge-guide",
  pathAsFileUrl(guidePath()),
  {
    title: "Gemini UI Bridge MCP Guide",
    description: "Operational guide for using the Gemini UI bridge tools safely and reading saved outputs.",
    mimeType: "text/markdown"
  },
  async (uri) => ({
    contents: [{
      uri: uri.href,
      mimeType: "text/markdown",
      text: await readBridgeGuide()
    }]
  })
);

server.tool(
  "gemini_read_guide",
  "Read this before any other Gemini tool. Returns the bridge guide with tool choice, archive folders, cleanup behavior, and safe operating rules.",
  {},
  async () => jsonTool(async () => ({
    ok: true,
    guidePath: guidePath(),
    guide: await readBridgeGuide()
  }))
);

server.tool(
  "gemini_status",
  `${READ_GUIDE_FIRST} Show bridge configuration, supported Gemini modes, archive paths, and gallery path without prompting Gemini.`,
  {},
  async () => jsonTool(async () => ({
    ok: true,
    mode: "gemini-web-ui",
    guidePath: guidePath(),
    guideResource: pathAsFileUrl(guidePath()),
    stuffDir: config.stuffDir,
    gallery: archiveIndexPath(),
    supportedTools: Object.keys(GEMINI_TOOL_PATHS),
    defaults: {
      lowResourceMode: config.lowResourceMode,
      temporaryChats: config.useTemporaryChats,
      freshChatEachPrompt: config.freshChatEachPrompt,
      autoDeleteCreatedChats: config.autoDeleteCreatedChats,
      defaultRetries: config.defaultRetries,
      responsePollMs: config.responsePollMs,
      mediaPollMs: config.mediaPollMs,
      saveStuff: config.saveStuff,
      saveMediaArtifacts: config.saveMediaArtifacts,
      browserVisibility: config.browserVisibility,
      browserBringToFront: config.browserBringToFront
    }
  }))
);

server.tool(
  "gemini_open",
  `${READ_GUIDE_FIRST} Open the local Gemini browser window so the user can sign in or inspect the session.`,
  {
    visibility: z.enum(["visible", "offscreen", "minimized"]).optional()
  },
  async (input) => jsonTool(() => openGemini(input))
);

server.tool(
  "gemini_browser_visibility",
  `${READ_GUIDE_FIRST} Show, hide offscreen, or minimize the Gemini bridge browser so it does not interrupt normal computer use.`,
  {
    visibility: z.enum(["visible", "offscreen", "minimized"])
  },
  async (input) => jsonTool(() => setGeminiBrowserVisibility(input))
);

server.tool(
  "gemini_prompt",
  `${READ_GUIDE_FIRST} Send a prompt to Gemini. Supports modes: chat, create_image, create_video, canvas, create_music, guided_learning. Saves each run under stuff/ and returns archive.folder.`,
  {
    prompt: z.string().min(1),
    tool: z.enum(Object.keys(GEMINI_TOOL_PATHS)).optional(),
    timeoutMs: z.number().int().positive().optional(),
    retries: z.number().int().min(0).max(3).optional()
  },
  async (input) => jsonTool(() => promptGemini(input))
);

function promptTool(name, description, tool) {
  server.tool(
    name,
    `${READ_GUIDE_FIRST} ${description}`,
    {
      prompt: z.string().min(1),
      timeoutMs: z.number().int().positive().optional(),
      retries: z.number().int().min(0).max(3).optional()
    },
    async (input) => jsonTool(() => promptGemini({ ...input, tool }))
  );
}

promptTool("gemini_create_image", "Open Gemini's Create image tool, send the prompt, archive the run under stuff/, and return response text plus visible media references.", "create_image");
promptTool("gemini_create_video", "Open Gemini's Create video tool, send the prompt, archive the run under stuff/, and return response text plus visible media references.", "create_video");
promptTool("gemini_create_music", "Open Gemini's Create music tool from More tools, send the prompt, archive the run under stuff/, and return response text plus visible media references.", "create_music");
promptTool("gemini_canvas", "Open Gemini Canvas, send the prompt, archive the run under stuff/, and return the extracted response.", "canvas");
promptTool("gemini_guided_learning", "Open Gemini Guided Learning, send the prompt, archive the run under stuff/, and return the extracted response.", "guided_learning");

server.tool(
  "gemini_upload_file",
  `${READ_GUIDE_FIRST} Upload a local file to Gemini through the browser UI. Optionally send a prompt after upload. Archives the upload/run under stuff/.`,
  {
    filePath: z.string().min(1),
    prompt: z.string().optional(),
    timeoutMs: z.number().int().positive().optional(),
    retries: z.number().int().min(0).max(3).optional()
  },
  async (input) => jsonTool(() => uploadFileToGemini(input))
);

server.tool(
  "gemini_open_tool",
  `${READ_GUIDE_FIRST} Open any Gemini tool/picker in the browser UI. Some picker-based tools like Drive, Photos, Avatar, Import code, and Notebooks may require manual selection in the browser.`,
  {
    tool: z.enum(Object.keys(GEMINI_TOOL_PATHS))
  },
  async (input) => jsonTool(() => openGeminiTool(input))
);

server.tool(
  "gemini_cleanup_chat",
  `${READ_GUIDE_FIRST} Delete the currently active Gemini conversation when Gemini exposes a delete action. Mostly a fallback because bridge prompts use temporary/fresh chats by default.`,
  {},
  async () => jsonTool(() => cleanupGeminiChat())
);

server.tool(
  "gemini_list_archives",
  `${READ_GUIDE_FIRST} List recent saved Gemini runs from the stuff/ folder, including prompt/response previews, screenshot path, and media download counts.`,
  {
    limit: z.number().int().positive().max(500).optional(),
    includeErrors: z.boolean().optional()
  },
  async (input) => jsonTool(async () => ({
    ok: true,
    stuffDir: config.stuffDir,
    archives: await listArchives(input)
  }))
);

server.tool(
  "gemini_latest_archive",
  `${READ_GUIDE_FIRST} Return the newest saved Gemini archive folder and regenerate the gallery index.`,
  {},
  async () => jsonTool(async () => {
    await updateArchiveIndex();
    return {
      ok: true,
      stuffDir: config.stuffDir,
      gallery: archiveIndexPath(),
      latest: await latestArchive()
    };
  })
);

server.tool(
  "gemini_open_stuff",
  `${READ_GUIDE_FIRST} Open the saved-output gallery or newest archive folder on this PC. Use target='gallery' or target='latest'.`,
  {
    target: z.enum(["gallery", "latest"]).optional(),
    folderName: z.string().optional()
  },
  async (input) => jsonTool(() => openLocalTarget(input.folderName || input.target || "gallery"))
);

server.tool(
  "gemini_cleanup_archives",
  `${READ_GUIDE_FIRST} Preview or delete old saved-output folders inside stuff/. Defaults to dryRun=true for safety.`,
  {
    olderThanDays: z.number().positive().optional(),
    keepLatest: z.number().int().min(0).max(500).optional(),
    dryRun: z.boolean().optional()
  },
  async (input) => jsonTool(() => cleanupArchives({
    ...input,
    dryRun: input.dryRun !== false
  }))
);

server.tool(
  "gemini_close",
  `${READ_GUIDE_FIRST} Close the local Gemini browser automation session.`,
  {},
  async () => jsonTool(() => closeGemini())
);

const transport = new StdioServerTransport();
await server.connect(transport);
