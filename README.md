# Gradient Peaks

A light 3D sandbox for teaching surface plots of differentiable functions of two
variables — and the geometry of maximising them over a constraint set.

Students type a function `f(x, y)` and a feasible set, and then **walk around on
the graph** in first person, third person, or from a flying drone. The surface is
dressed as real terrain — forest, rock, snow, lakes — so that the abstract object
`z = f(x, y)` becomes a landscape you can stand on, with level curves under your
feet, partial derivatives drawn on the ground around you, and a shaft of light
marking the constrained optimum.

Everything runs in the browser. No install, no plugin, no account. The interface
is available in **English and Spanish**, switchable at any time from the panel or
pinned with `?lang=es` / `?lang=en` on the URL.

---

## Running it

**The quickest way** — open `dist/Gradient-Peaks.html`. That is the whole
application inlined into one file: double-click it and it runs, with no server,
no network and no install. It is what you hand to someone who does not code.

`docs/` holds the source of the illustrated manual, built in both languages:
**`dist/Gradient-Peaks-Guide.pdf`** and **`dist/Gradient-Peaks-Guia.pdf`**. Each
is ~25 pages written for a complete beginner — installing, every control, the
expression syntax, nine classroom activities, publishing it for a class, and
troubleshooting — and each is screenshotted in its own language.

**For development**, serve `app/` — any static web server works, because the app
is just files.

```sh
cd app
python3 -m http.server 8000
# then open http://localhost:8000
```

`app/index.html` must be served over `http://` or `https://`, not opened as a
`file://` path — ES modules and the service worker both require an origin. That
restriction is exactly why `dist/Gradient-Peaks.html` exists; rebuild it with:

```sh
npm install esbuild && npm run build:standalone
```

---

## What's in it

| | Feature |
|---|---|
| **1** | Surface plot of any `f(x, y)` typed into a dialog box, over an adjustable domain |
| **2** | Realistic terrain dressing: trees, grass, rocks and snow placed *on top of* the smooth surface, plus translucent water filling every depression where `f < 0` |
| **3** | **Feasible set** from typed constraints, drawn as glowing frontier walls, with a toggle that turns everything outside translucent |
| **4** | First person, third person (over-the-shoulder), and a drone that flies level with its own first- and third-person cameras, a straight-down map view, and a beam dropping perpendicular to `z = 0` onto a bright ring marking the point of the domain you are over |
| **5** | **Level curves** by marching squares, drawn as wide walkable paths draped over the ground and coloured by height on a ten-colour ramp, at an interval you choose; the contour under the explorer and its tangent, both projected onto the surface; the HUD always shows `(x, y)`, the height, and `RMS = \|∂f/∂x ÷ ∂f/∂y\|`, the slope of the level curve |
| **6** | **Derivative disc** of 1 m or 2 m around the explorer, measured as **arc length over the surface** rather than on the flat floor — so the rim is the set of points that far *walked* — with `∂f/∂x` in blue, `∂f/∂y` in red and `∇f` in double-width teal, each a flat arrow painted on the curved surface, each reporting both its instantaneous and its average rate of change |
| **7** | **Directional derivative**: freezes the explorer and lets the mouse swing **u** around the rim |
| **8** | **Zoom-in ruler**: shrinks the explorer by powers of ten, down to 0.18 mm, so a differentiable surface visibly flattens onto its tangent plane |
| **9** | **Numerical maximisation** over the feasible set, marked with a ring and a beam of light visible from anywhere, reporting whether the optimum is interior or on the boundary |

### The teaching moment this was built for

Load the default scene: `f(x,y) = (x·y)^0.5` on `[0,2]²`, feasible set
`x>=0 && y>=0 && x+y<=2`. Turn on **Show optimum**.

It finds the maximum at `(1, 1)`, value `1`, and reports `‖∇f‖ = 0.707` there —
*not* zero. The gradient does not vanish at the optimum because the optimum is on
the boundary: the constraint is what stops you, not the surface flattening out.
Switch the feasible set off and the maximum jumps to the far corner. That
contrast, standing on the surface and looking at the arrows, is the point.

---

## Controls

| | |
|---|---|
| Move | `W` `A` `S` `D` — hold `Shift` to run |
| Look | mouse (click the scene to capture the pointer, `Esc` to release) |
| Drone altitude | `Space` / `Ctrl` — the drone flies level, so the mouse only aims the camera |
| Views | `1` first person · `2` third person · `3` drone · `T` straight down · `R` recentre |
| Toggles | `C` level curves · `M` colour by height · `J` the curve under your feet · `K` its tangent · `F` frontier walls · `G` translucent outside · `H` highlight disc · `X` `Y` `V` `B` the four arrows · `P` tangent plane · `O` optimum |
| Panel | `Tab` |

On a phone or tablet: drag on the left half to walk, drag on the right half to
look.

### Writing functions

Arithmetic is `+ − * / ^`, and implicit products work, so `2x`, `x y` and
`3(x+y)` all parse. Available: `sin cos tan asin acos atan atan2 sinh cosh tanh
exp ln log log2 log10 sqrt cbrt abs sign floor ceil round min max pow hypot mod
clamp step gauss`, with constants `pi`, `e`, `tau`. Bars give absolute value:
`|x-y|`.

