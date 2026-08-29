# -*- coding: utf-8 -*-
"""Content for the five applet manuals. The shared skeleton lives in
manual-skeleton.py; here there is only prose, tables and worked examples."""
import os, sys, importlib.util

_here = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("manual_skeleton",
                                               os.path.join(_here, "manual-skeleton.py"))
manual_skeleton = importlib.util.module_from_spec(_spec)
sys.modules["manual_skeleton"] = manual_skeleton
_spec.loader.exec_module(manual_skeleton)
from manual_skeleton import sec, h2, p, note, warn, res, steps, build
from manual_skeleton import table as _table

_lspec = importlib.util.spec_from_file_location("manual_labels",
                                                os.path.join(_here, "manual-labels.py"))
_labels = importlib.util.module_from_spec(_lspec)
_lspec.loader.exec_module(_labels)
LBL = _labels.LBL
NEUTRAL = _labels.NEUTRAL


def table(head_es, head_en, rows):
    """Rows are written once, with the Spanish label. Every label must then be
    declared exactly once: translated in LBL, or listed in NEUTRAL because it
    reads the same in both languages — a symbol, a formula, a piece of code, a
    proper name. An undeclared label is an error rather than a silent Spanish
    leak into the English guide."""
    out, missing = [], []
    for a, b, c in rows:
        if a in LBL:
            out.append((a, LBL[a], b, c))
        elif a in NEUTRAL:
            out.append((a, b, c))
        else:
            missing.append(a)
    if missing:
        raise SystemExit("undeclared table label(s):\n  " + "\n  ".join(missing))
    return _table(head_es, head_en, out)

OUT = os.path.join(os.path.dirname(_here), "manuales")
os.makedirs(OUT, exist_ok=True)

# The applet draws its effect arrows in fixed hues that hold on either ground.
# Where the text names one, the hue itself goes beside the word rather than
# into it: a swatch has no contrast floor to clear, and the reader can hold it
# against the screen. Keep these in step with MK.sub and MK.inc in the applet.
SW_SUB = '<span class="sw" style="background:#FF3C87"></span>'
SW_INC = '<span class="sw" style="background:#5CFFB0"></span>'

HEAD_CTRL   = (["Control", "Qué hace"], ["Control", "What it does"])
HEAD_LAYER  = (["Capa", "Qué dibuja"], ["Layer", "What it draws"])
HEAD_PANEL  = (["Panel", "Qué muestra"], ["Panel", "What it shows"])
HEAD_READ   = (["Lectura", "Cómo leerla"], ["Readout", "How to read it"])

def common_start(app_es, app_en):
    """Every manual opens the same way: it is a web page, nothing to install."""
    return sec("Antes de empezar", "Before you start", [
        h2("Cómo se abre", "Opening it"),
        p("No hay nada que instalar. Es una página web: se abre en Chrome, Safari, Edge o "
          "Firefox, en ordenador, tableta o teléfono. La primera vez necesitas conexión; "
          "después el navegador la conserva y funciona sin ella.",
          "There is nothing to install. It is a web page: it opens in Chrome, Safari, Edge or "
          "Firefox, on a computer, tablet or phone. You need a connection the first time; "
          "after that the browser keeps it and it works offline."),
        p("Arriba a la derecha hay dos parejas de botones. La primera X; la segunda pasa de <b>Oscuro</b> a <b>Claro</b>. Para proyectar "
          "en clase, el modo claro se ve mejor en un cañón; en pantalla, el oscuro cansa menos.",
          "Top right there are two pairs of buttons. The first switches the language between "
          "<b>ES</b> and <b>EN</b>; the second goes from <b>Dark</b> to <b>Light</b>. For projecting "
          "in class, light mode reads better on a beamer; on screen, dark is easier on the eyes."),
        note("<b>Se puede hacer zoom en cualquier gráfica.</b> Rueda del ratón sobre la gráfica, "
             "o pellizco con dos dedos en el trackpad o la pantalla táctil. El zoom afecta sólo "
             "a la gráfica bajo el cursor, no a la página entera.",
             "<b>Every graph zooms.</b> Mouse wheel over the graph, or a two-finger pinch on the "
             "trackpad or touchscreen. The zoom applies to the graph under the pointer only, "
             "not to the whole page."),
        note("Los deslizadores tienen al lado una casilla con el número. Para un valor exacto, "
             "escríbelo en la casilla y pulsa <code>Intro</code>; el deslizador es para explorar, "
             "la casilla para precisar.",
             "Each slider has a number box beside it. For an exact value, type it into the box and "
             "press <code>Enter</code>; the slider is for exploring, the box is for precision."),
    ])

SYNTAX_ROWS = [
    ("<code>+ − * / ^</code>",
     "Suma, resta, producto, cociente y potencia. <code>x^0.5</code> es la raíz de x.",
     "Add, subtract, multiply, divide, power. <code>x^0.5</code> is the square root of x."),
    ("<code>( )</code>",
     "Paréntesis. <code>(x+y)^2</code> no es lo mismo que <code>x+y^2</code>.",
     "Brackets. <code>(x+y)^2</code> is not the same as <code>x+y^2</code>."),
    ("<code>sqrt ln log exp abs</code>",
     "Raíz, logaritmo natural, logaritmo decimal, exponencial y valor absoluto.",
     "Root, natural log, base-10 log, exponential and absolute value."),
    ("<code>min max</code>",
     "Con dos argumentos: <code>min(x,y)</code> son complementarios perfectos.",
     "Two arguments: <code>min(x,y)</code> is perfect complements."),
    ("<code>sin cos</code>",
     "Trigonométricas, en radianes. Rara vez útiles aquí, pero están.",
     "Trigonometric, in radians. Rarely useful here, but available."),
    ("<code>e pi</code>",
     "Las dos constantes. <code>e</code> es 2,718…, <code>pi</code> es 3,1416…",
     "The two constants. <code>e</code> is 2.718…, <code>pi</code> is 3.1416…"),
    ("<code>2x</code>, <code>3xy</code>",
     "El producto implícito funciona: <code>2x</code> se lee como <code>2*x</code>.",
     "Implicit multiplication works: <code>2x</code> reads as <code>2*x</code>."),
]

def syntax_section(varnote_es, varnote_en, examples):
    rows = [(f"<code>{s}</code>", a, b) for s, a, b in examples]
    return sec("Escribir tu propia función", "Writing your own function", [
        h2("La sintaxis admitida", "The syntax it accepts"),
        p(varnote_es, varnote_en),
        table(*HEAD_CTRL, SYNTAX_ROWS),
        h2("Ejemplos que funcionan", "Examples that work"),
        table(["Expresión", "Qué preferencias describe"], ["Expression", "What preferences it describes"], rows),
        warn("Si escribes algo que no se entiende, aparece <i>«No entiendo esa expresión»</i> y la "
             "gráfica se queda como estaba. Las causas habituales son un paréntesis sin cerrar, una "
             "coma decimal en vez de un punto (<code>0,5</code> en vez de <code>0.5</code>) o una "
             "variable que no sea x ni y.",
             "If it cannot be read you get <i>“I can't read that expression”</i> and the graph stays "
             "as it was. The usual causes are an unclosed bracket, a decimal comma instead of a point "
             "(<code>0,5</code> instead of <code>0.5</code>) or a variable other than x and y."),
    ])

def trouble_section(extra):
    return sec("Si algo no sale", "If something goes wrong", [
        h2("Problemas frecuentes", "Common problems"),
        table(["Síntoma", "Qué hacer"], ["Symptom", "What to do"], extra),
    ])

