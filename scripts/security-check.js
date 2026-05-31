import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const maxTextBytes = 2 * 1024 * 1024;
const skippedDirs = new Set([".git", "node_modules", "profiles", "stuff", "downloads"]);

function isFallbackIgnored(relPath) {
  const normalized = relPath.replace(/\\/g, "/");
  if (normalized === ".env") return true;
  if (/^\.env\.(?!example$)/i.test(normalized)) return true;
  return false;
}

const blockedPathRules = [
  /^\.env$/i,
  /^\.env\.(?!example$)/i,
  /^node_modules\//i,
  /^profiles\/(?!\.gitkeep$)/i,
  /^stuff\/(?!\.gitkeep$)/i,
  /^downloads\//i
];

const secretRules = [
  { name: "private key", re: /-----BEGIN (?:RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: "GitHub token", re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{30,}\b/ },
  { name: "GitHub fine-grained token", re: /\bgithub_pat_[A-Za-z0-9_]{40,}\b/ },
  { name: "OpenAI-style key", re: /\bsk-[A-Za-z0-9_-]{32,}\b/ },
  { name: "Google API key", re: /\bAIza[0-9A-Za-z_-]{30,}\b/ },
  { name: "Google OAuth token", re: /\bya29\.[0-9A-Za-z_-]{20,}\b/ },
  { name: "Slack token", re: /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/ },
  { name: "real bearer token", re: /Bearer\s+[A-Za-z0-9._~+/-]{20,}/ },
  { name: "hardcoded local user path", re: /C:\\Users\\(?!YOUR_NAME\\|USERNAME\\|path\\)[^\\\s]+\\/i }
];

function toRepoPath(filePath) {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const rel = toRepoPath(fullPath);
    if (entry.isDirectory()) {
      if (skippedDirs.has(entry.name)) continue;
      out.push(...await walk(fullPath));
    } else {
      if (isFallbackIgnored(rel)) continue;
      out.push(rel);
    }
  }

  return out;
}

function gitFiles() {
  try {
    const output = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    return output.split(/\r?\n/).filter(Boolean);
  } catch {
    return null;
  }
}

function looksBinary(buffer) {
  return buffer.includes(0);
}

function fileIssueList(relPath) {
  const issues = [];
  const normalized = relPath.replace(/\\/g, "/");

  for (const rule of blockedPathRules) {
    if (rule.test(normalized)) {
      issues.push("blocked path should not be committed");
    }
  }

  const fullPath = path.join(root, relPath);
  if (!existsSync(fullPath)) return issues;

  const stats = statSync(fullPath);
  if (stats.size > maxTextBytes) return issues;

  let bytes;
  try {
    bytes = readFileSync(fullPath);
  } catch (error) {
    issues.push(`could not read file: ${error.code || error.message}`);
    return issues;
  }
  if (looksBinary(bytes)) return issues;

  const text = bytes.toString("utf8");
  for (const rule of secretRules) {
    if (rule.re.test(text)) {
      issues.push(rule.name);
    }
  }

  return issues;
}

const files = gitFiles() || await walk(root);
const problems = [];

for (const file of files) {
  const issues = fileIssueList(file);
  for (const issue of issues) {
    problems.push({ file, issue });
  }
}

if (problems.length) {
  console.error("Security check failed. Fix these before pushing:");
  for (const problem of problems) {
    console.error(`- ${problem.file}: ${problem.issue}`);
  }
  process.exit(1);
}

console.log(`Security check passed. Scanned ${files.length} candidate files.`);
