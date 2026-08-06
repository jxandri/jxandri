# Óptimo del Consumidor / Consumer Optimum

A standalone rewrite of the GeoGebra applet
[*Maximización de Utilidad, Curvas de Nivel y…*](https://www.geogebra.org/m/ucqksspr)
as a single self-contained HTML file — no build step, no dependencies, no network
access at runtime. Open `index.html` in any browser, or serve the folder anywhere
static.

Two goods, monotone preferences, a differentiable utility function, parametrised
linear prices and income. The 2D textbook diagram and the 3D utility surface are
two views of one model: move the bundle or the level curve in either panel and
the other follows.

## What the student can do

- **Pick the bundle** — drag `P` along the budget line and hunt for the highest
  indifference curve.
- **Raise the level curve** — sweep `u` until the curve meets the budget line at
  exactly one point (or lies along it, for perfect substitutes).
- **Free point** — move `P` anywhere in the quadrant, inside or outside the
  feasible set.

Both panels are draggable. In 3D the pointer is ray-marched into the height
field, so the bundle lands where the cursor visually touches the terrain.

## Layers

Utility map, background contours, the swept level curve, the indifference curve
through `P`, the feasible set, the budget slice lifted onto the surface, the
tangent at `P`, the gradient, the partial derivatives, the cutting plane, the
floor grid, an affordable-only shading of the surface, the true optimum, and a
trail of swept curves.

## Challenge mode

Six preference families, each generating fresh prices and income:
Cobb–Douglas, asymmetric Cobb–Douglas, perfect substitutes, perfect complements,
quasilinear, and CES. Prices, income and the utility function lock while a
challenge is live. Checking an answer reveals the optimum, scores the attempt,
and explains *which* optimality condition applied — tangency, a kink, or a
corner. Progress is kept in `localStorage`.

## Utility syntax

`+ − * / ^ ( )`, functions `sqrt ln log log10 exp abs min max sin cos tan`,
constants `e pi`. Implicit multiplication works: `2xy` is `2*x*y`,
`x^(1/3)y^(2/3)` parses as expected. `^` is right-associative and binds tighter
than unary minus, so `-x^2` is `-(x^2)`.

## How it works

Everything is hand-rolled so the page stays self-contained:

| Piece | Approach |
|---|---|
| Expression language | Tokeniser → Pratt parser → AST → closure tree. No `eval`/`new Function`, so a strict CSP cannot break it. |
| Partial derivatives | Symbolic differentiation over the AST, with constant folding. Falls back to central differences when the expression contains `min`, `max` or `abs` — exactly the kink cases. |
| Level curves | Marching squares over a 141×141 sampled field, with saddle disambiguation and NaN-cell skipping. |
| Optimum | Dense scan then golden-section refinement along the budget line, then classification into interior / kink / corner. Robust where a first-order condition finds nothing. |
| 3D surface | Painter's algorithm on canvas 2D. A height field sorts exactly by centroid depth, overlays composite without a depth buffer, and there is no shader or context-loss failure mode. |
| 3D picking | Ray-march the unprojected pointer ray against the height field, then bisect. |

## Changes from the GeoGebra original

Beyond the visual rebuild, several things behave differently on purpose:

- **Colour ramp.** The original tinted level curves with three piecewise-linear
  channel functions (`redfun`, `greenfun`, `bluefun`) whose lightness dipped in
  the middle, so two different utility levels could land on nearly the same
  tone. The replacement ramp keeps L\* rising monotonically from deep water to
  snow, so it reads as terrain *and* as an ordered magnitude.
- **Colour range.** `uMIN`/`uMAX` were read off two domain corners
  (`f(x_C,y_C)`, `f(x_G,y_G)`). For `ln(x) + y` that lower corner is −∞ and the
  ramp collapses. The rewrite takes the 2nd percentile of the sampled field.
- **Domain.** The `x_C`, `y_C` sliders reached −10, which puts `sqrt(x)` and
  `ln(x)` outside their domain. The quadrant is now clamped to `x, y ≥ 0`.
- **Budget parametrisation.** `x_s` ranged over `[x_C, x_G]` rather than
  `[0, m/p_x]`, so the "bundle" could sit at negative `x` with `y` above the
  budget line. It is now parametrised by `t ∈ [0, m/p_x]`.
- **Prices.** `p_X` and `p_Y` sliders started at 0, making `y_s = (m − p_X x)/p_Y`
  and the budget curve's domain `m/p_X` divide by zero. Prices are now bounded
  below by 0.2.
- **MRS labelling.** The original displayed `−f_x/f_y` under a label reading
  `RMS := (∂u/∂x)/(∂u/∂y)`. MRS is now reported positive as `f_x/f_y` and
  compared directly against `p_x/p_y`, with the tangency gap as its own readout.
- **Dead objects.** The construction carried leftovers from the applet it was
  copied from — `afin`, `text1` (referring to `a_0, a_1, a_2`, which do not
  exist in the file), `BooleFuncion`, `BooleTransparente`, `BooleMostrarVar`,
  `BooleIntersecciones`, `BooleTangent`, `BooleTanPlane`, `s`, `Impl`, `Boole`,
  `DX`. None were carried over.
- **Performance.** The utility field, the contour set and the 3D mesh are cached
  and invalidated by key, so dragging the bundle no longer re-evaluates the
  whole field.

## Accessibility

Both canvases are keyboard-operable (arrow keys move the bundle or the level;
`+`/`−` zoom the 3D view). Light and dark themes are designed separately and
both respond to the viewer's toggle. Numbers are tabular. Motion respects
`prefers-reduced-motion`.
