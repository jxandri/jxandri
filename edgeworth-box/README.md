# La Caja de Edgeworth / The Edgeworth Box

A standalone rewrite of the Desmos calculator
[*2D Edgeworth Box*](https://www.desmos.com/calculator/7a231ef6a8) as a single
self-contained HTML file — no build step, no dependencies, no network access at
runtime. Open `index.html` in any browser, or serve the folder anywhere static.

Two people, two goods, nothing produced: only what is already there to divide.
The box is as wide as the total endowment of *x* and as tall as the total of
*y*, A is measured from the bottom left and B from the top right, and every
point of the rectangle is a complete description of who has what. The diagram
and the utility space are two views of one model: move the allocation or the
price in either panel and the other follows.

## On the source

The Desmos graph could not be read while this was built — `desmos.com` is
blocked by the network egress policy of the build environment, at the proxy,
for every path including the state endpoint. So this is a rebuild of the
standard construction rather than a line-by-line transcription of that
particular file: every object a 2D Edgeworth box carries is here, and both
preferences, both endowments and the price ratio are parameters rather than
constants, so any specific graph is a setting of this one. What is *not* here
is a reconciliation against the original's own choices — its utility
functions, its slider ranges, its labelling. Paste the graph's expression list
and those can be matched.

## What the student can do

- **Divide by hand** — drag the allocation anywhere in the box. The lens drawn
  from it is the set of allocations both people prefer; while that lens is not
  empty, the division is not efficient.
- **Trade from the endowment** — the same drag, but the edge of the lens at ω
  is a wall. Nobody accepts being made worse off, so the allocation cannot
  leave the set of trades both would sign.
- **Run a Walrasian auction** — announce a price ratio, watch each person
  demand what they like at it, and hunt for the price at which the two demands
  are the same allocation.

Both drags work with the mouse, with a finger, and with the arrow keys.

## The second panel

| Button | Shows |
|---|---|
| `u_A–u_B` | the utility possibility frontier, the individually-rational rectangle, and the core as their intersection |
| `z(p)` | excess demand for *x* against the announced price ratio, on a logarithmic price axis, with every equilibrium marked |

The frontier is not a second computation. The sweep that traces the contract
curve across the box records (*u_A*, *u_B*) at every step; plotting those pairs
instead of those points **is** the frontier, so the core highlighted on one is
the core highlighted on the other by construction rather than by agreement.

`z(p)` is the honest way to show that the number of equilibria is a question
and not a given: its zeros are the Walrasian prices, and you can watch them
appear, move and merge as the endowments change.

## Layers

Lens of gains, both families of indifference curves, the two curves through the
allocation, the contract curve, the core marked on it, the price line through
the endowment, each person's demand at the announced price, both offer curves,
and the Walrasian equilibria. The map behind them can show the lens (the
default), A's utility, B's utility, or nothing.

The gains map is this applet's own, and it is the default because the question
the box exists to ask is not "how high is utility here" but "who is better off
here than there". Where both gain it ramps green through gold; where only one
gains it carries that person's hue at a tenth of the strength; where neither
gains it is empty. Both utilities are measured in *percentile rank within the
box* for this purpose, since nothing in the model makes utils of `sqrt(xy)`
comparable with utils of `x + 2y`.

## Challenge mode

Seven preference pairs, each generating fresh endowments: Cobb–Douglas,
asymmetric Cobb–Douglas, the auction, perfect substitutes, perfect
complements, quasilinear, and CES. Three kinds of question — put the allocation
on the contract curve, put it in the core, or find the price that clears the
market — scored on how close the answer is, with preferences and endowments
locked while a challenge is live. Progress is kept in `localStorage`.

## Utility syntax

`+ − * / ^ ( )`, functions `sqrt ln log log10 exp abs min max sin cos tan`,
constants `e pi`. Implicit multiplication works: `2xy` is `2*x*y`,
`x^(1/3)y^(2/3)` parses as expected. `^` is right-associative and binds tighter
than unary minus, so `-x^2` is `-(x^2)`.

`u_B` is written in B's own variables and evaluated at B's own bundle. Typing
`x^0.5*y^0.5` into both boxes gives two identical people, not two people who
both want the bottom-left corner.

## How it works

Everything is hand-rolled so the page stays self-contained:

| Piece | Approach |
|---|---|
| Expression language | Tokeniser → Pratt parser → AST → closure tree. No `eval`/`new Function`, so a strict CSP cannot break it. |
| Partial derivatives | Symbolic differentiation over the AST, with constant folding. Falls back to central differences when the expression contains `min`, `max` or `abs` — exactly the kink cases. |
| Indifference curves | Marching squares over two 161×161 sampled fields, with saddle disambiguation and NaN-cell skipping. Levels are nudged one part in a million off the sampled values, because `min(x,y)` is flat over whole cells and a level landing exactly on a plateau produces no crossing at all. |
| Contract curve | Hold A on one indifference curve, find where B does best on it, sweep A's curve upward. Levels are spaced by quantile rather than uniformly, so the sweep spends its samples where the box is rather than in the tail a logarithmic utility drags to minus infinity. |
| …refined | Each swept point is then lifted off the grid by projected gradient ascent — step along A's level curve in the direction that raises B, Newton back onto the level curve, halve the step when it fails to improve. On two symmetric Cobb–Douglas consumers this takes the maximum error from half a cell to 2·10⁻⁴; on the quasilinear pair it lands the vertical contract curve on its analytic value to three decimals. |
| Pareto filter | The swept points are reduced to their skyline: keep a point only if nothing with more *u_A* also has more *u_B*. Ties are kept, because a whole plateau of them is the right answer for perfect substitutes. |
| Demand | Dense scan then golden-section refinement along the budget line. A first-order condition finds nothing at the kink of `min(x,y)` and the wrong thing at the corner solution of `x + 2y`; a scan finds both. |
| Equilibrium | Every sign change of excess demand over a logarithmic price sweep, refined by bisection in log price. There can be more than one, and with perfect substitutes excess demand jumps across zero rather than crossing it — that case is reported as a jump rather than rounded to `z = 0`. |
| The map | Rasterised at the sampling resolution of the fields and blitted with smoothing, not evaluated per screen pixel: the gains map is redrawn on every pointer move, and painting from the same grid the contours are traced from makes the shading and the curves agree exactly rather than nearly. |
| Ranks | The percentile rank of every grid cell is computed once per sampling. Doing 26 000 binary searches per frame to shade the lens was the one thing in this applet that could be felt. |
| Cased curves | A curve is emitted as one batched path and stroked twice. Stroking segment by segment lets each casing overpaint its neighbour's core, and the line comes out beaded. |

## Decisions taken in the rebuild

- **Both origins are drawn and ticked.** Which corner you are measuring from is
  the one thing the diagram asks you to keep straight, so B's axes are drawn
  along the top and the right with their numbers running backwards rather than
  left to be inferred.
- **The box's shape is data.** It is as wide as the total endowment of *x* and
  as tall as the total of *y*, letterboxed inside a square panel rather than
  stretched to fill it, so that equal steps in the two goods are equal steps on
  the screen and the diagonal means what it looks like.
- **A is blue and B is orange** — chrome, canvas and legend alike. It is also
  the one pair of hues that survives the common colour deficiencies. Marks on
  the canvas are fixed bright values with a dark casing rather than theme
  tokens, because they are drawn over saturated ground in both themes.
- **The contract curve is found by search, not by solving MRS_A = MRS_B.**
  Three of the seven preference pairs are cases where that equation either has
  no solution or has a segment of them.
- **Excess demand is scaled by the box, not by the data.** `z_x` runs to
  infinity as the price of *x* goes to zero, and scaling to the data flattened
  the interesting part into the axis; the plot is two box widths tall and
  clips.
- **The lens is a wall, not a warning.** In trade mode a drag that would leave
  the lens is walked back to its boundary by bisection along the drag itself,
  so the claim the mode is making is something you can feel rather than
  something a readout tells you afterwards.
- **A price ratio gets a logarithmic slider.** A ratio is a ratio; a linear
  slider spends nine tenths of its travel above p = 10.

## Checks

`tools/check-edgeworth.js` drives the page in a headless browser and checks the
model against arithmetic that can be done by hand: that two symmetric
Cobb–Douglas consumers have the diagonal for a contract curve, that their
equilibrium price ratio is exactly 1 and clears both markets, that the
quasilinear pair `2√x + y` and `ln x + y` gives a vertical contract curve at
`x_A = ((√33 − 1)/2)² = 5.628`, that both people set their MRS equal to an
announced price, that the kinked and linear cases still produce a Pareto set,
and that the lens really does hold the allocation in.

```sh
cd edgeworth-box && python3 -m http.server 8130 &
node tools/check-edgeworth.js
```

## Accessibility

Both canvases are keyboard-operable: the arrow keys move the allocation in the
box, and move the announced price in auction mode. Light and dark themes are
designed separately and both respond to the viewer's toggle. Numbers are
tabular. Motion respects `prefers-reduced-motion`. The interface is available
in Spanish and English, switchable at any time, and pinnable with `?lang=en`.