# ===========================================================================
# 1. Óptimo del Consumidor
# ===========================================================================
M1 = dict(
  title="Manual · Óptimo del Consumidor / Consumer Optimum",
  desc="Manual de uso del applet Óptimo del Consumidor, en español e inglés.",
  h1_es="Óptimo del Consumidor", h1_en="Consumer Optimum",
  lede_es="Dos bienes, una renta y unos precios. Dónde para el consumidor, por qué para ahí, "
          "y qué se ve en la superficie 3D que no se ve en el plano.",
  lede_en="Two goods, an income and some prices. Where the consumer stops, why there, "
          "and what the 3D surface shows that the plane does not.",
  href="../consumer-optimum/",
  sections=[
    common_start("Óptimo del Consumidor", "Consumer Optimum"),

    sec("Qué hay en pantalla", "What is on screen", [
      h2("Los dos paneles", "The two panels"),
      p("La pantalla se parte en dos vistas del mismo problema. No son dos ejercicios: son "
        "un solo objeto mirado desde dos sitios. Mueve algo en cualquiera de los dos y el otro responde.",
        "The screen splits into two views of one problem. They are not two exercises: they are "
        "one object seen from two places. Move something in either and the other follows."),
      table(*HEAD_PANEL, [
        ("<b>Diagrama 2D</b> · plano (x, y)",
         "El plano de siempre. El fondo es un mapa de calor de la utilidad —azul abajo, rojo "
         "arriba—, con la recta presupuestaria, las curvas de indiferencia y el punto <b>P</b> "
         "que puedes arrastrar.",
         "The familiar plane. The background is a heat map of utility — blue low, red high — "
         "with the budget line, the indifference curves and the point <b>P</b> you can drag."),
        ("<b>Superficie 3D</b> · z = u(x, y)",
         "La misma función levantada en altura. La recta presupuestaria se convierte en un plano "
         "vertical que corta la superficie, y el óptimo es la cima de esa curva de corte.",
         "The same function lifted into height. The budget line becomes a vertical plane cutting "
         "the surface, and the optimum is the summit of that cut."),
      ]),
      note("Arrastrar <b>P</b> funciona en los dos paneles. En el 3D, arrastrar sobre el fondo "
           "—no sobre el punto— gira la cámara.",
           "Dragging <b>P</b> works in both panels. In the 3D one, dragging on the background — "
           "not on the point — rotates the camera."),
      h2("Los números de la derecha", "The readouts"),
      table(*HEAD_READ, [
        ("x, y", "Las coordenadas de P: cuánto de cada bien.", "P's coordinates: how much of each good."),
        ("u(P)", "La utilidad en P. Es la altura en el panel 3D.", "Utility at P. It is the height in the 3D panel."),
        ("Gasto", "p<sub>x</sub>·x + p<sub>y</sub>·y. Si es menor que la renta, sobra dinero.",
                  "p<sub>x</sub>·x + p<sub>y</sub>·y. If it is below income, money is left over."),
        ("RMS", "La relación marginal de sustitución en P, es decir la pendiente de la curva de "
                "indiferencia que pasa por ahí.",
                "The marginal rate of substitution at P — the slope of the indifference curve "
                "through that point."),
        ("p<sub>x</sub>/p<sub>y</sub>", "El precio relativo, o sea la pendiente de la recta presupuestaria.",
                                        "The relative price — the slope of the budget line."),
        ("Brecha", "La distancia entre RMS y p<sub>x</sub>/p<sub>y</sub>. Cuando se acerca a cero, "
                   "estás en tangencia.",
                   "The distance between MRS and p<sub>x</sub>/p<sub>y</sub>. As it approaches zero "
                   "you are at tangency."),
        ("u máx.", "La utilidad del óptimo verdadero, para comparar con la tuya.",
                   "The utility of the true optimum, to compare against yours."),
      ]),
    ]),

    sec("Los controles", "The controls", [
      h2("Panel de la izquierda", "The left-hand panel"),
      table(*HEAD_CTRL, [
        ("<b>Explorar</b> / <b>Retos</b>",
         "Dos modos. En Explorar mandas tú: eliges la utilidad y los precios. En Retos el applet "
         "propone un problema con números aleatorios y puntúa tu respuesta.",
         "Two modes. In Explore you are in charge: you pick the utility and the prices. In "
         "Challenges the applet poses a problem with random numbers and scores your answer."),
        ("<b>Preferencias</b>",
         "La casilla <code>u(x, y)</code>. Escribe la función que quieras; empieza en "
         "<code>x^0.5*y^0.5</code>.",
         "The <code>u(x, y)</code> box. Type whatever function you want; it starts at "
         "<code>x^0.5*y^0.5</code>."),
        ("<b>Restricción presupuestaria</b>",
         "Tres deslizadores: p<sub>x</sub>, p<sub>y</sub> y la renta m. Por defecto 2, 3 y 24.",
         "Three sliders: p<sub>x</sub>, p<sub>y</sub> and income m. They start at 2, 3 and 24."),
        ("<b>Método gráfico</b>",
         "Cómo buscas el óptimo: <i>Elegir la canasta</i> (arrastras P sobre la recta), "
         "<i>Subir la curva de nivel</i> (subes u hasta que toque) o <i>Punto libre</i> "
         "(mueves P por todo el cuadrante).",
         "How you hunt for the optimum: <i>Pick the bundle</i> (drag P along the line), "
         "<i>Raise the level curve</i> (raise u until it touches) or <i>Free point</i> "
         "(move P anywhere in the quadrant)."),
        ("<b>Capas</b>",
         "Enciende y apaga cada elemento del dibujo. Menos capas es casi siempre mejor para "
         "explicar; enciéndelas de una en una.",
         "Turns each element of the drawing on and off. Fewer layers is nearly always better for "
         "explaining; switch them on one at a time."),
        ("<b>Dominio</b>",
         "Hasta dónde llegan los ejes. Súbelo si el óptimo se sale del marco.",
         "How far the axes reach. Raise it if the optimum leaves the frame."),
        ("<b>Ajustar al presupuesto</b>",
         "Devuelve P a la recta presupuestaria si lo has llevado fuera.",
         "Puts P back on the budget line if you have taken it off."),
      ]),
      h2("Las capas, una a una", "The layers, one by one"),
      table(*HEAD_LAYER, [
        ("Mapa de utilidad", "El fondo de color. Azul es poca utilidad, rojo mucha.",
                             "The coloured background. Blue is low utility, red is high."),
        ("Curvas de fondo", "Curvas de indiferencia a niveles regulares, como las de un mapa topográfico.",
                            "Indifference curves at regular levels, like a topographic map."),
        ("Curva de nivel", "La curva del nivel que fijas tú con el deslizador.",
                           "The curve at the level you set with the slider."),
        ("Curva por P", "La curva de indiferencia que pasa exactamente por P.",
                        "The indifference curve running exactly through P."),
        ("Conjunto factible", "La zona que puedes pagar: el triángulo bajo la recta.",
                              "What you can afford: the triangle under the line."),
        ("Corte 3D", "En el panel 3D, la curva donde el plano presupuestario corta la superficie.",
                     "In the 3D panel, the curve where the budget plane cuts the surface."),
        ("Tangente en P", "La recta tangente a la curva de indiferencia en P. Cuando coincide con la "
                          "recta presupuestaria, has llegado.",
                          "The tangent to the indifference curve at P. When it lines up with the "
                          "budget line, you are there."),
        ("Gradiente", "El vector ∇u en P: apunta en la dirección de máximo crecimiento de la utilidad.",
                      "The vector ∇u at P: it points where utility grows fastest."),
        ("Parciales", "Las dos componentes del gradiente por separado, u<sub>x</sub> y u<sub>y</sub>.",
                      "The two components of the gradient separately, u<sub>x</sub> and u<sub>y</sub>."),
        ("Plano de corte", "El plano vertical del presupuesto, en el panel 3D.",
                           "The vertical budget plane, in the 3D panel."),
        ("Sólo lo asequible", "Recorta la superficie 3D al conjunto factible: lo demás desaparece.",
                              "Clips the 3D surface to the feasible set: the rest disappears."),
        ("Mostrar óptimo", "Marca la solución verdadera. Apágala mientras el alumno busca.",
                           "Marks the true solution. Turn it off while the student searches."),
        ("Dejar rastro", "P va dejando marcas por donde pasa.",
                         "P leaves a trail of marks as it moves."),
      ]),
    ]),

    sec("Primeros diez minutos", "The first ten minutes", [
      h2("Un recorrido guiado", "A guided run"),
      p("Ábrelo y haz esto en orden. Los resultados están comprobados con los valores de arranque, "
        "así que si no coinciden es que algo se ha movido: recarga la página y vuelve a empezar.",
        "Open it and do this in order. The results are checked against the starting values, so if "
        "they do not match something has moved: reload the page and start again."),
      steps([
        ("Déjalo como viene: <code>u = x^0.5*y^0.5</code>, p<sub>x</sub> = 2, p<sub>y</sub> = 3, "
         "m = 24. Enciende <b>Mostrar óptimo</b>.",
         "Leave it as it comes: <code>u = x^0.5*y^0.5</code>, p<sub>x</sub> = 2, p<sub>y</sub> = 3, "
         "m = 24. Switch on <b>Show optimum</b>.",
         ("El óptimo cae en x* = 6, y* = 4, con u = 4,899.",
          "The optimum sits at x* = 6, y* = 4, with u = 4.899.")),
        ("Comprueba la aritmética a mano: con Cobb–Douglas de exponentes iguales, cada bien se lleva "
         "la mitad de la renta. 12 pesos en x a 2 el uno son 6 unidades; 12 en y a 3 el uno son 4.",
         "Check the arithmetic by hand: with equal Cobb–Douglas exponents each good takes half the "
         "income. 12 on x at 2 each is 6 units; 12 on y at 3 each is 4.",
         ("Gasto = 2·6 + 3·4 = 24. No sobra nada.",
          "Spend = 2·6 + 3·4 = 24. Nothing left over.")),
        ("Enciende <b>Tangente en P</b> y arrastra P por la recta hasta que la tangente se tumbe "
         "sobre la propia recta. Mira la <b>Brecha</b> mientras lo haces.",
         "Switch on <b>Tangent at P</b> and drag P along the line until the tangent lies flat on "
         "the line itself. Watch the <b>Gap</b> as you do it.",
         ("En el óptimo, RMS = 0,667 = p<sub>x</sub>/p<sub>y</sub> = 2/3, y la brecha es cero.",
          "At the optimum, MRS = 0.667 = p<sub>x</sub>/p<sub>y</sub> = 2/3, and the gap is zero.")),
        ("Cambia el método a <b>Subir la curva de nivel</b> y sube u despacio. Verás la curva pasar "
         "de cortar la recta dos veces, a rozarla, a no llegar.",
         "Switch the method to <b>Raise the level curve</b> and raise u slowly. You will watch the "
         "curve go from cutting the line twice, to grazing it, to missing it.",
         ("El nivel donde deja de cortar es exactamente u = 4,899.",
          "The level where it stops cutting is exactly u = 4.899.")),
        ("Ahora mira el panel 3D. El plano vertical corta la superficie en un arco; el óptimo es "
         "su punto más alto. Gira la cámara arrastrando el fondo.",
         "Now look at the 3D panel. The vertical plane cuts the surface in an arch; the optimum is "
         "its highest point. Rotate the camera by dragging the background.",
         ("Los dos paneles marcan el mismo punto al mismo tiempo.",
          "Both panels mark the same point at the same time.")),
      ]),
    ]),

    sec("Tres experimentos", "Three experiments", [
      h2("1 · Cuando la tangencia no sirve", "1 · When tangency is no use"),
      p("La condición RMS = p<sub>x</sub>/p<sub>y</sub> es la que se enseña, pero sólo vale para "
        "soluciones interiores con curvas suaves. Los dos casos siguientes la rompen, y el applet "
        "lo dice en voz alta.",
        "The condition MRS = p<sub>x</sub>/p<sub>y</sub> is what gets taught, but it only holds for "
        "interior solutions with smooth curves. The next two cases break it, and the applet says so."),
      steps([
        ("Escribe <code>min(x,y)</code> y deja p<sub>x</sub> = 2, p<sub>y</sub> = 3, m = 24. Las "
         "curvas de indiferencia son ángulos rectos.",
         "Type <code>min(x,y)</code> and leave p<sub>x</sub> = 2, p<sub>y</sub> = 3, m = 24. The "
         "indifference curves are right angles.",
         ("x* = y* = 4,8. El applet lo llama «vértice»: la RMS no existe ahí.",
          "x* = y* = 4.8. The applet calls it a “kink”: MRS does not exist there.")),
        ("Escribe ahora <code>2x+y</code>, sustitutos perfectos. La RMS vale 2 en todas partes; el "
         "precio relativo vale 2/3.",
         "Now type <code>2x+y</code>, perfect substitutes. MRS is 2 everywhere; the relative price "
         "is 2/3.",
         ("x* = 12, y* = 0. Es una esquina: la RMS nunca llega a igualar al precio.",
          "x* = 12, y* = 0. A corner: MRS never gets down to the price ratio.")),
        ("Con los mismos sustitutos, sube p<sub>x</sub> hasta pasar de 6 (es decir, hasta que "
         "p<sub>x</sub>/p<sub>y</sub> pase de 2).",
         "With the same substitutes, raise p<sub>x</sub> past 6 (that is, until "
         "p<sub>x</sub>/p<sub>y</sub> goes above 2).",
         ("La solución salta de golpe al otro eje: todo en y. No hay transición suave.",
          "The solution jumps straight to the other axis: everything in y. There is no smooth transition.")),
      ]),
      h2("2 · El gradiente y por qué apunta hacia fuera", "2 · The gradient, and why it points outward"),
      p("Enciende <b>Gradiente</b> y <b>Parciales</b> y arrastra P por la recta presupuestaria. El "
        "gradiente siempre apunta hacia arriba en la superficie; en el óptimo queda perpendicular a "
        "la recta. Ésa es la misma condición de tangencia, dicha con vectores.",
        "Switch on <b>Gradient</b> and <b>Partials</b> and drag P along the budget line. The "
        "gradient always points uphill on the surface; at the optimum it ends up perpendicular to "
        "the line. That is the same tangency condition, said with vectors."),
      h2("3 · Los retos", "3 · The challenges"),
      p("Pulsa <b>Retos</b>. Hay seis niveles y cada uno genera números nuevos cada vez, así que no "
        "se puede memorizar la respuesta. Se desbloquean en orden.",
        "Press <b>Challenges</b>. There are six levels and each one generates fresh numbers every "
        "time, so the answer cannot be memorised. They unlock in order."),
      table(["Nivel", "Qué se practica"], ["Level", "What it drills"], [
        ("1 · Cobb–Douglas", "Tangencia interior con exponentes iguales. El caso de libro.",
                             "Interior tangency with equal exponents. The textbook case."),
        ("2 · Cobb–Douglas asimétrica", "Lo mismo con exponentes distintos, por el método del nivel.",
                                        "The same with unequal exponents, by the level-curve method."),
        ("3 · Sustitutos perfectos", "Soluciones de esquina y el salto de un eje a otro.",
                                     "Corner solutions and the jump from one axis to the other."),
        ("4 · Complementarios perfectos", "El vértice, donde la RMS no está definida.",
                                          "The kink, where MRS is undefined."),
        ("5 · Cuasilineal", "La demanda de un bien no depende de la renta; el otro absorbe el resto.",
                            "One good's demand does not depend on income; the other absorbs the rest."),
        ("6 · CES", "Elasticidad de sustitución distinta de uno, con ρ positivo o negativo.",
                    "Elasticity of substitution away from one, with ρ positive or negative."),
      ]),
      note("La puntuación premia acercarse al óptimo verdadero. <b>Comprobar</b> evalúa, "
           "<b>Reintentar</b> repite con los mismos números y <b>Siguiente</b> pasa de nivel.",
           "The score rewards getting close to the true optimum. <b>Check</b> grades it, "
           "<b>Try again</b> repeats with the same numbers and <b>Next</b> moves on."),
    ]),

    syntax_section(
      "En la casilla <code>u(x, y)</code> las variables son <b>x</b> e <b>y</b>, y sólo ésas. "
      "Las derivadas parciales se calculan de forma exacta, no aproximada, así que la RMS que ves "
      "es la de verdad.",
      "In the <code>u(x, y)</code> box the variables are <b>x</b> and <b>y</b>, and only those. "
      "The partial derivatives are computed exactly, not approximated, so the MRS you see is the "
      "real one.",
      [("x^0.5*y^0.5", "Cobb–Douglas simétrica.", "Symmetric Cobb–Douglas."),
       ("x^0.3*y^0.7", "Cobb–Douglas con más peso en y.", "Cobb–Douglas weighted towards y."),
       ("min(2x,y)", "Complementarios en proporción fija: dos x por cada y.",
                     "Fixed-proportion complements: two x per y."),
       ("3x+y", "Sustitutos perfectos con RMS constante igual a 3.",
                "Perfect substitutes with a constant MRS of 3."),
       ("4ln(x)+y", "Cuasilineal. El óptimo en x no depende de la renta: x* = 4p<sub>y</sub>/p<sub>x</sub>.",
                    "Quasilinear. The optimum in x does not depend on income: x* = 4p<sub>y</sub>/p<sub>x</sub>."),
       ("(x^0.5+y^0.5)^2", "CES con ρ = 0,5, más sustituibles que Cobb–Douglas.",
                           "CES with ρ = 0.5, more substitutable than Cobb–Douglas."),
       ("(x^(-1)+y^(-1))^(-1)", "CES con ρ = −1, menos sustituibles.",
                                "CES with ρ = −1, less substitutable.")]),

    trouble_section([
      ("El óptimo se sale del marco",
       "Sube el <b>Dominio</b>, o baja la renta. Con m grande y precios pequeños la canasta óptima "
       "se va lejos.",
       "Raise the <b>Domain</b>, or lower income. With large m and small prices the optimal bundle "
       "runs far out."),
      ("La superficie 3D se ve plana",
       "Estás mirándola casi de canto. Arrastra el fondo del panel para girar la cámara y subir el "
       "ángulo de elevación.",
       "You are looking at it almost edge-on. Drag the panel background to rotate the camera and "
       "raise the elevation."),
      ("No consigo arrastrar P",
       "En el panel 3D hay que agarrar el punto, no el fondo: el fondo gira la cámara. Si P está "
       "fuera de la recta, pulsa <b>Ajustar al presupuesto</b>.",
       "In the 3D panel you must grab the point, not the background: the background rotates the "
       "camera. If P has left the line, press <b>Fit to budget</b>."),
      ("La curva de indiferencia no aparece",
       "Con funciones como <code>ln(x)+ln(y)</code> la utilidad es negativa en parte del cuadrante "
       "y no hay curva que dibujar ahí. Prueba con <code>x^0.5*y^0.5</code>.",
       "With functions like <code>ln(x)+ln(y)</code> utility is negative over part of the quadrant "
       "and there is no curve to draw there. Try <code>x^0.5*y^0.5</code>."),
      ("Los retos están bloqueados",
       "Se abren en orden: hay que superar el anterior. Pulsa <b>Comprobar</b> con P en el óptimo.",
       "They unlock in order: you must clear the previous one. Press <b>Check</b> with P at the "
       "optimum."),
    ]),
  ])

