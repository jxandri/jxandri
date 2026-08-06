# Gradient Peaks

A light 3D sandbox for teaching surface plots of differentiable functions of two
variables — and the geometry of maximising them over a constraint set.

Students type a function `f(x, y)` and a feasible set, and then **walk around on
the graph** in first person, third person, or from a flying drone. The surface is
dressed as real terrain — forest, rock, snow, lakes — so that the abstract object
`z = f(x, y)` becomes a landscape you can stand on, with level curves under your
feet, partial derivatives drawn on the ground around you, and a shaft of light
marking the constrained optimum.

Everything runs in the browser. No install, no plugin, no account.

---

## Running it

Any static web server works, because the app is just files.

```sh
cd app
python3 -m http.server 8000
# then open http://localhost:8000
```

It must be served over `http://` or `https://`, not opened as a `file://` path —
ES modules and the service worker both require an origin.

---

## What's in it

| | Feature |
|---|---|
| **1** | Surface plot of any `f(x, y)` typed into a dialog box, over an adjustable domain |
| **2** | Realistic terrain dressing: trees, grass, rocks and snow placed *on top of* the smooth surface, plus translucent water filling every depression where `f < 0` |
| **3** | **Feasible set** from typed constraints, drawn as glowing frontier walls, with a toggle that turns everything outside translucent |
| **4** | First person, third person (over-the-shoulder), and a free-flying drone with a straight-down map view |
| **5** | **Level curves** by marching squares, plus topographic hypsometric colouring; the HUD always shows `(x, y)` and the height |
| **6** | **Derivative disc** of 1 m or 2 m radius around the explorer, with `∂f/∂x` in blue, `∂f/∂y` in red and `∇f` in double-width teal — each drawn following the curved surface, each reporting both its instantaneous and its average rate of change |
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
| Drone up / down | `Space` / `Ctrl` |
| Views | `1` first person · `2` third person · `3` drone · `T` straight down · `R` recentre |
| Toggles | `C` level curves · `M` topographic colours · `F` frontier walls · `G` translucent outside · `H` highlight disc · `X` `Y` `V` `B` the four arrows · `P` tangent plane · `O` optimum |
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
character position; it cannot produce code.

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

**A high-resolution patch follows the explorer.** Without it, zooming down to
10⁻⁴ would park the student on a single enormous flat triangle and the surface
would look linear for entirely the wrong reason. The patch re-samples `f` at the
current zoom, and is lifted clear of the coarse mesh by the measured gap between
them. Depth is logarithmic, because the zoom ruler spans five orders of magnitude
and a conventional depth buffer cannot.

---

## Licence

The application code is MIT. three.js is MIT, © three.js authors; its licence is
kept at `app/vendor/LICENSE.three`.
