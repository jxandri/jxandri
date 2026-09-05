# Derivadas Parciales / Partial Derivatives

A standalone rewrite of the GeoGebra applet *Partial Derivatives* as a single
self-contained HTML file. No build step, no dependencies, no network at
runtime.

A partial derivative is the slope of the curve left when you cut the surface
with a plane that holds the other variable fixed. The original applet drew that
cut in 3D and stopped there, so the trace stayed a wire in space. This one puts
the slice beside it **as an ordinary function of one variable**, with its
secant and its tangent, because that is the sentence the topic turns on: a
partial derivative is just a derivative.

## The two panels

**The surface** `z = f(x, y)` in 3D: the point `P`, the two cutting planes, the
two trace curves, the finite-difference staircase, the tangent directions, the
tangent plane and the gradient. Drag the purple point to move `P`; drag
anywhere else to orbit. Wheel zooms, arrow keys orbit, `+`/`−` zoom.

**The slice**: `f(x, y_P)` or `f(x_P, y)` plotted flat, with the run `Δ`, the
rise `Δf`, the secant through both ends, and the tangent at `P`. The two slope
numbers are printed where they are drawn.

Four camera buttons. `X–Z` and `Y–Z` are true orthographic projections, and in
them the surface drops to 30 % opacity — edge on, the trace curve lies *inside*
the surface, and leaving it opaque would hide the one thing those buttons exist
to show.

## Δ → 0

The button that makes the definition visible. It shrinks both increments
geometrically over about 1.7 s, so the secant swings onto the tangent and the
error readout falls with it. Geometric rather than linear because the
interesting part of the approach to zero is the last decade, and a linear ramp
spends almost no time there.

On the quadratic the error is exactly proportional to `Δ`: 2 → −0.200,
1 → −0.100, 0.5 → −0.050, 0.1 → −0.010. On a **plane** it is exactly zero at
every `Δ`, however large — which is the one case where the linear
approximation costs nothing, and the reason every other function's is measured
against it.

## The verdict

The band names what is true at `P`, and it is computed rather than guessed:

| Verdict | When |
|---|---|
| The tangent plane is the function | The function is linear. Secant = tangent for any `Δ`. |
| Local maximum / minimum | Both partials vanish, `D = f_xx·f_yy − f_xy² > 0`, sign from `f_xx`. |
| Saddle point | Both partials vanish and `D < 0`. |
| Critical point, unclassified | Both vanish but `D ≈ 0`. |
| Critical point, no test available | Both vanish, but the expression has a kink and the derivatives are numerical. |
| There is no derivative here | `f` is defined at `P` but its partials are not — the apex of a cone. |
| The secant is / is not the tangent yet | Away from a critical point, by the size of the error. |

The second-derivative test runs on **symbolic** second partials: the AST is
differentiated, then the result is differentiated again. Where the expression
contains `abs`, `min` or `max` there is no symbolic derivative, the first
partials fall back to central differences, and the second ones would be a
difference of differences across the kink — noise. In that case `f_xy` and `D`
are blanked and the test is not run, rather than a classification being
invented from the noise.

## Three functions

| Family | Form |
|---|---|
| Quadratic | `a₀ − a₁x² − a₂y² − a₃xy` — dome, bowl, ridge or saddle from one family |
| Plane | `a₀ + a₁x + a₂y` |
| Custom | whatever you type, with seven presets |

The presets are `x*y`, `x^2-y^2`, `sin(x)*cos(y)`, `exp(-(x^2+y^2)/4)`,
`x^2*y`, `sqrt(x^2+y^2)` and `abs(x)+abs(y)`. The last two are there for the
two verdicts above: the cone has no derivative at its apex, and the kinked one
has no usable Hessian.

## Changes from the GeoGebra original

- **The slice panel, which was not there.** The original had only the 3D view,
  so the trace curve never appeared as a function of one variable. That is the
  whole idea, so it now has a panel of its own.
- **The quadratic is the formula the original advertised.** `g` was fixed at
  `3 − 0.1x² − 0.1y²` with no slider reaching it, while the label beside it read
  `a₀ − a₁x² − a₂y² − a₃xy`. That formula is now implemented, so `a₃` stops
  being a dead slider and one family covers the dome, the bowl, the ridge and
  the saddle. At the opening values it reproduces the original `g` exactly.
- **The tangent vectors have unit run.** The original built them as
  `c·(f_x, 0, f_x²)` and `c·(0, f_y, f_y²)` — the right direction, but scaled by
  the derivative itself, so the arrow reversed when the slope went negative and
  vanished where the derivative was zero. That is the one place a student most
  wants to see it. They are now `(1, 0, f_x)` and `(0, 1, f_y)`.
- **The gradient is drawn where it lives.** On the floor, as `(f_x, f_y)`, with
  its lift onto the tangent plane shown as the direction of steepest ascent.
  The original drew only the lifted vector, which makes the gradient look like
  something that lives on the surface.
- **The second-derivative test**, and the refusal to run it on numerical
  second differences.
- **Dead objects not carried over.** `s` had a slider and a range but entered no
  expression; `a₃` was declared and never used; `Transparente` was a second copy
  of `f` that existed only to be drawn translucently, which is a rendering
  setting here rather than an object.
- **Bilingual**, with a verdict, and a light theme for projectors.

## Expression syntax

`+ − * / ^ ( )`, functions `sqrt ln log log10 exp abs sin cos tan sinh cosh
tanh atan min max pow atan2`, constants `e` and `pi`. Implicit multiplication
works: `2xy` is `2*x*y`. `^` is right-associative and binds tighter than unary
minus, so `-x^2` is `-(x^2)`. Only `x` and `y` are variables.

Everything is hand-rolled — tokeniser, Pratt parser, closure-tree compiler,
symbolic differentiation, painter's-algorithm 3D — so there is no `eval` and a
strict CSP cannot break the page. The 3D view is canvas 2D: a height field
sorts exactly by centroid depth, so there is no depth buffer, no shader, and no
context-loss failure mode. Surface quads and every overlay go into one
depth-sorted list, because drawing the overlays afterwards would put a tangent
vector in front of a hill it is standing behind.

## Keyboard

`1`–`3` pick the function family. On the 3D panel: arrow keys orbit, `+`/`−`
zoom.
