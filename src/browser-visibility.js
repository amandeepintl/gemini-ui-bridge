import { applyWindowVisibilityViaCdp, normalizeBrowserVisibility } from "./browser-window.js";

const visibility = normalizeBrowserVisibility(process.argv[2] || "offscreen");
const result = await applyWindowVisibilityViaCdp(visibility);
console.log(JSON.stringify(result, null, 2));