# ===========================================================================
# 2. Funciones de Demanda
# ===========================================================================
M2 = dict(
  title="Manual · Funciones de Demanda / Demand Functions",
  desc="Manual de uso del applet Algunas Funciones de Demanda, en español e inglés.",
  h1_es="Funciones de Demanda", h1_en="Demand Functions",
  lede_es="De dónde sale la curva de demanda. Mueve un precio, la canasta óptima se mueve, "
          "y el rastro que va dejando <i>es</i> la función de demanda.",
  lede_en="Where the demand curve comes from. Move a price, the optimal bundle moves, "
          "and the trail it leaves <i>is</i> the demand function.",
  href="../demand-functions/",
  sections=[
    common_start("Funciones de Demanda", "Demand Functions"),

    sec("Qué hay en pantalla", "What is on screen", [
      h2("Los paneles", "The panels"),
      p("A la izquierda, la elección: el plano (x, y) con la recta presupuestaria y la curva de "
        "indiferencia que pasa por el óptimo. A la derecha, la demanda: el mismo óptimo pero "
        "dibujado contra la variable que estés moviendo.",
        "On the left, the choice: the (x, y) plane with the budget line and the indifference curve "
        "through the optimum. On the right, the demand: the same optimum, drawn against whichever "
        "variable you are moving."),
      table(*HEAD_PANEL, [
        ("<b>Elección</b> · plano (x, y)",
         "Recta presupuestaria, curva de indiferencia y el punto óptimo. Es de dónde sale todo lo demás.",
         "Budget line, indifference curve and the optimal point. Everything else comes from here."),
        ("<b>Demanda</b>",
         "El óptimo dibujado contra p<sub>x</sub>, p<sub>y</sub> o la renta. Si mueves la renta, "
         "el panel se titula <i>Curva de Engel</i>, que es su nombre propio.",
         "The optimum drawn against p<sub>x</sub>, p<sub>y</sub> or income. If you move income the "
         "panel is titled <i>Engel curve</i>, which is its proper name."),
      ]),
      note("Puedes ver un panel o los dos. Con uno solo se ve más grande, y para proyectar en clase "
           "suele ser mejor.",
           "You can show one panel or both. One alone is bigger, and for projecting in class that is "
           "usually better."),
      h2("Los números", "The readouts"),
      table(*HEAD_READ, [
        ("x*, y*", "La canasta óptima a los precios y la renta actuales.",
                   "The optimal bundle at the current prices and income."),
        ("Gasto", "p<sub>x</sub>·x* + p<sub>y</sub>·y*. Con preferencias monótonas es igual a la renta.",
                  "p<sub>x</sub>·x* + p<sub>y</sub>·y*. With monotone preferences it equals income."),
        ("Tipo", "Si x es normal, inferior o Giffen <b>en el punto donde estás</b>. No es una "
                 "propiedad de la función entera: cambia de un tramo a otro.",
                 "Whether x is normal, inferior or Giffen <b>at the point you are at</b>. It is not a "
                 "property of the whole function: it changes from stretch to stretch."),
      ]),
    ]),

    sec("Los intervalos: lo primero que hay que ajustar", "Ranges: the first thing to set", [
      h2("Por qué existen esas casillas", "Why those boxes are there"),
      p("Arriba del todo hay tres parejas de casillas: p<sub>x</sub> de … a …, p<sub>y</sub> de … a …, "
        "m de … a … Cada pareja hace dos cosas a la vez: fija hasta dónde llega el deslizador, y fija "
        "el tramo que dibuja el eje horizontal del panel de demanda.",
        "At the very top there are three pairs of boxes: p<sub>x</sub> from … to …, p<sub>y</sub> "
        "from … to …, m from … to … Each pair does two things at once: it sets how far the slider "
        "travels, and it sets the stretch the horizontal axis of the demand panel draws."),
      warn("Un precio mínimo muy cerca de cero arruina el dibujo. La demanda de x tiende a infinito "
           "cuando p<sub>x</sub> → 0, así que el eje vertical se estira hasta que la parte "
           "interesante de la curva queda aplastada contra el eje. Deja el mínimo en 1, o al menos "
           "en 0,5.",
           "A minimum price near zero ruins the picture. Demand for x runs off to infinity as "
           "p<sub>x</sub> → 0, so the vertical axis stretches until the interesting part of the "
           "curve is squashed flat against the axis. Leave the minimum at 1, or at least 0.5."),
      h2("El eje vertical fijo", "The fixed vertical axis"),
      p("Con <b>Eje vertical fijo</b> encendido, el tope del eje vertical es m<sub>máx</sub> "
        "dividido entre el precio mínimo, y no se mueve nunca. Es la mayor cantidad que se podría "
        "comprar con los intervalos que has puesto, así que la curva siempre cabe y siempre llega "
        "hasta cero por abajo. Apágalo y el eje se ajusta a la curva del momento: se ve más grande, "
        "pero salta cada vez que tocas un parámetro y las comparaciones dejan de ser justas.",
        "With <b>Fixed vertical axis</b> on, the ceiling of the vertical axis is m<sub>max</sub> "
        "divided by the minimum price, and it never moves. That is the most anyone could buy given "
        "the ranges you set, so the curve always fits and always reaches down to zero. Turn it off "
        "and the axis fits the current curve: bigger, but it jumps every time you touch a parameter "
        "and comparisons stop being fair."),
      note("Para comparar dos situaciones —antes y después de una subida de precio, o dos familias "
           "de preferencias— el eje fijo es imprescindible. Si el eje se mueve, las dos curvas están "
           "dibujadas a escalas distintas y la comparación engaña.",
           "To compare two situations — before and after a price rise, or two preference families — "
           "the fixed axis is essential. If the axis moves, the two curves are drawn at different "
           "scales and the comparison lies."),
    ]),

    sec("Las familias de preferencias", "The preference families", [
      h2("Seis puntos de partida", "Six starting points"),
      table(["Familia", "Qué es y qué parámetros tiene"], ["Family", "What it is and its parameters"], [
        ("<b>Cobb–Douglas</b>",
         "U = x<sup>α</sup>·y<sup>1−α</sup>. Un parámetro, α. La demanda es "
         "x* = α·m/p<sub>x</sub>: una hipérbola, y el gasto en x no depende del precio.",
         "U = x<sup>α</sup>·y<sup>1−α</sup>. One parameter, α. Demand is "
         "x* = α·m/p<sub>x</sub>: a hyperbola, and spending on x does not depend on the price."),
        ("<b>CES</b>",
         "U = γ<sub>H</sub>·(γ·x<sup>ρ</sup> + (1−γ)·y<sup>ρ</sup>)<sup>1/ρ</sup>, donde γ<sub>H</sub> "
         "es la media armónica de γ y 1−γ. Dos parámetros: γ reparte el peso, ρ manda en la "
         "sustituibilidad. Con ρ = 0 se convierte en Cobb–Douglas.",
         "U = γ<sub>H</sub>·(γ·x<sup>ρ</sup> + (1−γ)·y<sup>ρ</sup>)<sup>1/ρ</sup>, where γ<sub>H</sub> "
         "is the harmonic mean of γ and 1−γ. Two parameters: γ splits the weight, ρ governs "
         "substitutability. At ρ = 0 it becomes Cobb–Douglas."),
        ("<b>Cuasilineal</b>",
         "Primero eliges cuál es la variable lineal —<b>u = φ(x) + y</b> o <b>u = x + ψ(y)</b>— y "
         "después escribes tú la parte curva en la casilla que aparece.",
         "First you choose which variable is the linear one — <b>u = φ(x) + y</b> or "
         "<b>u = x + ψ(y)</b> — and then you type the curved half into the box that appears."),
        ("<b>Lineal (sustitutos)</b>",
         "U = a·x + y. La RMS es constante e igual a a. La demanda es todo o nada: un salto de un "
         "eje al otro cuando p<sub>x</sub>/p<sub>y</sub> cruza a.",
         "U = a·x + y. MRS is constant at a. Demand is all-or-nothing: a jump from one axis to the "
         "other when p<sub>x</sub>/p<sub>y</sub> crosses a."),
        ("<b>X inferior (Giffen)</b>",
         "U = ln(x − x̲) − ((1+b)/b)·ln(ȳ − y), con b = (1−β)/β. Tres parámetros: β, el mínimo de "
         "subsistencia x̲ y el techo ȳ. Es la familia con la que se caza el caso Giffen.",
         "U = ln(x − x̲) − ((1+b)/b)·ln(ȳ − y), with b = (1−β)/β. Three parameters: β, the "
         "subsistence floor x̲ and the ceiling ȳ. This is the family you hunt the Giffen case with."),
        ("<b>Personalizada</b>",
         "Escribe tú la utilidad. El óptimo se busca numéricamente, así que valen funciones con "
         "vértices y esquinas.",
         "Type your own utility. The optimum is found numerically, so kinks and corners are fine."),
      ]),
      note("La cuasilineal tiene dos pasos a propósito. Hasta que no dices cuál es la variable "
           "lineal, la casilla de la función no aparece: φ sólo puede depender de x, y ψ sólo de y. "
           "Si escribes <code>ln(y)</code> en la casilla de φ, el applet lo rechaza.",
           "The quasilinear one has two steps on purpose. Until you say which variable is linear, "
           "the function box does not appear: φ may only depend on x, and ψ only on y. If you type "
           "<code>ln(y)</code> into the φ box, the applet refuses it."),
    ]),

    sec("Descubrir una curva de demanda", "Discovering a demand curve", [
      h2("La idea", "The idea"),
      p("La curva de demanda no se postula: se construye. Se fija todo menos una variable, se mueve "
        "esa variable, y se apunta la canasta óptima que sale cada vez. El grupo de <b>Descubrir la "
        "demanda</b> hace exactamente eso, y deja que el alumno lo vea ocurrir en lugar de contárselo.",
        "The demand curve is not postulated: it is built. Hold everything fixed but one variable, "
        "move that variable, and record the optimal bundle each time. The <b>Discover the demand "
        "curve</b> group does exactly that, and lets the student watch it happen rather than being told."),
      table(*HEAD_CTRL, [
        ("<b>Variable que varía</b>",
         "Cuál mueves: p<sub>x</sub>, p<sub>y</sub> o m. Las otras dos quedan fijas. Los puntos que "
         "registres pertenecen sólo a la variable elegida: si la cambias, empiezas otra colección.",
         "Which one you move: p<sub>x</sub>, p<sub>y</sub> or m. The other two stay fixed. Recorded "
         "points belong to the chosen variable only: change it and you start a fresh collection."),
        ("<b>Marcar al mover</b>",
         "Encendido, cada vez que tocas el deslizador queda una marca. Es la forma rápida.",
         "On, every touch of the slider leaves a mark. This is the quick way."),
        ("<b>Registrar punto</b>",
         "Marca sólo cuando lo pulsas. Es la forma lenta, y la mejor para explicar: mueves, "
         "preguntas, registras.",
         "Marks only when you press it. This is the slow way, and the better one for explaining: "
         "move, ask, record."),
        ("<b>Barrido</b> / <b>Parar</b>",
         "El applet recorre la variable de un extremo al otro solo, dejando marcas. Para rematar, "
         "cuando ya se ha entendido de dónde salen los puntos.",
         "The applet sweeps the variable from end to end on its own, leaving marks. For the finish, "
         "once it is clear where the points come from."),
        ("<b>Limpiar</b>", "Borra todos los puntos registrados y vuelve a empezar.",
                            "Clears every recorded point and starts over."),
      ]),
      h2("Un recorrido de diez minutos", "A ten-minute run"),
      steps([
        ("Elige <b>Cobb–Douglas</b>. Pon los intervalos: p<sub>x</sub> de <b>0,5</b> a <b>6</b>, "
         "p<sub>y</sub> de <b>0,5</b> a <b>4</b>, m de <b>0</b> a <b>10</b>. Escribe los números en "
         "las casillas y pulsa <code>Intro</code>.",
         "Pick <b>Cobb–Douglas</b>. Set the ranges: p<sub>x</sub> from <b>0.5</b> to <b>6</b>, "
         "p<sub>y</sub> from <b>0.5</b> to <b>4</b>, m from <b>0</b> to <b>10</b>. Type the numbers "
         "into the boxes and press <code>Enter</code>.", None),
        ("Pon α = <b>0,5</b>, p<sub>y</sub> = <b>2</b>, m = <b>6</b>. Deja p<sub>x</sub> en 1.",
         "Set α = <b>0.5</b>, p<sub>y</sub> = <b>2</b>, m = <b>6</b>. Leave p<sub>x</sub> at 1.",
         ("x* = 3, y* = 1,5. La mitad de la renta en cada bien.",
          "x* = 3, y* = 1.5. Half the income on each good.")),
        ("Apaga <b>Marcar al mover</b> y <b>Revelar la curva</b>. La variable que varía debe ser "
         "p<sub>x</sub>. Sube p<sub>x</sub> a 1,5 y pulsa <b>Registrar punto</b>. Repite en 2 y en 3.",
         "Turn off <b>Mark while moving</b> and <b>Reveal the curve</b>. The swept variable should "
         "be p<sub>x</sub>. Raise p<sub>x</sub> to 1.5 and press <b>Record point</b>. Repeat at 2 "
         "and at 3.",
         ("Cuatro puntos: (1, 3), (1,5, 2), (2, 1,5), (3, 1). Es exactamente x* = 3/p<sub>x</sub>.",
          "Four points: (1, 3), (1.5, 2), (2, 1.5), (3, 1). That is exactly x* = 3/p<sub>x</sub>.")),
        ("Enciende <b>Unir los puntos</b>. Sale una poligonal que ya se parece a una hipérbola. "
         "Enciende ahora <b>Revelar la curva</b> para ver la curva exacta por debajo.",
         "Switch on <b>Join the points</b>. A polyline appears that already looks like a hyperbola. "
         "Now switch on <b>Reveal the curve</b> to see the exact curve underneath.",
         ("Los puntos caen sobre la curva. No hay truco: son el mismo cálculo.",
          "The points land on the curve. No trick: it is the same computation.")),
        ("Fíjate en el gasto en x mientras mueves p<sub>x</sub>: p<sub>x</sub>·x* = 3 siempre. Ésa "
         "es la firma de Cobb–Douglas, y explica por qué la curva es una hipérbola.",
         "Watch spending on x as you move p<sub>x</sub>: p<sub>x</sub>·x* = 3 always. That is the "
         "Cobb–Douglas signature, and it explains why the curve is a hyperbola.", None),
        ("Cambia la variable que varía a <b>m</b> y limpia los puntos. Barre la renta de 0 a 10.",
         "Change the swept variable to <b>m</b> and clear the points. Sweep income from 0 to 10.",
         ("La curva de Engel es una recta por el origen: x* = 0,5·m/p<sub>x</sub>.",
          "The Engel curve is a straight line through the origin: x* = 0.5·m/p<sub>x</sub>.")),
      ]),
    ]),

    sec("Cazar un bien Giffen", "Hunting a Giffen good", [
      h2("Qué hace falta", "What it takes"),
      p("Un bien Giffen es un bien cuya demanda <i>sube</i> cuando sube su propio precio. Es raro, y "
        "hacen falta dos cosas a la vez: que el bien sea inferior, y que pese tanto en el "
        "presupuesto que el efecto renta se coma al efecto sustitución. Ser inferior no basta.",
        "A Giffen good is one whose demand <i>rises</i> when its own price rises. It is rare, and it "
        "needs two things at once: the good must be inferior, and it must weigh so heavily in the "
        "budget that the income effect swallows the substitution effect. Being inferior is not enough."),
      note("En la familia <b>X inferior</b>, el tramo Giffen aparece cuando la renta supera "
           "p<sub>y</sub>·ȳ. Con esa desigualdad al revés, x es inferior pero no Giffen — que es "
           "justo la distinción que interesa enseñar.",
           "In the <b>X inferior</b> family the Giffen stretch appears once income exceeds "
           "p<sub>y</sub>·ȳ. With that inequality the other way round, x is inferior but not Giffen — "
           "which is exactly the distinction worth teaching."),
      h2("Una receta que funciona", "A recipe that works"),
      steps([
        ("Elige la familia <b>X inferior (Giffen)</b>.",
         "Pick the <b>X inferior (Giffen)</b> family.", None),
        ("Intervalos: p<sub>x</sub> de <b>7</b> a <b>21</b>, p<sub>y</sub> de <b>0,5</b> a <b>4</b>, "
         "m de <b>0</b> a <b>10</b>.",
         "Ranges: p<sub>x</sub> from <b>7</b> to <b>21</b>, p<sub>y</sub> from <b>0.5</b> to <b>4</b>, "
         "m from <b>0</b> to <b>10</b>.", None),
        ("Parámetros: β = <b>0,89</b>, x̲ = <b>0,3</b>, ȳ = <b>5</b>. Precios y renta: "
         "p<sub>y</sub> = <b>1</b>, m = <b>7</b>.",
         "Parameters: β = <b>0.89</b>, x̲ = <b>0.3</b>, ȳ = <b>5</b>. Prices and income: "
         "p<sub>y</sub> = <b>1</b>, m = <b>7</b>.",
         ("La condición se cumple: m = 7 &gt; p<sub>y</sub>·ȳ = 5.",
          "The condition holds: m = 7 &gt; p<sub>y</sub>·ȳ = 5.")),
        ("Enciende <b>Resaltar tramo Giffen</b> y <b>Revelar la curva</b>, y barre p<sub>x</sub> de "
         "punta a punta.",
         "Switch on <b>Highlight Giffen stretch</b> and <b>Reveal the curve</b>, and sweep "
         "p<sub>x</sub> from end to end.",
         ("La demanda de x sube: 0,302 en p<sub>x</sub> = 7, 0,312 en 10, 0,321 en 15 y 0,325 en 21. "
          "La curva tiene pendiente positiva y el tramo queda resaltado.",
          "Demand for x rises: 0.302 at p<sub>x</sub> = 7, 0.312 at 10, 0.321 at 15 and 0.325 at 21. "
          "The curve slopes upward and the stretch is highlighted.")),
        ("Baja ahora la renta a <b>4</b>, por debajo de p<sub>y</sub>·ȳ = 5, y vuelve a barrer.",
         "Now drop income to <b>4</b>, below p<sub>y</sub>·ȳ = 5, and sweep again.",
         ("El resaltado desaparece: x sigue siendo inferior, pero ya no es Giffen.",
          "The highlight disappears: x is still inferior, but no longer Giffen.")),
      ]),
      warn("Si el panel de demanda sale vacío en parte del recorrido, es que estás fuera del dominio "
           "de la función: en esta familia hace falta x &gt; x̲ e y &lt; ȳ. Sube el precio mínimo o "
           "baja la renta hasta que la curva vuelva a aparecer entera.",
           "If the demand panel goes blank over part of the sweep, you are outside the domain of the "
           "function: this family needs x &gt; x̲ and y &lt; ȳ. Raise the minimum price or lower "
           "income until the curve is whole again."),
    ]),

    sec("Las capas", "The layers", [
      h2("Qué enciende cada una", "What each one turns on"),
      table(*HEAD_LAYER, [
        ("Puntos registrados", "Las marcas que has ido dejando.", "The marks you have left."),
        ("Unir los puntos", "Una poligonal entre marca y marca.", "A polyline from mark to mark."),
        ("Revelar la curva", "La curva de demanda exacta. Déjala apagada mientras el alumno la construye.",
                             "The exact demand curve. Leave it off while the student builds it."),
        ("Senda precio-consumo", "En el plano (x, y), el rastro del óptimo al mover el precio. Es la "
                                 "misma información que la curva de demanda, en otro sistema de coordenadas.",
                                 "In the (x, y) plane, the trail of the optimum as the price moves. "
                                 "The same information as the demand curve, in other coordinates."),
        ("Recta presupuestaria", "La restricción en el plano (x, y).", "The constraint in the (x, y) plane."),
        ("Curva de indiferencia", "La que pasa por el óptimo actual.", "The one through the current optimum."),
        ("Demanda de x", "La curva de x en el panel de demanda.", "The curve for x in the demand panel."),
        ("Demanda de y", "La de y, en el mismo panel. Suele ser la que sorprende.",
                         "The one for y, in the same panel. It is usually the surprising one."),
        ("Resaltar tramo Giffen", "Marca en color el tramo donde la demanda sube con el precio.",
                                  "Colours the stretch where demand rises with the price."),
        ("Retícula", "La cuadrícula de fondo.", "The background grid."),
      ]),
      note("Un ejemplo bonito con la cuasilineal: elige <b>u = φ(x) + y</b>, escribe "
           "<code>4ln(x)</code>, pon p<sub>y</sub> = 2 y m = 10. La demanda de x es "
           "x* = 4p<sub>y</sub>/p<sub>x</sub> = 8/p<sub>x</sub>, y la de y sale <b>plana</b>: valga "
           "lo que valga p<sub>x</sub>, y* = 1. El gasto en x es siempre 4p<sub>y</sub> = 8.",
           "A nice example with the quasilinear: choose <b>u = φ(x) + y</b>, type <code>4ln(x)</code>, "
           "set p<sub>y</sub> = 2 and m = 10. Demand for x is x* = 4p<sub>y</sub>/p<sub>x</sub> = "
           "8/p<sub>x</sub>, and demand for y comes out <b>flat</b>: whatever p<sub>x</sub> is, "
           "y* = 1. Spending on x is always 4p<sub>y</sub> = 8."),
    ]),

    syntax_section(
      "Se escribe en dos sitios: en la casilla de la utilidad personalizada (variables <b>x</b> e "
      "<b>y</b>) y en la casilla de la parte curva de la cuasilineal (sólo <b>x</b> si has elegido "
      "φ, sólo <b>y</b> si has elegido ψ).",
      "There are two boxes: the custom utility one (variables <b>x</b> and <b>y</b>) and the curved "
      "half of the quasilinear one (only <b>x</b> if you chose φ, only <b>y</b> if you chose ψ).",
      [("x^0.5*y^0.5", "Cobb–Douglas simétrica, como comprobación.",
                       "Symmetric Cobb–Douglas, as a check."),
       ("4ln(x)", "En φ(x): la demanda sale x* = 4p<sub>y</sub>/p<sub>x</sub>, independiente de la renta.",
                  "In φ(x): demand comes out x* = 4p<sub>y</sub>/p<sub>x</sub>, independent of income."),
       ("2sqrt(x)", "En φ(x): x* = p<sub>y</sub>²/p<sub>x</sub>².",
                    "In φ(x): x* = p<sub>y</sub>²/p<sub>x</sub>²."),
       ("3ln(y)", "En ψ(y): ahora el bien lineal es x, y la demanda plana es la de x.",
                  "In ψ(y): now x is the linear good, and the flat demand is x's."),
       ("min(x,y)", "En la personalizada: complementarios perfectos, demanda m/(p<sub>x</sub>+p<sub>y</sub>).",
                    "In the custom box: perfect complements, demand m/(p<sub>x</sub>+p<sub>y</sub>).")]),

    trouble_section([
      ("La curva está aplastada contra el eje",
       "El precio mínimo es demasiado bajo. Súbelo a 1 y el eje vertical baja con él.",
       "The minimum price is too low. Raise it to 1 and the vertical axis comes down with it."),
      ("El eje se mueve cada vez que toco algo",
       "Enciende <b>Eje vertical fijo</b>.",
       "Switch on <b>Fixed vertical axis</b>."),
      ("La casilla del número no hace nada",
       "Las casillas de los intervalos se aplican al pulsar <code>Intro</code> o al salir de la "
       "casilla, no mientras escribes.",
       "The range boxes apply when you press <code>Enter</code> or leave the box, not while you type."),
      ("Los puntos registrados desaparecen",
       "Has cambiado la variable que varía. Cada variable tiene su propia colección de puntos.",
       "You changed the swept variable. Each variable keeps its own collection of points."),
      ("No aparece la casilla para escribir φ",
       "Hay que elegir antes cuál es la variable lineal, pulsando una de las dos opciones.",
       "You must first choose which variable is the linear one, by pressing one of the two options."),
      ("Sale «φ sólo puede depender de x»",
       "Has escrito una y dentro de φ. La parte curva de una cuasilineal depende de una sola variable.",
       "You put a y inside φ. The curved half of a quasilinear function depends on one variable only."),
    ]),
  ])

