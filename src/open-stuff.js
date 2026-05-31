import { openLocalTarget, updateArchiveIndex } from "./archive-tools.js";

const target = process.argv[2] || "gallery";

if (target === "index") {
  console.log(JSON.stringify(await updateArchiveIndex(), null, 2));
} else {
  console.log(JSON.stringify(await openLocalTarget(target), null, 2));
}
