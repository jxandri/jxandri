# El Robot Escalador / The Climbing Robot

A standalone rewrite of two GeoGebra applets — *Climbing Mountain 1D* and
*Lagrangian in R2* — fused into one self-contained HTML file. No build step, no
dependencies, no network at runtime.

A robot is standing on a hillside, or on a mountain. It can only see a distance
`d` around itself. From what it can see it measures the slope, and on that
measurement it decides which way is up. The original applets drew that. This one
adds the panel the whole idea turns on: **what the robot actually sees**, drawn
at constant size on screen while `d` shrinks through twelve orders of magnitude.

One number does three jobs, and keeping them the same number is the point:

- `d` is how far the robot can see — the original's `d`, `d_x`, `d_y`.
- `d` is the increment its slope is measured over — the original's `DiscTan`.
- `d` is the half-width of the zoom window.

So the zoom is not a camera move. Turn the dial and the robot keeps its size on
screen while the scale around it shrinks. It is the robot walking up to the
ground and looking closer.

The zoom lives in the **right-hand panel alone**. The terrain panel always shows
the whole landscape: one picture that holds still to point at, and one that goes
in. Moving both at once leaves nothing to measure the magnification against.

## The two worlds, in one applet

**Ladera (2D)** — the robot on a curve `y = f(x)`. Drag it along the curve or
use the slider.

**Montaña (3D)** — the robot on a surface `z = f(x, y)`. Drag it over the
surface; dragging anywhere else orbits. Camera buttons for 3D, X–Z and X–Y.

Both worlds share the rail, the zoom dial, the climb, the fence and the verdict.
Press `d` to switch, or use the buttons at the top of the rail.

## The zoom, and what it proves

The right-hand panel plots the same function over `[−d, d]` around the robot —
in 3D, over the square `[x ± d] × [y ± d]`, which is the neighbourhood the
GeoGebra original's `ROBOTFUN` and `FiniteTangent` used — with its tangent over
it and the gap between them shaded. The vertical half-height is proportional to
`d`, so shrinking `d` really is a magnifying glass: a straight line keeps its
screen angle at every zoom, and only the gap is allowed to shrink. Auto-fitting
the vertical instead would stretch the relief back up to fill the panel at every
magnification, and a summit would stay a parabola for ever.

The dial turns **both ways**, from `d = 15` down to `d = 1.5×10⁻¹²`. One unit of
the domain is one kilometre, so the window goes from **15 km to 1.5 nanometres** —
from ×0.1 to ×10¹². The mouse wheel over either panel turns it; so do `+` and
`−`; so does **Acercar al límite**, which walks the whole range in about three
seconds. It is linear in the dial and therefore geometric in `d`, a constant
number of decades per second, because that is the only pacing that gives every
scale equal time. Backing all the way out earns its place: far enough away, a
plane is the one thing the function is not, and the gap ratio climbs above 1.

Three numbers are reported, and the third is the definition:

| Readout | On a differentiable point | On a corner |
|---|---|---|
| Separación | the largest gap in the window, `~C·d²` | `~C·d` |
| En píxeles | how far apart they are **on this drawing** | never below a pixel |
| Separación / d | `→ 0` | stays put |

On the hill it runs

| | ×1 | ×100 | ×10⁴ | ×10⁶ |
|---|---|---|---|---|
| Separación / d | 0.4500 | 0.0045 | 4.5×10⁻⁵ | 4.5×10⁻⁷ |

falling like `d`, exactly: a hundredfold every two decades. On the tent it is
0.7000 at ×1, 0.7000 at ×1000 and 0.7000 at ×10⁶. That is the whole
distinction, and it is measured rather than asserted.

Two terrains exist for that contrast. **Una arista** has a corner at `x = 1`;
**Un cono** has an apex at the origin. Neither ever flattens, the partials are
reported as `—` rather than as the numbers a difference quotient would invent,
and the red line is drawn dashed and labelled *aquí no hay tangente*.

## Thirteen decades, and then the arithmetic gives out

Two numbers near `f(P)` differ by at least about `|f(P)|·2⁻⁵²`, so the zoom
cannot go on forever. The applet distinguishes two different moments:

- The **gap** falls below what the arithmetic can represent. On the default
  hill the gap is `0.3·d²` and the floor is about `4.7×10⁻¹⁵`, so it happens at
  `d ≈ 1.2×10⁻⁷` — a tenth of a millimetre. The readouts then show a bound
  (`< 4.7 pm`) instead of a number, because the number would be rounding error.