# ===========================================================================
# 3. Restricciones No Lineales
# ===========================================================================
M3 = dict(
  title="Manual · Restricciones No Lineales / Non-Linear Budget Constraints",
  desc="Manual de uso del applet Restricciones Presupuestarias No Lineales, en español e inglés.",
  h1_es="Restricciones No Lineales", h1_en="Non-Linear Budget Constraints",
  lede_es="Subsidios en especie, subsidios parciales y esquemas excluyentes. Cada uno dobla la "
          "recta de presupuesto en un sitio distinto, y el óptimo puede caer justo en el pliegue.",
  lede_en="In-kind subsidies, partial subsidies and exclusive schemes. Each one bends the budget "
          "line somewhere different, and the optimum can land right on the fold.",
  href="../nonlinear-budget/",
  sections=[
    common_start("Restricciones No Lineales", "Non-Linear Budget Constraints"),

    sec("Qué hay en pantalla", "What is on screen", [
      h2("Hasta tres paneles", "Up to three panels"),
      table(*HEAD_PANEL, [
        ("<b>Plano (x, y)</b>",
         "La frontera presupuestaria con sus pliegues, el conjunto factible, la curva de "
         "indiferencia por el óptimo y —si lo pides— un segundo esquema superpuesto para comparar.",
         "The budget frontier with its folds, the feasible set, the indifference curve through the "
         "optimum and — if you ask — a second scheme overlaid for comparison."),
        ("<b>Utilidad sobre la restricción</b>",
         "La utilidad recorrida a lo largo de la frontera, de x = 0 al extremo. El óptimo es el "
         "máximo de esta curva, y aquí se ve por qué a veces cae en un pico anguloso.",
         "Utility traced along the frontier, from x = 0 to the far end. The optimum is this curve's "
         "maximum, and here you can see why it sometimes lands on a sharp peak."),
        ("<b>Superficie 3D</b> · z = u(x, y)",
         "Opcional, al pie de la pantalla. La misma restricción levantada sobre la superficie de "
         "utilidad: el óptimo es la cima del arco.",
         "Optional, at the foot of the screen. The same constraint lifted onto the utility surface: "
         "the optimum is the summit of the arch."),
      ]),
      h2("Los números", "The readouts"),
      table(*HEAD_READ, [
        ("x*, y*, u(x*, y*)", "La canasta óptima y su utilidad.", "The optimal bundle and its utility."),
        ("Coste", "Lo que le cuesta el programa a quien lo financia.",
                  "What the programme costs whoever funds it."),
        ("Ventaja del efectivo", "Cuánta utilidad más se alcanzaría con una transferencia en "
                                 "efectivo del mismo coste. Es el número que resume el argumento.",
                                 "How much more utility a cash transfer of the same cost would "
                                 "reach. This is the number that carries the argument."),
        ("Tipo de óptimo", "Tangencia, vértice, esquina o borde del salto. Cada uno pide un "
                           "argumento distinto, y sólo el primero admite «RMS = precio relativo».",
                           "Tangency, kink, corner or jump edge. Each needs a different argument, "
                           "and only the first admits “MRS = relative price”."),
        ("Pendiente en x_s", "Cuánto cambia la pendiente de la frontera al cruzar el cupo.",
                             "How much the frontier's slope changes as you cross the allowance."),
        ("Salto en x_s", "Cuánto cae la frontera en vertical en el cupo. Cero salvo en los esquemas "
                         "excluyentes.",
                         "How far the frontier drops vertically at the allowance. Zero except in "
                         "the exclusive schemes."),
      ]),
    ]),

    sec("Los siete esquemas", "The seven schemes", [
      h2("Qué hace cada uno", "What each one does"),
      p("Todos parten de la misma renta m y los mismos precios. Lo que cambia es dónde y cómo se "
        "dobla la recta. El cupo se llama <b>x_s</b> y la intensidad del subsidio <b>s</b>.",
        "All of them start from the same income m and the same prices. What changes is where and "
        "how the line bends. The allowance is called <b>x_s</b> and the subsidy intensity <b>s</b>."),
      table(["Esquema", "La frontera que produce"], ["Scheme", "The frontier it produces"], [
        ("<b>Restricción simple</b>",
         "La recta de siempre, sin programa. El punto de comparación.",
         "The ordinary line, no programme. The benchmark."),
        ("<b>Subsidio en especie (no excluyente)</b>",
         "Las primeras x_s unidades de x son gratis. La frontera arranca <b>horizontal</b> hasta "
         "x_s, y a partir de ahí baja con la pendiente normal. Coste: p<sub>x</sub>·x_s.",
         "The first x_s units of x are free. The frontier starts <b>flat</b> up to x_s and from "
         "there falls with the normal slope. Cost: p<sub>x</sub>·x_s."),
        ("<b>Subsidio parcial en especie</b>",
         "Descuento de s sobre las primeras x_s unidades. La frontera arranca con pendiente "
         "(1−s)·p<sub>x</sub>/p<sub>y</sub> y luego recupera la normal. Coste: s·p<sub>x</sub>·x_s.",
         "A discount of s on the first x_s units. The frontier starts with slope "
         "(1−s)·p<sub>x</sub>/p<sub>y</sub> and then reverts to normal. Cost: s·p<sub>x</sub>·x_s."),
        ("<b>Subsidio excluyente</b>",
         "Como el de especie, pero <b>pasar del cupo hace perder la ayuda entera</b>. La frontera "
         "cae en vertical en x_s y continúa desde la recta original. El ejemplo típico son los "
         "colegios públicos: si matriculas fuera, pierdes la plaza.",
         "Like the in-kind one, but <b>going past the allowance forfeits the whole grant</b>. The "
         "frontier drops vertically at x_s and continues from the original line. The standard "
         "example is public schooling: enrol elsewhere and you lose the place."),
        ("<b>Subsidio parcial excluyente</b>",
         "Igual, con descuento en vez de gratuidad. El salto es más pequeño pero está.",
         "The same with a discount instead of free units. The drop is smaller but it is there."),
        ("<b>Equivalente en efectivo (total)</b>",
         "Una transferencia de p<sub>x</sub>·x_s en dinero. La recta se desplaza hacia fuera, "
         "paralela, sin doblarse.",
         "A cash transfer of p<sub>x</sub>·x_s. The line shifts outward, parallel, with no bend."),
        ("<b>Equivalente en efectivo (parcial)</b>",
         "Lo mismo con s·p<sub>x</sub>·x_s. Es el rival justo del subsidio parcial.",
         "The same with s·p<sub>x</sub>·x_s. The fair rival to the partial subsidy."),
      ]),
      note("El deslizador <b>s</b> llega hasta −1. Con s negativo el programa deja de ser subsidio "
           "y pasa a ser un <b>impuesto</b> de tipo τ = |s| sobre las primeras x_s unidades: la "
           "frontera se dobla hacia dentro en vez de hacia fuera.",
           "The <b>s</b> slider reaches down to −1. With s negative the programme stops being a "
           "subsidy and becomes a <b>tax</b> at rate τ = |s| on the first x_s units: the frontier "
           "bends inward instead of outward."),
      h2("Comparar con", "Compare with"),
      p("El menú <b>Comparar con</b> superpone un segundo esquema en otro color. La comparación que "
        "importa es casi siempre contra la transferencia en efectivo del mismo coste, y viene "
        "elegida por defecto.",
        "The <b>Compare with</b> menu overlays a second scheme in another colour. The comparison "
        "that matters is nearly always against the cash transfer of equal cost, and that is the "
        "default."),
    ]),

    sec("El argumento clásico, en números", "The classic argument, in numbers", [
      h2("Efectivo contra especie", "Cash versus in-kind"),
      p("El resultado que se enseña es que una transferencia en efectivo nunca es peor para quien "
        "la recibe que un subsidio en especie del mismo coste, y a veces es estrictamente mejor. "
        "Aquí se comprueba en dos minutos, y —más importante— se ve <i>cuándo</i> hay diferencia y "
        "cuándo no.",
        "The standard result is that a cash transfer is never worse for the recipient than an "
        "in-kind subsidy of the same cost, and is sometimes strictly better. You can check that in "
        "two minutes here and — more importantly — see <i>when</i> there is a difference and when "
        "there is not."),
      steps([
        ("Pon <b>Cobb–Douglas</b>, p<sub>x</sub> = <b>2</b>, p<sub>y</sub> = <b>2</b>, "
         "m = <b>20</b>, x_s = <b>4</b>. Elige el esquema <b>Subsidio en especie (no excluyente)</b> "
         "y compara con el <b>Equivalente en efectivo (total)</b>.",
         "Set <b>Cobb–Douglas</b>, p<sub>x</sub> = <b>2</b>, p<sub>y</sub> = <b>2</b>, "
         "m = <b>20</b>, x_s = <b>4</b>. Pick the scheme <b>In-kind subsidy (non-exclusive)</b> and "
         "compare with the <b>Cash equivalent (full)</b>.",
         ("Coste del programa: p<sub>x</sub>·x_s = 8.",
          "Programme cost: p<sub>x</sub>·x_s = 8.")),
        ("Deja a = <b>0,5</b>. Mira los dos óptimos.",
         "Leave a = <b>0.5</b>. Look at the two optima.",
         ("Los dos dan x* = 7, y* = 7, u = 7. <b>Empatan.</b> El óptimo cae en la parte donde las "
          "dos fronteras coinciden, así que el cupo no restringe.",
          "Both give x* = 7, y* = 7, u = 7. <b>A tie.</b> The optimum lands where the two frontiers "
          "coincide, so the allowance does not bind.")),
        ("Baja ahora a a <b>0,15</b>. El consumidor deja de querer tanto x.",
         "Now lower a to <b>0.15</b>. The consumer stops wanting so much x.",
         ("En especie: x* = 4, y* = 10, u = 8,716, y el applet lo clasifica como <b>vértice</b>. "
          "En efectivo: x* = 2,1, y* = 11,9, u = 9,174. <b>El efectivo gana.</b>",
          "In kind: x* = 4, y* = 10, u = 8.716, and the applet classes it as a <b>kink</b>. "
          "In cash: x* = 2.1, y* = 11.9, u = 9.174. <b>Cash wins.</b>")),
        ("Ésa es la moraleja completa: el subsidio en especie sólo hace daño cuando <i>empuja</i>. "
         "Con a = 0,5 el consumidor ya quería 7 unidades y las 4 gratis no le obligan a nada; con "
         "a = 0,15 sólo quería 2,1 y el programa le deja parado en 4.",
         "That is the whole moral: an in-kind subsidy only hurts when it <i>pushes</i>. At a = 0.5 "
         "the consumer already wanted 7 units and the 4 free ones force nothing; at a = 0.15 he "
         "only wanted 2.1, and the programme parks him at 4.", None),
      ]),
      h2("Lo que añade la exclusión", "What exclusion adds"),
      p("Los esquemas excluyentes son peores todavía, y por una razón distinta. Con el mismo coste "
        "no sólo doblan la frontera: la <b>rompen</b>.",
        "Exclusive schemes are worse still, and for a different reason. At the same cost they do "
        "not merely bend the frontier: they <b>break</b> it."),
      steps([
        ("Vuelve a a = <b>0,5</b> y cambia el esquema a <b>Subsidio excluyente</b>, con los mismos "
         "p<sub>x</sub> = 2, p<sub>y</sub> = 2, m = 20, x_s = 4.",
         "Go back to a = <b>0.5</b> and change the scheme to <b>Exclusive subsidy</b>, with the same "
         "p<sub>x</sub> = 2, p<sub>y</sub> = 2, m = 20, x_s = 4.",
         ("x* = 4, y* = 10, u = 6,325. El tipo de óptimo es <b>borde del salto</b>.",
          "x* = 4, y* = 10, u = 6.325. The optimum type is <b>jump edge</b>.")),
        ("Compáralo con el subsidio en especie no excluyente, que costaba lo mismo (8) y daba u = 7.",
         "Compare it with the non-exclusive in-kind subsidy, which cost the same (8) and gave u = 7.",
         ("Mismo dinero público, 0,675 menos de utilidad. Lo único que ha cambiado es la regla de "
          "exclusión.",
          "The same public money, 0.675 less utility. The only thing that changed is the exclusion "
          "rule.")),
        ("Enciende la capa <b>Vértices</b> y mira el panel de <b>Utilidad sobre la restricción</b>: "
         "la curva salta hacia abajo justo en x_s. El consumidor se queda pegado al borde izquierdo "
         "del salto porque cruzarlo le cuesta la ayuda entera.",
         "Switch on the <b>Kinks</b> layer and look at the <b>Utility along the constraint</b> "
         "panel: the curve drops at x_s. The consumer sticks to the left edge of the drop because "
         "crossing it costs the whole grant.", None),
      ]),
      note("Ésta es la lectura política del applet: no se trata sólo de cuánto se gasta, sino de "
           "qué forma tiene la frontera que se le deja al beneficiario. Un programa mal diseñado "
           "puede gastar lo mismo y valer menos.",
           "This is the applet's policy reading: it is not only how much is spent, but what shape "
           "of frontier the recipient is left with. A badly designed programme can spend the same "
           "and be worth less."),
    ]),

    sec("La superficie 3D", "The 3D surface", [
      h2("Para qué sirve", "What it is for"),
      p("El interruptor <b>Superficie 3D</b> abre un panel al pie con la misma función de utilidad "
        "dibujada en altura, y la frontera presupuestaria levantada sobre ella. El óptimo, que en "
        "el plano es un punto de tangencia, aquí es sencillamente la cima del arco: para mucha "
        "gente ésa es la imagen que hace clic.",
        "The <b>3D surface</b> switch opens a panel at the foot with the same utility function "
        "drawn in height, and the budget frontier lifted onto it. The optimum, a tangency point in "
        "the plane, is here simply the summit of the arch: for many people that is the picture that "
        "makes it click."),
      table(*HEAD_CTRL, [
        ("<b>3D</b>", "Vista libre en perspectiva. Arrastra para girar la cámara, rueda para acercar.",
                      "Free perspective view. Drag to rotate the camera, wheel to zoom."),
        ("<b>X–Z</b>", "Proyección ortogonal sobre el plano y = 0. Se ve la utilidad frente a x sola.",
                       "Orthogonal projection onto the plane y = 0. Utility against x alone."),
        ("<b>X–Y</b>", "Proyección sobre z = 0: la vista cenital. Es literalmente el mapa de curvas "
                       "de nivel, y sirve para enseñar de dónde salen.",
                       "Projection onto z = 0: the view from above. Literally the contour map, and "
                       "useful for showing where contours come from."),
        ("<b>Y–Z</b>", "Proyección sobre x = 0: la utilidad frente a y.",
                       "Projection onto x = 0: utility against y."),
        ("<b>Sombrear fuera del conjunto factible</b>",
         "Apaga el color de la parte de la superficie que no se puede pagar. Queda encendida sólo "
         "la rebanada asequible, que es donde vive el problema.",
         "Washes out the colour of the part of the surface you cannot afford. Only the affordable "
         "slice stays lit, which is where the problem lives."),
        ("<b>Plano XY</b>", "Dibuja el suelo z = 0 y proyecta la frontera sobre él, para ver a la "
                            "vez la curva levantada y su sombra.",
                            "Draws the floor z = 0 and projects the frontier onto it, so you see the "
                            "lifted curve and its shadow at once."),
      ]),
      note("Las tres proyecciones son <b>ortográficas</b>, no en perspectiva: no hay escorzo, así "
           "que las distancias se pueden comparar directamente. La vista libre sí es en perspectiva, "
           "que es más fácil de leer como volumen pero engaña con las medidas.",
           "The three projections are <b>orthographic</b>, not perspective: nothing foreshortens, "
           "so distances compare directly. The free view is perspective, which reads better as a "
           "solid but misleads about measurements."),
    ]),

    sec("Los ejes y las capas", "Axes and layers", [
      h2("Ajustar los ejes", "Setting the axes"),
      p("Por defecto los ejes están <b>fijos</b> en los topes que escribas, para que dos esquemas se "
        "puedan comparar a la misma escala. Si la frontera se sale del marco aparece un aviso: sube "
        "el tope o marca <b>Ajustar los ejes solos</b>.",
        "By default the axes are <b>fixed</b> at the ceilings you type, so two schemes compare at "
        "the same scale. If the frontier leaves the frame a warning appears: raise the ceiling or "
        "tick <b>Fit the axes automatically</b>."),
      h2("Las capas", "The layers"),
      table(*HEAD_LAYER, [
        ("Degradado de calor", "El fondo de color del mapa de utilidad. Apágalo y el fondo queda "
                               "liso; las curvas de indiferencia conservan su color de altura.",
                               "The coloured utility map. Turn it off and the background goes plain; "
                               "the indifference curves keep their height colour."),
        ("Curvas de fondo", "Curvas de indiferencia a niveles regulares.",
                            "Indifference curves at regular levels."),
        ("Conjunto factible", "Oscurece todo lo que queda fuera del presupuesto.",
                              "Darkens everything outside the budget."),
        ("Curva por el óptimo", "La curva de indiferencia que pasa por la solución.",
                                "The indifference curve through the solution."),
        ("Óptimo", "El punto. Apágalo mientras el alumno lo busca.",
                   "The point. Turn it off while the student looks for it."),
        ("Vértices", "Marca los pliegues y los saltos de la frontera.",
                     "Marks the folds and the jumps of the frontier."),
        ("Conjunto comparado", "El área factible del segundo esquema.",
                               "The feasible area of the second scheme."),
        ("Retícula", "La cuadrícula.", "The grid."),
      ]),
    ]),

    syntax_section(
      "En la casilla de preferencias personalizadas las variables son <b>x</b> e <b>y</b>. El "
      "óptimo se busca recorriendo la frontera tramo por tramo y comprobando además los dos "
      "extremos de cada tramo, así que los vértices y los saltos se encuentran bien aunque la "
      "condición de primer orden no diga nada allí.",
      "In the custom preferences box the variables are <b>x</b> and <b>y</b>. The optimum is found "
      "by walking the frontier piece by piece and also testing both ends of every piece, so kinks "
      "and jumps are found properly even where the first-order condition says nothing.",
      [("x^0.3*y^0.7", "Cobb–Douglas con más peso en y: el cupo de x tiende a morder.",
                       "Cobb–Douglas weighted towards y: the x allowance tends to bind."),
       ("min(x,y)", "Complementarios perfectos. El óptimo salta de un pliegue a otro.",
                    "Perfect complements. The optimum jumps from fold to fold."),
       ("x+2y", "Sustitutos perfectos: soluciones de esquina, y el subsidio puede voltearlas.",
                "Perfect substitutes: corner solutions, and the subsidy can flip them."),
       ("ln(x)+y", "Cuasilineal: la demanda de x no depende de la renta, y el cupo se ve limpio.",
                   "Quasilinear: demand for x does not depend on income, so the allowance shows clean.")]),

    trouble_section([
      ("Sale «La frontera se sale del marco»",
       "Sube el tope de x o de y, o marca <b>Ajustar los ejes solos</b>. Con x_s grande la frontera "
       "se alarga mucho.",
       "Raise the x or y ceiling, or tick <b>Fit the axes automatically</b>. With a large x_s the "
       "frontier stretches a long way."),
      ("Los dos esquemas se ven idénticos",
       "Es un resultado, no un fallo: el cupo no está mordiendo. Baja el parámetro a de las "
       "preferencias, o sube x_s, hasta que el óptimo caiga sobre el pliegue.",
       "That is a result, not a bug: the allowance is not biting. Lower the preference parameter a, "
       "or raise x_s, until the optimum lands on the fold."),
      ("La ventaja del efectivo sale cero",
       "Lo mismo: el óptimo está en el tramo donde las dos fronteras coinciden. Es exactamente el "
       "caso en que dar en especie no cuesta nada en bienestar.",
       "Same thing: the optimum is on the stretch where the two frontiers coincide. That is exactly "
       "the case where giving in kind costs nothing in welfare."),
      ("El panel 3D va lento",
       "Cierra el panel de sustitución, o baja los topes de los ejes. La malla se recalcula al girar.",
       "Close the substitution panel, or lower the axis ceilings. The mesh is rebuilt as you rotate."),
      ("No consigo volver a la vista libre",
       "Pulsa el botón <b>3D</b> del grupo de vistas, o arrastra directamente sobre el panel: "
       "arrastrar sale de la proyección.",
       "Press the <b>3D</b> button in the view group, or just drag on the panel: dragging leaves "
       "the projection."),
    ]),
  ])

