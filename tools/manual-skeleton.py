# -*- coding: utf-8 -*-
"""Emits one bilingual manual per applet from a shared skeleton, so all five
stay identical in design and only the content differs."""
import html, json, os, sys

SKELETON = """<!doctype html>
<html lang="es" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>__TITLE__</title>
<meta name="description" content="__DESC__">
<style>
:root{
  color-scheme:dark;
  --paper:#0D1215; --surface:#151C20; --sunk:#0F171A; --panel:#192126;
  --ink:#E7EEF1; --ink-2:#A3B4BC; --ink-3:#6D7F87;
  --rule:#2A353B; --rule-2:#212B30;
  --accent:#4CC6D4; --accent-soft:#173238; --accent-ink:#8CE2EC;
  --btn-ink:#08171A; --warn:#E3BC72; --warn-soft:#2C2314; --warn-rule:#6B5227;
  --good:#6FD3A0; --good-soft:#12301F;
  --shadow:0 1px 2px rgba(0,0,0,.4), 0 10px 28px -16px rgba(0,0,0,.8);
  --f-display:"Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Georgia,ui-serif,serif;
  --f-ui:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  --f-mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;
}
:root[data-theme="light"]{
  color-scheme:light;
  --paper:#F2F4F4; --surface:#FFFFFF; --sunk:#E9EDEE; --panel:#F7F9F9;
  --ink:#14191B; --ink-2:#4A585D; --ink-3:#78878C;
  --rule:#CDD6D8; --rule-2:#E2E8E9;
  --accent:#0E6E78; --accent-soft:#D8EAEC; --accent-ink:#0A4F57;
  --btn-ink:#FFFFFF; --warn:#8A5512; --warn-soft:#F6E9D3; --warn-rule:#D9B071;
  --good:#1B6E48; --good-soft:#D8EDE1;
  --shadow:0 1px 2px rgba(20,25,27,.05), 0 8px 22px -14px rgba(20,25,27,.3);
}
*{box-sizing:border-box}
body{margin:0; background:var(--paper); color:var(--ink); font-family:var(--f-ui);
  font-size:15.5px; line-height:1.62; -webkit-font-smoothing:antialiased; padding:36px 20px 70px}
.wrap{max-width:820px; margin:0 auto; display:flex; flex-direction:column; gap:32px}
.top{display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap}
.kicker{font-family:var(--f-mono); font-size:11px; letter-spacing:.12em; text-transform:uppercase;
  color:var(--accent-ink); background:var(--accent-soft); padding:4px 9px; border-radius:2px}
h1{margin:8px 0 0; font-family:var(--f-display); font-size:clamp(27px,4.3vw,37px);
  font-weight:600; letter-spacing:-.012em; line-height:1.15; text-wrap:balance}
.lede{margin:8px 0 0; color:var(--ink-2); max-width:64ch; font-size:16.5px}
.seg{display:inline-flex; border:1px solid var(--rule); border-radius:3px; overflow:hidden; flex:none}
.seg button{appearance:none; cursor:pointer; background:var(--panel); color:var(--ink-2);
  border:0; padding:6px 13px; font-size:12.5px; font-family:var(--f-ui)}
.seg button+button{border-left:1px solid var(--rule)}
.seg button[aria-pressed="true"]{background:var(--accent); color:var(--btn-ink); font-weight:600}
.seg button:focus-visible{outline:2px solid var(--accent); outline-offset:-2px}
section{display:flex; flex-direction:column; gap:14px}
.part{font-family:var(--f-mono); font-size:11px; letter-spacing:.12em; text-transform:uppercase;
  color:var(--ink-3); padding-bottom:8px; border-bottom:1px solid var(--rule)}
h2{margin:0; font-family:var(--f-display); font-size:24px; font-weight:600; letter-spacing:-.008em; text-wrap:balance}
h3{margin:0; font-size:15.5px; font-weight:700}
p{margin:0; max-width:66ch}
code{font-family:var(--f-mono); font-size:.885em; background:var(--sunk);
  border:1px solid var(--rule-2); border-radius:3px; padding:1px 5px; word-break:break-word}
a{color:var(--accent-ink); text-decoration:none; border-bottom:1px solid var(--rule)}
a:hover{border-bottom-color:var(--accent)}
a:focus-visible{outline:2px solid var(--accent); outline-offset:2px; border-radius:2px}
.btn{display:inline-block; text-decoration:none; border:1px solid var(--accent);
  background:var(--accent); color:var(--btn-ink); border-radius:3px; padding:9px 17px;
  font-size:14px; font-weight:600; align-self:flex-start}
.btn:hover{filter:brightness(1.08)}
.tbl-wrap{overflow-x:auto; border:1px solid var(--rule); border-radius:4px; background:var(--surface)}
table{border-collapse:collapse; width:100%; font-size:14.5px; min-width:480px}
th,td{text-align:left; padding:10px 15px; border-bottom:1px solid var(--rule-2); vertical-align:top}
th{font-family:var(--f-mono); font-size:10.5px; letter-spacing:.09em; text-transform:uppercase;
  color:var(--ink-3); background:var(--panel); border-bottom-color:var(--rule)}
tr:last-child td{border-bottom:0}
td:first-child{font-weight:600; width:34%}
ol.steps{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:17px}
ol.steps>li{display:grid; grid-template-columns:32px minmax(0,1fr); gap:13px; align-items:start}
ol.steps>li>.n{font-family:var(--f-mono); font-variant-numeric:tabular-nums; font-size:13px;
  font-weight:700; color:var(--accent-ink); background:var(--accent-soft); border-radius:3px;
  text-align:center; padding:3px 0; margin-top:1px}
ol.steps>li>.body{display:flex; flex-direction:column; gap:6px; min-width:0}
.note,.warn{border-radius:4px; padding:13px 16px; display:flex; flex-direction:column; gap:6px;
  border:1px solid var(--rule); border-left-width:3px}
.note{background:var(--panel); border-left-color:var(--accent)}
.warn{background:var(--warn-soft); border-color:var(--warn-rule); border-left-color:var(--warn); color:var(--warn)}
.res{background:var(--good-soft); border:1px solid var(--good); border-radius:3px;
  padding:8px 12px; font-family:var(--f-mono); font-size:13px; color:var(--good); max-width:66ch}
/* The applet draws its arrows in fixed hues that hold on either ground, so a
   colour named in the text gets the hue itself beside it rather than being
   set in it: a swatch has no contrast floor to clear, and the reader can hold
   it against the screen. */
.sw{display:inline-block; width:.62em; height:.62em; border-radius:2px;
  margin-right:.28em; vertical-align:baseline;
  box-shadow:0 0 0 1px rgba(128,128,128,.45)}
footer{border-top:1px solid var(--rule); padding-top:18px; color:var(--ink-3); font-size:13.5px;
  display:flex; flex-direction:column; gap:8px}
[data-l]{display:none}
[data-l].on{display:revert}
p[data-l].on,h1[data-l].on,h2[data-l].on,h3[data-l].on,li[data-l].on{display:revert}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
@page{margin:19mm 16mm}
@media print{
  body{padding:0; font-size:10.6pt; line-height:1.5}
  .wrap{max-width:none; gap:24px}
  .seg{display:none!important}
  .top{display:block}
  h1{font-size:26pt} .lede{font-size:11.4pt}
  h2{font-size:15pt; break-after:avoid} h3{break-after:avoid}
  .part{break-after:avoid} p{max-width:none}
  ol.steps>li,.note,.warn,.res,.tbl-wrap,footer{break-inside:avoid}
  table{min-width:0} th,td{padding:7px 11px}
  a{border-bottom:0}
  section{break-inside:auto}
}
</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <div>
      <span class="kicker" data-l="es">Manual de uso</span><span class="kicker" data-l="en">User guide</span>
      <h1 data-l="es">__H1_ES__</h1><h1 data-l="en">__H1_EN__</h1>
      <p class="lede" data-l="es">__LEDE_ES__</p><p class="lede" data-l="en">__LEDE_EN__</p>
    </div>
    <div style="display:flex; gap:8px; flex-wrap:wrap">
      <div class="seg" id="lang">
        <button type="button" data-lang="es" aria-pressed="true">ES</button>
        <button type="button" data-lang="en" aria-pressed="false">EN</button>
      </div>
      <div class="seg" id="theme">
        <button type="button" data-th="dark" aria-pressed="true"><span data-l="es">Oscuro</span><span data-l="en">Dark</span></button>
        <button type="button" data-th="light" aria-pressed="false"><span data-l="es">Claro</span><span data-l="en">Light</span></button>
      </div>
    </div>
  </div>
__BODY__
  <footer>
    <p data-l="es">Abre el applet: <a href="__APPHREF__">__H1_ES__</a>. Todo funciona en el navegador; una vez cargado, también sin conexión.</p>
    <p data-l="en">Open the applet: <a href="__APPHREF__">__H1_EN__</a>. It all runs in the browser, and once loaded, offline too.</p>
    <p><a href="../index.html" data-l="es">← Volver al menú</a><a href="../index.html" data-l="en">← Back to the menu</a></p>
  </footer>
</div>
<script>
"use strict";
/* One page, two languages: every block is tagged and the toggle just switches
   which set is shown. Keeping both in one file means a correction lands in both
   at once instead of drifting apart. */
function setLang(l){
  document.documentElement.lang = l;
  document.querySelectorAll("[data-l]").forEach(function(el){
    el.classList.toggle("on", el.dataset.l === l);
  });
  document.querySelectorAll("#lang button").forEach(function(b){
    b.setAttribute("aria-pressed", String(b.dataset.lang === l));
  });
  try{ localStorage.setItem("manual.lang", l); }catch(e){}
}
function setTheme(t){
  document.documentElement.setAttribute("data-theme", t);
  document.querySelectorAll("#theme button").forEach(function(b){
    b.setAttribute("aria-pressed", String(b.dataset.th === t));
  });
  try{ localStorage.setItem("manual.theme", t); }catch(e){}
}
document.querySelectorAll("#lang button").forEach(function(b){
  b.addEventListener("click", function(){ setLang(b.dataset.lang); });
});
document.querySelectorAll("#theme button").forEach(function(b){
  b.addEventListener("click", function(){ setTheme(b.dataset.th); });
});
/* The toggle always stamps data-theme, so the media query never gets a say —
   which is why the first visit takes its cue from the reader's system setting
   instead of assuming dark. After that their own choice sticks. */
var sysLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
var l0 = "es", t0 = sysLight ? "light" : "dark";
try{ l0 = localStorage.getItem("manual.lang") || l0;
     t0 = localStorage.getItem("manual.theme") || t0; }catch(e){}
setLang(l0); setTheme(t0);
</script>
</body>
</html>
"""

