/**
 * i18n.js — interface language.
 *
 * One codebase, two languages. Static markup is translated by walking
 * `data-i18n` attributes; anything the program composes at runtime goes through
 * `t()`. Switching language never rebuilds the terrain — it only repaints text.
 *
 * The language is taken from ?lang= in the address, then from what the user
 * last chose, then from the browser's own setting. A teacher can therefore send
 * students a link ending in ?lang=es and be sure of what they will see.
 */

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
];

const STRINGS = {
  en: {
    'meta.title': 'Gradient Peaks — walk on the graph of f(x,y)',
    'meta.labtitle': 'Gradient Peaks Lab — the surface and its map, side by side',
    'meta.labdesc': 'The same 3D sandbox with a flat map panel beside the scene: the domain from above, the same level curves in the same colours, and the explorer as a dot.',
    'meta.description': 'A light 3D sandbox for exploring surface plots, level curves, partial derivatives, gradients and constrained maxima of functions of two variables.',

    'panel.hide': 'Hide panel (Tab)',
    'panel.show': 'Show panel (Tab)',

    'sec.function': 'Function',
    'surf.kind': 'Kind of surface',
    'surf.graph': 'Graph — z = f(x, y)',
    'surf.implicit': 'Implicit — F(x, y, z) = 0',
    'surf.parametric': 'Parametric — r(u, v)',
    'surf.flabel': 'F(x, y, z) =',
    'surf.note': 'This surface is not the graph of a function, so walking, partial derivatives and level curves do not apply. Fly around it with the drone.',
    'fn.label': 'f(x, y) =',
    'fn.examples': '— examples —',
    'fn.cobb05': 'Cobb–Douglas  (x·y)^0.5',
    'fn.cobb37': 'Cobb–Douglas  x^0.3·y^0.7',
    'fn.paraboloid': 'Paraboloid  1 − x² − y²',
    'fn.saddle': 'Saddle  x² − y²',
    'fn.eggcarton': 'Egg carton  sin(3x)·cos(3y)/2',
    'fn.twopeaks': 'Two peaks (Gaussians)',
    'fn.hills': 'Rolling hills',
    'fn.cone': 'Cone  1 − √(x²+y²)',
    'fn.rosenbrock': 'Rosenbrock (try maximising!)',
    'fn.xyexp': 'x·y·e^−(x²+y²)',

    'shape.named': 'Named surface',
    'shape.custom': '— custom (type below) —',
    'shape.sphere': 'Sphere — radius a',
    'shape.torus': 'Torus — radii a, b',
    'shape.pseudo': 'Pseudosphere — radius a',
    'shape.hyper1': 'Hyperboloid, one sheet — a, b',
    'shape.catenoid': 'Catenoid — waist a',
    'shape.helicoid': 'Helicoid — radius a, pitch b',
    'shape.mobius': 'Möbius strip — radius a, width b',
    'shape.klein': 'Klein bottle (3D immersion) — a',
    'shape.cross': 'Cross-cap — a',
    'shape.pa': 'a', 'shape.pb': 'b',
    'shape.radius': 'radius a', 'shape.tube': 'tube radius b',
    'shape.pitch': 'pitch b', 'shape.width': 'half-width b', 'shape.waist': 'waist a',
    'shape.orientable': 'Orientable: it has two sides, and the inside / outside toggle means something.',
    'shape.nonorientable': 'Not orientable: it has only one side. Walk a full lap and the explorer comes back upside down — the inside / outside toggle only chooses where to start.',
    'shape.immersion': 'This is a 3-dimensional immersion, so the surface passes through itself. The true embedding needs a fourth dimension; walking through the intersection is the price of drawing it here.',
    'orient.inside': 'Walk on the inside',
    'orient.up': 'Which way is up',
    'orient.normal': 'Normal to the tangent plane',
    'orient.z': 'World z (the usual vertical)',
    'orient.x': 'World x',
    'orient.y': 'World y',
    'orient.note': 'Click the surface to land the explorer on it. Walking keeps them upright with respect to the surface: on a sphere that is a planet, on a Möbius strip one lap brings them back upside down, which is what non-orientable means. In third person the camera holds a fixed height and circles, so the movement reads in three dimensions.',
    'orient.click': 'Click the surface to place the explorer',
    'cons.mode': 'Consumer problem',
    'cons.utility': 'Utility function',
    'cons.cobb': 'Cobb–Douglas  x^a · y^(1−a)',
    'cons.ces': 'CES  (x^r + y^r)^(1/r)',
    'cons.subs': 'Perfect substitutes  a·x + (1−a)·y',
    'cons.quasi': 'Quasi-linear  a·ln x + y',
    'cons.alpha': 'Share a',
    'cons.rho': 'Substitution r',
    'cons.px': 'price of x',
    'cons.py': 'price of y',
    'cons.inc': 'income',
    'cons.note': 'The feasible set becomes the budget set p<sub>x</sub>·x + p<sub>y</sub>·y ≤ m with x, y ≥ 0, the domain is framed on it, and the vocabulary on screen changes: level curves are indifference curves, and RMS is the marginal rate of substitution. Turn on the optimum to find the consumer’s choice.',
    'cons.contours': 'Indifference curves',
    'cons.curveshow': 'Indifference curve you are standing on',
    'cons.seccurve': 'The indifference curve under your feet',
    'cons.mrs': 'MRS',
    'cons.mrshelp': 'Marginal rate of substitution — |∂u/∂x ÷ ∂u/∂y|, the absolute slope of the indifference curve through the bundle you are standing on. At the optimum it equals the price ratio p_x / p_y.',
    'cons.budget': 'Budget set',
    'lab.sec': 'Flat map panel',
    'lab.link': 'Open the Lab — the same program with a flat map panel beside the scene',
    'lab.linkback': 'Back to the classic layout',
    'lab.mode': 'What the panel shows',
    'lab.ramp': 'Heat map on the level-curve ramp',
    'lab.heat': 'Classical heat map',
    'lab.down': 'Looking straight down at the surface',
    'lab.off': 'Nothing — hide the panel',
    'lab.opacity': 'Panel opacity',
    'lab.size': 'Panel size',
    'lab.full': 'Full screen',
    'lab.projlabel': 'the (x, y) plane',
    'lab.note': 'The panel is the picture your textbook draws: the domain seen from above, with the same level curves in the same colours, the same tangent line, and the explorer as a dot. Everything on it is the same state as the scene behind — walk in the 3D view and the dot walks on the map.',
    'sec.domain': 'Domain',
    'dom.xmin': 'x min', 'dom.xmax': 'x max', 'dom.ymin': 'y min', 'dom.ymax': 'y max',
    'dom.res': 'Mesh resolution',
    'dom.axes': 'Axis scale',
    'dom.sx': 'x axis', 'dom.sy': 'y axis', 'dom.sz': 'z axis (steepness)',
    'dom.isotropic': 'Reset to equal axes',
    'dom.axesnote': 'All three at 1 is ordinary Cartesian space, where the unit sphere is round. Stretching an axis changes the picture only — every number reported stays the true value.',
    'dom.follow': 'The window follows the explorer',
    'dom.followg': 'step G (x)',
    'dom.followh': 'step H (y)',
    'dom.follownote': 'Reaching an edge slides that axis along by G (or H) times its own width, in the direction you were walking, and the terrain is rebuilt around the new window. The width never changes, so the scale — and every reading taken against the 1.80 m explorer — survives the move. It is left off in the consumer problem, where the domain is not a window but the set of bundles that exist.',
    'dom.rebuild': 'Rebuild terrain',

    'sec.feasible': 'Feasible set',
    'feas.label': 'constraints',
    'feas.examples': '— examples —',
    'feas.triangle': 'Triangle  x,y ≥ 0, x+y ≤ 2',
    'feas.disc': 'Disc  x² + y² ≤ 1',
    'feas.rect': 'Rectangle',
    'feas.two': 'Two budget lines',
    'feas.curved': 'x·y ≥ 0.3, x+y ≤ 2.5',
    'feas.walls': 'Show frontier walls',
    'feas.isolate': 'Make the outside translucent',

    'sec.map': 'Map & terrain',
    'map.contours': 'Level curves',
    'map.cstep': 'Contour interval Δz (blank = automatic)',
    'map.cwidth': 'Path width',
    'map.heightcol': 'Colour the surface by height',
    'map.grid': 'Coordinate grid on the surface',
    'map.gridnote': 'On a graph this is the grid of the (x, y) plane lifted onto the surface; on a parametric surface it is the parameter lines themselves; on an implicit one it is where the surface cuts the coordinate planes. It is drawn on both sides, so it stays readable from inside.',
    'map.clamped': 'interval widened to keep the count manageable',
    'map.decor': 'Vegetation, rocks & snow',
    'map.water': 'Water in the depressions',
    'map.density': 'Decoration density',
    'map.shadows': 'Shadows (costs performance)',

    'sec.deriv': 'Derivatives',
    'deriv.disc': 'Highlight neighbourhood',
    'deriv.radius': 'Radius',
    'deriv.dx': '∂f/∂x arrow',
    'deriv.dy': '∂f/∂y arrow',
    'deriv.grad': 'Gradient ∇f',
    'deriv.dir': 'Directional derivative',
    'deriv.dirnote': 'The explorer is frozen — move the mouse to swing <b>u</b> around the rim.',
    'deriv.arcnote': 'The radius is arc length — the distance actually walked over the surface, not on the flat floor underneath. On a steep slope the patch therefore covers less of the (x, y) plane, and the rim is no longer a circle.',
    'deriv.tangent': 'Tangent plane',

    'sec.curve': 'The curve under your feet',
    'curve.show': 'Level curve you are standing on',
    'curve.tangent': 'Tangent line to that curve',
    'curve.note': 'Both are painted on the surface itself and follow the explorer continuously. The tangent is the tangent direction pushed back down onto the surface, so it hugs the ground; it parts from the level curve only at second order, and shrinking the explorer closes the gap. Each curve takes its colour from its own height on the ramp.',

    'sec.zoom': 'Tangent plane & scale',
    'zoom.scale': 'Explorer scale',
    'zoom.note': 'Slide right and the explorer shrinks, down to 0.18 mm; slide left and they grow to ten times life size. The mouse wheel does the same thing, the way it zooms a map — a trackpad pinch works too. Turn on the tangent plane and slide right: a differentiable surface becomes indistinguishable from its plane.',

    'sec.opt': 'Optimisation',
    'opt.show': 'Show optimum',
    'opt.idle': 'Maximise f over the feasible set.',
    'opt.goto': 'Teleport to the optimum',
    'opt.none': 'No feasible point found on this domain.',
    'opt.max': 'max f =',
    'opt.at': 'at (x, y) =',
    'opt.on': 'on the',
    'opt.interior': 'interior of the feasible set',
    'opt.boundary': 'boundary of the feasible set',
    'opt.domain': 'domain',
    'opt.gradthere': '‖∇f‖ there =',
    'opt.pill': 'max {v} at ({x}, {y})',

    'sec.view': 'View',
    'view.first': 'First person',
    'view.third': 'Third person',
    'view.drone': 'Drone',
    'view.dronecam': 'Drone camera',
    'view.dronefirst': 'First person — from the drone',
    'view.dronethird': 'Third person — behind the drone',
    'view.dronenote': 'The drone flies level: W A S D move it over the (x, y) plane, Space and Ctrl set its altitude, and the mouse only aims the camera. The beam under it drops straight down to the point of the domain you are above.',
    'view.style': "Explorer's look",
    'style.explorer': 'Hiker',
    'style.brick': 'Brick minifigure',
    'style.blocky': 'Blocky (pixel style)',
    'style.buddy': 'Round buddy',
    'view.compass': 'Direction indicator',
    'view.compassnote': 'The globe in the top right shows which way you are looking: latitude and longitude around a small figure turned to face the same direction, with the bearing and the elevation underneath. Hold \u2318/\u229e or Alt, or press Esc and move the mouse, and it enlarges.',
    'view.top': 'Look straight down',
    'view.reset': 'Return to the centre',

    'sec.help': 'Help',
    'help.move': 'Move', 'help.run': 'run', 'help.look': 'look', 'help.mouse': 'mouse',
    'help.keylook': 'Look without the mouse',
    'help.orcmd': 'or \u2318/\u229e',
    'help.zoomcam': 'Camera zoom',
    'help.zoomsize': "explorer\u2019s size",
    'help.wheel': 'wheel',
    'help.updown': 'Drone up/down',
    'help.release': 'Release the mouse', 'help.hide': 'hide this panel',
    'help.syntax': 'Write functions with <code>+ − * / ^</code>, and <code>sin cos tan exp ln sqrt abs min max hypot gauss</code>. Implicit products work: <code>2x</code>, <code>x y</code>. Constraints combine with <code>&&</code>, <code>||</code>, and chained comparisons like <code>0&lt;=x&lt;=1</code>.',

    'hud.z': 'z = f(x,y)',
    'hud.avg': 'avg',
    'hud.scale11': 'scale 1 : 1',
    'hud.tall': 'explorer {h} m tall',
    'hud.uat': 'u at {deg}°',
    'hud.undefined': 'undefined',
    'hud.rmshelp': 'RMS — |∂f/∂x ÷ ∂f/∂y|, the absolute slope of the level curve through the point you are standing on.',

    'dial.camhelp': 'Camera zoom — the mouse wheel, or a pinch on the trackpad. Moves the camera closer; the explorer stays exactly the size they were.',
    'dial.camreset': 'Back to the standard camera distance',
    'dial.sizehelp': "The explorer's size — hold ⌘ (⊞ on Windows) or Alt/Option and use the wheel. Shrinking them magnifies the surface, the same as the ruler dial in the panel.",
    'dial.sizereset': 'Back to 1 : 1 — the explorer 1.8 m tall',

    'cc.click': 'Click to look around',
    'cc.esc': 'Esc releases the mouse',
    'loading': 'Building the terrain…',

    'msg.undefinedFrac': 'f is undefined on {pct}% of the domain',
    'msg.emptyFeasible': 'the feasible set is empty here',
    'surf.empty': 'That surface is empty in this box — widen the bounds or check the formula.',
    'err.emptyDomain': 'Domain is empty — check that x max > x min and y max > y min.',
    'err.undefinedEverywhere': 'f(x,y) is undefined everywhere on this domain.',
    'err.at': '(at character {pos})',

    // Parser diagnostics.
    'p.badChar': 'Unexpected character "{c}"',
    'p.unknownFn': 'Unknown function "{name}"',
    'p.missingParen': 'Missing ")"',
    'p.missingBar': 'Missing closing "|"',
    'p.missingCall': 'Missing ")" after {name}(',
    'p.arity': '{name}() takes {want} argument(s), got {got}',
    'p.isFunction': '"{name}" is a function — write {name}(...)',
    'p.unknownName': 'Unknown name "{name}"',
    'p.badOperator': 'Unexpected operator "{op}"',
    'p.eof': 'Unexpected end of expression',
    'p.unexpected': 'Unexpected "{what}"',
    'p.trailing': 'Unexpected trailing input',
    'p.empty': 'Expression is empty',
    'p.notNumber': 'Expression did not produce a number',
  },

  es: {
    'meta.title': 'Gradient Peaks — camine sobre la gráfica de f(x,y)',
    'meta.labtitle': 'Gradient Peaks Lab — la superficie y su mapa, lado a lado',
    'meta.labdesc': 'El mismo laboratorio 3D con un panel de mapa plano junto a la escena: el dominio visto desde arriba, las mismas curvas de nivel en los mismos colores y el explorador como un punto.',
    'meta.description': 'Un entorno 3D ligero para explorar gráficas de superficie, curvas de nivel, derivadas parciales, gradientes y máximos con restricciones de funciones de dos variables.',

    'panel.hide': 'Ocultar el panel (Tab)',
    'panel.show': 'Mostrar el panel (Tab)',

    'sec.function': 'Función',
    'surf.kind': 'Tipo de superficie',
    'surf.graph': 'Gráfica — z = f(x, y)',
    'surf.implicit': 'Implícita — F(x, y, z) = 0',
    'surf.parametric': 'Paramétrica — r(u, v)',
    'surf.flabel': 'F(x, y, z) =',
    'surf.note': 'Esta superficie no es la gráfica de una función, así que caminar, las derivadas parciales y las curvas de nivel no aplican. Recórrala con el dron.',
    'fn.label': 'f(x, y) =',
    'fn.examples': '— ejemplos —',
    'fn.cobb05': 'Cobb–Douglas  (x·y)^0.5',
    'fn.cobb37': 'Cobb–Douglas  x^0.3·y^0.7',
    'fn.paraboloid': 'Paraboloide  1 − x² − y²',
    'fn.saddle': 'Silla de montar  x² − y²',
    'fn.eggcarton': 'Cartón de huevos  sin(3x)·cos(3y)/2',
    'fn.twopeaks': 'Dos picos (gaussianas)',
    'fn.hills': 'Colinas onduladas',
    'fn.cone': 'Cono  1 − √(x²+y²)',
    'fn.rosenbrock': 'Rosenbrock (¡intente maximizarla!)',
    'fn.xyexp': 'x·y·e^−(x²+y²)',

    'cons.mode': 'Problema del consumidor',
    'shape.named': 'Superficie con nombre',
    'shape.custom': '— a la medida (escríbala abajo) —',
    'shape.sphere': 'Esfera — radio a',
    'shape.torus': 'Toro — radios a, b',
    'shape.pseudo': 'Pseudoesfera — radio a',
    'shape.hyper1': 'Hiperboloide de una hoja — a, b',
    'shape.catenoid': 'Catenoide — cintura a',
    'shape.helicoid': 'Helicoide — radio a, paso b',
    'shape.mobius': 'Banda de Möbius — radio a, ancho b',
    'shape.klein': 'Botella de Klein (inmersión 3D) — a',
    'shape.cross': 'Cross-cap — a',
    'shape.pa': 'a', 'shape.pb': 'b',
    'shape.radius': 'radio a', 'shape.tube': 'radio del tubo b',
    'shape.pitch': 'paso b', 'shape.width': 'semiancho b', 'shape.waist': 'cintura a',
    'shape.orientable': 'Orientable: tiene dos caras, y la opción interior / exterior significa algo.',
    'shape.nonorientable': 'No orientable: tiene una sola cara. Dé una vuelta completa y el explorador regresa de cabeza: eso es justamente ser no orientable. La opción interior / exterior solo elige por dónde empezar.',
    'shape.immersion': 'Esta es una inmersión en tres dimensiones, así que la superficie se atraviesa a sí misma. El encaje verdadero necesita una cuarta dimensión; caminar a través de la intersección es el precio de dibujarla aquí.',
    'orient.inside': 'Caminar por dentro',
    'orient.up': 'Hacia dónde queda arriba',
    'orient.normal': 'Normal al plano tangente',
    'orient.z': 'z del mundo (la vertical de siempre)',
    'orient.x': 'x del mundo',
    'orient.y': 'y del mundo',
    'orient.note': 'Haga clic sobre la superficie para dejar allí al explorador. Al caminar se mantiene erguido respecto de la superficie: en una esfera eso es un planeta; en una banda de Möbius, una vuelta completa lo devuelve de cabeza, que es lo que significa no ser orientable. En tercera persona la cámara mantiene una altura fija y gira alrededor, de modo que el movimiento se lee en tres dimensiones.',
    'orient.click': 'Haga clic sobre la superficie para colocar al explorador',
    'cons.utility': 'Función de utilidad',
    'cons.cobb': 'Cobb–Douglas  x^a · y^(1−a)',
    'cons.ces': 'CES  (x^r + y^r)^(1/r)',
    'cons.subs': 'Sustitutos perfectos  a·x + (1−a)·y',
    'cons.quasi': 'Cuasilineal  a·ln x + y',
    'cons.alpha': 'Participación a',
    'cons.rho': 'Sustitución r',
    'cons.px': 'precio de x',
    'cons.py': 'precio de y',
    'cons.inc': 'ingreso',
    'cons.note': 'El conjunto factible pasa a ser el conjunto presupuestario p<sub>x</sub>·x + p<sub>y</sub>·y ≤ m con x, y ≥ 0, el dominio se encuadra sobre él y el vocabulario en pantalla cambia: las curvas de nivel son curvas de indiferencia y RMS es la relación marginal de sustitución. Active el óptimo para encontrar la elección del consumidor.',
    'cons.contours': 'Curvas de indiferencia',
    'cons.curveshow': 'Curva de indiferencia sobre la que está parado',
    'cons.seccurve': 'La curva de indiferencia bajo sus pies',
    'cons.mrs': 'TMS',
    'cons.mrshelp': 'Tasa marginal de sustitución — |∂u/∂x ÷ ∂u/∂y|, el valor absoluto de la pendiente de la curva de indiferencia en la canasta donde está parado. En el óptimo iguala la razón de precios p_x / p_y.',
    'cons.budget': 'Conjunto presupuestario',
    'lab.sec': 'Panel del mapa plano',
    'lab.link': 'Abrir el Laboratorio — el mismo programa con un panel de mapa plano junto a la escena',
    'lab.linkback': 'Volver a la presentación clásica',
    'lab.mode': 'Qué muestra el panel',
    'lab.ramp': 'Mapa de calor con la rampa de las curvas de nivel',
    'lab.heat': 'Mapa de calor clásico',
    'lab.down': 'Vista cenital de la superficie',
    'lab.off': 'Nada — ocultar el panel',
    'lab.opacity': 'Opacidad del panel',
    'lab.size': 'Tamaño del panel',
    'lab.full': 'Pantalla completa',
    'lab.projlabel': 'el plano (x, y)',
    'lab.note': 'El panel es la figura que dibuja su libro de texto: el dominio visto desde arriba, con las mismas curvas de nivel en los mismos colores, la misma recta tangente y el explorador como un punto. Todo lo que hay en él es el mismo estado de la escena de atrás: camine en la vista 3D y el punto camina sobre el mapa.',
    'sec.domain': 'Dominio',
    'dom.xmin': 'x mín', 'dom.xmax': 'x máx', 'dom.ymin': 'y mín', 'dom.ymax': 'y máx',
    'dom.res': 'Resolución de la malla',
    'dom.axes': 'Escala de los ejes',
    'dom.sx': 'eje x', 'dom.sy': 'eje y', 'dom.sz': 'eje z (inclinación)',
    'dom.isotropic': 'Volver a ejes iguales',
    'dom.axesnote': 'Los tres en 1 es el espacio cartesiano corriente, donde la esfera unitaria es redonda. Estirar un eje cambia solo la imagen: todos los números reportados siguen siendo los verdaderos.',
    'dom.follow': 'La ventana sigue al explorador',
    'dom.followg': 'paso G (x)',
    'dom.followh': 'paso H (y)',
    'dom.follownote': 'Al llegar a un borde, ese eje se desplaza G (u H) veces su propia anchura en la direcci\u00f3n en que iba caminando, y el terreno se reconstruye alrededor de la nueva ventana. La anchura no cambia, de modo que la escala —y con ella toda medida tomada contra el explorador de 1,80 m— sobrevive al desplazamiento. Queda desactivada en el problema del consumidor, donde el dominio no es una ventana sino el conjunto de cestas que existen.',
    'dom.rebuild': 'Reconstruir el terreno',

    'sec.feasible': 'Conjunto factible',
    'feas.label': 'restricciones',
    'feas.examples': '— ejemplos —',
    'feas.triangle': 'Triángulo  x,y ≥ 0, x+y ≤ 2',
    'feas.disc': 'Disco  x² + y² ≤ 1',
    'feas.rect': 'Rectángulo',
    'feas.two': 'Dos rectas de presupuesto',
    'feas.curved': 'x·y ≥ 0.3, x+y ≤ 2.5',
    'feas.walls': 'Mostrar los muros de la frontera',
    'feas.isolate': 'Volver translúcido lo que está afuera',

    'sec.map': 'Mapa y terreno',
    'map.contours': 'Curvas de nivel',
    'map.cstep': 'Intervalo entre curvas Δz (vacío = automático)',
    'map.cwidth': 'Ancho del sendero',
    'map.heightcol': 'Colorear la superficie según la altura',
    'map.grid': 'Ret\u00edcula de coordenadas sobre la superficie',
    'map.gridnote': 'En una gr\u00e1fica es la ret\u00edcula del plano (x, y) levantada sobre la superficie; en una superficie param\u00e9trica son las propias l\u00edneas de par\u00e1metro; en una impl\u00edcita es donde la superficie corta los planos coordenados. Se dibuja por ambos lados, de modo que sigue siendo legible desde dentro.',
    'map.clamped': 'se amplió el intervalo para no generar demasiadas curvas',
    'map.decor': 'Vegetación, rocas y nieve',
    'map.water': 'Agua en las depresiones',
    'map.density': 'Densidad de la decoración',
    'map.shadows': 'Sombras (cuesta rendimiento)',

    'sec.deriv': 'Derivadas',
    'deriv.disc': 'Resaltar la vecindad',
    'deriv.radius': 'Radio',
    'deriv.dx': 'Flecha ∂f/∂x',
    'deriv.dy': 'Flecha ∂f/∂y',
    'deriv.grad': 'Gradiente ∇f',
    'deriv.dir': 'Derivada direccional',
    'deriv.dirnote': 'El explorador queda inmóvil: mueva el ratón para girar <b>u</b> sobre el borde.',
    'deriv.arcnote': 'El radio se mide como longitud de arco: la distancia realmente recorrida sobre la superficie, no sobre el suelo plano de abajo. En una ladera empinada el entorno abarca menos del plano (x, y) y su borde deja de ser una circunferencia.',
    'deriv.tangent': 'Plano tangente',

    'sec.curve': 'La curva bajo sus pies',
    'curve.show': 'Curva de nivel sobre la que está parado',
    'curve.tangent': 'Recta tangente a esa curva',
    'curve.note': 'Ambas se dibujan sobre la propia superficie y siguen al explorador continuamente. La tangente es la dirección tangente proyectada de vuelta sobre la superficie, así que se pega al terreno; se separa de la curva de nivel solo en segundo orden, y al encoger al explorador esa separación desaparece. Cada curva toma su color de su propia altura en la rampa.',

    'sec.zoom': 'Plano tangente y escala',
    'zoom.scale': 'Escala del explorador',
    'zoom.note': 'Deslice a la derecha y el explorador se encoge, hasta 0,18 mm; deslice a la izquierda y crece hasta diez veces su tamaño natural. La rueda del ratón hace lo mismo, como al acercar un mapa, y el gesto de pellizco del trackpad también. Active el plano tangente y deslice a la derecha: una superficie diferenciable se vuelve indistinguible de su plano.',

    'sec.opt': 'Optimización',
    'opt.show': 'Mostrar el óptimo',
    'opt.idle': 'Maximizar f sobre el conjunto factible.',
    'opt.goto': 'Teletransportarse al óptimo',
    'opt.none': 'No se encontró ningún punto factible en este dominio.',
    'opt.max': 'máx f =',
    'opt.at': 'en (x, y) =',
    'opt.on': 'en',
    'opt.interior': 'el interior del conjunto factible',
    'opt.boundary': 'la frontera del conjunto factible',
    'opt.domain': 'el dominio',
    'opt.gradthere': '‖∇f‖ allí =',
    'opt.pill': 'máx {v} en ({x}, {y})',

    'sec.view': 'Vista',
    'view.first': 'Primera persona',
    'view.third': 'Tercera persona',
    'view.drone': 'Dron',
    'view.dronecam': 'Cámara del dron',
    'view.dronefirst': 'Primera persona — desde el dron',
    'view.dronethird': 'Tercera persona — detrás del dron',
    'view.dronenote': 'El dron vuela nivelado: W A S D lo desplazan sobre el plano (x, y), Espacio y Ctrl fijan su altitud, y el ratón solo apunta la cámara. El haz que cuelga de él cae perpendicular al plano z = 0 y marca el punto del dominio sobre el que está.',
    'view.style': 'Aspecto del explorador',
    'style.explorer': 'Excursionista',
    'style.brick': 'Figura de bloques',
    'style.blocky': 'Estilo píxel',
    'style.buddy': 'Amigo redondo',
    'view.compass': 'Indicador de direcci\u00f3n',
    'view.compassnote': 'El globo de la esquina superior derecha muestra hacia d\u00f3nde est\u00e1 mirando: latitud y longitud alrededor de una figurita orientada en la misma direcci\u00f3n, con el rumbo y la elevaci\u00f3n debajo. Mantenga \u2318/\u229e o Alt, o pulse Esc y mueva el rat\u00f3n, y se agranda.',
    'view.top': 'Mirar desde arriba',
    'view.reset': 'Volver al centro',

    'sec.help': 'Ayuda',
    'help.move': 'Moverse', 'help.run': 'correr', 'help.look': 'mirar', 'help.mouse': 'ratón',
    'help.keylook': 'Mirar sin el rat\u00f3n',
    'help.orcmd': 'o \u2318/\u229e',
    'help.zoomcam': 'Zoom de la c\u00e1mara',
    'help.zoomsize': 'tama\u00f1o del explorador',
    'help.wheel': 'rueda',
    'help.updown': 'Dron sube/baja',
    'help.release': 'Soltar el ratón', 'help.hide': 'ocultar este panel',
    'help.syntax': 'Escriba funciones con <code>+ − * / ^</code> y <code>sin cos tan exp ln sqrt abs min max hypot gauss</code>. El producto implícito funciona: <code>2x</code>, <code>x y</code>. Las restricciones se combinan con <code>&&</code>, <code>||</code> y comparaciones encadenadas como <code>0&lt;=x&lt;=1</code>.',

    'hud.z': 'z = f(x,y)',
    'hud.avg': 'prom',
    'hud.scale11': 'escala 1 : 1',
    'hud.tall': 'explorador de {h} m',
    'hud.uat': 'u a {deg}°',
    'hud.undefined': 'indefinida',
    'hud.rmshelp': 'RMS — |∂f/∂x ÷ ∂f/∂y|, el valor absoluto de la pendiente de la curva de nivel en el punto donde está parado.',

    'dial.camhelp': 'Zoom de la cámara — la rueda del ratón, o un gesto de pellizco en el trackpad. Acerca la cámara; el explorador conserva exactamente su tamaño.',
    'dial.camreset': 'Volver a la distancia normal de la cámara',
    'dial.sizehelp': 'Tamaño del explorador — mantenga ⌘ (⊞ en Windows) o Alt/Option y use la rueda. Al encogerlo se amplía la superficie, igual que el dial de la regla en el panel.',
    'dial.sizereset': 'Volver a 1 : 1 — el explorador de 1,8 m',

    'cc.click': 'Haga clic para mirar alrededor',
    'cc.esc': 'Esc suelta el ratón',
    'loading': 'Construyendo el terreno…',

    'msg.undefinedFrac': 'f no está definida en el {pct}% del dominio',
    'msg.emptyFeasible': 'el conjunto factible está vacío aquí',
    'surf.empty': 'Esa superficie está vacía en esta caja: amplíe los límites o revise la fórmula.',
    'err.emptyDomain': 'El dominio está vacío: verifique que x máx > x mín y que y máx > y mín.',
    'err.undefinedEverywhere': 'f(x,y) no está definida en ningún punto de este dominio.',
    'err.at': '(en el carácter {pos})',

    'p.badChar': 'Carácter inesperado «{c}»',
    'p.unknownFn': 'Función desconocida «{name}»',
    'p.missingParen': 'Falta un «)»',
    'p.missingBar': 'Falta la barra «|» de cierre',
    'p.missingCall': 'Falta un «)» después de {name}(',
    'p.arity': '{name}() recibe {want} argumento(s), se dieron {got}',
    'p.isFunction': '«{name}» es una función: escriba {name}(...)',
    'p.unknownName': 'Nombre desconocido «{name}»',
    'p.badOperator': 'Operador inesperado «{op}»',
    'p.eof': 'La expresión termina antes de tiempo',
    'p.unexpected': 'Elemento inesperado «{what}»',
    'p.trailing': 'Sobra texto al final de la expresión',
    'p.empty': 'La expresión está vacía',
    'p.notNumber': 'La expresión no produjo un número',
  },
};