- The **picture** becomes rounding error, which happens several decades later,
  and only when the terrain is nearly flat to begin with. Then the verdict says
  *Se acabaron los decimales* and means it.

Confusing the two would have put a false warning over a perfectly good picture
for the last half of the dial. The machine runs out of decimals before the
mathematics runs out of zoom, and the applet says which has happened.

## The robot measures with a forward difference, and it is wrong

The slope the robot reports is `(f(x + d) − f(x))/d`, which is what the
GeoGebra original built (`DiscTan`, `GradientDestinationFinite`) and what a
hiker who takes a step and compares altitudes actually gets. It is wrong by
`f''·d/2`, to every digit:

| d | true | measured | off by | f''·d/2 |
|---|---|---|---|---|
| 1.5 | 1.110000 | 0.660000 | −0.450000 | −0.450000 |
| 0.15 | 1.110000 | 1.065000 | −0.045000 | −0.045000 |
| 0.015 | 1.110000 | 1.105500 | −0.004500 | −0.004500 |

A centred difference would have been *exact* on the quadratic, and the robot
would never have mismeasured anything on the default terrain. That would have
been better numerics and a worse applet.

The consequence is the best thing in it. **Escalar** climbs by gradient ascent
on the measured slope, and stops where the measured slope vanishes — which is
the summit minus `d/2`:

| d | stops at | summit − d/2 |
|---|---|---|
| 1.5 km | 1.9972 | 2.0000 |
| 50 m | 2.7221 | 2.7250 |
| 1 m | 2.7465 | 2.7495 |

A robot with a one-and-a-half-kilometre horizon stops 750 metres short of the
peak and believes it has arrived. On **Una cordillera** it is worse: from the
same starting point, a far-sighted robot walks to one summit and a short-sighted
one to another. The pill above the panel says *midiendo mal* whenever the
measured slope is off by more than about a fifth of the slope itself.

## Four derivatives, four colours, four switches

On a surface the derivative is not one number, and the applet draws all of it
with a switch for each:

| | | |
|---|---|---|
| **∂f/∂x** | orange | the slope of the slice that holds `y` fixed |
| **∂f/∂y** | blue | the slope of the slice that holds `x` fixed |
| **D_u f** | cyan | the slope along whatever direction the θ dial points |
| **∇f** | purple | on the floor where it lives, and lifted as steepest ascent |

Each appears in **both** panels: as a tangent arrow on the terrain, and again
in the magnified window — the arrow, plus the cut it is the slope of, laid
across the square patch. That is where they belong. At that magnification the
surface and its tangent plane are the same picture, and these four vectors are
what that picture is made of; the numbers are written in the panel in the
colour they are drawn in. The arrows have unit run and a length fixed along the
surface, so they do not reverse when the slope goes negative, do not vanish
where the derivative is zero, and do not shoot off the top of the panel on
steep ground.

The directional derivative is the one that ties them together, and the numbers
say so. At `(3, 2.5)` on the quadratic, with `∇f = (−0.6000, −0.7250)` and
`‖∇f‖ = 0.9411` pointing at 230.39°:

| θ | D_u f |
|---|---|
| 0° | −0.6000 = `f_x` |
| 90° | −0.7250 = `f_y` |
| 230.39° | 0.9411 = `‖∇f‖` |
| 320.39° | −6.7×10⁻¹⁶ = 0 |

**Hacia el gradiente** points θ at the steepest ascent; turning it a further 90°
takes the directional derivative to zero, along the contour.

## The fence

Both originals have a constraint — an interval `P_min ≤ x ≤ P_max` in the 1D
file, a half-plane `x + y ≥ s` in the other — and both are here as an optional
fence the robot cannot cross. In 3D the boundary is drawn as the curve
`(t, s − t, f(t, s − t))` lifted onto the surface, which is exactly the
GeoGebra file's constrained path. The climb then walks up the fence and stops
against it with the gradient still pointing uphill and out. That is what a
constrained optimum looks like before anybody writes down a multiplier.

The fence is drawn in the zoom panel too whenever it crosses what the robot can
reach: in 2D as the barred band, in 3D as the boundary lifted onto the patch
with the unreachable part of the patch tinted. A constraint does not stop
existing when you look more closely at it.

