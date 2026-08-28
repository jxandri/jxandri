// Strip an applet's outer document down to what an Artifact publish wants:
// the wrapper supplies <!doctype>, <html>, <head> and <body>, so the page has
// to hand over its <title>, its <style> and its markup and nothing else.
// A <style> tag is legal in the body, so the stylesheet travels with the rest.
//
//   node tools/build-artifact.mjs edgeworth-box/index.html out.html
import { readFileSync, writeFileSync } from "node:fs";

const [src, out] = process.argv.slice(2);
if(!src || !out){
  console.error("usage: node tools/build-artifact.mjs <source.html> <out.html>");
  process.exit(2);
}
const html = readFileSync(src, "utf8");

const grab = (open, close) => {
  const i = html.indexOf(open);
  const j = html.indexOf(close, i);
  if(i < 0 || j < 0) throw new Error(`missing ${open}`);
  return html.slice(i, j + close.length);
};

const title = grab("<title>", "</title>");
const style = grab("<style>", "</style>");
const body  = html.slice(html.indexOf("<body>") + "<body>".length,
                         html.lastIndexOf("</body>")).trim();

const page = `${title}\n${style}\n${body}\n`;

// The publisher only scans the first 8 KB for a title, and only that host list
// for external resources; both are worth failing on here rather than on a live
// page a class has already been handed.
if(page.indexOf("<title>") > 8000) throw new Error("title past the 8 KB mark");
const ext = page.match(/(?:src|href)\s*=\s*"(https?:)?\/\/[^"]*/g);
if(ext) throw new Error("external resources: " + ext.join(", "));
// word-boundaried, or <header class="masthead"> reads as a stray <head>
const stray = page.match(/<!doctype|<\/?(?:html|head|body)\b/i);
if(stray) throw new Error(`stray ${stray[0]} in output`);

writeFileSync(out, page);
console.log(`${out}  ${(page.length / 1024).toFixed(0)} KB  ${title}`);
