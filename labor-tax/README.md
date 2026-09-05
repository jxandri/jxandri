# Impuesto a la Renta del Trabajo / Labour Income Tax

A standalone rewrite of the GeoGebra applet *Restricción Presupuestaria con
Impuesto a la Renta* as a single self-contained HTML file. No build step, no
dependencies, no network at runtime.

**Manual:** [`dist/Labour-Tax-Guia.pdf`](../dist/Labour-Tax-Guia.pdf) (español) · [`dist/Labour-Tax-Guide.pdf`](../dist/Labour-Tax-Guide.pdf) (English)

Three rates and two thresholds, both on labour income `Y = w·L`, with the time
endowment normalised to 1 so `L` is the fraction of it worked and `ℓ = 1 − L` is
leisure. Consumption affordable at labour `L` is

```
c(L) = ( m₀ + w·L − T(w·L) ) / pₓ
```

## The two modes, which are the point

**Marginal rates.** Each rate applies only to the income falling inside its own
bracket. Net income is continuous and concave, so the frontier **kinks**. An
optimum can land exactly on a kink — which is why tax data shows people bunched
just below a threshold. It is not evasion; it is the optimum.

**Average rates.** The bracket you land in sets the rate on *all* your income.
Net income **jumps down** at every threshold, so earning one unit more can leave
you strictly poorer. That is a notch, not a kink, and the optimum gets pinned
just below it.

At the defaults (`w = 50`, `m₀ = 10`, rates 0 / 0.4 / 0.8, thresholds 20 and 30)
average rates take net income from 19.99 to 12.01 across the first threshold.

## The two panels

**Consumption and leisure** — the utility map under a topographic ramp,
everything unaffordable veiled over, the frontier with its kinks or notches, the
thresholds, the indifference curve through the optimum, and the optimum itself.
The vertical axis switches between leisure and labour; the utility is always read
on leisure, so flipping the axis genuinely re-reads preferences rather than
mirroring a picture.

**Net income** — net against gross labour income with the 45° line for
reference. Preferences play no part here, which is the point: the notch is a
property of the schedule, not of the worker. Switch it to **Utility** to see
`u(c(L), 1−L)` along the frontier; under average rates that curve breaks into
disconnected arcs, and the peak sits at a threshold.

## How the optimum is found

Not from a first-order condition. The best point is usually the kink at a
threshold, or under average rates a point pinned just below a notch with a
strictly worse point immediately to its right. Every piece of the frontier is
scanned and refined by golden section, then every vertex is tested from both
sides, each on its own bracket's formula. Whichever wins classifies the optimum
as a tangency, a kink, the edge of a drop, or a corner.

## Changes from the GeoGebra original

- **One tax base.** `TAX_LABOR` taxed `w·L`, but the average-rate branch `l1`
  taxed `w·L + I₀`. The two modes were therefore not comparable at exactly the
  moment you want to compare them. Both tax labour income here.
- **Discontinuities are modelled.** The original wrote the schedule as nested
  `If[...]`, which GeoGebra draws with a segment bridging the gap. Each bracket
  is a separate piece here, so a notch stays a notch.
- **Each piece carries its own bracket.** Looking the bracket up from the income
  makes `c(L)` single-valued at a threshold, which silently loses the left-hand
  limit — the highest point of the frontier. It was falling outside the computed
  view and being clipped.
- **Preferences and an optimum.** The original drew the budget set only. Without
  an optimum the kink and the notch are shapes rather than predictions, so a
  utility function, the indifference curve through the optimum, and the bunching
  verdict are added.
- **`p_X` and `w` sliders started at 0**, dividing by zero throughout. Both are
  bounded away from it.
- **`s₁ < s₀`** would inverse the schedule; the second threshold is held at or
  above the first.
- **Dead objects.** `s₂` had a slider and a label but never entered `TAX_LABOR`;
  `a`, `b`, `f`, `ngreso`, `E`, `E_trace`, `Pendiente`, `B_OCIO`, `B_TRABAJO`,
  `h_TRABAJO` and the `Q`/`P` point set were leftovers from the applet this was
  copied from. Not carried over.

## Utility syntax

In the expression box `x` is consumption and `y` is leisure. `+ − * / ^ ( )`,
functions `sqrt ln log log10 exp abs min max sin cos tan`, constants `e pi`.
Implicit multiplication works. Everything is hand-rolled — tokeniser, Pratt
parser, closure-tree compiler, marching squares — so there is no `eval` and a
strict CSP cannot break the page.
