# Restricciones Presupuestarias No Lineales / Non-Linear Budget Constraints

A standalone rewrite of the GeoGebra applet *Max. Utilidad — Rest. Presupuestaria
No Lineal* as a single self-contained HTML file. No build step, no dependencies,
no network at runtime.

**Manual:** [`dist/Nonlinear-Budget-Guia.pdf`](../dist/Nonlinear-Budget-Guia.pdf) (español) · [`dist/Nonlinear-Budget-Guide.pdf`](../dist/Nonlinear-Budget-Guide.pdf) (English)

Seven schemes bend the budget line in different places, and the question in every
one is the same: where does the best affordable bundle land, and does it land on
the fold?

| # | Scheme | Frontier |
|---|---|---|
| 0 | Simple constraint | the textbook line |
| 1 | In-kind subsidy, non-exclusive | flat to `x_s`, then the market rate — a kink |
| 2 | Partial in-kind, non-exclusive | `(1−s)p` to `x_s`, then `p` — a shallower kink |
| 3 | Exclusive subsidy (public schools) | take `x_s` free **or** buy at `p` — a vertical drop |
| 4 | Partial exclusive | discount on the first `x_s`, forfeited if you exceed it |
| 5 | Cash equivalent (full) | income `m + p_x·x_s`, straight |
| 6 | Cash equivalent (partial) | income `m + s·p_x·x_s`, straight |

Scheme 1 pairs with 5, and 2 with 6: the same cost to whoever funds the
programme, with no strings attached. Putting one against the other is what the
**Compare with** control is for, and it is the point of the applet.

`s < 0` turns the subsidy into a tax of rate `τ = −s` on the first `x_s` units.

## What the two panels show

**Plane (x, y)** — the utility map under a topographic ramp, everything out of
reach veiled over, the frontier of the chosen scheme, the compared scheme behind
it, the indifference curve through the optimum, and the vertices.

**Utility along the constraint** — `u(x, f(x))` as x runs along the frontier. Its
peak *is* the optimum, so "find the best affordable bundle" becomes "find the top
of this curve". On schemes 3 and 4 the curve visibly breaks in two: that gap is
the forfeited subsidy.

## How the optimum is found

A first-order condition is the wrong instrument here. On these frontiers the best
bundle is very often at a kink, where the slope is undefined and no tangency
holds; on the exclusive schemes it sits at the right end of the first piece with
a strictly worse point immediately to its right. So every piece is scanned
densely, the best interior sample is refined by golden section, and then every
vertex is tested explicitly — both sides of every join. Whichever wins that
comparison is the optimum, and where it came from is what classifies it as a
tangency, a kink, a corner, or the edge of a drop.

## Changes from the GeoGebra original

- **Discontinuities are modelled, not approximated.** The original wrote schemes
  3 and 4 as single `If[...]` functions, which GeoGebra draws with a connecting
  segment across the jump. Each scheme here is a list of separate pieces, so the
  drop stays a drop and the utility profile breaks where it should.
- **Colour range.** `uMIN := U(0.001, 0.001)` is undefined for the Stone-Geary
  utility, whose domain needs `x > x̲`; the ramp collapsed to a single colour for
  the whole "x inferior" example. The rewrite takes the 2nd percentile of the
  sampled field.
- **`uMAX`** used the same x-derived value for both coordinates, and exceeded
  `ȳ` often enough to return NaN. Same fix.
- **Prices.** `p_X` and `p_Y` sliders started at 0, making `I/p_Y` and the whole
  construction divide by zero. Both are bounded below by 0.2.
- **`x_s` and `x̲`** are clamped to what the income can actually buy, so the
  allowance can never exceed the budget and the Stone-Geary utility stays
  defined.
- **Dead objects.** `pXlow` and `pXhigh` were computed from a formula that
  returns large negative numbers for every setting the sliders allow, and were
  displayed nowhere. Not carried over.
- **The cash comparison is computed**, not left for the reader to eyeball: the
  cost of each scheme and the utility difference against the equal-cost cash
  transfer are readouts.

## Preferences

The same families as the Consumer Optimum applet, so a student moving between
the two meets the same menu:

| Family | Form |
|---|---|
| Cobb–Douglas | `x^a · y^(1−a)` |
| Perfect substitutes | `a·x + (1−a)·y` |
| Perfect complements | `min(a·x, (1−a)·y)` |
| Quasilinear | `8a·ln(x) + y` |
| Generalised CES | `[1/(2a) + 1/(2(1−a))]⁻¹ · (a·x^ρ + (1−a)·y^ρ)^(1/ρ)` |
| X inferior | `ln(x − x̲) − 1/(1−β)·ln(ȳ − y)` |
| Custom | whatever you type |

One weight `a` runs through all of them: the exponent in Cobb–Douglas, the
relative value in the linear and Leontief cases, the share in the CES.

Two notes on the generalised CES. Its leading factor is written internally as
`2a(1−a)`, which it equals identically — `1/(2a) + 1/(2(1−a))` collapses to
`1/(2a(1−a))`. Worth doing rather than transcribing, because the literal form
divides by zero at both ends of the `a` slider while `2a(1−a)` simply goes to
zero there. Being a positive constant it rescales utility without touching
preferences or the optimum. And at `ρ = 0` the CES is undefined while its limit
is Cobb–Douglas, so a slider resting on zero emits that limit rather than
dividing by it.

## View

- **Heat gradient** — turn the utility map off and the background goes plain.
  The indifference curves keep their height colour at all times: with the map
  showing it agrees with the ground underneath, and with the map off it is the
  only reading of height left.
- **Substitution panel** — the utility-along-the-constraint reading is a
  supporting view, so it takes the smaller share of the width and can be
  dismissed entirely, giving the plane the full frame.
- **Axes** — fixed by default, set by the `x ≤` and `y ≤` boxes. An axis that
  refits on every slider move renumbers as you drag, and then two settings
  cannot be compared by eye, which is the whole point of putting a scheme and
  its cash equivalent on one picture. Auto-fit stays available, and a warning
  appears if a frontier runs outside a fixed frame rather than being silently
  cropped.

## Utility syntax

`+ − * / ^ ( )`, functions `sqrt ln log log10 exp abs min max sin cos tan`,
constants `e pi`. Implicit multiplication works: `2xy` is `2*x*y`. `^` is
right-associative and binds tighter than unary minus, so `-x^2` is `-(x^2)`.

Everything is hand-rolled — tokeniser, Pratt parser, closure-tree compiler,
symbolic differentiation, marching squares — so there is no `eval` and a strict
CSP cannot break the page.