# ===========================================================================
# 4. Impuesto a la Renta del Trabajo
# ===========================================================================
M4 = dict(
  title="Manual · Impuesto a la Renta del Trabajo / Labour Income Tax",
  desc="Manual de uso del applet Impuesto a la Renta del Trabajo, en español e inglés.",
  h1_es="Impuesto a la Renta del Trabajo", h1_en="Labour Income Tax",
  lede_es="Un impuesto por tramos dobla la restricción entre consumo y ocio. Con tipos marginales "
          "la frontera se quiebra; con tipos medios se rompe, y cruzar un umbral deja al "
          "trabajador estrictamente peor.",
  lede_en="A bracketed tax bends the constraint between consumption and leisure. Marginal rates "
          "kink the frontier; average rates break it, and crossing a threshold leaves the worker "
          "strictly worse off.",
  href="../labor-tax/",
  sections=[
    common_start("Impuesto a la Renta del Trabajo", "Labour Income Tax"),

    sec("El modelo, en una página", "The model, on one page", [
      h2("Qué está eligiendo el trabajador", "What the worker is choosing"),
      p("La dotación de tiempo está normalizada a <b>1</b>. El trabajador reparte esa unidad entre "
        "trabajo L y ocio ℓ = 1 − L. Trabajando toda la dotación gana <b>w</b>; trabajando la mitad, "
        "w/2. Además tiene una renta no laboral <b>m₀</b> que cobra trabaje o no.",
        "The time endowment is normalised to <b>1</b>. The worker splits that unit between labour L "
        "and leisure ℓ = 1 − L. Working the whole endowment earns <b>w</b>; working half of it, w/2. "
        "On top of that there is non-labour income <b>m₀</b>, received whether he works or not."),
      p("El consumo es lo que queda después del impuesto, dividido por el precio del bien: "
        "c = (m₀ + w·L − impuesto) / p<sub>x</sub>. El impuesto recae sobre la renta del trabajo "
        "w·L, no sobre m₀.",
        "Consumption is what is left after tax, divided by the price of the good: "
        "c = (m₀ + w·L − tax) / p<sub>x</sub>. The tax falls on labour income w·L, not on m₀."),
      note("Que m₀ no tribute es una decisión del modelo, y conviene decirla en voz alta en clase: "
           "si tributase, la frontera se desplazaría entera y los umbrales caerían en otros sitios. "
           "Aquí los dos modos usan la misma base imponible, que es lo que permite compararlos.",
           "That m₀ is untaxed is a modelling choice, and worth saying out loud in class: if it "
           "were taxed, the whole frontier would shift and the thresholds would land elsewhere. "
           "Here both modes use the same tax base, which is what makes them comparable."),
      h2("Los tres tramos", "The three brackets"),
      p("Dos umbrales, <b>s₀</b> y <b>s₁</b>, definidos sobre la renta del trabajo, y tres tipos, "
        "<b>t₀</b>, <b>t₁</b> y <b>t₂</b>. Lo interesante no son los números sino cómo se aplican, "
        "y eso lo decide el grupo <b>Cómo se aplica</b>.",
        "Two thresholds, <b>s₀</b> and <b>s₁</b>, defined on labour income, and three rates, "
        "<b>t₀</b>, <b>t₁</b> and <b>t₂</b>. What matters is not the numbers but how they apply, "
        "and that is what the <b>How it applies</b> group decides."),
      table(["Modo", "Cómo se calcula el impuesto"], ["Mode", "How the tax is worked out"], [
        ("<b>Tipos marginales</b>",
         "Cada tipo se aplica sólo a la parte de la renta que cae dentro de su tramo. Es el sistema "
         "real de casi todos los países. La renta neta es <b>continua</b>: la frontera se quiebra "
         "pero no se rompe, y ganar un peso más siempre deja algo más.",
         "Each rate applies only to the slice of income falling inside its own bracket. This is how "
         "nearly every real system works. Net income is <b>continuous</b>: the frontier kinks but "
         "does not break, and earning one more always leaves you with more."),
        ("<b>Tipos medios</b>",
         "El tramo en el que caes fija el tipo sobre <b>toda</b> tu renta. En cada umbral la renta "
         "neta da un salto hacia abajo. Ganar un peso más puede dejarte con bastante menos.",
         "The bracket you land in sets the rate on <b>all</b> of your income. At each threshold net "
         "income jumps down. Earning one more can leave you with considerably less."),
      ]),
    ]),

    sec("Qué hay en pantalla", "What is on screen", [
      h2("Los dos paneles", "The two panels"),
      table(*HEAD_PANEL, [
        ("<b>Consumo y ocio</b>",
         "La restricción entre consumo y ocio, con el mapa de utilidad de fondo, la curva de "
         "indiferencia por el óptimo y los umbrales marcados. Con el interruptor de eje puedes "
         "poner <b>trabajo</b> en la horizontal en vez de ocio: es el mismo dibujo del revés, pero "
         "para hablar de horas trabajadas se lee mejor.",
         "The constraint between consumption and leisure, with the utility map behind, the "
         "indifference curve through the optimum and the thresholds marked. The axis switch puts "
         "<b>labour</b> on the horizontal instead of leisure: the same picture mirrored, but easier "
         "to read when talking about hours worked."),
        ("<b>Renta neta</b> / <b>Utilidad</b>",
         "El segundo panel muestra o la renta neta frente a la bruta —donde el salto de los tipos "
         "medios salta a la vista— o la utilidad recorrida a lo largo de la frontera.",
         "The second panel shows either net against gross income — where the average-rate drop is "
         "unmissable — or utility traced along the frontier."),
      ]),
      h2("Los números", "The readouts"),
      table(*HEAD_READ, [
        ("Consumo, Trabajo L*, Ocio", "La elección óptima.", "The optimal choice."),
        ("u(c*, ℓ*)", "La utilidad que alcanza.", "The utility it reaches."),
        ("Renta bruta", "w·L*, antes de impuestos.", "w·L*, before tax."),
        ("Impuesto", "Lo que paga.", "What is paid."),
        ("Tipo medio", "Impuesto dividido entre renta bruta.", "Tax divided by gross income."),
        ("Tipo marginal", "Lo que se lleva el fisco del siguiente peso ganado. Es el número que "
                          "gobierna la decisión de trabajar una hora más.",
                          "What the taxman takes from the next unit earned. This is the number that "
                          "governs the decision to work one more hour."),
        ("Tipo de óptimo", "Tangencia, quiebre, borde del salto, no trabaja o trabaja todo.",
                           "Tangency, kink, jump edge, no work or all work."),
        ("Mayor salto", "El escalón más grande de la frontera. Cero con tipos marginales.",
                        "The biggest step in the frontier. Zero under marginal rates."),
      ]),
    ]),

    sec("El experimento central", "The central experiment", [
      h2("Los mismos tramos, dos maneras de aplicarlos", "The same brackets, two ways of applying them"),
      p("Éste es el ejercicio que justifica el applet entero. Los números están comprobados: si no "
        "te salen, revisa que hayas puesto todos los deslizadores.",
        "This is the exercise that justifies the whole applet. The numbers are checked: if yours "
        "differ, make sure every slider is set."),
      steps([
        ("Elige <b>Cobb–Douglas</b> con α = <b>0,5</b>. Salario y renta: w = <b>100</b>, "
         "m₀ = <b>0</b>, p<sub>x</sub> = <b>1</b>.",
         "Pick <b>Cobb–Douglas</b> with α = <b>0.5</b>. Wage and income: w = <b>100</b>, "
         "m₀ = <b>0</b>, p<sub>x</sub> = <b>1</b>.", None),
        ("Tramos: t₀ = <b>0</b>, s₀ = <b>40</b>, t₁ = <b>0,2</b>, s₁ = <b>70</b>, t₂ = <b>0,8</b>. "
         "Los primeros 40 no tributan; entre 40 y 70 el tipo es del 20 %; por encima, del 80 %.",
         "Brackets: t₀ = <b>0</b>, s₀ = <b>40</b>, t₁ = <b>0.2</b>, s₁ = <b>70</b>, t₂ = <b>0.8</b>. "
         "The first 40 is untaxed; between 40 and 70 the rate is 20 %; above that, 80 %.", None),
        ("Ponlo en <b>Tipos marginales</b>.",
         "Set it to <b>Marginal rates</b>.",
         ("L* = 0,45 — trabaja el 45 % de su tiempo. Consumo 44, ocio 0,55, u = 4,919. Renta bruta "
          "45, impuesto 1. El applet lo llama <b>tangencia</b>: es un óptimo interior corriente.",
          "L* = 0.45 — he works 45 % of his time. Consumption 44, leisure 0.55, u = 4.919. Gross "
          "income 45, tax 1. The applet calls it a <b>tangency</b>: an ordinary interior optimum.")),
        ("Cambia sólo el modo a <b>Tipos medios</b>. No toques nada más: mismos tramos, mismo "
         "salario, mismas preferencias.",
         "Change only the mode to <b>Average rates</b>. Touch nothing else: same brackets, same "
         "wage, same preferences.",
         ("L* = 0,40 — trabaja menos. Consumo 40, ocio 0,60, u = 4,899, y el tipo de óptimo pasa a "
          "ser <b>borde del salto</b>. Se ha quedado clavado justo debajo del umbral.",
          "L* = 0.40 — he works less. Consumption 40, leisure 0.60, u = 4.899, and the optimum type "
          "becomes <b>jump edge</b>. He has parked himself just below the threshold.")),
        ("Pon el segundo panel en <b>Renta neta</b> y mira el escalón en 40.",
         "Set the second panel to <b>Net income</b> and look at the step at 40.",
         ("Con renta bruta 40 se queda 40; con 40,01 se queda 32,01. Un peso más de renta bruta "
          "cuesta <b>ocho</b> de renta neta.",
          "At gross 40 he keeps 40; at 40.01 he keeps 32.01. One more unit of gross income costs "
          "<b>eight</b> of net income.")),
        ("Vuelve a <b>Tipos marginales</b> y sube t₁ a <b>0,4</b>.",
         "Go back to <b>Marginal rates</b> and raise t₁ to <b>0.4</b>.",
         ("Ahora L* = 0,40 también, con u = 4,899, pero el tipo de óptimo es <b>quiebre</b>, no "
          "salto. También hay amontonamiento en el umbral, sólo que por una razón más suave.",
          "Now L* = 0.40 too, with u = 4.899, but the optimum type is <b>kink</b>, not jump. There "
          "is bunching at the threshold here as well, only for a gentler reason.")),
      ]),
      note("Ésa es la distinción que hay que llevarse: los <b>quiebres</b> amontonan gente porque "
           "el salario neto cae de golpe, y los <b>saltos</b> la amontonan porque cruzar el umbral "
           "deja estrictamente peor. Lo primero es un coste de eficiencia; lo segundo es, "
           "sencillamente, un error de diseño.",
           "That is the distinction to take away: <b>kinks</b> bunch people because the net wage "
           "falls abruptly, and <b>jumps</b> bunch them because crossing the threshold leaves them "
           "strictly worse off. The first is an efficiency cost; the second is simply a design error."),
    ]),

    sec("Más cosas que probar", "More to try", [
      h2("Tres variaciones", "Three variations"),
      steps([
        ("<b>Subir la renta no laboral.</b> Con los tramos de antes en modo marginal, sube m₀ de 0 "
         "a 20. El trabajador se hace más rico sin trabajar más.",
         "<b>Raise non-labour income.</b> With the same brackets in marginal mode, raise m₀ from 0 "
         "to 20. The worker gets richer without working more.",
         ("L* baja: con el ocio como bien normal, la renta extra se gasta en parte en no trabajar.",
          "L* falls: with leisure a normal good, part of the extra income is spent on not working.")),
        ("<b>Un tipo confiscatorio.</b> Sube t₂ hasta 0,95 y baja s₁ a 45.",
         "<b>A confiscatory rate.</b> Raise t₂ to 0.95 and lower s₁ to 45.",
         ("Casi nadie cruza el segundo umbral: la frontera queda casi horizontal a partir de ahí y "
          "trabajar más apenas paga.",
          "Almost nobody crosses the second threshold: the frontier goes nearly flat beyond it and "
          "working more barely pays.")),
        ("<b>Preferencias cuasilineales.</b> Elige <b>Cuasilineal</b> y compara los dos modos otra "
         "vez. En la casilla personalizada, x es el consumo e y el ocio.",
         "<b>Quasilinear preferences.</b> Pick <b>Quasilinear</b> and compare the two modes again. "
         "In the custom box, x is consumption and y is leisure.",
         ("El efecto renta desaparece del bien lineal, así que el amontonamiento se ve más limpio.",
          "The income effect drops out of the linear good, so the bunching shows more cleanly.")),
      ]),
      h2("Las capas", "The layers"),
      table(*HEAD_LAYER, [
        ("Mapa de utilidad", "El fondo de color.", "The coloured background."),
        ("Curvas de fondo", "Curvas de indiferencia a niveles regulares.",
                            "Indifference curves at regular levels."),
        ("Conjunto factible", "Lo alcanzable bajo la frontera.", "What is reachable under the frontier."),
        ("Curva por el óptimo", "La curva de indiferencia de la solución.",
                                "The indifference curve of the solution."),
        ("Óptimo", "El punto elegido.", "The chosen point."),
        ("Umbrales", "Las líneas verticales en s₀/w y s₁/w. Encendidas es como se ve que el óptimo "
                     "cae justo encima.",
                     "The vertical lines at s₀/w and s₁/w. With these on you can see the optimum "
                     "land right on top of one."),
        ("Retícula", "La cuadrícula.", "The grid."),
      ]),
    ]),

    syntax_section(
      "En la casilla de utilidad personalizada, <b>x es el consumo</b> e <b>y es el ocio</b>. Es la "
      "convención que más confunde del applet, así que conviene decirla dos veces.",
      "In the custom utility box, <b>x is consumption</b> and <b>y is leisure</b>. It is the "
      "applet's most confusing convention, so it is worth saying twice.",
      [("x^0.5*y^0.5", "Consumo y ocio con el mismo peso.", "Consumption and leisure weighted equally."),
       ("x^0.7*y^0.3", "Alguien a quien le importa más consumir: trabaja más.",
                       "Someone who cares more about consuming: works more."),
       ("x+2ln(y)", "Cuasilineal en el consumo. El ocio óptimo no depende de m₀.",
                    "Quasilinear in consumption. Optimal leisure does not depend on m₀."),
       ("2ln(x)+y", "Cuasilineal en el ocio, el caso contrario.",
                    "Quasilinear in leisure, the other way round."),
       ("min(x,3y)", "Complementarios: un vértice que interactúa con los del impuesto.",
                     "Complements: a kink that interacts with the tax's own.")]),

    trouble_section([
      ("El óptimo sale en «No trabaja»",
       "Con m₀ alto o w bajo puede ser lo correcto. Sube el salario o baja la renta no laboral.",
       "With a high m₀ or a low w that can be right. Raise the wage or lower non-labour income."),
      ("Los umbrales no aparecen",
       "Están fuera del rango: hace falta 0 &lt; s/w &lt; 1, es decir umbrales por debajo de lo que "
       "se gana trabajando toda la dotación. Baja s₀ y s₁ o sube w.",
       "They are out of range: you need 0 &lt; s/w &lt; 1, that is, thresholds below what full-time "
       "work earns. Lower s₀ and s₁, or raise w."),
      ("No veo ninguna diferencia entre los dos modos",
       "Con t₀ = t₁ = t₂ los dos coinciden por construcción. Separa los tipos.",
       "With t₀ = t₁ = t₂ they coincide by construction. Spread the rates apart."),
      ("«Mayor salto» sale cero",
       "Estás en tipos marginales, donde la renta neta es continua por definición. Es la respuesta "
       "correcta.",
       "You are in marginal rates, where net income is continuous by definition. That is the right "
       "answer."),
      ("El dibujo se ve al revés de lo que espero",
       "Comprueba el eje: <b>Ocio</b> y <b>Trabajo</b> dan la imagen especular. Los libros usan "
       "ocio; hablando de horas suele ser más claro trabajo.",
       "Check the axis: <b>Leisure</b> and <b>Labour</b> give mirror images. Textbooks use leisure; "
       "when talking about hours, labour is usually clearer."),
    ]),
  ])