## Terrains

| 2D | | 3D | |
|---|---|---|---|
| Una colina | `−k·x·(x − b)`, the original's parabola | Cuadrática | `a₀ − a₁x² − a₂y² − a₃xy`, the original's `f` |
| Una rampa recta | `m·x`, the original's `StraightLine` branch | Un plano | `a₀ + a₁x + a₂y` |
| Una cordillera | two sines, several summits | Tres cerros | three Gaussians and a tilt |
| Una arista | a corner at `x = 1` | Un cono | an apex at the origin |
| Personalizada | type `f(x)` | Personalizada | type `f(x, y)` |

The 2D presets are chosen for the zoom: `abs(x)` and `sqrt(abs(x))` are
continuous and not differentiable at 0, `pow(abs(x),2/3)` is the cusp with a
vertical tangent, `x*sin(1/x)` is continuous with no derivative at 0, and
`x^2*sin(1/x)` **is** differentiable at 0 with a derivative that is not
continuous there.

## Changes from the GeoGebra originals

- **The zoom window, which was not there.** Both originals let `d` shrink, but
  neither redrew the function at the new scale, so the flattening never
  happened on screen. It is now a panel of its own, with the gap measured in
  units, in multiples of `d`, and in pixels of the drawing being looked at.
- **Thirteen decades instead of four.** `d` ran `[0, 4]` and `[0, 5]` on the
  original sliders, in linear steps. A linear slider spends almost no time in
  the decade where anything happens, and it cannot go the other way.
- **The point is a robot.** `A = (p, f(p))` and `PointIn(f)` were points. The
  original's own object names — `ROBOT`, `ROBOTFUN`, `RobotArea`, `RobotView`,
  *See Robot's Range* — say what they were meant to be, so it is drawn as one,
  standing on the graph and facing the way it is walking.
- **The climb, which the original could not do.** Everything needed for
  gradient ascent was in the file — the gradient vector, the measured slope, the
  constraint — but the point was dragged by hand, so the one thing the machinery
  was for never happened.
- **The gradient is the original's construction.** `p + g/√(1+g²)` and
  `f(p) + g²/√(1+g²)`: the ascent direction, with the slope itself as its
  length. In 3D it is also drawn on the floor, where it lives.
- **A corner is detected rather than declared.** The jump between the one-sided
  slopes is measured at `d`, `d/8` and `d/64`: a corner keeps the same jump at
  all three, a smooth function's falls off, and a cusp's grows. The threshold
  rises with the rounding error of a difference quotient over the step, which is
  what stops every smooth hill from sprouting a kink at maximum zoom.
- **Where there is no derivative, none is reported.** At the cone's apex the
  symbolic partials are `0/0`. The gap is then measured from the best line the
  robot has rather than from `NaN`, the readouts show `—`, and the line is
  dashed.
- **Dead objects not carried over.** `n`, `x_2`, `f'`, `Δ`, `h`, `i`, `β`, `q`,
  `a(x)`, `p(x)`, `text1`, `ll`, `numerito`, `B_2`, `D_2`, `L_2`, `l_1`, `l_2`
  and `w` were sliders and objects with no reader; `Tangente` and `FiniteTangent`
  were the same plane twice.
- **Bilingual, with a verdict, and a light theme for projectors.**

## Expression syntax

`+ − * / ^ ( )`, functions `sqrt ln log log10 exp abs sin cos tan sinh cosh
tanh atan min max pow atan2`, constants `e` and `pi`. Implicit multiplication
works: `2xy` is `2*x*y`. `^` is right-associative and binds tighter than unary
minus, so `-x^2` is `-(x^2)`. In the 2D world only `x` is accepted; in 3D, `x`
and `y`.

Everything is hand-rolled — tokeniser, Pratt parser, closure-tree compiler,
symbolic differentiation, painter's-algorithm 3D — so there is no `eval` and a
strict content security policy cannot break the page. Where an expression
contains `abs`, `min` or `max` there is no symbolic derivative and central
differences take over.

## Keyboard

`1`–`5` pick the terrain, `d` swaps the two worlds, `c` starts and stops the
climb. On the panels: `+`/`−` turn the zoom dial, arrow keys move the robot in
2D and orbit in 3D. Shift + wheel moves the 3D camera instead of the zoom.
Dragging the zoom panel orbits it, and the terrain panel follows, so the two
never disagree about which way is north.
