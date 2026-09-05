# Funciones de Demanda / Demand Functions

A standalone rewrite of a GeoGebra applet as a single self-contained HTML file.
No build step, no dependencies, no network at runtime.

**Manual:** [`dist/Demand-Functions-Guia.pdf`](../dist/Demand-Functions-Guia.pdf)
(español) · [`dist/Demand-Functions-Guide.pdf`](../dist/Demand-Functions-Guide.pdf)
(English)

A demand curve is not a datum. It is the result of solving the consumer's
problem once for every price, and writing the answers down. So this applet puts
the consumer's problem on the left, an empty pair of axes on the right, and lets
the student move the price. Every optimal bundle leaves a mark. After a while
there is a curve there, and the student built it point by point.

Switch on **Reveal the curve** and the computed demand function is drawn
underneath the marks. It passes exactly through them.

## Five preference families

| Family | Utility | Demand |
|---|---|---|
| Cobb–Douglas | `x^α · y^(1−α)` | `x* = αm/pₓ`, `y* = (1−α)m/p_y` |
| CES | `(x^r + y^r)^(1/r)` | closed form in `r` |
| Linear (substitutes) | `a·x + y` | a corner, either all `x` or all `y` |
| X inferior (Giffen) | `ln(x − x̲) − ((1+b)/b)·ln(ȳ − y)`, `b = (1−β)/β` | closed form, in three pieces |
| Custom | whatever you type | solved numerically |

## Normal, inferior, Giffen

Three readouts settle it: `∂x*/∂pₓ` (the slope of demand), `∂x*/∂m` (the income
effect), and the type. The verdict names the case, and the **Highlight Giffen
stretch** layer marks in purple wherever `∂x*/∂pₓ > 0`.

Getting to a Giffen good takes three deliberate steps, and the manual walks
through them: pick the **X inferior** family, lower the *range* minimum of `p_y`
to 0.2 before setting `p_y = 0.35`, and turn off the fixed vertical axis so the
curve is not squashed flat. Then `∂x*/∂pₓ = +3.1×10⁻⁴` and demand slopes upward.

## Ranges

The most easily overlooked control. The **Ranges** group sets the interval
considered for each variable, and that interval is *both* the travel of the
slider and the stretch the horizontal axis draws. A price slider that appears
not to respond is a price slider hitting its range, not a bug.

The right panel's vertical axis is fixed by default at `m_max / p_min`, so that
two sweeps can be compared by eye. Where the quantity of interest is small next
to that ceiling — the Giffen case — switch the fixed axis off.

## Handling the demand panel

Neither framing can know which stretch of the curve a reader is after, so the
demand panel can be handled directly:

- **Click an axis** — in its own margin — to point the mouse wheel at it. The
  armed axis shows a band in its gutter. Wheel then zooms only that axis.
- **Click the plane** to point the wheel at both.
- **Drag the plane** to pan, in both directions at once. It is grab-and-drag:
  the curve follows the pointer.
- **Double-click**, or the **Encuadre automático** button that appears once you
  have touched the view, hands the framing back.

Zooming is about the pointer, so whatever is under it stays under it. The
horizontal axis is a price or an income and is stopped at `10⁻⁴` rather than
allowed through zero, where there is no demand to draw. Panning past the slider
range is allowed and the curve is re-sampled over whatever is on screen, so the
window is not confined to the interval the **Ranges** group happens to bracket.
Changing the panel layout hands the framing back, because a view set for two
stacked panels does not fit one.

## Sweeping

**Mark while moving** records a point on every move; **Sweep** runs the variable
end to end and marks as it goes; **Record point** saves one; **Clear** erases
the current variable's trail. Points belong to the variable that was moving, so
switching from `pₓ` to `m` does not mix the trails.

With income as the swept variable the right panel becomes the **Engel curve**.

## Utility syntax

`+ − * / ^ ( )`, functions `sqrt ln log exp abs min max sin cos`, constants
`e pi`. Implicit multiplication works: `2xy` is `2*x*y`. Only `x` and `y` are
allowed as variables.

Everything is hand-rolled — tokeniser, Pratt parser, closure-tree compiler — so
there is no `eval` and a strict CSP cannot break the page.