Where `f` is undefined the terrain simply has no ground — `(x*y)^0.5` on a domain
crossing the axes leaves two empty quadrants, and the explorer will not walk into
them.

### Writing feasible sets

Comparisons combine with `&&` and `||`, and chain: `0 <= x <= 1` means what it
looks like. Anything you can write as inequalities in `x` and `y` works —
`x^2+y^2<=1`, `x*y>=0.3 && x+y<=2.5`, and so on. Leave the box empty for "no
constraint".

---

## Installing it as an app

The page is a PWA, so it installs on every platform without any store, without
signing, and without a developer account:

- **iPhone / iPad** — open in Safari, Share → *Add to Home Screen*
- **Android** — open in Chrome, menu → *Install app*
- **macOS / Windows / Linux** — open in Chrome or Edge, the install icon in the
  address bar (Safari on macOS: File → *Add to Dock*)

Once installed it runs full-screen, offline, from cache. It is about 1 MB total.

### Publishing it for a class

Any static host will do — GitHub Pages, Netlify, a university web directory,
even a folder on a shared drive served over HTTP. A `.github/workflows/pages.yml`
is included that publishes `app/` to GitHub Pages on every push to the default
branch; enable it under *Settings → Pages → Source: GitHub Actions*.

---

## How it is built

Plain ES modules, no build step, no framework, no bundler. The only dependency is
three.js, vendored under `app/vendor/` (MIT, ~700 KB minified) so the whole thing
works with no network at all.

```
app/
  index.html          markup and the control panel
  css/style.css
  js/
    i18n.js           English and Spanish strings, and the language switch
    mathexpr.js       expression compiler: text -> closure tree, no eval()
    field.js          math space <-> world space, gradients, sampling grid
    terrain.js        surface mesh, biome & topographic colour, water, walls
    decor.js          instanced trees / rocks / grass / snow
    analysis.js       contours, derivative arrows, tangent plane, optimiser
    player.js         character, drone, and the three cameras
    main.js           scene assembly, controls, UI wiring
  vendor/three.*      three.js r180
  sw.js               offline cache
```

A few decisions worth knowing about:

**Nothing is `eval`'d.** Student input is parsed by a hand-written recursive
descent parser into a tree of closures. A typo produces an error message with a
character position; it cannot produce code. Those diagnostics carry a key and
parameters rather than a fixed English sentence, so they are translated along
with the rest of the interface.

**Switching language never recomputes anything.** `applyStatic()` walks
`data-i18n` attributes for the markup; the handful of strings the program
composes itself — the mode pill, the optimum report, a visible parse error — are
re-rendered from cached state, so you can switch mid-demonstration.

**The world scale is uniform.** The domain maps to a fixed world size and the
height uses that same factor, so `∂f/∂x` means the same number in world metres as
it does in math units, and the slope you see is the slope that is reported. The
vertical exaggeration slider deliberately breaks this and is labelled as visual
only.

**Biome rules are relative to each surface.** Thresholds are measured against the
median `|∇f|` of the surface being plotted. An absolute "steep means slope > 0.55"
rule would render `√(xy)` — whose slope is about 0.7 nearly everywhere — as one
uniform slab of bare rock.

**The decorations never touch the graph.** Trees and rocks are separate instanced
meshes standing on the surface, placed at the height of the *rendered triangle*
rather than of `f` itself so nothing floats or sinks. The surface stays exactly as
smooth as `f` is.

**Nested detail rings follow the explorer.** The global mesh has to span the whole
domain, so at eye level its cells are close to a metre across and the ground reads
as facets. Two nested squares — roughly 7 m and 24 m across — re-sample `f` around
the explorer at centimetre spacing, each rebuilding on its own movement threshold
so the small one can follow every few steps while the large one hardly ever moves.
Both rings together rebuild in about 10 ms.

They also carry the zoom demonstration: without them, shrinking the character to
10⁻⁴ would park the student on a single enormous flat triangle and the surface
would look linear for entirely the wrong reason. Each ring is lifted clear of what
it covers by the *measured* gap, since the two surfaces differ by real geometry and
no depth-buffer trick can bridge centimetres when the explorer is a fraction of a
millimetre tall. Depth is logarithmic, because the zoom ruler spans five orders of
magnitude and a conventional depth buffer cannot.

**Surface colour comes from coherent noise sampled in world space,** at four
scales: which rock or soil you are on (~60 m), mottling within it (~15 m), meadow
and woodland patchiness (~30 m), and ground texture at walking range (~7 m). Two
consequences matter. Sampling by *position* rather than by vertex index means the
global mesh and the detail rings compute identical colours and the seam between
them vanishes — and it is smooth by construction, where a per-vertex hash turned
into visible static as soon as you stood close enough to resolve single vertices.
Low-frequency noise also displaces the biome boundaries, so they wander instead of
tracking the level curves; a colour band that follows a contour exactly is the
giveaway that you are looking at a plot rather than at a place.

**How much the colour varies scales with how harsh the ground is.** A "ruggedness"
term built from slope and altitude drives the amplitude, so meadows stay calm while
summits break into patches of granite, sandstone and basalt, with lichen on the
gentler faces, strata banding on the steep ones, and a snow line broken up by noise
rather than ringing the peak like a contour.

---

## Licence

The application code is MIT. three.js is MIT, © three.js authors; its licence is
kept at `app/vendor/LICENSE.three`.
