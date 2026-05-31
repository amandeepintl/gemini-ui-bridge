# gemini ui bridge

> use ur Gemini web plan from other local AI apps ( specially Claude Desktop ) without paying for the Gemini API.

i made this because api pricing is annoying and sometimes u already have Gemini sitting open in the browser. this bridge lets an MCP client, like Claude Desktop, use the real Gemini website through your own signed-in Chrome/Edge profile.

it is local, browser-based, and honest about the limits. no Gemini API key, no paid API calls, no weird cookie export stuff.

![Gemini UI bridge screenshot](docs/assets/gemini-chat.png)

<p>
  <b>Status:</b> personal tool, not production infra<br>
  <b>Works through:</b> Chrome/Edge + Playwright + MCP<br>
  <b>Best for:</b> making Claude use Gemini web without another api bill
</p>

## quick map

- [what this does](#what-this-does)
- [how it works](#how-it-works)
- [interactive website](#interactive-website)
- [screenshots](#screenshots)
- [install](#install)
- [claude desktop setup](#claude-desktop-setup)
- [daily use](#daily-use)
- [saved outputs](#saved-outputs)
- [security rules](#security-rules)
- [zero-cost quality upgrades](#zero-cost-quality-upgrades)

## what this does

| thing | supported |
| --- | --- |
| normal Gemini chat | yes |
| Create image | yes |
| Create video | yes |
| Create music | yes |
| Canvas | yes |
| Guided Learning | yes |
| upload local files | yes |
| archive prompts/responses/screenshots | yes |
| hide the browser offscreen | yes |
| official Gemini API replacement | no |

this is useful if u want Claude or another local AI to say: "ask Gemini this", "make an image prompt", "open Gemini image mode", "save the output", and stuff like that.

it is not useful if u need 24/7 production reliability. Gemini can change the UI and break browser automation. that is the trade.

## how it works

```mermaid
flowchart LR
  User["you / Claude / local AI"] --> MCP["gemini-ui-bridge MCP"]
  MCP --> Browser["local Chrome or Edge profile"]
  Browser --> Gemini["Gemini website"]
  Gemini --> Browser
  Browser --> Archive["stuff/ dated archive folder"]
  Archive --> Gallery["stuff/index.html gallery"]
  MCP --> User
```

<details open>
<summary><b>the short version</b></summary>

1. u sign in to Gemini yourself in a separate local browser profile.
2. Claude calls an MCP tool like `gemini_prompt` or `gemini_create_image`.
3. the bridge pastes the prompt into Gemini.
4. it waits for the visible response.
5. it saves the run into `stuff/YYYY-MM-DD_HH-mm-ss-SSS_tool-name/`.
6. it returns the response and archive folder back to Claude.

</details>

<details>
<summary><b>why this exists</b></summary>

because sometimes u do not want another paid API bill. if u already have access to Gemini web features, this gives your local AI apps a way to use that browser session.

but it still behaves like browser automation, not a clean API. so use it slowly and normally, like a human using the website.

</details>

## screenshots / stuff

just the useful visuals: Gemini answering, the stuff gallery, terminal check, and Claude seeing tools.

### Gemini UI run

![Gemini prompt and response](docs/assets/gemini-chat.png)

### Saved-output gallery

![Stuff gallery](docs/assets/stuff-gallery-preview.png)

### Terminal / safety check

![Terminal check](docs/assets/terminal-preview.png)

### Claude sees MCP tools

![Claude MCP tools](docs/assets/claude-tool-list-preview.png)

## interactive website

there is also a more visual 3D explainer site in `docs/`.

Run it locally:

```powershell
npm run site
```

Then open:

```text
http://127.0.0.1:4173
```

it explains the whole thing with a 3D bridge map, a fake run simulator, clickable tool cards, screenshots, and the security checklist.

## install

<details open>
<summary><b>1. clone and install</b></summary>

```powershell
git clone https://github.com/amandeepintl/gemini-ui-bridge.git
cd gemini-ui-bridge
npm install
Copy-Item .env.example .env
```

</details>

<details open>
<summary><b>2. login to Gemini</b></summary>

```powershell
npm run launch-browser
```

Or double-click:

```text
OPEN_GEMINI_LOGIN.bat
```

sign in manually. the login stays inside `profiles/real-browser`, which is ignored by git.

</details>

<details>
<summary><b>3. run the bridge</b></summary>

```powershell
npm start
```

Or use one of the BAT files:

```text
START_BRIDGE.bat
START_BRIDGE_HIDDEN.bat
START_BRIDGE_ULTRA_LOW.bat
```

</details>

## claude desktop setup

add this MCP server to Claude Desktop. change the path to wherever u cloned the repo:

```json
{
  "mcpServers": {
    "gemini-ui-bridge": {
      "command": "node",
      "args": [
        "--max-old-space-size=128",
        "C:\\path\\to\\gemini-ui-bridge\\src\\mcp-server.js"
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

then restart Claude and ask:

```text
Call gemini_read_guide, then gemini_status.
```

<details>
<summary><b>available MCP tools</b></summary>

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

</details>

<details>
<summary><b>supported Gemini UI modes</b></summary>

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

</details>

## daily use

### ask Gemini normally

```powershell
curl -X POST http://127.0.0.1:8787/v1/prompt `
  -H "Content-Type: application/json" `
  -d "{\"prompt\":\"Reply exactly: bridge is working\"}"
```

### use a Gemini mode

```powershell
curl -X POST http://127.0.0.1:8787/v1/prompt `
  -H "Content-Type: application/json" `
  -d "{\"tool\":\"create_image\",\"prompt\":\"Create a clean app icon for a study app.\"}"
```

### hide or show the browser

```text
HIDE_GEMINI_BROWSER.bat
SHOW_GEMINI_BROWSER.bat
```

the hidden mode moves the browser offscreen and stops it from jumping over your work. it is convenience, not security magic.

## saved outputs

every successful run gets a folder like:

```text
stuff/YYYY-MM-DD_HH-mm-ss-SSS_tool-name/
```

Inside:

```text
prompt.txt
response.md
result.json
media-refs.json
media-downloads.json
page.png
media/
```

failed runs are saved too:

```text
stuff/YYYY-MM-DD_HH-mm-ss-SSS_error_tool-name/
```

Open the gallery:

```powershell
npm run open-stuff
```

Or double-click:

```text
OPEN_STUFF_GALLERY.bat
```

## security rules

this repo is designed to avoid uploading private local stuff.

never commit:

- `.env`
- `profiles/`
- `stuff/`
- screenshots with your account/sidebar visible
- generated files that contain private prompts
- exported Claude config files with personal paths
- tokens, passwords, cookies, API keys

before pushing:

```powershell
npm run security-check
git status --ignored
```

the security check blocks obvious mistakes, but still look at `git status`. your browser profile is basically a logged-in browser, so treat it like one.

## zero-cost quality upgrades

the way to make this better for free is not "spam Gemini harder". it is fewer wasted calls.

Good flow:

```mermaid
flowchart TD
  A["rough idea"] --> B["Claude/local AI polishes prompt"]
  B --> C["send one strong prompt to Gemini"]
  C --> D["archive result"]
  D --> E["review gallery before regenerating"]
```

use this pattern:

- ask Claude to improve/check the prompt first
- send Gemini one strong final prompt
- use `retries: 1` only for UI failures/timeouts
- for media, include aspect ratio, duration, style, camera, mood, and negative constraints
- do not ask Gemini for shorter output unless you actually want shorter output

same limits, better hit rate.

## honest rating

| use case | rating |
| --- | --- |
| personal assistant bridge | 7.5/10 |
| cheap creative workflow | 8/10 |
| production integration | 2/10 |
| official API replacement | 3/10 |

that is the truth. it is useful, but it is still a browser bridge.

## license

MIT