# ===========================================================================
# 5. Efectos Ingreso y Sustitución
# ===========================================================================
M5 = dict(
  title="Manual · Efectos Ingreso y Sustitución / Income and Substitution Effects",
  desc="Manual de uso del applet Efectos Ingreso y Sustitución, en español e inglés.",
  h1_es="Efectos Ingreso y Sustitución", h1_en="Income and Substitution Effects",
  lede_es="Cambia un precio y la canasta óptima se mueve por dos razones a la vez. La compensación "
          "las separa: primero gira la restricción sin cambiar el bienestar, después devuelve la renta.",
  lede_en="Change a price and the optimal bundle moves for two reasons at once. Compensation "
          "separates them: first pivot the constraint without changing welfare, then hand the "
          "income back.",
  href="../income-substitution/",
  sections=[
    common_start("Efectos Ingreso y Sustitución", "Income and Substitution Effects"),

    sec("Las tres canastas", "The three bundles", [
      h2("Por qué hacen falta tres", "Why there have to be three"),
      p("Cuando sube p<sub>x</sub> el consumidor compra menos x por dos motivos distintos que "
        "ocurren a la vez: x se ha encarecido <i>en relación con</i> y, y además el consumidor es "
        "más pobre en términos reales. La descomposición inventa una canasta intermedia para "
        "separarlos.",
        "When p<sub>x</sub> rises the consumer buys less x for two distinct reasons happening at "
        "once: x has become dearer <i>relative to</i> y, and the consumer is also poorer in real "
        "terms. The decomposition invents an intermediate bundle to pull them apart."),
      table(["Canasta", "Qué es"], ["Bundle", "What it is"], [
        ("<b>B₀</b>", "La elección inicial, a los precios y la renta de partida.",
                      "The original choice, at the starting prices and income."),
        ("<b>B<sub>S</sub></b>", "La elección a los <b>precios nuevos</b> pero con la renta <b>compensada</b>: "
                       "el consumidor ha visto cambiar los precios relativos, pero no ha "
                       "empobrecido. De B₀ a B<sub>S</sub> está el <b>efecto sustitución</b>.",
                       "The choice at the <b>new prices</b> but with <b>compensated</b> income: the "
                       "consumer has seen relative prices change, but has not got poorer. From B₀ "
                       "to B<sub>S</sub> is the <b>substitution effect</b>."),
        ("<b>B₁</b>", "La elección final, a los precios nuevos y la renta de verdad. De B<sub>S</sub> a B₁ "
                      "está el <b>efecto ingreso</b>.",
                      "The final choice, at the new prices and the real income. From B<sub>S</sub> to B₁ is "
                      "the <b>income effect</b>."),
      ]),
      note("El efecto total, de B₀ a B₁, es la suma de los otros dos. Es lo único observable: B<sub>S</sub> no "
           "existe en los datos, es un instrumento de análisis.",
           "The total effect, B₀ to B₁, is the sum of the other two. It is the only observable one: "
           "B<sub>S</sub> does not exist in the data, it is an analytical device."),
      h2("Slutsky o Hicks", "Slutsky or Hicks"),
      p("La compensación se puede definir de dos maneras, y el applet las tiene las dos porque los "
        "libros no se ponen de acuerdo.",
        "Compensation can be defined two ways, and the applet has both because the textbooks do not "
        "agree."),
      table(["Regla", "Qué se le compensa"], ["Rule", "What is compensated"], [
        ("<b>Slutsky</b> — mantener la canasta",
         "Se le da justo lo necesario para poder comprar <b>la canasta original</b> a los precios "
         "nuevos. Es observable —basta con saber qué compraba antes— y deja al consumidor algo "
         "<i>mejor</i> que antes, porque además de poder repetir la canasta puede recomponerla.",
         "Give exactly enough to buy <b>the original bundle</b> at the new prices. It is observable "
         "— you only need to know what was bought before — and it leaves the consumer slightly "
         "<i>better off</i>, because on top of repeating the bundle he can rearrange it."),
        ("<b>Hicks</b> — mantener la utilidad",
         "Se le da justo lo necesario para alcanzar <b>la utilidad original</b> a los precios "
         "nuevos. No es observable, porque nadie ve una curva de indiferencia, pero mantiene el "
         "bienestar exactamente fijo, que es lo que la teoría pide.",
         "Give exactly enough to reach <b>the original utility</b> at the new prices. Not "
         "observable, since nobody sees an indifference curve, but it holds welfare exactly fixed, "
         "which is what the theory asks for."),
      ]),
      warn("Cambiar de regla cambia dónde cae B<sub>S</sub> y, por tanto, cómo se reparte el efecto total "
           "entre los dos componentes. Lo que <b>no</b> cambia es el efecto total ni el signo del "
           "efecto sustitución: ése apunta siempre en contra del precio, con cualquiera de las dos "
           "reglas y con cualquier función de utilidad.",
           "Switching rule changes where B<sub>S</sub> lands and therefore how the total splits between the "
           "two components. What does <b>not</b> change is the total effect, nor the sign of the "
           "substitution effect: it always points against the price, under either rule and with any "
           "utility function."),
    ]),

    sec("Qué hay en pantalla", "What is on screen", [
      h2("Los dos paneles", "The two panels"),
      table(*HEAD_PANEL, [
        ("<b>Plano (x, y)</b>",
         "Las tres restricciones, las curvas de indiferencia, las tres canastas y —si enciendes las "
         "flechas— los vectores de los efectos.",
         "The three constraints, the indifference curves, the three bundles and — if you switch the "
         "arrows on — the effect vectors."),
        ("<b>Panel de demanda</b>",
         "El precio en el eje horizontal y la cantidad demandada en el vertical, con la demanda "
         "<b>ordinaria</b> y la <b>compensada</b> superpuestas. Puedes ver x, y, o las dos a la vez.",
         "Price on the horizontal axis and quantity demanded on the vertical, with <b>ordinary</b> "
         "and <b>compensated</b> demand overlaid. You can show x, y, or both at once."),
      ]),
      note("Mostrar los <b>dos</b> bienes es la opción que más enseña. El efecto sobre y suele ser "
           "el que sorprende: al subir p<sub>x</sub>, la demanda de y se mueve aunque su precio no "
           "haya cambiado.",
           "Showing <b>both</b> goods teaches the most. The effect on y is usually the surprise: "
           "when p<sub>x</sub> rises, demand for y moves even though its own price did not change."),
      h2("Las capas y las flechas", "Layers and arrows"),
      table(*HEAD_LAYER, [
        ("Restricción inicial / compensada / final",
         "Las tres rectas. La compensada es paralela a la final y pasa por B₀ (Slutsky) o es "
         "tangente a la curva original (Hicks).",
         "The three lines. The compensated one is parallel to the final one and passes through B₀ "
         "(Slutsky) or is tangent to the original curve (Hicks)."),
        ("Canastas (B₀, B₁)",
         "Sólo el punto de partida y el de llegada, con sus nombres. Es la vista honesta: lo que se "
         "observa.",
         "Just the start and the finish, labelled. This is the honest view: what is observed."),
        ("Descomposición (B_S)",
         "Añade la canasta intermedia. Enciéndela cuando vayas a explicar la separación, no antes.",
         "Adds the intermediate bundle. Switch it on when you are about to explain the split, not "
         "before."),
        ("Flechas de los efectos",
         "Los vectores. Sin descomposición sale sólo el efecto total, de B₀ a B₁. Con "
         "descomposición aparecen dos: uno <b>" + SW_SUB + "magenta</b> de B₀ a B<sub>S</sub> rotulado "
         "«E. Sustitución» y uno <b>" + SW_INC + "verde menta</b> de B<sub>S</sub> a B₁ rotulado "
         "«E. Ingreso». Los mismos colores miden los tramos al margen de cada eje, "
         "fuera del recuadro: a la izquierda de x = 0 y por debajo de y = 0, para no "
         "amontonarse con las canastas.",
         "The vectors. Without the decomposition you get only the total effect, B₀ to B₁. With it, "
         "two more appear: a <b>" + SW_SUB + "magenta</b> one from B₀ to B<sub>S</sub> labelled "
         "“Subst. effect” and a <b>" + SW_INC + "mint green</b> one from B<sub>S</sub> to B₁ labelled "
         "“Income effect”. The same colours measure the stretches in the margin beside "
         "each axis, outside the frame — left of x = 0 and below y = 0, so they do not "
         "crowd the bundles."),
        ("Curvas de indiferencia", "Las que pasan por las canastas.", "The ones through the bundles."),
        ("Curvas de fondo", "El resto del mapa, a niveles regulares.",
                            "The rest of the map, at regular levels."),
        ("Retícula", "La cuadrícula.", "The grid."),
      ]),
      h2("Los números", "The readouts"),
      table(*HEAD_READ, [
        ("B₀ · inicial, B<sub>S</sub> · sustitución, B₁ · final", "Las tres canastas, con sus coordenadas.",
                                                        "The three bundles, with their coordinates."),
        ("Renta compensada", "Cuánto habría que darle o quitarle para la compensación elegida.",
                             "How much to hand over or take back for the chosen compensation."),
        ("Sustitución / Ingreso / Total", "Los tres efectos, en unidades del bien, para x y para y.",
                                          "The three effects, in units of the good, for x and for y."),
      ]),
    ]),

    sec("El caso de libro, en números", "The textbook case, in numbers", [
      h2("Cobb–Douglas, precio que se duplica", "Cobb–Douglas, price doubling"),
      steps([
        ("Elige <b>Cobb–Douglas</b> con a = <b>0,5</b>. Situación inicial: p<sub>x</sub> = <b>1</b>, "
         "p<sub>y</sub> = <b>1</b>, m = <b>8</b>. Variación: Δp<sub>x</sub> = <b>1</b>, "
         "Δp<sub>y</sub> = <b>0</b>.",
         "Pick <b>Cobb–Douglas</b> with a = <b>0.5</b>. Starting point: p<sub>x</sub> = <b>1</b>, "
         "p<sub>y</sub> = <b>1</b>, m = <b>8</b>. Change: Δp<sub>x</sub> = <b>1</b>, "
         "Δp<sub>y</sub> = <b>0</b>.",
         ("B₀ = (4, 4) con u = 4. B₁ = (2, 4). El efecto total sobre x es −2.",
          "B₀ = (4, 4) with u = 4. B₁ = (2, 4). The total effect on x is −2.")),
        ("Fíjate primero en y: no ha cambiado. Con Cobb–Douglas el gasto en cada bien es una "
         "fracción fija de la renta, así que la subida de p<sub>x</sub> no toca a y en absoluto.",
         "Look at y first: it has not moved. With Cobb–Douglas the spending on each good is a fixed "
         "share of income, so the rise in p<sub>x</sub> does not touch y at all.", None),
        ("Pon la compensación en <b>Slutsky</b> y enciende <b>Descomposición (B_S)</b>.",
         "Set compensation to <b>Slutsky</b> and switch on <b>Decomposition (B_S)</b>.",
         ("Renta compensada 12 = 2·4 + 1·4: justo lo que cuesta la canasta vieja a precios nuevos. "
          "B<sub>S</sub> = (3, 6). Sustitución −1, ingreso −1.",
          "Compensated income 12 = 2·4 + 1·4: exactly what the old bundle costs at the new prices. "
          "B<sub>S</sub> = (3, 6). Substitution −1, income −1.")),
        ("Cambia a <b>Hicks</b> sin tocar nada más.",
         "Switch to <b>Hicks</b> without touching anything else.",
         ("Renta compensada 11,314 = 8·√2: la justa para volver a u = 4. B<sub>S</sub> = (2,828, 5,657). "
          "Sustitución −1,172, ingreso −0,828.",
          "Compensated income 11.314 = 8·√2: just enough to get back to u = 4. B<sub>S</sub> = (2.828, 5.657). "
          "Substitution −1.172, income −0.828.")),
        ("Compara las dos lecturas: el total sigue siendo −2 con las dos reglas, pero el reparto "
         "cambia. Slutsky compensa de más —deja al consumidor en u = 4,243, por encima del "
         "original— y por eso atribuye menos al efecto sustitución.",
         "Compare the two readings: the total is still −2 under both rules, but the split changes. "
         "Slutsky over-compensates — it leaves the consumer at u = 4.243, above the original — and "
         "so attributes less to the substitution effect.", None),
        ("Enciende <b>Flechas de los efectos</b> y mira los ejes: los tramos <b>" + SW_SUB +
         "magenta</b> y <b>" + SW_INC + "verde menta</b> del eje x "
         "—dibujados en el margen, por debajo del recuadro— suman el desplazamiento total, y al "
         "margen del eje y aparecen los mismos dos tramos, porque y "
         "también se mueve entre B₀ y B<sub>S</sub> aunque acabe donde empezó.",
         "Switch on <b>Effect arrows</b> and look at the axes: the <b>" + SW_SUB + "magenta</b> and <b>" +
         SW_INC + "mint green</b> stretches on the x "
         "axis — drawn in the margin below the frame — add up to the total move, and the same two "
         "appear beside the y axis, because y "
         "moves between B₀ and B<sub>S</sub> even though it ends where it started.", None),
      ]),
    ]),

    sec("La bandera roja: encontrar un Giffen", "The red flag: finding a Giffen", [
      h2("Qué avisa el applet", "What the applet warns about"),
      p("Si en algún tramo del recorrido la demanda <b>ordinaria</b> de un bien sube con su "
        "<b>propio</b> precio, aparece un aviso en rojo que dice entre qué precios ocurre. Sólo "
        "cuenta el precio propio: una demanda cruzada con pendiente positiva sólo significa que los "
        "bienes son sustitutos brutos, que es lo normal y no merece aviso.",
        "If over some stretch of the sweep the <b>ordinary</b> demand for a good rises with its "
        "<b>own</b> price, a red warning appears naming the prices between which it happens. Only "
        "the own price counts: a cross-price curve sloping up merely means the goods are gross "
        "substitutes, which is ordinary and needs no warning."),
      h2("Una receta comprobada", "A checked recipe"),
      steps([
        ("Elige la familia <b>X inferior</b>. Parámetros: ȳ = <b>4</b>, β = <b>0,4</b>, "
         "x̲ = <b>0,6</b>.",
         "Pick the <b>X inferior</b> family. Parameters: ȳ = <b>4</b>, β = <b>0.4</b>, "
         "x̲ = <b>0.6</b>.", None),
        ("Situación inicial: p<sub>x</sub> = <b>3</b>, p<sub>y</sub> = <b>1</b>, m = <b>5,6</b>. "
         "Variación: Δp<sub>x</sub> = <b>2</b>, Δp<sub>y</sub> = <b>0</b>. Deja el panel de demanda "
         "en <b>x</b>.",
         "Starting point: p<sub>x</sub> = <b>3</b>, p<sub>y</sub> = <b>1</b>, m = <b>5.6</b>. "
         "Change: Δp<sub>x</sub> = <b>2</b>, Δp<sub>y</sub> = <b>0</b>. Leave the demand panel on "
         "<b>x</b>.",
         ("Sale el aviso: «la demanda ordinaria de x sube con su propio precio entre 2,72 y 6,66».",
          "The warning appears: “ordinary demand for x rises with its own price between 2.72 and "
          "6.66”.")),
        ("Mira las tres canastas con <b>Slutsky</b>.",
         "Look at the three bundles under <b>Slutsky</b>.",
         ("B₀ = (0,644, 3,667), B<sub>S</sub> = (0,615, 3,815), B₁ = (0,787, 1,667). Sustitución −0,030, "
          "ingreso +0,172, total <b>+0,142</b>.",
          "B₀ = (0.644, 3.667), B<sub>S</sub> = (0.615, 3.815), B₁ = (0.787, 1.667). Substitution −0.030, "
          "income +0.172, total <b>+0.142</b>.")),
        ("Ahí está el mecanismo completo, en tres números. La sustitución es negativa, como siempre. "
         "El efecto ingreso es <b>positivo</b>, porque x es inferior. Y es lo bastante grande para "
         "dominar: el total sale positivo y la demanda sube con el precio.",
         "There is the whole mechanism, in three numbers. Substitution is negative, as always. The "
         "income effect is <b>positive</b>, because x is inferior. And it is big enough to dominate: "
         "the total comes out positive and demand rises with the price.", None),
        ("Cambia a <b>Hicks</b>: sustitución −0,026, ingreso +0,168, total +0,142 otra vez.",
         "Switch to <b>Hicks</b>: substitution −0.026, income +0.168, total +0.142 again.",
         ("El reparto cambia un poco, el total no. Es la comprobación de que la descomposición es "
          "un instrumento y no un hecho.",
          "The split shifts a little, the total does not. That is the check that the decomposition "
          "is a device, not a fact.")),
        ("Mira ahora el panel de demanda: la curva <b>ordinaria</b> sube de izquierda a derecha, y "
         "la <b>compensada</b> baja. Las dos a la vez, en el mismo dibujo.",
         "Now look at the demand panel: the <b>ordinary</b> curve rises from left to right, and the "
         "<b>compensated</b> one falls. Both at once, in the same picture.",
         ("La demanda compensada nunca puede tener pendiente positiva. Ésa es la ley de la demanda "
          "que sí se cumple siempre.",
          "Compensated demand can never slope upward. That is the law of demand that does always hold.")),
      ]),
      note("Si quieres el caso intermedio —x inferior pero no Giffen— sube la renta a 3, por debajo "
           "de p<sub>y</sub>·ȳ = 4. El aviso desaparece y el efecto ingreso sigue siendo positivo, "
           "pero ya no gana.",
           "For the in-between case — x inferior but not Giffen — lower income to 3, below "
           "p<sub>y</sub>·ȳ = 4. The warning disappears and the income effect is still positive, "
           "but no longer wins."),
    ]),

    sec("Los límites de los deslizadores", "The slider limits", [
      h2("Para qué sirven", "What they are for"),
      p("El grupo <b>Límites de los deslizadores</b> tiene una pareja de casillas por variable. "
        "Deciden dos cosas: hasta dónde llega cada deslizador, y qué tramo barre el panel de "
        "demanda. Los valores por defecto sirven para el caso de libro, pero para cazar un Giffen "
        "casi siempre hay que ensancharlos.",
        "The <b>Slider limits</b> group has a pair of boxes per variable. They decide two things: "
        "how far each slider travels, and what stretch the demand panel sweeps. The defaults suit "
        "the textbook case, but hunting a Giffen nearly always needs them widened."),
      warn("Los límites no cambian la economía, sólo la ventana desde la que se mira. Si un efecto "
           "parece desaparecer al mover un límite, es que ha salido del encuadre, no que haya "
           "dejado de existir.",
           "The limits do not change the economics, only the window you look through. If an effect "
           "seems to vanish when you move a limit, it has left the frame, not stopped existing."),
    ]),

    syntax_section(
      "En la casilla de preferencias personalizadas las variables son <b>x</b> e <b>y</b>. Con una "
      "utilidad escrita a mano, la canasta óptima y la renta compensada de Hicks se calculan "
      "numéricamente, así que valen funciones con vértices.",
      "In the custom preferences box the variables are <b>x</b> and <b>y</b>. With a hand-written "
      "utility, the optimal bundle and the Hicks compensated income are computed numerically, so "
      "functions with kinks are fine.",
      [("x^0.5*y^0.5", "El caso de libro, con el que se comprueban los números de arriba.",
                       "The textbook case, the one that checks the numbers above."),
       ("min(x,y)", "Complementarios perfectos: el efecto sustitución es <b>cero</b>, y todo el "
                    "movimiento es efecto ingreso.",
                    "Perfect complements: the substitution effect is <b>zero</b>, and the whole "
                    "move is income effect."),
       ("x+y", "Sustitutos perfectos: el efecto sustitución se lo lleva todo, de golpe.",
               "Perfect substitutes: the substitution effect takes everything, all at once."),
       ("2ln(x)+y", "Cuasilineal: el efecto ingreso sobre x es <b>cero</b>, y sustitución y total "
                    "coinciden.",
                    "Quasilinear: the income effect on x is <b>zero</b>, so substitution and total "
                    "coincide.")]),

    trouble_section([
      ("Las tres canastas coinciden",
       "No has cambiado ningún precio. Mueve Δp<sub>x</sub> o Δp<sub>y</sub>.",
       "You have not changed any price. Move Δp<sub>x</sub> or Δp<sub>y</sub>."),
      ("No aparece B<sub>S</sub>",
       "Enciende la capa <b>Descomposición (B_S)</b>. La capa <b>Canastas</b> muestra sólo B₀ y B₁ "
       "a propósito.",
       "Switch on the <b>Decomposition (B_S)</b> layer. The <b>Bundles</b> layer shows only B₀ and "
       "B₁ on purpose."),
      ("El efecto sustitución sale positivo",
       "No puede serlo en el propio precio. Si lo ves, estás mirando el efecto sobre el <i>otro</i> "
       "bien, que sí puede ir en cualquier sentido.",
       "It cannot be, in the own price. If you see one, you are looking at the effect on the "
       "<i>other</i> good, which can go either way."),
      ("Sale «Algo se sale del marco»",
       "Sube el tope de x o de y en el grupo de vista, o marca <b>Ajustar los ejes solos</b>.",
       "Raise the x or y ceiling in the view group, or tick <b>Fit the axes automatically</b>."),
      ("El panel de demanda sale a trozos",
       "La utilidad no está definida en parte del recorrido —típico de la familia X inferior, que "
       "exige x &gt; x̲ e y &lt; ȳ—. Estrecha los límites de p<sub>x</sub> o cambia la renta.",
       "Utility is undefined over part of the sweep — typical of the X inferior family, which needs "
       "x &gt; x̲ and y &lt; ȳ. Narrow the p<sub>x</sub> limits or change income."),
      ("La bandera roja no sale nunca",
       "El caso Giffen es raro y hay que buscarlo. Usa la receta de arriba, y recuerda que hace "
       "falta m &gt; p<sub>y</sub>·ȳ.",
       "The Giffen case is rare and has to be hunted. Use the recipe above, and remember it needs "
       "m &gt; p<sub>y</sub>·ȳ."),
    ]),
  ])