const STORAGE_KEY = 'gradient-peaks-lang';
let current = 'en';
const listeners = [];

function supported(code) {
  return LANGUAGES.some((l) => l.code === code) ? code : null;
}

/** ?lang= wins, then the last explicit choice, then the browser. */
export function detectLanguage() {
  try {
    const fromUrl = supported(new URLSearchParams(location.search).get('lang'));
    if (fromUrl) return fromUrl;
  } catch (err) { /* no URL to read */ }

  try {
    const saved = supported(localStorage.getItem(STORAGE_KEY));
    if (saved) return saved;
  } catch (err) { /* storage blocked */ }

  const nav = (navigator.languages && navigator.languages[0]) || navigator.language || 'en';
  return supported(String(nav).slice(0, 2).toLowerCase()) || 'en';
}

export function getLanguage() { return current; }

export function setLanguage(code) {
  current = supported(code) || 'en';
  try { localStorage.setItem(STORAGE_KEY, current); } catch (err) { /* storage blocked */ }
  document.documentElement.lang = current;
  applyStatic();
  for (const fn of listeners) fn(current);
}

export function onLanguageChange(fn) { listeners.push(fn); }

/** Look up `key`, substituting {placeholders} from `params`. */
export function t(key, params) {
  const table = STRINGS[current] || STRINGS.en;
  let s = table[key];
  if (s === undefined) s = STRINGS.en[key];
  if (s === undefined) return key;
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (m, name) => (params[name] === undefined ? m : params[name]));
}

/**
 * Translate the static markup.
 *   data-i18n       -> textContent
 *   data-i18n-html  -> innerHTML (for strings carrying <code> or <b>)
 *   data-i18n-title -> title attribute
 */
export function applyStatic(root) {
  const scope = root || document;

  for (const el of scope.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.getAttribute('data-i18n'));
  }
  for (const el of scope.querySelectorAll('[data-i18n-html]')) {
    el.innerHTML = t(el.getAttribute('data-i18n-html'));
  }
  for (const el of scope.querySelectorAll('[data-i18n-title]')) {
    el.title = t(el.getAttribute('data-i18n-title'));
  }

  if (scope === document) {
    // Two front ends share this dictionary, and they are different pages. A
    // page that names its own title key keeps it; only the one that says
    // nothing gets the default. Otherwise the Lab's tab is indistinguishable
    // from the classic app's, which is exactly when you have both open.
    const key = document.documentElement.dataset.titleKey || 'meta.title';
    document.title = t(key);
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.content = t(document.documentElement.dataset.descKey || 'meta.description');
  }
}
