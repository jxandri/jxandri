# Applet manuals

Ten PDFs: five applets, each in Spanish and English. Built from LaTeX with
`pdflatex`, illustrated with screenshots captured from the applets themselves.

```
docs/manual/
  appletmanual.cls          the shared class: page, palette, environments
  open-es.tex  open-en.tex  "how to open it" — shared, folder name substituted
  tail-es.tex  tail-en.tex  publishing and licence — shared
  <applet>-es.tex           one document per applet per language
  <applet>-en.tex
  figs/<applet>/<lang>/     screenshots, written by the figure builder
```

## Building

```sh
node tools/build-manual-figs.mjs      # capture 86 screenshots (~3 min)
node tools/build-manuals.mjs          # typeset the ten PDFs into dist/
```

Either takes an applet name to do just that one:

```sh
node tools/build-manual-figs.mjs firm-supply
node tools/build-manuals.mjs firm-supply       # both languages
node tools/build-manuals.mjs firm-supply-es    # one
```

Output lands in `dist/` as `<Applet>-Guide.pdf` and `<Applet>-Guia.pdf`,
matching the naming the Gradient Peaks guide already uses.

### What you need

The figure builder uses the vendored `playwright-core` and the Chromium at
`PLAYWRIGHT_CHROMIUM` (default `/opt/pw-browsers/chromium`). It optionally runs
`pngquant` over the results, which cuts them from 31 MB to under 10 MB with no
visible loss; without it everything still builds, just larger.

The typesetter needs a TeX Live with `XCharter`, `newtxmath`, `FiraSans`,
`inconsolata`, `tcolorbox`, `titlesec` and `tocloft`. On Debian or Ubuntu:

```sh
sudo apt-get install -y --no-install-recommends \
  texlive-latex-base texlive-latex-recommended texlive-latex-extra \
  texlive-fonts-recommended texlive-fonts-extra texlive-lang-spanish \
  texlive-plain-generic lmodern pngquant
```

## How the two editions stay in step

A document sets three things and the class does the rest:

```latex
\manuallang{es}              % switches "Figure", "Activity", "Settings", …
\appletname{...}             % cover, running header
\appletdir{firm-supply}      % folder name, and where figures are looked up
```

`\fig{panels}{caption}` resolves to `figs/firm-supply/es/panels.png`, so the two
editions of a manual differ by one line and never spell out a path. Screenshots
are captured with each applet set to the manual's own language: a manual whose
figures are in the other language is a manual the reader has to translate while
reading it.

Figures are taken in the light theme, because they are going onto white paper.
The one `dark` figure in each set exists to show the reader what the toggle
does.

## Adding an applet

1. Add an entry to `APPS` in `tools/build-manual-figs.mjs`: which selector to
   clip to, and the steps that put the applet into each state. Steps are
   expressions evaluated in the page; the applets expose `st` and `render()`,
   and the prelude adds `setSlider`, `setExpr`, `pickPreset`, `pickScheme`,
   `pickCompare` and `sweepFor`.
2. Add it to `TITLES` in `tools/build-manuals.mjs`.
3. Write `<applet>-es.tex` and `<applet>-en.tex`, taking `firm-supply-*.tex` as
   the model.
4. Register the two PDFs in `tools/build-site.mjs` and
   `.github/workflows/pages.yml`, and add the links to the applet's card in
   `landing/index.html`.

## A note on the numbers

Every figure quoted in an activity — every `q* = 2.869`, every
`utility 34.781` — was read out of the running applet, not estimated. When an
applet changes, re-check them: `tools/build-manual-figs.mjs` will happily
capture a screenshot that no longer matches the prose.
