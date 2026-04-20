#!/usr/bin/env node
// Mirrors apps/member/public/ into website/app/ for Vercel deployment.
//
// Responsibilities:
//   1. Clean-copy the member app source into the deployed folder.
//   2. Rewrite root-relative asset URLs in index.html so they resolve under
//      /app/* (Vercel serves website/app/ at /app/..., but the dev server
//      serves apps/member/public/ at /).
//   3. Stamp the service worker's CACHE_NAME with the current git short SHA
//      (or a timestamp fallback) so returning users pick up fresh assets
//      instead of getting stuck on a stale cache.
//
// Usage: npm run sync:app

import { execSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "apps/member/public");
const DEST = path.join(ROOT, "website/app");
const PREFIX = "app";

// index.html path replacements: dev paths (left) -> deployed paths (right).
// Only absolute, root-relative references are rewritten; anything relative
// already works in both environments.
const HTML_REWRITES = [
  [/(src|href)="\/app\.js"/g, `$1="/${PREFIX}/app.js"`],
  [/(src|href)="\/manifest\.json"/g, `$1="/${PREFIX}/manifest.json"`],
  [/(src|href)="\/service-worker\.js"/g, `$1="/${PREFIX}/service-worker.js"`],
  [/(src|href)="\/icons\//g, `$1="/${PREFIX}/icons/`],
];

function getVersion() {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return `ts-${Date.now()}`;
  }
}

async function rewriteFile(filepath, transform) {
  const contents = await fs.readFile(filepath, "utf8");
  const next = transform(contents);
  if (next !== contents) {
    await fs.writeFile(filepath, next, "utf8");
  }
}

async function main() {
  const version = getVersion();

  await fs.rm(DEST, { recursive: true, force: true });
  await fs.mkdir(DEST, { recursive: true });
  await fs.cp(SRC, DEST, { recursive: true });

  await rewriteFile(path.join(DEST, "index.html"), (html) =>
    HTML_REWRITES.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), html)
  );

  await rewriteFile(path.join(DEST, "service-worker.js"), (js) =>
    js.replace(/const CACHE_NAME = ".*?";/, `const CACHE_NAME = "dbc-member-shell-${version}";`)
  );

  console.log(`[sync:app] Synced apps/member/public -> website/app (cache: dbc-member-shell-${version})`);
}

main().catch((err) => {
  console.error("[sync:app] Failed:", err);
  process.exit(1);
});
