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

A second tab holds the same economics with **three goods**, translated from the
GeoGebra file `Edgeworth_box__2_agents_3_goods.ggb`. There the box is a cube,
and the picture is drawn in a small hand-rolled 3-D renderer rather than lifted
from a library. See [Three goods](#three-goods) below.

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

## Three economies

A toggle at the top of the rail switches the model. All three are one picture
with the corner of the box rounded by different amounts, because the firm's
technology is written as a frontier rather than as a production function:

    (x/Fx)^c + (y/Fy)^c = 1,     c >= 1

At `c = 1` the frontier is a straight line and the opportunity cost is
constant; `c = 2` is the quarter ellipse of every textbook; and as `c` grows
the frontier squares off against the corner `(Fx, Fy)` — which **is** the
pure-exchange box. The exchange economy is the limit of the production one
rather than a separate thing, and the checks pin that down: with the frontier
squared off, the production model's Pareto set is the same diagonal the
exchange model gives, to one part in ten thousand.

| Model | Who is in it | What the diagram shows |
|---|---|---|
| **Exchange** | two consumers, fixed endowments | the box, the contract curve, the core |
| **Production** | two consumers and a firm | the frontier, with the rectangle being divided sliding along it; efficiency needs `MRS_A = MRS_B = MRT` |
| **Robinson** | one consumer and a firm | no division to argue about: the optimum is where `MRS = MRT` |

In the production model B's side of the box is a **residual utility**: given
what A takes, the best B can do once the firm has been told to produce
whatever suits B best. That is a one-dimensional maximisation along the arc of
the frontier that still leaves A its bundle, done once per grid cell — and
writing it as a field over the same box means the level sweep, the contour
tracer, the colour ramp and the pointer all work on a production economy
unchanged. The production point the maximisation chose is kept alongside, and
drawn: it is the far corner of the sub-box, and it moves as the two of them
trade.

A production economy has no goods endowments — people own shares of the firm
instead — so it has no core either: individual rationality needs an outside
option, and a share of a firm is worth nothing until the firm trades. The
applet says so by not drawing one, rather than by drawing the whole Pareto set
and calling it the core.

## Welfare weights, Negishi, and the second welfare theorem

These three are one mechanism, which is why they are one section.

Give the planner a weight λ and ask for the feasible allocation maximising
`λ·u_A + (1−λ)·u_B`. Sweeping λ walks the Pareto set from B's best to A's
best — the second characterisation of that set: not *where the curves are
tangent* but *what a planner with these weights would choose*. At the optimum
the common tangent is the supporting price, so the same computation hands you
the prices that decentralise the allocation and the transfer each person needs
to afford their bundle at those prices. **Negishi's algorithm** is then nothing
more than moving λ until that transfer is zero: at that weight nobody needs a
gift, and the planner's allocation is the competitive equilibrium. The checks
confirm it lands on exactly the allocation and price the excess-demand root
finds by a completely separate route.

The **second welfare theorem** layer draws the consequence. One budget line, in
its own bright hue and drawn the full width of the box, because it is a
constraint the whole diagram is divided by rather than a segment joining two
marks — and it is *both* budget constraints at once: A's is `p·x_A + y_A = m_A`
read from the bottom left, B's is `p·x_B + y_B = m_B` read from the top right,
and substituting `x_B = X − x_A` turns the second into the first. So the two
constraints are one line seen from two origins, and the two budget sets are its
two sides: A's filled red below, B's blue above, each with its own switch,
because the thing to see is that they meet exactly on the line.

Beside it a readout states the implementation in words: *implemented by prices
(p_x, p_y) = (…, 1) with transfers T_A = …, T_B = …*, and the sum, which is
zero by construction because the two incomes add up to the value of everything
there is.

The price line through the endowment is a different object and is drawn only
under the auction, where it *is* the budget line at the announced price.
Elsewhere it was a second line across the box at a price nothing on screen was
using, which next to the supporting budget line read as noise.

Three things about λ the applet does not hide:

- **λ is a coordinate, not a measure of importance.** It weights the utility
  functions as they are typed, and utility is ordinal — rewriting `u_A` as
  `2·u_A` relabels every weight without moving a single indifference curve.
- **It cannot always index the set at all.** Two people with the same
  homothetic preferences have a *straight* utility possibility frontier, and
  against a straight one every efficient allocation is supported by the same
  weight: λ is genuinely constant along the whole set. The slider still walks
  the set, and the applet says so — the readout marks λ *constant* and the
  scrubber's caption names the reason — rather than freezing the number with
  no explanation. It is also why the applet no longer **boots** into that case:
  two identical Cobb–Douglas consumers are the canonical first picture, but
  they are the one economy where the weight slider cannot demonstrate anything,
  so the default is now the asymmetric pair and the symmetric one is a preset.
- **Its useful range is narrow, and measured.** For two Cobb–Douglas consumers
  the entire Pareto set lives in a band of weights about a tenth of a unit
  wide; a slider running 0 to 1 would spend nine tenths of its travel on two
  corner allocations. The band is measured once per model — across the weights
  that pick an *interior* allocation, since at either end a marginal utility
  runs to zero or infinity — and the slider is stretched across it, while the
  readout still shows the real λ.
- **Where λ is constant, Negishi bisects along the set** rather than along λ,
  since no weight singles the equilibrium out. Same equilibrium, found from the
  other side.

The weight is **inverted rather than maximised**. Solving "maximise the
weighted sum" is the definition and also the worst way to evaluate it: against
a nearly straight frontier the weight that picks the middle and the weight that
picks a corner differ in the fourth decimal, and the slider becomes a switch.
The supporting weight is exact — a ratio of two marginal utilities of the
numéraire — and rises monotonically along the Pareto set, so the applet finds
the point whose supporting weight *is* λ. Same answer, continuous where the sum
is flat to machine precision.

## Three goods

The second tab is a translation of `Edgeworth_box__2_agents_3_goods.ggb`, which
unlike the Desmos graph behind the first tab *was* available to read: it is a
zip of XML, so every object, formula, slider range and saved value in it could
be pulled out and checked against. That makes the source file a specification
and a test fixture at the same time, and `tools/check-edgeworth3.js` compares
the applet against twenty of its stored values.

Two agents, three goods, nothing produced, so the box is a cube
`[0,O₁] × [0,O₂] × [0,O₃]`, A measured from the near corner and B from the far
one. Both agents are Cobb–Douglas, `u = x^α y^β z^γ`, and that is what keeps the
whole construction closed-form rather than searched the way the two-good tab has
to search. Maximising `ζ·ln u_A + (1−ζ)·ln u_B` good by good gives

```
x_Aj = O_j · ζ·A_j / (ζ·A_j + (1−ζ)·B_j)
```

with B taking the complement, and the price that supports it is
`p_j = (ζ·A_j + (1−ζ)·B_j) / O_j`. At those prices `MRS_A = MRS_B` for every
pair of goods, which the checks verify to eleven decimals. Sweeping ζ from 0 to
1 traces the Pareto set as a curve from A's corner of the cube to B's, and the
one ζ whose transfers vanish is the Walrasian equilibrium — which is what the
**Negishi** button finds by bisection, and what the source file's own last text
box asks the reader to find by hand.

Everything the .ggb draws is here: the cube, the Pareto curve, both
indifference surfaces through the chosen allocation, the budget plane, A's
budget set, the price vector and the two trade directions at Q, the
market-error arrow, the totals, the raw and the normalised-to-100 prices, the
demands, the market incomes, the expenditures and the transfers.

Four things were added to make it a sibling of the two-good tab rather than a
separate applet: the **Negishi** solve; **B's budget set** as well as A's, in
the same red-and-blue as the two-good box, so the budget plane is seen to
partition the cube into what each agent can pay for; the **indifference
surfaces through the endowment**, whose interior is the three-good version of
the lens of mutual gain; and the **Spanish/English** switch, the theme, and the
keyboard operation that the rest of the site already had.

### Where the source file is not followed

Four of its formulas do not survive arithmetic. The applet uses the corrected
ones, and the checks assert both the correction and the fact that the original
breaks an identity:

| In the .ggb | The problem | Used here |
|---|---|---|
| `x_b = ζ·α_b/D · O₁` (and `y_b`, `z_b`) | written with ζ where 1−ζ belongs, so A's and B's bundles do not add up to the cube — at the saved sliders they leave 0.97 of good 1 unallocated | `x_b = (1−ζ)·α_b/D · O₁` |
| `Def_A = p·ω_A − p·x_A`, labelled "Net Transfers to A" | the sign is inverted against its own label: when A is given more than its endowment buys, this goes *negative* | `T_A = p·x_A − p·ω_A`, so a transfer *to* A is positive |
| `Indi_b(x,y) = O₃ − u_b/((O₁−x)^α_b (O₂−y)^β_b)` | missing the `^(1/γ_b)` root that its own `Indi_Pb` has, so it is not a level surface of `u_B` | the root restored |
| `ParcialX = L·(p₁/p₃, 0, −p₁/p₃)` | not orthogonal to `(p₁,p₂,p₃)` unless `p₁ = p₃`, so it does not lie in the budget plane it is meant to run along | `L·(1, 0, −p₁/p₃)` |

With the first two fixed, `T_A + T_B = 0` identically — which is the whole
content of the second welfare theorem here, and which the original cannot show:
its two transfers sum to 0.110 at its own saved sliders.

One thing in the file is deliberately **not** carried over. It contains an
unfinished CES branch — sliders `φ_a`, `φ_b` feeding `ρ = 1 + log₂φ`,
`σ = 1/(1−ρ)` and a price index `P_b` — but nothing consumes it: `U_a` and
`U_b` are Cobb–Douglas, and every closed form above depends on their being so.
Wiring CES in would mean giving up the closed-form Pareto set and prices for a
numerical solve, which is a different applet, so the objects were left out
rather than shown as dead controls.

### Drawing it

There is no 3-D library. The renderer is about 200 lines: an orbit camera and
one perspective divide, primitives pushed onto a list with the depth of their
centroid, one back-to-front sort, and flat shading from each quad's own normal
so two translucent sheets do not read as mush. Surfaces are height fields
`z = f(x,y)` tessellated over the floor and clamped to the cube, so a sheet
that runs out of the box ends against the wall rather than in a ragged fringe.

The budget sets are the honest solid, not a shaded face: the cube is clipped by
the half-space `p·x ≤ p·x_A` with Sutherland–Hodgman, and the cap where the
plane cuts through is computed from the edge crossings and ordered by angle in
the cutting plane. That cap *is* the budget plane, so drawing the set draws the
plane for free, and the checks confirm that no point of A's solid costs more
than A can pay, no point of B's costs less, and every corner of the shared face
sits on the plane to within 1e-9.

Drag to turn the cube, wheel to zoom; from the keyboard, arrows turn and `+`/`−`
zoom.

## Preferences

Each person picks their own family, independently, from a menu that also shows
the algebraic form; the dials under it write the function, and the expression
the dials produce is shown back underneath. Nothing is hidden behind a
parameter you cannot see the effect of.

| Family | Form | Dials |
|---|---|---|
| Cobb–Douglas | `x^a · y^(1−a)` | the weight on *x* |
| Substitutes | `a·x + b·y` | what each good is worth |
| Complements | `min(x/a, y/b)` | how much of each goes into a unit |
| Quasilinear | `a·x^b + y` | scale and curvature |
| CES | `(a·x^r + (1−a)·y^r)^(1/r)` | the weight on *x*, and *r* |
| Typed by hand | anything the parser takes | — |

Choosing independently is the point of the interesting cases: Cobb–Douglas
against perfect complements has a contract curve that is neither family's
textbook picture, and you cannot get there from a menu of matched pairs.

CES collapses at `r = 0` — the formula is 0/0 there and the limit is
Cobb–Douglas — so that dial steps over a narrow band around zero rather than
handing the parser an infinite exponent.

Changing a dial changes the utility function, which means resampling both
fields, re-sweeping the Pareto set and re-solving the price sweep, around 45 ms.
That work is coalesced to one recompute per animation frame, so a drag stays
responsive and never shows a curve belonging to a parameter value the slider
has already left.

## The improving set

Where the two indifference curves through the allocation **cross** rather than
touch, the region between them is filled: the set of reallocations that make
both people strictly better off. It is empty exactly when the allocation is
Pareto efficient, which is the claim the whole diagram is built to make, and
watching it close as you drag onto the contract curve is the fastest way to see
why that claim is true.

A readout beside it reports the region's size as a share of the box — how much
is still on the table — and it goes to zero as the allocation reaches the
contract curve.

The region is rasterised rather than traced. Its boundary is two arcs meeting
at two crossings, and chaining marching-squares output into closed rings to
fill it would be a lot of machinery for a shape a mask draws exactly. It is
read from the sampled fields by the same linear interpolation the contours use,
so the fill lands on the curves, at a resolution set by how big the box is on
screen rather than by the sampling grid — otherwise the edge blurs up from 161
cells and sits visibly off the curves that bound it.

Under an announced price the two curves are drawn at two different
allocations — A's through A's demand, B's through B's — and the shaded set is
still the one between the curves you can see.

## What the student can do

- **Move the endowment** — ω is draggable in the diagram, not only from the
  sliders. Dragging it moves the point, not the box: what A drops, B picks up,
  so the rectangle stays put while ω slides. Both utility fields are therefore
  untouched, and the expensive half of the recompute is skipped — only what
  depends on who owns what is redone: the core, the price sweep, the equilibria
  and the Negishi weight.
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

## One diagram

The applet is the box and nothing else. It had a second panel — the utility
possibility frontier, and excess demand against the price ratio — and both were
removed on request: everything they showed is either in the box already or in
the readout under it. They are in the git history if they are ever wanted back.

The numbers that were split across two strips are now one: each person's
bundle and utility, both marginal rates and the gap between them, and, under
the planner, the weight, the supporting price, both transfers and the Negishi
weight.

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

Eight preference pairs, each generating fresh endowments and fresh dial
settings: Cobb–Douglas, opposite tastes, the auction, perfect substitutes,
perfect complements, quasilinear, CES, and one that pits two different families
against each other. Three kinds of question — put the allocation
on the contract curve, put it in the core, or find the price that clears the
market — scored on how close the answer is, with preferences and endowments
locked while a challenge is live. Progress is kept in `localStorage`.

## Utility syntax

Only the **Typed by hand** family needs this; every other family writes its own
expression from its dials.

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
| The improving set | A mask read from both fields by bilinear interpolation at display resolution, shaded by the smaller of the two percentile gains so the deepest part of the region reads as its middle. Its size is counted off the sampling grid instead, cheaply enough to report on every frame. |
| The firm | The frontier is inverted in closed form both ways; profit maximisation is a bisection on `MRT = p`, since `MRT` rises along the frontier and needs no derivative. |
| Residual utility | One golden-section maximisation along the frontier per grid cell — about 830 000 utility evaluations, and 47 ms in total, only a third more than the exchange model costs. |
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
- **A is red and B is blue** — chrome, canvas, legend and budget sets alike.
  The pair stays distinguishable under the common colour deficiencies, where
  red darkens rather than converging on the blue. Marks on
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
announced price, and that the kinked and linear cases still produce a Pareto
set.

The new economics is checked against algebra too. Robinson with `sqrt(xy)` on a
quarter circle of radius 8 puts the optimum at `x = y = 8/sqrt(2)`, and
`x^0.7 y^0.3` tilts it to `x = sqrt(44.8)`, `y = x·sqrt(3/7)` — both to three
decimals. Transfers net to zero at every weight and in every model. The
supporting price equals the marginal rate both consumers share, and with a firm
it equals the MRT as well. Negishi drives the transfer to zero and lands on the
allocation and price the excess-demand root finds independently. The weight read
back off an allocation matches the weight that chose it. And a second group of
checks drives the actual controls — the model buttons, the family selects, the
weight scrubber, the arrow keys, the Negishi button — because the model can be
right while the buttons are wired to the wrong code, which during this build
they briefly were.

The dials are checked against algebra too: a Cobb–Douglas weight of 0.8 against
0.5 on an 8×8 box puts the contract curve through `(4, 1.6)`, and two
quasilinear people with scale dials at 2 and 3 pin their vertical contract
curve at `8/(1 + (3/2)²) = 2.462` — moving one dial to 5 moves it to 1.103,
which the checks also verify. Every family is parsed at both ends of every dial
it owns. The improving set is cross-checked against the utility closures
themselves by Monte Carlo, so a bug in the grid or in the bilinear read cannot
agree with itself.

`tools/check-edgeworth3.js` does the same for the three-good tab. Because the
GeoGebra file stores the value of every object it defines, twenty of those
values are used directly as expected results — the demands, all three prices
raw and normalised, both market incomes, A's expenditure, both utilities at the
Pareto point, both utilities at the far corner, and `Def_A` — and the applet
reproduces every one of them to at least twelve decimals. The four corrected
formulas are checked in the opposite direction: that A and B now exhaust the
cube, that the transfers net to zero, that the trade directions are orthogonal
to the price vector while the file's own are not. Beyond the fixture: the
Pareto set runs from corner to corner in the maths *and* in screen
coordinates, raising the weight never takes a good away from A, Negishi lands
where each agent's textbook Cobb–Douglas demand `share × income / price` equals
what it holds, and the clipped budget solids satisfy their own inequalities.
The controls, both languages and the two-good tab are exercised too, so a
regression in either tab fails a check.

```sh
cd edgeworth-box && python3 -m http.server 8130 &
node tools/check-edgeworth.js

# and, on its own port, the three-good tab
python3 -m http.server 8131 --directory edgeworth-box &
node tools/check-edgeworth3.js
```

## Accessibility

Both canvases are keyboard-operable: the arrow keys move the allocation in the
box, and move the announced price in auction mode. Light and dark themes are
designed separately and both respond to the viewer's toggle. Numbers are
tabular. Motion respects `prefers-reduced-motion`. The interface is available
in Spanish and English, switchable at any time, and pinnable with `?lang=en`.