# ===========================================================================
# Index of the manuals
# ===========================================================================
INDEX_CARDS = [
  ("consumer-optimum", "Óptimo del Consumidor", "Consumer Optimum",
   "Optimo-del-Consumidor", "Consumer-Optimum",
   "Dos bienes, una renta y unos precios. Tangencia, vértices y esquinas, y la superficie 3D.",
   "Two goods, an income and some prices. Tangency, kinks and corners, and the 3D surface."),
  ("demand-functions", "Funciones de Demanda", "Demand Functions",
   "Funciones-de-Demanda", "Demand-Functions",
   "Cómo se construye una curva de demanda punto a punto, y cómo se caza un bien Giffen.",
   "How a demand curve is built point by point, and how to hunt a Giffen good."),
  ("nonlinear-budget", "Restricciones No Lineales", "Non-Linear Budget Constraints",
   "Restricciones-No-Lineales", "Non-Linear-Budget-Constraints",
   "Siete esquemas de subsidio, el argumento del efectivo contra la especie, y el panel 3D.",
   "Seven subsidy schemes, the cash-versus-in-kind argument, and the 3D panel."),
  ("labor-tax", "Impuesto a la Renta del Trabajo", "Labour Income Tax",
   "Impuesto-a-la-Renta-del-Trabajo", "Labour-Income-Tax",
   "Tipos marginales frente a tipos medios, y por qué la gente se amontona bajo un umbral.",
   "Marginal versus average rates, and why people bunch below a threshold."),
  ("income-substitution", "Efectos Ingreso y Sustitución", "Income and Substitution Effects",
   "Efectos-Ingreso-y-Sustitucion", "Income-and-Substitution-Effects",
   "Slutsky y Hicks, las tres canastas, los vectores de los efectos y la bandera roja del Giffen.",
   "Slutsky and Hicks, the three bundles, the effect vectors and the Giffen red flag."),
]

