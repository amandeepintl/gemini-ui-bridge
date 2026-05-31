# Gemini UI Bridge

i made this because api pricing is annoying and sometimes you already have a Gemini plan sitting there in the browser.

This is a local MCP/REST bridge that controls the real Gemini website through Chrome or Edge. You sign in yourself, then another AI app can ask this bridge to paste prompts into Gemini, wait for the answer, save the run, and hand the result back.

No Gemini API key. No paid API calls. Just your own local browser session.

## what it can do

- send normal prompts to Gemini
- open Gemini modes like Create image, Create video, Canvas, Create music, and Guided Learning
- upload a local file and ask Gemini about it
- save every run into a dated folder inside `stuff/`
- save screenshots, prompt text, response text, JSON metadata, and media when Gemini exposes downloadable links/blobs
- make a simple local gallery at `stuff/index.html`
- hide the Gemini browser offscreen so it does not keep jumping over your work
- expose everything as MCP tools for Claude Desktop and other MCP clients

## what it is not

This is not an official Google/Gemini API.

So be real with it:

- it can break if Gemini changes the website UI
- it is slower than an API
- login/captcha/security checks still need you
- some generated media may still need manual download from the browser
- do not use it to bypass login, captchas, rate limits, plan limits, or Google rules
- do not treat it like production infrastructure

For personal use, prompt testing, creative stuff, and making Claude talk to Gemini through your browser, it is useful. For a serious product backend, use a real API.

## quick start

```powershell
cd C:\path\to\gemini-ui-bridge
npm install
Copy-Item .env.example .env
```

Login first:

```powershell
npm run launch-browser
```

or double-click:

```text
OPEN_GEMINI_LOGIN.bat
```

Sign in to Gemini in the browser that opens. That browser uses its own local profile under `profiles/real-browser`.

## start it

Normal:

```powershell
npm start
```

Hidden/offscreen:

```text
START_BRIDGE_HIDDEN.bat
```

Lightest mode:

```text
START_BRIDGE_ULTRA_LOW.bat
```

If the browser is in your way:

```text
HIDE_GEMINI_BROWSER.bat
```

If you need to see it again:

```text
SHOW_GEMINI_BROWSER.bat
```

## MCP tools

Claude should call `gemini_read_guide` once first. That returns `MCP_GUIDE.md`, which explains how to use the bridge without wasting your Gemini plan.

Current tools:

```text
gemini_read_guide
gemini_status
gemini_open
gemini_browser_visibility
gemini_prompt
gemini_create_image
gemini_create_video
gemini_create_music
gemini_canvas
gemini_guided_learning
gemini_upload_file
gemini_open_tool
gemini_cleanup_chat
gemini_list_archives
gemini_latest_archive
gemini_open_stuff
gemini_cleanup_archives
gemini_close
```

Supported Gemini UI modes:

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

## Claude Desktop config

Example config:

```json
{
  "mcpServers": {
    "gemini-ui-bridge": {
      "command": "node",
      "args": [
        "--max-old-space-size=128",
        "C:\\Users\\YOUR_NAME\\Desktop\\gemini-ui-bridge\\src\\mcp-server.js"
      ],
      "env": {
        "REAL_BROWSER_DEBUG_PORT": "9222",
        "CHROME_CDP_URL": "http://127.0.0.1:9222",
        "LOW_RESOURCE_MODE": "true",
        "GEMINI_BROWSER_VISIBILITY": "offscreen",
        "GEMINI_BRING_TO_FRONT": "false",
        "GEMINI_CAPTURE_MEDIA_REFS_FOR_TEXT": "false",
        "GEMINI_RETURN_PROMPT_IN_RESPONSE": "true",
        "HEADLESS": "false"
      }
    }
  }
}
```

There is also a `mcp-config.example.json` file in this repo.

## REST examples

Open Gemini/login:

```powershell
curl -X POST http://127.0.0.1:8787/v1/open
```

Send a normal prompt:

```powershell
curl -X POST http://127.0.0.1:8787/v1/prompt `
  -H "Content-Type: application/json" `
  -d "{\"prompt\":\"Reply exactly: bridge is working\"}"
```

Use a Gemini mode:

```powershell
curl -X POST http://127.0.0.1:8787/v1/prompt `
  -H "Content-Type: application/json" `
  -d "{\"tool\":\"create_image\",\"prompt\":\"Create a clean app icon for a study app.\"}"
```

Open saved stuff:

```powershell
npm run open-stuff
```

## where outputs go

Every run gets a folder like:

```text
stuff/YYYY-MM-DD_HH-mm-ss-SSS_tool-name/
```

Inside you usually get:

```text
prompt.txt
response.md
result.json
media-refs.json
media-downloads.json
page.png
media/
```

Failed runs also get saved as `stuff/YYYY-MM-DD_HH-mm-ss-SSS_error_tool-name/` with `error.txt`, so you can see what happened.

The gallery is here:

```text
stuff/index.html
```

Double-click:

```text
OPEN_STUFF_GALLERY.bat
```

## settings i actually care about

The defaults are meant to save hardware, not reduce Gemini quality:

```text
LOW_RESOURCE_MODE=true
GEMINI_BROWSER_VISIBILITY=offscreen
GEMINI_BRING_TO_FRONT=false
GEMINI_CAPTURE_MEDIA_REFS_FOR_TEXT=false
GEMINI_DEFAULT_RETRIES=0
GEMINI_RESPONSE_POLL_MS=1500
GEMINI_MEDIA_POLL_MS=3500
GEMINI_AUTO_DELETE_CREATED_CHATS=true
SAVE_STUFF=true
SAVE_MEDIA_ARTIFACTS=true
```

Important bit: the bridge does not ask Gemini to shorten your prompts or shorten responses. It only tries to use less local CPU/RAM while keeping the Gemini output normal.

## how to get better results without spending money

The best trick is not more automation. The best trick is fewer bad Gemini calls.

- let Claude or your local AI polish the prompt first
- send Gemini one strong final prompt instead of five messy ones
- only use `retries: 1` for actual UI bugs/timeouts
- for image/video/music, include format, style, duration, camera, aspect ratio, and negative constraints
- check the `stuff/` gallery before regenerating the same thing again

That keeps the same Gemini limits, but wastes less of them.

## privacy warning

Do not commit or share:

- `.env`
- `profiles/`
- `stuff/`
- screenshots or generated files that contain private prompts

The `.gitignore` already blocks those, but still look before you push. Future-you will be happier.

## license

MIT
