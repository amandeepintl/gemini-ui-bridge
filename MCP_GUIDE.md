# Gemini UI Bridge MCP Guide

Read this once before using the Gemini tools.

## What this bridge is

This is a local browser-control bridge for the Gemini website. It does not use the paid Gemini API. It drives the user's signed-in Chrome/Edge Gemini session, pastes prompts, waits for visible responses, and saves outputs into the local `stuff/` folder.

Use it like a careful human using a browser, not like a high-volume API.

## First tool to call

Call `gemini_read_guide` before calling any generation tool in a new MCP session. After reading it once, continue normally.

If Gemini is not logged in or the browser is not open, call `gemini_open` and ask the user to finish login in the opened browser window.

## Tool choice

- Use `gemini_prompt` for normal text chat.
- Use `gemini_prompt` with `tool` set to `create_image`, `create_video`, `canvas`, `create_music`, or `guided_learning` when you need one dynamic mode selector.
- Use `gemini_create_image` for images.
- Use `gemini_create_video` for videos.
- Use `gemini_create_music` for music.
- Use `gemini_canvas` for Canvas tasks.
- Use `gemini_guided_learning` for learning/tutoring.
- Use `gemini_upload_file` when the user gives a local file path.
- Use `gemini_open_tool` only when you need to open a Gemini picker manually, such as Drive, Photos, Avatar, Import code, or Notebooks.

Supported `gemini_open_tool` values are:

```text
chat
upload_files
add_from_drive
photos
avatar
import_code
notebooks
create_image
create_video
canvas
create_music
guided_learning
```

## Output folders

Every successful run is archived under:

```text
stuff\YYYY-MM-DD_HH-mm-ss-SSS_tool-name\
```

Each archive folder can contain:

- `prompt.txt`
- `response.md`
- `result.json`
- `media-refs.json`
- `media-downloads.json`
- `page.png`
- `media/` with downloaded images, videos, audio, or files when Gemini exposes accessible URLs/blobs

Failed runs are saved as:

```text
stuff\YYYY-MM-DD_HH-mm-ss-SSS_error_tool-name\
```

Use these archive tools:

- `gemini_list_archives` to inspect recent folders.
- `gemini_latest_archive` to get the newest saved folder.
- `gemini_open_stuff` with `target: "gallery"` to open `stuff/index.html`.
- `gemini_open_stuff` with `target: "latest"` to open the newest run folder.
- `gemini_cleanup_archives` to preview or remove old folders. Keep `dryRun: true` unless the user explicitly wants deletion.

## Quality and resource usage

Do not shorten the user's prompt or ask Gemini for shorter output unless the user asks for that. Hardware/resource optimization is handled by the bridge launch mode and polling settings, not by reducing Gemini quality.

The bridge is configured to use fresh temporary chats and auto-delete bridge-created chats by default. This keeps Gemini history cleaner. If cleanup fails, the run is still archived and the result will mention cleanup status.

Retries are optional. Use `retries: 1` only for UI hiccups or timeouts. Avoid retrying media generation repeatedly because it can waste the user's Gemini plan allowance.

The bridge browser may be hidden offscreen. Use `gemini_browser_visibility` with `visibility: "visible"` only when the user needs to sign in, inspect Gemini, or manually download something. Switch it back to `visibility: "offscreen"` after inspection so it does not interrupt normal computer use.

## How to make it better without spending money

The best free improvement is to reduce wasted Gemini calls while keeping prompt quality high:

- First ask the local AI to refine/check the prompt before sending it to Gemini.
- For image, video, and music, generate one strong final prompt, then send that final prompt to Gemini.
- Avoid repeated retries for media generations. Retry UI failures, not creative disappointments.
- Reuse archive folders and the gallery to compare outputs instead of regenerating from memory.
- Use `gemini_open_tool` for tools that require manual choice, then let the user choose in the browser.
- Keep prompts explicit about format, aspect ratio, style, duration, lyrics/no lyrics, camera movement, and negative constraints when relevant.
- Keep Gemini at full quality. Do not ask for short responses just to save hardware.

## Safe operating rules

- Do not ask for Google passwords, cookies, tokens, or credentials.
- Do not try to bypass captchas, login checks, rate limits, regional limits, or plan limits.
- Use slower, deliberate calls. Do not batch-spam prompts.
- If a media download is not available in `media/`, tell the user the generated item may need manual download from the open Gemini browser.
- Prefer absolute Windows file paths for uploads.

## Recommended flow

1. Call `gemini_read_guide`.
2. Call `gemini_open` if the user may need to sign in or inspect the browser.
3. Call the best generation tool.
4. Read the returned `archive.folder`.
5. If needed, call `gemini_latest_archive` or `gemini_open_stuff`.
6. Use `gemini_cleanup_chat` only as a fallback when a conversation remains open.