def sec(part_es, part_en, blocks):
    out = ['  <section>']
    out.append(f'    <div class="part" data-l="es">{part_es}</div><div class="part" data-l="en">{part_en}</div>')
    out.extend(blocks)
    out.append('  </section>')
    return "\n".join(out)

def h2(es, en):   return f'    <h2 data-l="es">{es}</h2><h2 data-l="en">{en}</h2>'
def p(es, en):    return f'    <p data-l="es">{es}</p><p data-l="en">{en}</p>'
def note(es, en): return f'    <div class="note"><p data-l="es">{es}</p><p data-l="en">{en}</p></div>'
def warn(es, en): return f'    <div class="warn"><p data-l="es">{es}</p><p data-l="en">{en}</p></div>'
def res(es, en):  return f'    <div class="res" data-l="es">{es}</div><div class="res" data-l="en">{en}</div>'

def table(head_es, head_en, rows):
    """A row is (label, es, en) when the label reads the same in both languages —
    a formula, a symbol, a piece of code — and (label_es, label_en, es, en) when
    it does not. Control and layer names have to be the second kind: the applets
    themselves rename their buttons when the language changes, and a guide that
    kept the Spanish button name would send an English reader looking for a
    control that is not there."""
    cells = []
    for r in rows:
        if len(r) == 4:
            a, a_en, b, c = r
            lbl = f'<td data-l="es">{a}</td><td data-l="en">{a_en}</td>'
        else:
            a, b, c = r
            lbl = f'<td>{a}</td>'
        cells.append(f'<tr>{lbl}<td data-l="es">{b}</td><td data-l="en">{c}</td></tr>')
    r = "".join(cells)
    return ('    <div class="tbl-wrap"><table><thead>'
            f'<tr><th data-l="es">{head_es[0]}</th><th data-l="en">{head_en[0]}</th>'
            f'<th data-l="es">{head_es[1]}</th><th data-l="en">{head_en[1]}</th></tr>'
            f'</thead><tbody>{r}</tbody></table></div>')

def steps(items):
    out = ['    <ol class="steps">']
    for i,(es,en,r) in enumerate(items, 1):
        inner = f'<p data-l="es">{es}</p><p data-l="en">{en}</p>'
        if r: inner += f'<div class="res" data-l="es">{r[0]}</div><div class="res" data-l="en">{r[1]}</div>'
        out.append(f'      <li><span class="n">{i}</span><div class="body">{inner}</div></li>')
    out.append('    </ol>')
    return "\n".join(out)

def build(spec, outpath):
    body = "\n".join(spec["sections"])
    page = (SKELETON
        .replace("__BODY__", body)
        .replace("__TITLE__", spec["title"])
        .replace("__DESC__", spec["desc"])
        .replace("__H1_ES__", spec["h1_es"]).replace("__H1_EN__", spec["h1_en"])
        .replace("__LEDE_ES__", spec["lede_es"]).replace("__LEDE_EN__", spec["lede_en"])
        .replace("__APPHREF__", spec["href"]))
    with open(outpath, "w", encoding="utf-8") as f:
        f.write(page)
    return outpath