INDEX_HTML = """<!doctype html>
<html lang="es" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Manuales · Applets de microeconomía</title>
<meta name="description" content="Manuales de uso de los cinco applets de microeconomía, en español e inglés, en la web y en PDF.">
<style>
__CSS__
.wrap{max-width:960px}
.grid{display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:18px}
.card{display:flex; flex-direction:column; gap:11px; background:var(--surface);
  border:1px solid var(--rule); border-radius:4px; padding:20px; box-shadow:var(--shadow)}
.card h3{font-family:var(--f-display); font-size:20px; font-weight:600; letter-spacing:-.006em}
.card p{color:var(--ink-2); font-size:14px}
.grow{flex:1}
.row{display:flex; gap:9px; flex-wrap:wrap; align-items:center}
.pdfs{display:flex; gap:8px; flex-wrap:wrap; align-items:center;
  border-top:1px solid var(--rule-2); padding-top:11px}
.pdfs>span{font-family:var(--f-mono); font-size:10px; letter-spacing:.09em;
  text-transform:uppercase; color:var(--ink-3)}
.pill{font-size:13px; text-decoration:none; color:var(--accent-ink); border:1px solid var(--rule);
  border-radius:3px; padding:5px 11px; white-space:nowrap}
.pill:hover{border-color:var(--accent)}
.quiet{font-size:13.5px; text-decoration:none; color:var(--ink-2); border-bottom:1px solid var(--rule)}
.quiet:hover{color:var(--accent-ink); border-bottom-color:var(--accent)}
</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <div>
      <span class="kicker" data-l="es">Documentación</span><span class="kicker" data-l="en">Documentation</span>
      <h1 data-l="es">Manuales de los applets</h1><h1 data-l="en">Applet user guides</h1>
      <p class="lede" data-l="es">Uno por applet, en español y en inglés. La versión web lleva el
         interruptor de idioma; el PDF va en un idioma por archivo, listo para imprimir o repartir.</p>
      <p class="lede" data-l="en">One per applet, in Spanish and in English. The web version carries
         the language switch; the PDF is one language per file, ready to print or hand out.</p>
    </div>
    <div style="display:flex; gap:8px; flex-wrap:wrap">
      <div class="seg" id="lang">
        <button type="button" data-lang="es" aria-pressed="true">ES</button>
        <button type="button" data-lang="en" aria-pressed="false">EN</button>
      </div>
      <div class="seg" id="theme">
        <button type="button" data-th="dark" aria-pressed="true"><span data-l="es">Oscuro</span><span data-l="en">Dark</span></button>
        <button type="button" data-th="light" aria-pressed="false"><span data-l="es">Claro</span><span data-l="en">Light</span></button>
      </div>
    </div>
  </div>
  <section>
    <div class="grid">
__CARDS__
    </div>
  </section>
  <footer>
    <p data-l="es">Los manuales explican los controles y traen recorridos guiados con los números ya
       comprobados: si sigues los pasos, los resultados deben coincidir hasta la última cifra.</p>
    <p data-l="en">The guides explain the controls and carry guided runs with the numbers already
       checked: follow the steps and the results should match to the last digit.</p>
    <p><a href="../index.html" data-l="es">← Volver al menú de applets</a><a href="../index.html" data-l="en">← Back to the applet menu</a></p>
  </footer>
</div>
<script>
"use strict";
function setLang(l){
  document.documentElement.lang = l;
  document.querySelectorAll("[data-l]").forEach(function(el){
    el.classList.toggle("on", el.dataset.l === l);
  });
  document.querySelectorAll("#lang button").forEach(function(b){
    b.setAttribute("aria-pressed", String(b.dataset.lang === l));
  });
  try{ localStorage.setItem("manual.lang", l); }catch(e){}
}
function setTheme(t){
  document.documentElement.setAttribute("data-theme", t);
  document.querySelectorAll("#theme button").forEach(function(b){
    b.setAttribute("aria-pressed", String(b.dataset.th === t));
  });
  try{ localStorage.setItem("manual.theme", t); }catch(e){}
}
document.querySelectorAll("#lang button").forEach(function(b){
  b.addEventListener("click", function(){ setLang(b.dataset.lang); });
});
document.querySelectorAll("#theme button").forEach(function(b){
  b.addEventListener("click", function(){ setTheme(b.dataset.th); });
});
/* The toggle always stamps data-theme, so the media query never gets a say —
   which is why the first visit takes its cue from the reader's system setting
   instead of assuming dark. After that their own choice sticks. */
var sysLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
var l0 = "es", t0 = sysLight ? "light" : "dark";
try{ l0 = localStorage.getItem("manual.lang") || l0;
     t0 = localStorage.getItem("manual.theme") || t0; }catch(e){}
setLang(l0); setTheme(t0);
</script>
</body>
</html>
"""

def build_index():
    from manual_skeleton import SKELETON
    css = SKELETON.split("<style>\n",1)[1].split("</style>",1)[0]
    cards = []
    for slug, es, en, pes, pen, des, den in INDEX_CARDS:
        cards.append(
          f'      <article class="card">\n'
          f'        <h3 data-l="es">{es}</h3><h3 data-l="en">{en}</h3>\n'
          f'        <p data-l="es">{des}</p><p data-l="en">{den}</p>\n'
          f'        <div class="grow"></div>\n'
          f'        <div class="row">\n'
          f'          <a class="btn" href="{slug}.html" data-l="es">Leer el manual</a>'
          f'<a class="btn" href="{slug}.html" data-l="en">Read the guide</a>\n'
          f'          <a class="quiet" href="../{slug}/" data-l="es">Abrir el applet →</a>'
          f'<a class="quiet" href="../{slug}/" data-l="en">Open the applet →</a>\n'
          f'        </div>\n'
          f'        <div class="pdfs">\n'
          f'          <span>PDF</span>\n'
          f'          <a class="pill" href="pdf/{pes}-ES.pdf">Español</a>\n'
          f'          <a class="pill" href="pdf/{pen}-EN.pdf">English</a>\n'
          f'        </div>\n'
          f'      </article>')
    page = INDEX_HTML.replace("__CSS__", css).replace("__CARDS__", "\n".join(cards))
    path = os.path.join(OUT, "index.html")
    with open(path, "w", encoding="utf-8") as f:
        f.write(page)
    return path

# ===========================================================================
def check_swatches():
    """The guide's swatches are the applet's arrow colours, copied. Copies drift —
    this one already did once — so the build reads the applet and refuses to
    write a guide that names a colour the applet no longer draws."""
    import re
    app = os.path.join(os.path.dirname(_here), "income-substitution", "index.html")
    src = open(app, encoding="utf-8").read()
    m = re.search(r'sub:"(#\w{6})", inc:"(#\w{6})"', src)
    if not m:
        raise SystemExit("cannot find MK.sub/MK.inc in " + app)
    mine = (re.search(r'background:(#\w{6})', SW_SUB).group(1),
            re.search(r'background:(#\w{6})', SW_INC).group(1))
    if mine != m.groups():
        raise SystemExit("swatches drifted: guide has %s/%s, applet draws %s/%s"
                         % (mine + m.groups()))


if __name__ == "__main__":
    check_swatches()
    specs = [("consumer-optimum", M1), ("demand-functions", M2),
             ("nonlinear-budget", M3), ("labor-tax", M4), ("income-substitution", M5)]
    for name, spec in specs:
        path = os.path.join(OUT, name + ".html")
        build(spec, path)
        print("wrote", path, os.path.getsize(path), "bytes")
    p = build_index()
    print("wrote", p, os.path.getsize(p), "bytes")
