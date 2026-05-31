import { openGemini } from "./gemini-ui.js";

const result = await openGemini();
console.log(JSON.stringify(result, null, 2));
console.log("Leave this browser open after signing in. Press Ctrl+C here when done.");

await new Promise(() => {});
