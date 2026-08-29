# Beneficios, Costos y Oferta / Profit, Costs and Supply

A standalone rewrite of the GeoGebra applet *Beneficios y Costos* as a single
self-contained HTML file. No build step, no dependencies, no network at runtime.

**Manual:** [`dist/Firm-Supply-Guia.pdf`](../dist/Firm-Supply-Guia.pdf) (español) · [`dist/Firm-Supply-Guide.pdf`](../dist/Firm-Supply-Guide.pdf) (English)

The competitive firm in the short run: capital is fixed, the price is given, and
the only choice is how much to produce. The original applet drew that problem.
This one draws it **twice, side by side**, because the answer to it — repeated at
every price — is the firm's supply curve.

## The two panels

**The firm's problem**, on the right, in either of two views:

- **Marginals** — marginal cost, average cost and average variable cost, all in
  $ per unit, with the price line, the optimum, the variable-cost area under MC
  and the producer-surplus area between p and MC.
- **Totals** — total cost, total revenue and profit in $, with the tangent of
  slope `p` touching the cost curve at `q*`. The first-order condition drawn
  rather than asserted: the tangent is parallel to the revenue line.

**The firm's supply**, on the left, in `(q, p)`: the inverse supply curve, the
shutdown and break-even prices, the price line, `q*(p)`, and producer surplus.

In the marginals view the two panels share **both axes exactly** — same `q`
range, same `p` range, same pixels — so marginal cost is drawn at the same place
in both. Marginal cost is then laid over the supply curve as a dashed red line,
and above the shutdown price the dashes sit exactly on the cyan. That is the
whole point of the pairing. In the totals view the vertical axis becomes money
rather than money per unit; the quantity axis stays shared and the panel header
says which of the two you are looking at.

Dragging anywhere in a panel whose vertical axis *is* the price moves the price.

## Four cost functions, all from the original

| | |
|---|---|
| **Quadratic / power** | `c(q) = F + a·q^k`. With `k > 1` marginal cost rises from zero, so the firm produces at any positive price and never shuts down. |
| **Custom** | Type `c(q)`. Marginal cost is differentiated symbolically. The default cubic gives the textbook U-shaped average variable cost and a strictly positive shutdown price. |
| **Cobb–Douglas production** | `f(K,l) = b(K^β l^(1−β))^s`, inverted for `l(q)` and priced at `w`: `c(q) = rK + w b^(−e) K^(−β/(1−β)) q^e`, with `e = 1/((1−β)s)`. |
| **Logistic log-CD production** | `g(K,l) = bK^γ / (1 + e^(−s(ln f − m)))`, giving `c(q) = rK + w e^(m/(1−β)) K^(−β/(1−β)) (q/(Q̄−q))^e` with capacity `Q̄ = bK^γ`. |

The last one is the interesting one: output cannot exceed `Q̄` however much
labour is hired, so marginal cost runs to infinity there and supply gets a
vertical asymptote. That is what a fixed capital does in the short run.

The Cobb–Douglas one carries the opposite lesson. Everything turns on
`e = 1/((1−β)s)`: above 1 marginal cost rises and the problem has a solution,
at or below 1 every extra unit adds profit and it does not. The applet says so
instead of drawing something meaningless.

## How the optimum is found

Not from `MC = p`. That condition has two roots on a cubic cost, one of them a
*minimum* of profit, and with any non-convex cost the global optimum can be a
corner instead. Profit is maximised directly: a 700-point scan over the whole
feasible range, golden-section refinement of the best bracket, then a comparison
against shutting down — which is a real candidate, not a limiting case.

Supply is traced the same way, by solving the firm's problem at each of 140
prices rather than by inverting marginal cost. That is the only way to get the
jump right: below the shutdown price the answer is `0`, at it the answer leaps to
a strictly positive quantity, and no inversion of `MC = p` produces that leap.

Producer surplus is drawn in both panels, and the two regions are deliberately
different shapes. On the right it is the area between `p` and `MC` out to `q*`;
on the left it is the area between the price axis and the supply curve from the
shutdown price up to `p` — the integral of `q*(P) dP`. With a jump at the
shutdown price the two regions *cannot* coincide, but their areas do, and both
equal revenue minus variable cost, and profit plus fixed cost. All four agree to
five decimals in every family.

## Changes from the GeoGebra original

- **Two panels instead of one.** The original drew total cost, total revenue,
  profit, marginal cost and average cost on one pair of axes. Money and money
  per unit share no scale, so the marginal curves were unreadable against the
  totals. They are separated here, and the marginal panel is locked to the
  supply panel's scale.
- **The supply curve, which was not there at all.** Along with the shutdown
  price, the break-even price, the jump between them, and the elasticity of
  supply.
- **The optimum is a maximisation, not an intersection.** `Eq: CM(x) = p` was
  intersected with the axis and the result used as the right end of a
  `Max[Beneficios, 0, x(A)]`. On a cost curve whose marginal cost is not
  monotone that bracket is the wrong one, and when `MC = p` has no root the
  chain produced `NaN` and the applet went blank.
- **Shutting down is a candidate.** The original always compared against an
  interior maximum. Here `π(0) = −F` competes with it, which is what makes the
  shutdown price exist and the supply curve start where it does.
- **An infimum is not a minimum.** Average variable cost that merely decreases
  towards zero has no minimum, so there is no shutdown price — reporting the
  smallest sampled value as one gave a shutdown price of `7.7e-4`. Both averages
  now report whether their minimum is attained.
- **Sliders bounded away from division by zero.** `β = 1` divides by `1 − β`,
  `K̄ = 0` raises zero to a negative power, `w = 0` and `a = 0` make cost
  constant, and `k = 1` makes marginal cost constant. All were reachable in the
  original; all are bounded away here.
- **`m` widened** from `[0, 1]` to `[−1, 2]`, where it actually moves the cost
  level enough to see.
- **Bilingual, and a verdict.** Every state of the problem — profit, loss above
  the shutdown price, shutdown, break-even, against the capacity, no optimum —
  is named and explained in Spanish and English, because the shapes on their own
  do not say which case a student is looking at.
- **Dead objects not carried over.** `AreaProfi`, `CM2` (a copy of `CM`), `eq1`,
  `A`, `prueba` and `prueba2` were plumbing for the GeoGebra construction rather
  than objects with meaning.

## Expression syntax

In the cost box the variable is `q`; `x` is accepted too, because that is what
GeoGebra called it. `+ − * / ^ ( )`, functions `sqrt ln log log10 exp abs sin
cos tan min max pow`, constants `e` and `pi`. Implicit multiplication works, so
`2q`, `3(q+1)` and `2sqrt(q)` all parse. Marginal cost is differentiated
symbolically; where the expression has a kink (`min`, `max`, `abs`) it falls
back to a central difference, which is what the picture shows anyway.

Everything is hand-rolled — tokeniser, Pratt parser, closure-tree compiler,
symbolic differentiation — so there is no `eval` and a strict CSP cannot break
the page.

## Keyboard

`1`–`4` pick the cost function, `m` and `t` switch the firm panel between
marginals and totals.
