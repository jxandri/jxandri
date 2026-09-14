#!/usr/bin/env node
/* Derive artifact-ready copies of the single-file applets.
 *
 * An Artifact is published as page CONTENT: the host supplies
 * <!doctype html><head>…</head><body> around whatever is handed to it, along
 * with a charset, a viewport and a small reset. So the document wrapper has to
 * come off, and the <title> and <style> have to survive at the top of what is
 * left — the title is what names the artifact in a tab and a gallery, and it is
 * only looked for in the first 8 KB.
 *
 * Nothing else changes. The applets are already self-contained: no build step,
 * no dependencies, no network at runtime, no eval, so they run inside a strict
 * content security policy exactly as they run from a file:// URL.
 *
 *   node tools/build-artifacts.mjs [outDir]      (default dist/artifacts)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT  = process.argv[2] || join(ROOT, "dist", "artifacts");

const APPS = ["climbing-robot", "demand-functions", "firm-supply",
              "partial-derivatives", "consumer-optimum", "nonlinear-budget",
              "labor-tax"];

const one = (src, re, what) => {
  const m = src.match(re);
  if (!m) throw new Error(`no ${what}`);
  return m[1];
};

mkdirSync(OUT, { recursive: true });
console.log(OUT);
for (const app of APPS) {
  let src;
  try { src = readFileSync(join(ROOT, app, "index.html"), "utf8"); }
  catch { continue; }

  const title = one(src, /<title>([\s\S]*?)<\/title>/, `title in ${app}`);
  const style = one(src, /<style>([\s\S]*?)<\/style>/, `style in ${app}`);
  const body  = one(src, /<body[^>]*>([\s\S]*)<\/body>/, `body in ${app}`);

  /* the <html> attributes go with the wrapper; the applets set both of them
     from script on boot, so nothing is lost */
  const out = `<title>${title}</title>\n<style>${style}</style>\n${body.trim()}\n`;
  const path = join(OUT, `${app}.html`);
  writeFileSync(path, out);
  console.log(`  ${app.padEnd(20)} ${String(out.length).padStart(7)} bytes`);
}
