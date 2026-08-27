# Efectos Ingreso y Sustitución / Income and Substitution Effects

A standalone rewrite of the GeoGebra applet *Efectos Ingreso y Sustitución* as a
single self-contained HTML file. No build step, no dependencies, no network at
runtime.

A price change moves the optimum for two reasons at once. The applet separates
them by inserting a third bundle between the start and the finish:

| | Prices | Income | Meaning |
|---|---|---|---|
| **A** | old | own | the starting optimum |
| **B** | **new** | **compensated** | the substitution step alone |
| **C** | new | own | where the consumer actually ends up |

Substitution = B − A, income = C − B, total = C − A.

## The two compensation rules

What "compensated" means is the choice the applet exists to show, and it is a
toggle:

- **Slutsky** — give exactly enough to buy the **old bundle** at the new prices,
  `m' = p'·A`. Observable, and it leaves the consumer slightly better off than
  before.
- **Hicks** — give exactly enough to reach the **old utility** at the new
  prices, `m' = e(p', u⁰)`. Not observable, but it holds welfare fixed, which is
  what the theory asks for.

The total effect is the same under both — A and C do not depend on the rule.
Only the split between the two effects changes.

## The two panels

**Plane (x, y)** — the utility map, the three budget lines (original,
compensated, final), the three bundles, the indifference curves through them,
and the two effects drawn as arrows on the x axis where they can be measured
against the numbers. Under Hicks, A and B sit on the same curve by construction.

**Demand for x** — ordinary demand against the compensated demand built from the
same rule. This is what makes the Giffen case legible: the compensated curve
always slopes down, and only the ordinary one can turn back on itself.

## How it is computed

The original carried closed forms per family. Solving numerically instead costs
a little speed and gives every family the same treatment — including the
complements and quasilinear cases it could not express, and anything typed into
the box. The optimum on a budget line is found by dense scan then golden
section, since several families here are kinked and no first-order condition
holds at the kink.

Hicks needs the expenditure function. Rather than inverting the utility, the app
bisects on income: indirect utility rises with income, so the `m` that lands on
`u⁰` is unique and easy to bracket.

The compensated demand **curve** needs a bundle at every price on the axis.
Bisecting income eighty times over would cost a hundredfold, so the compensating
set is built once — the old indifference curve for Hicks, the single old bundle
for Slutsky — and the bundle at price `p` is then just its cheapest point.

## Changes from the GeoGebra original

- **`IndiLIN`** was defined as `U_LIN(x,y) = U_INF(x(P_LIN), y(P_LIN))` — the
  right-hand side evaluates the *inferior-good* utility at the linear optimum,
  so the curve drawn for perfect substitutes was the level set of a different
  function entirely.
- **`IndiS_INF`** used `U(xS_INF, yS_INF)` — the fixed `x^0.3·y^0.7` left over
  from an earlier construction — instead of `U_INF`, so the substitution
  indifference curve for the inferior good was wrong.
- **`IndiT_LIN` and `IndiS_LIN`** both read `U_LIN(xT_LIN, y*T_LIN)`. `T_LIN` is
  a slider, so `y*T_LIN` is a multiplication, not the variable `yT_LIN`; and
  both used the **T** bundle, so the substitution curve and the total curve
  coincided.
- **`XinfPy`** was `Point({p_y, y_INF})` using the stray slider `p_y` rather
  than `p_Y`.
- **`pXlow`/`pXhigh`** return large negative numbers for every reachable setting
  and are displayed nowhere. `X_CD`, `P_X`, `p`, `d`, `dx`, `dp_X`, `oin`, `V`,
  `S`, `Q_X`, `LB`, `giffen` and the `A = Point(Circle[...])` leftover were not
  carried over.
- **Prices could be zero.** `p_X` and `p_Y` sliders started at 0, and the price
  change sliders are now bounded by the price they move so a price can never be
  driven to zero or below.
- **Every family gets both rules.** The original computed `EfectoSustitucionY`
  and friends for CD, CES and INF but left the linear ones as bare sliders
  holding the constant 1, so the linear case reported nonsense effects.

## Utility syntax

`+ − * / ^ ( )`, functions `sqrt ln log log10 exp abs min max sin cos tan`,
constants `e pi`. Implicit multiplication works. Everything is hand-rolled —
tokeniser, Pratt parser, closure-tree compiler, marching squares — so there is
no `eval` and a strict CSP cannot break the page.
