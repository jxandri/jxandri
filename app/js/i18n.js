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
    'meta.description': 'A light 3D sandbox for exploring surface plots, level curves, partial derivatives, gradients and constrained maxima of functions of two variables.',

    'panel.hide': 'Hide panel (Tab)',
    'panel.show': 'Show panel (Tab)',

    'sec.function': 'Function',
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

    'sec.domain': 'Domain',
    'dom.xmin': 'x min', 'dom.xmax': 'x max', 'dom.ymin': 'y min', 'dom.ymax': 'y max',
    'dom.res': 'Mesh resolution',
    'dom.vex': 'Vertical exaggeration',
    'dom.vexnote': 'Exaggeration is visual only — every number shown is the true value.',
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
    'map.topo': 'Topographic colours',
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
    'deriv.tangent': 'Tangent plane',

    'sec.zoom': 'Zoom-in ruler',
    'zoom.scale': 'Explorer scale',
    'zoom.note': 'Each notch shrinks the explorer ten-fold. Turn on the tangent plane and watch a differentiable surface become a plane.',

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
    'view.top': 'Look straight down',
    'view.reset': 'Return to the centre',

    'sec.help': 'Help',
    'help.move': 'Move', 'help.run': 'run', 'help.look': 'look', 'help.mouse': 'mouse',
    'help.updown': 'Drone up/down',
    'help.release': 'Release the mouse', 'help.hide': 'hide this panel',
    'help.syntax': 'Write functions with <code>+ − * / ^</code>, and <code>sin cos tan exp ln sqrt abs min max hypot gauss</code>. Implicit products work: <code>2x</code>, <code>x y</code>. Constraints combine with <code>&&</code>, <code>||</code>, and chained comparisons like <code>0&lt;=x&lt;=1</code>.',

    'hud.z': 'z = f(x,y)',
    'hud.avg': 'avg',
    'hud.scale11': 'scale 1 : 1',
    'hud.tall': 'explorer {h} m tall',
    'hud.uat': 'u at {deg}°',
    'hud.undefined': 'undefined',

    'cc.click': 'Click to look around',
    'cc.esc': 'Esc releases the mouse',
    'loading': 'Building the terrain…',

    'msg.undefinedFrac': 'f is undefined on {pct}% of the domain',
    'msg.emptyFeasible': 'the feasible set is empty here',
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
    'meta.description': 'Un entorno 3D ligero para explorar gráficas de superficie, curvas de nivel, derivadas parciales, gradientes y máximos con restricciones de funciones de dos variables.',

    'panel.hide': 'Ocultar el panel (Tab)',
    'panel.show': 'Mostrar el panel (Tab)',

    'sec.function': 'Función',
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

    'sec.domain': 'Dominio',
    'dom.xmin': 'x mín', 'dom.xmax': 'x máx', 'dom.ymin': 'y mín', 'dom.ymax': 'y máx',
    'dom.res': 'Resolución de la malla',
    'dom.vex': 'Exageración vertical',
    'dom.vexnote': 'La exageración es solo visual: todos los números que aparecen son los verdaderos.',
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
    'map.topo': 'Colores topográficos',
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
    'deriv.tangent': 'Plano tangente',

    'sec.zoom': 'Regla de acercamiento',
    'zoom.scale': 'Escala del explorador',
    'zoom.note': 'Cada muesca reduce al explorador diez veces. Active el plano tangente y vea cómo una superficie diferenciable se convierte en un plano.',

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
    'view.top': 'Mirar desde arriba',
    'view.reset': 'Volver al centro',

    'sec.help': 'Ayuda',
    'help.move': 'Moverse', 'help.run': 'correr', 'help.look': 'mirar', 'help.mouse': 'ratón',
    'help.updown': 'Dron sube/baja',
    'help.release': 'Soltar el ratón', 'help.hide': 'ocultar este panel',
    'help.syntax': 'Escriba funciones con <code>+ − * / ^</code> y <code>sin cos tan exp ln sqrt abs min max hypot gauss</code>. El producto implícito funciona: <code>2x</code>, <code>x y</code>. Las restricciones se combinan con <code>&&</code>, <code>||</code> y comparaciones encadenadas como <code>0&lt;=x&lt;=1</code>.',

    'hud.z': 'z = f(x,y)',
    'hud.avg': 'prom',
    'hud.scale11': 'escala 1 : 1',
    'hud.tall': 'explorador de {h} m',
    'hud.uat': 'u a {deg}°',
    'hud.undefined': 'indefinida',

    'cc.click': 'Haga clic para mirar alrededor',
    'cc.esc': 'Esc suelta el ratón',
    'loading': 'Construyendo el terreno…',

    'msg.undefinedFrac': 'f no está definida en el {pct}% del dominio',
    'msg.emptyFeasible': 'el conjunto factible está vacío aquí',
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
    document.title = t('meta.title');
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.content = t('meta.description');
  }
}
