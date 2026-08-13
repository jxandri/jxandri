/**
 * main.js — scene assembly, controls and the UI wiring.
 */

import * as THREE from '../vendor/three.module.js';
import { compile, compilePredicate, MathExprError } from './mathexpr.js';
import { Field, FieldGrid } from './field.js';
import {
  buildSurface, buildWater, buildFeasibleWalls, recolorSurface, SurfaceDetail,
  GROUP_OUTSIDE, heightColor,
} from './terrain.js';
import { Decorations } from './decor.js';
import {
  buildContours, chooseLevels, DerivativeGizmo, TangentPlane,
  maximize, OptimumMarker, LevelCurveGizmo, TangentLineGizmo, traceLevelCurve,
} from './analysis.js';
import {
  Player, buildCharacter, MODE_FIRST, MODE_THIRD, MODE_DRONE,
  BASE_FOV, FOV_MIN, FOV_MAX,
} from './player.js';
import { ParametricWalker, ImplicitWalker, standBasis } from './walker.js';
import { buildImplicit, buildParametric } from './surfaces.js';
import {
  buildGraphGrid, buildParametricGrid, buildImplicitGrid, buildGeodesicGrid,
  disposeGrid,
} from './gridlines.js';
import { Compass, angles } from './compass.js';
import { Projection } from './projection.js';
import {
  LANGUAGES, detectLanguage, setLanguage, getLanguage, onLanguageChange, applyStatic, t,
} from './i18n.js';

/* ------------------------------------------------------------ utilities */

const $ = (id) => document.getElementById(id);

function fmt(v, digits = 3) {
  if (v === undefined || v === null || Number.isNaN(v)) return '—';
  if (!isFinite(v)) return v > 0 ? '+∞' : '−∞';
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-3 || a >= 1e6)) return v.toExponential(2);
  return v.toFixed(digits);
}

/** Free every geometry and material under `obj`, then detach it. */
function disposeTree(obj) {
  if (!obj) return;
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const m = o.material;
    if (Array.isArray(m)) m.forEach((mm) => mm && mm.dispose());
    else if (m) m.dispose();
  });
  if (obj.parent) obj.parent.remove(obj);
}

/* ------------------------------------------------------- renderer setup */

const canvas = $('view');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
  // The zoom ruler puts the near plane at 10^-6 m while the horizon is still
  // kilometres away; a linear depth buffer cannot span that.
  logarithmicDepthBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
// No tone mapping on purpose: the height ramp has to arrive on screen as the
// exact colours it was authored in, or the map legend stops matching.
renderer.toneMapping = THREE.NoToneMapping;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.05, 6000);

/** A cheap gradient sky: one inverted sphere with vertex colours. */
function buildSky(radius) {
  const geom = new THREE.SphereGeometry(radius, 24, 16);
  const pos = geom.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const top = new THREE.Color(0x2e6ba8);
  const mid = new THREE.Color(0x9fc4e0);
  const bot = new THREE.Color(0xc6d0d8);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / radius; // −1 .. 1
    if (t > 0) c.copy(mid).lerp(top, Math.min(1, t * 1.3));
    else c.copy(mid).lerp(bot, Math.min(1, -t * 1.6));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false,
  }));
  mesh.name = 'sky';
  return mesh;
}

// Three.js lights are in physical units and the Lambert BRDF divides by π, so
// these numbers are ~3× what they look like they should be.
const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x8a7f6a, 3.1);
const sun = new THREE.DirectionalLight(0xfff8ec, 3.4);
sun.position.set(1, 1.4, 0.6);
scene.add(hemi, sun, sun.target);

let sky = null;

/* ------------------------------------------------------------- app state */

const state = {
  fnSrc: '(x*y)^0.5',
  feasSrc: 'x>=0 && y>=0 && x+y<=2',
  xmin: 0, xmax: 2, ymin: 0, ymax: 2,
  res: 300,
  sx: 1, sy: 1, sz: 1,   // axis scales; 1,1,1 is isotropic Cartesian

  surfaceKind: 'graph',  // 'graph' | 'implicit' | 'parametric'
  implicitSrc: 'x^2+y^2+z^2-1',
  zmin: -1.5, zmax: 1.5,
  pxSrc: 'cos(u)*sin(v)', pySrc: 'sin(u)*sin(v)', pzSrc: 'cos(v)',
  umin: 0, umax: 6.2832, vmin: 0, vmax: 3.1416,
  worldSize: 220,

  feasible: false,
  isolate: false,
  contours: false,
  contourStep: 0,      // 0 = choose a round interval automatically
  pathWidth: 1.4,      // world metres; wide enough to walk along
  heightColors: false,
  surfGrid: false,     // the coordinate grid, drawn on the surface itself
  geoGrid: false,      // ...built from geodesics rather than from coordinates
  compass: true,       // the direction indicator, top right
  curCurve: false,
  curTangent: false,
  decor: true,
  water: true,

  // The window follows the explorer: reaching an edge slides that axis along by
  // this fraction of its own width, in the direction of travel.
  follow: true,
  followG: 0.2,
  followH: 0.2,

  density: 1,
  shadows: false,

  disc: false,
  radius: 3,
  showDx: false,
  showDy: false,
  showGrad: false,
  showDir: false,
  dirAngle: 0,
  tangent: false,

  zoom: 1,             // the explorer's own size, in units of 1.8 m
  camZoom: 1,          // how close the camera is, which is a separate question
  showOpt: false,

  charStyle: 'explorer',
  shape: '',           // named parametric surface, '' = whatever is typed
  pa: 1, pb: 0.4,      // its two parameters
  inside: false,       // walk the other side of an orientable surface
  upAxis: 'normal',    // 'normal' | 'x' | 'y' | 'z'

  // Consumer problem: the same machinery, wearing the vocabulary of demand
  // theory. Nothing about the mathematics changes — a budget set is a feasible
  // set and an indifference curve is a level curve — but a student meeting
  // this in a microeconomics course should read the words they were taught.
  consumer: false,
  utility: 'cobb',
  alpha: 0.5,
  px: 1, py: 1, income: 2,
};

let field = null;
let grid = null;
let predicate = () => true;
let surface = null;      // { mesh, geometry, materials, stats }
let water = null;
let walls = null;
let contourLines = null;
let contourInfo = null;
let surfaceDetail = null;
let gizmo = null;
let tangentPlane = null;
let optMarker = null;
let curveGizmo = null;
let tangentLine = null;
let optimum = null;
let altSurface = null;   // the implicit or parametric mesh, when one is shown
let surfGrid = null;     // the coordinate grid drawn on whichever surface it is
let decorations = new Decorations();
let player = null;

/* ---------------------------------------- standing on a non-graph surface */

// The heightfield explorer cannot be reused here: it is built around a Field,
// and a torus has none. These three hold the equivalent for a parametric or
// implicit surface — where the walker is, the character standing there, and a
// camera that has to work without a global "up".
let walker = null;
let altHiker = null;
const altView = {
  mode: MODE_DRONE,
  pitch: -0.1,          // first person only; third person stays level
  camYaw: 0.6,          // third person: where the fixed camera sits
  camDist: 0,
  camHeight: 0,
  scale: 1,             // world units per unit of the surface's own coordinates
  charScale: 1,         // world units per unit of the character
};

/*
 * The flat map beside the solid one — the Lab page only.
 *
 * Everything is driven off the same state as the scene, so nothing can drift
 * between the two pictures; the original page simply has no #minimap and every
 * call below is a no-op there. That is the whole cost of shipping two front
 * ends from one program.
 */
const projection = $('minimap') ? new Projection($('minimap')) : null;
const projState = { mode: 'ramp', opacity: 0.88, size: 1 };
let topCam = null;

/*
 * The direction indicator, top right.
 *
 * It reads the live camera rather than any one of the three things that can be
 * driving it — the explorer's head, the walker's heading, the aircraft's gimbal
 * — because whichever of those is in charge, the camera is where the answer
 * ends up. `_emphasis` counts down the seconds since the instrument was last
 * being consulted rather than glanced at.
 */
const compass = $('compass') ? new Compass($('compass')) : null;
const compassState = { emphasis: 0, freed: false };
const _camDir = new THREE.Vector3();

const world = new THREE.Group();
scene.add(world);
world.add(decorations.group);

/* ------------------------------------------------------------ the build */

function setMessage(text) {
  const el = $('r-msg');
  if (!text) { el.hidden = true; return; }
  el.textContent = text;
  el.hidden = false;
}

/** Remove every object that only makes sense for a graph of a function. */
function clearGraphWorld() {
  if (surface) disposeTree(surface.mesh);
  disposeTree(water);
  disposeTree(walls);
  disposeTree(contourLines);
  if (surfaceDetail) { disposeTree(surfaceDetail.group); surfaceDetail.dispose(); }
  if (gizmo) { disposeTree(gizmo.group); gizmo.dispose(); }
  if (tangentPlane) { disposeTree(tangentPlane.mesh); tangentPlane.dispose(); }
  if (optMarker) { disposeTree(optMarker.group); optMarker.dispose(); }
  if (curveGizmo) { disposeTree(curveGizmo.mesh); curveGizmo.dispose(); }
  if (tangentLine) { disposeTree(tangentLine.mesh); tangentLine.dispose(); }
  decorations.clear();
  surface = water = walls = contourLines = null;
  surfaceDetail = gizmo = tangentPlane = optMarker = curveGizmo = tangentLine = null;
  contourInfo = null;
  optimum = null;
}

/**
 * The named parametric surfaces, as formulas rather than as special cases.
 *
 * Each entry writes its X, Y, Z and its parameter rectangle into the same boxes
 * a student would type into, so choosing "Torus" is a worked example of writing
 * one rather than a hidden mode. `wrap` says which parameter directions close
 * up, which is what lets you walk right round a torus and stops you walking off
 * the edge of a Möbius strip.
 *
 * `sides` records what the surface is: two-sided, one-sided, or a
 * three-dimensional immersion of something that only embeds in four. That is
 * not decoration — it decides whether the inside/outside toggle means anything.
 */
const SHAPES = {
  sphere: (a) => ({
    X: `${a}*cos(u)*sin(v)`, Y: `${a}*sin(u)*sin(v)`, Z: `${a}*cos(v)`,
    umin: 0, umax: 6.28319, vmin: 0.001, vmax: 3.14059,
    wrapU: true, wrapV: false, sides: 2, labels: ['shape.radius', null],
  }),
  torus: (a, b) => ({
    X: `(${a}+${b}*cos(v))*cos(u)`, Y: `(${a}+${b}*cos(v))*sin(u)`, Z: `${b}*sin(v)`,
    umin: 0, umax: 6.28319, vmin: 0, vmax: 6.28319,
    wrapU: true, wrapV: true, sides: 2, labels: ['shape.radius', 'shape.tube'],
  }),
  // The tractrix of revolution: constant negative curvature, and the classical
  // answer to "what does a hyperbolic plane look like".
  pseudo: (a) => ({
    X: `${a}*cos(u)/cosh(v)`, Y: `${a}*sin(u)/cosh(v)`, Z: `${a}*(v-tanh(v))`,
    umin: 0, umax: 6.28319, vmin: -3, vmax: 3,
    wrapU: true, wrapV: false, sides: 2, labels: ['shape.radius', null],
  }),
  hyper1: (a, b) => ({
    X: `${a}*cosh(v)*cos(u)`, Y: `${a}*cosh(v)*sin(u)`, Z: `${b}*sinh(v)`,
    umin: 0, umax: 6.28319, vmin: -1.5, vmax: 1.5,
    wrapU: true, wrapV: false, sides: 2, labels: ['shape.radius', 'shape.pb'],
  }),
  catenoid: (a) => ({
    X: `${a}*cosh(v)*cos(u)`, Y: `${a}*cosh(v)*sin(u)`, Z: `${a}*v`,
    umin: 0, umax: 6.28319, vmin: -1.6, vmax: 1.6,
    wrapU: true, wrapV: false, sides: 2, labels: ['shape.waist', null],
  }),
  helicoid: (a, b) => ({
    X: `v*cos(u)`, Y: `v*sin(u)`, Z: `${b}*u`,
    umin: -6.28319, umax: 6.28319, vmin: -Number(a), vmax: Number(a),
    wrapU: false, wrapV: false, sides: 2, labels: ['shape.radius', 'shape.pitch'],
  }),
  mobius: (a, b) => ({
    X: `(${a}+v*cos(u/2))*cos(u)`, Y: `(${a}+v*cos(u/2))*sin(u)`, Z: `v*sin(u/2)`,
    umin: 0, umax: 6.28319, vmin: -Number(b), vmax: Number(b),
    wrapU: true, wrapV: false, sides: 1, labels: ['shape.radius', 'shape.width'],
  }),
  // The figure-eight immersion: the bottle really does pass through itself
  // here, because an embedding needs a fourth dimension to get out of the way.
  klein: (a) => ({
    X: `(${a}+cos(u/2)*sin(v)-sin(u/2)*sin(2*v))*cos(u)`,
    Y: `(${a}+cos(u/2)*sin(v)-sin(u/2)*sin(2*v))*sin(u)`,
    Z: `sin(u/2)*sin(v)+cos(u/2)*sin(2*v)`,
    umin: 0, umax: 6.28319, vmin: 0, vmax: 6.28319,
    wrapU: true, wrapV: true, sides: 1, immersed: true, labels: ['shape.radius', null],
  }),
  cross: (a) => ({
    X: `${a}*cos(u)*sin(2*v)`, Y: `${a}*sin(u)*sin(2*v)`, Z: `${a}*(cos(v)^2-cos(u)^2*sin(v)^2)`,
    umin: 0, umax: 6.28319, vmin: 0, vmax: 3.14159,
    wrapU: true, wrapV: false, sides: 1, immersed: true, labels: ['shape.radius', null],
  }),
};

/** Write the chosen named surface into the parametric boxes. */
function applyShape() {
  const make = SHAPES[state.shape];
  $('grp-shapeparams').hidden = !make;
  if (!make) { $('note-orientable').textContent = ''; return; }

  const spec = make(state.pa.toFixed(2), state.pb.toFixed(2));
  $('in-px').value = spec.X;
  $('in-py').value = spec.Y;
  $('in-pz').value = spec.Z;
  $('in-umin').value = spec.umin.toFixed(4);
  $('in-umax').value = spec.umax.toFixed(4);
  $('in-vmin').value = spec.vmin.toFixed(4);
  $('in-vmax').value = spec.vmax.toFixed(4);
  Object.assign(state, {
    pxSrc: spec.X, pySrc: spec.Y, pzSrc: spec.Z,
    umin: spec.umin, umax: spec.umax, vmin: spec.vmin, vmax: spec.vmax,
    wrapU: spec.wrapU, wrapV: spec.wrapV, sides: spec.sides,
  });

  $('lbl-pa-name').textContent = t(spec.labels[0] || 'shape.pa');
  $('lbl-pb-name').textContent = t(spec.labels[1] || 'shape.pb');
  $('in-pb').parentElement.hidden = !spec.labels[1];

  const note = spec.sides === 1 ? t('shape.nonorientable') : t('shape.orientable');
  $('note-orientable').textContent = spec.immersed ? `${note} ${t('shape.immersion')}` : note;
  $('t-inside').disabled = spec.sides === 1;
}

/**
 * Build an implicit or parametric surface, and something to stand on it.
 *
 * Neither is the graph of a function, so the heightfield machinery — contours,
 * partial derivatives, the optimiser — is torn down. The explorer is not: a
 * walker that knows the surface's own geometry takes over, and the view can be
 * the drone, the explorer's own eyes, or a level camera watching them.
 */
function rebuildAlternate() {
  clearGraphWorld();
  disposeTree(altSurface);
  altSurface = null;
  walker = null;

  const ws = state.worldSize;
  const common = { sx: state.sx, sy: state.sy, sz: state.sz, res: 0 };

  try {
    if (state.surfaceKind === 'implicit') {
      const F = compile(state.implicitSrc, ['x', 'y', 'z']);
      clearError('err-implicit');
      const span = Math.max(state.xmax - state.xmin, state.ymax - state.ymin, state.zmax - state.zmin) || 1;
      const built = buildImplicit(F, {
        ...common,
        res: Math.min(96, Math.max(24, Math.round(state.res / 4))),
        xmin: state.xmin, xmax: state.xmax,
        ymin: state.ymin, ymax: state.ymax,
        zmin: state.zmin, zmax: state.zmax,
        scale: ws / span,
      });
      if (!built) { setMessage(t('surf.empty')); return false; }
      altSurface = built.mesh;
      walker = new ImplicitWalker(F, {
        ...common, scale: ws / span,
        bounds: {
          xmin: state.xmin, xmax: state.xmax,
          ymin: state.ymin, ymax: state.ymax,
          zmin: state.zmin, zmax: state.zmax,
        },
      });
      altView.scale = ws / span;
      landWalkerOnMesh();
    } else {
      const X = compile(state.pxSrc, ['u', 'v']);
      const Y = compile(state.pySrc, ['u', 'v']);
      const Z = compile(state.pzSrc, ['u', 'v']);
      clearError('err-param');
      const built = buildParametric({ X, Y, Z }, {
        ...common,
        res: Math.min(320, Math.max(40, Math.round(state.res / 2))),
        umin: state.umin, umax: state.umax, vmin: state.vmin, vmax: state.vmax,
        scale: ws / 4,
      });
      if (!built) { setMessage(t('surf.empty')); return false; }
      altSurface = built.mesh;
      walker = new ParametricWalker({ X, Y, Z }, {
        ...common, scale: ws / 4,
        umin: state.umin, umax: state.umax, vmin: state.vmin, vmax: state.vmax,
        wrapU: !!state.wrapU, wrapV: !!state.wrapV,
      });
      altView.scale = ws / 4;
    }
  } catch (err) {
    showError(state.surfaceKind === 'implicit' ? 'err-implicit' : 'err-param', err);
    return false;
  }

  world.add(altSurface);
  setMessage('');

  // Sky and fog still want a sensible scale even without a Field.
  disposeTree(sky);
  sky = buildSky(ws * 8);
  scene.add(sky);
  scene.fog = new THREE.Fog(0xa9c3d8, ws * 1.6, ws * 8);
  const sunDist = ws * 2;
  sun.position.set(sunDist * 0.6, sunDist * 0.9, sunDist * 0.45);
  sun.target.position.set(0, 0, 0);

  if (player) player.group.visible = false;
  ensureAltHiker();
  applyOrientation();
  refreshSurfaceGrid();
  frameAlternate();
  return true;
}

/**
 * Build — or tear down — the coordinate grid on whatever surface is on screen.
 *
 * Called on every rebuild and whenever the checkbox moves. The three kinds of
 * surface have three different notions of "coordinate grid", so this is where
 * the choice is made; gridlines.js knows how to draw each one.
 *
 * It is rebuilt rather than kept and hidden, because the lines are tied to the
 * surface's own geometry: change the function, the domain, the axis scales or a
 * named surface's parameters, and every vertex of the grid has moved.
 */
function refreshSurfaceGrid() {
  if (surfGrid) { world.remove(surfGrid); disposeGrid(surfGrid); surfGrid = null; }
  updateGridUI();
  if (!state.surfGrid) return;

  const ws = state.worldSize;
  try {
    if (state.surfaceKind === 'graph') {
      // One square per explorer. Their height in world metres is the ruler.
      if (field) surfGrid = buildGraphGrid(field, { unit: 1.8 * state.zoom });
    } else {
      // Two, on a surface with no metres of its own — a person against a torus
      // is small enough that single squares would be a haze.
      const unit = 2 * 1.8 * state.zoom * (altView.charScale || 1);
      if (state.geoGrid && walker) {
        surfGrid = buildGeodesicGrid(walker, {
          unit,
          cells: Math.round((altSurfaceRadius() * 2.6) / unit),
          radius: altSurfaceRadius(),
        });
      } else if (state.surfaceKind === 'implicit') {
        const span = Math.max(state.xmax - state.xmin, state.ymax - state.ymin,
          state.zmax - state.zmin) || 1;
        surfGrid = buildImplicitGrid(compile(state.implicitSrc, ['x', 'y', 'z']), {
          unit,
          sx: state.sx, sy: state.sy, sz: state.sz,
          xmin: state.xmin, xmax: state.xmax,
          ymin: state.ymin, ymax: state.ymax,
          zmin: state.zmin, zmax: state.zmax,
          scale: ws / span, radius: ws / 2,
        });
      } else {
        surfGrid = buildParametricGrid({
          X: compile(state.pxSrc, ['u', 'v']),
          Y: compile(state.pySrc, ['u', 'v']),
          Z: compile(state.pzSrc, ['u', 'v']),
        }, {
          unit,
          sx: state.sx, sy: state.sy, sz: state.sz,
          umin: state.umin, umax: state.umax, vmin: state.vmin, vmax: state.vmax,
          scale: ws / 4, radius: ws / 3,
        });
      }
    }
  } catch (err) {
    // A formula that will not compile has already been reported where it was
    // typed; the grid simply has nothing to draw.
    surfGrid = null;
  }
  if (surfGrid) world.add(surfGrid);
  updateGridUI();
}

/** The radius of whatever non-graph surface is on screen. */
function altSurfaceRadius() {
  const b = altSurface && altSurface.geometry.boundingSphere;
  return b ? b.radius : state.worldSize / 2;
}

/**
 * Show what one square is worth, and offer the geodesic option only where it
 * means anything — a graph's grid is the plane's own, and the plane's own grid
 * is already made of geodesics.
 */
function updateGridUI() {
  const geoField = $('fld-geogrid');
  if (geoField) geoField.hidden = !(state.surfGrid && state.surfaceKind !== 'graph');
  const el = $('grid-scale');
  if (!el) return;
  if (!state.surfGrid || !surfGrid) { el.hidden = true; return; }
  const { side, multiple, geodesic } = surfGrid.userData;
  const heights = (side || 0) / (1.8 * state.zoom * (state.surfaceKind === 'graph' ? 1 : (altView.charScale || 1)));
  el.hidden = false;
  el.textContent = t(geodesic ? 'map.gridgeo' : 'map.gridside', {
    n: heights < 1.05 ? '1' : heights.toPrecision(2),
    m: multiple > 1 ? ` (×${multiple})` : '',
  });
}

/**
 * Resizing the explorer resizes the grid, and rebuilding a few hundred traced
 * lines is not something to do on every notch of a wheel. Wait until the dial
 * has stopped moving.
 */
let gridTimer = 0;
function scheduleGridRebuild() {
  if (!state.surfGrid) return;
  clearTimeout(gridTimer);
  gridTimer = setTimeout(() => refreshSurfaceGrid(), 220);
}

/**
 * Drop the implicit walker onto an actual vertex of the mesh.
 *
 * F = 0 says nothing about where the surface is, only which points are on it,
 * so there is no natural starting point to guess. The mesher has just found
 * several thousand of them; borrow one and Newton-polish it.
 */
function landWalkerOnMesh() {
  if (!walker || !altSurface) return;
  const pos = altSurface.geometry.getAttribute('position');
  if (!pos || pos.count === 0) return;
  const i = Math.floor(pos.count / 2) * 3;
  walker.placeAtWorld(new THREE.Vector3(pos.array[i], pos.array[i + 1], pos.array[i + 2]));
}

/** The character that stands on a non-graph surface. */
function ensureAltHiker() {
  if (altHiker) { disposeTree(altHiker); altHiker = null; }
  altHiker = buildCharacter(state.charStyle);
  altHiker.visible = false;
  world.add(altHiker);
}

function applyOrientation() {
  // Through flip(), not by assignment: swapping sides swaps which way is right,
  // and with it the sense of the angle the body is held at.
  const want = state.inside ? -1 : 1;
  if (walker && walker.sign !== want) walker.flip();
  $('fld-orient').hidden = state.surfaceKind === 'graph';
}

/**
 * Stand the character on the surface, turned the way they last moved.
 *
 * The basis is (side, up, −forward) because the character models look down
 * their own −Z. `up` is normally the surface normal — which is what makes a
 * sphere feel like a planet — but can be pinned to a world axis instead, for
 * students who find a tumbling horizon harder to read than a fixed one.
 *
 * Two directions are in play and they are not the same. The heading is where
 * the explorer is *looking*, which the mouse turns and the first-person camera
 * follows; the facing is which way the body is *pointed*, and a body points the
 * way it last travelled. Strafe left around a torus and you should watch
 * someone walk left, not watch someone walk forwards sideways. So the body
 * takes the facing and the returned frame keeps the heading for the camera.
 */
const _hbasis = new THREE.Matrix4();
const _cbasis = new THREE.Matrix4();
function placeAltHiker() {
  if (!walker || !altHiker) return null;
  const p = walker.position(new THREE.Vector3());
  const fr = walker.frame();
  const { n, side } = fr;
  const fwd = walker.facing ? walker.facing(fr) : fr.fwd;

  let up = n;
  if (state.upAxis !== 'normal') {
    const axis = state.upAxis === 'x' ? new THREE.Vector3(1, 0, 0)
      : state.upAxis === 'y' ? new THREE.Vector3(0, 0, -1)   // math y is world −Z
        : new THREE.Vector3(0, 1, 0);
    up = axis.multiplyScalar(walker.sign);
  }

  // Re-orthogonalise: pinning "up" to an axis leaves both directions out of
  // plane, and a character built on a skewed basis leans.
  const flatten = (v, fallback) => {
    const w = v.clone().addScaledVector(up, -v.dot(up));
    if (w.lengthSq() < 1e-12) w.copy(fallback);
    return w.normalize();
  };
  const face = flatten(fwd, side);            // the body
  const head = flatten(fr.fwd, side);         // the eyes

  // The explorer's own right hand — see standBasis for why the order matters.
  const sd = new THREE.Vector3().crossVectors(head, up).normalize();

  standBasis(up, face, _hbasis);
  altHiker.position.copy(p);
  altHiker.quaternion.setFromRotationMatrix(_hbasis);
  altHiker.scale.setScalar(state.zoom * altView.charScale);
  altHiker.visible = altView.mode !== MODE_FIRST;
  return { p, up, fwd: head, face, side: sd };
}

/**
 * Keep the following camera above the explorer's feet and short of straight
 * overhead — at exactly overhead its view is parallel to the world up and
 * lookAt has nothing left to orient against.
 */
function clampCamHeight(h) {
  const lim = (altView.camDist || 1) * 2.2;
  return Math.max(-lim, Math.min(lim, h));
}

/** Put the drone where the whole alternate surface is in shot. */
function frameAlternate() {
  const b = altSurface && altSurface.geometry.boundingSphere;
  const r = b ? b.radius : state.worldSize;
  const vFov = camera.fov * Math.PI / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const dist = (r / Math.sin(Math.min(vFov, hFov) / 2)) * 1.25;
  const elev = 0.5;
  camera.position.set(0, Math.sin(elev) * dist, Math.cos(elev) * dist);
  camera.lookAt(0, 0, 0);
  altCam.dist = dist;
  altCam.yaw = 0;
  altCam.pitch = -elev;
  // A torus has no metres. The explorer is sized against the surface instead —
  // about a fourteenth of its radius, which is roughly a person against a
  // small hill and keeps them visible without dwarfing the shape.
  altView.charScale = r / 14;
  // The third-person camera's offset *from the explorer*, in their own body
  // heights: far enough back to see the surface they are standing on, close
  // enough that they are a figure rather than a speck.
  const body = 1.8 * altView.charScale;
  altView.camDist = body * 7;
  altView.camHeight = body * 2.6;
}

function rebuild() {
  if (state.surfaceKind !== 'graph') return rebuildAlternate();

  disposeTree(altSurface);
  altSurface = null;
  walker = null;
  if (altHiker) altHiker.visible = false;
  if (player) player.group.visible = true;

  // --- parse first, so a typo never destroys a working scene -------------
  let fn, pred;
  try {
    fn = compile(state.fnSrc);
    clearError('err-fn');
  } catch (err) {
    showError('err-fn', err);
    return false;
  }
  try {
    pred = compilePredicate(state.feasSrc);
    pred(0, 0);
    clearError('err-feas');
  } catch (err) {
    showError('err-feas', err);
    return false;
  }

  if (!(state.xmax > state.xmin) || !(state.ymax > state.ymin)) {
    showError('err-fn', localError('err.emptyDomain'));
    return false;
  }

  predicate = pred;

  // --- tear the old world down ------------------------------------------
  clearGraphWorld();

  // --- sample -----------------------------------------------------------
  field = new Field({
    fn,
    xmin: state.xmin, xmax: state.xmax, ymin: state.ymin, ymax: state.ymax,
    worldSize: state.worldSize,
    sx: state.sx, sy: state.sy, sz: state.sz,
  });
  grid = new FieldGrid(field, state.res);
  field.zTop = grid.zmax;
  field.zBottom = grid.zmin;

  if (!grid.anyValid) {
    showError('err-fn', localError('err.undefinedEverywhere'));
    return false;
  }

  // --- meshes -----------------------------------------------------------
  surface = buildSurface(field, grid, predicate);
  world.add(surface.mesh);
  surface.mesh.receiveShadow = state.shadows;

  water = buildWater(field, grid);
  if (water) { world.add(water); water.visible = state.water; }

  walls = buildFeasibleWalls(field, grid, predicate);
  if (walls) { world.add(walls); walls.visible = state.feasible; }

  surfaceDetail = new SurfaceDetail(field, { rings: 2, segments: 96, growth: 3.4 });
  world.add(surfaceDetail.group);

  gizmo = new DerivativeGizmo(field);
  world.add(gizmo.group);

  tangentPlane = new TangentPlane(field);
  world.add(tangentPlane.mesh);

  optMarker = new OptimumMarker(field);
  world.add(optMarker.group);

  curveGizmo = new LevelCurveGizmo(field);
  world.add(curveGizmo.mesh);

  tangentLine = new TangentLineGizmo(field);
  world.add(tangentLine.mesh);

  decorations.build(field, grid, predicate, { density: state.density, shadows: state.shadows });
  decorations.setVisible(state.decor);
  decorations.setIsolate(state.isolate && state.feasible);

  // --- sky, fog, sun ----------------------------------------------------
  disposeTree(sky);
  sky = buildSky(field.worldSize * 8);
  scene.add(sky);
  scene.fog = new THREE.Fog(0xa9c3d8, field.worldSize * 1.1, field.worldSize * 6);

  const sunDist = field.worldSize * 2;
  sun.position.set(sunDist * 0.6, sunDist * 0.9, sunDist * 0.45);
  sun.target.position.set(field.worldX(field.cx), 0, field.worldZ(field.cy));
  configureShadows();

  // --- player -----------------------------------------------------------
  if (!player) {
    player = new Player(field);
    world.add(player.group);
  } else {
    player.field = field;
    player.resetToDomainCentre();
  }
  player.setZoom(state.zoom);

  applyPalette();
  applyIsolation();
  refreshContours();
  refreshSurfaceGrid();
  refreshProjection();
  refreshOptimum();
  reportStats();
  return true;
}

const lastError = { 'err-fn': null, 'err-feas': null };

function clearError(elementId) {
  lastError[elementId] = null;
  $(elementId).hidden = true;
}

function showError(elementId, err) {
  lastError[elementId] = err;
  const el = $(elementId);
  let msg;
  if (err instanceof MathExprError) {
    msg = err.code ? t(err.code, err.params) : err.message;
    if (err.position !== undefined) msg += ' ' + t('err.at', { pos: err.position + 1 });
  } else {
    msg = err.i18n ? t(err.i18n) : (err.message || String(err));
  }
  el.textContent = msg;
  el.hidden = false;
}

/** An error carrying a translation key rather than a fixed English sentence. */
function localError(key) {
  const e = new Error(t(key));
  e.i18n = key;
  return e;
}

function reportStats() {
  const parts = [];
  if (surface.stats.undefinedFraction > 0.005) {
    parts.push(t('msg.undefinedFrac', { pct: Math.round(surface.stats.undefinedFraction * 100) }));
  }
  if (state.feasible && surface.stats.insideTris === 0) {
    parts.push(t('msg.emptyFeasible'));
  }
  setMessage(parts.join(' · '));
}

function configureShadows() {
  renderer.shadowMap.enabled = state.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  sun.castShadow = state.shadows;
  if (state.shadows && field) {
    const r = field.worldSize * 0.75;
    const c = sun.shadow.camera;
    c.left = -r; c.right = r; c.top = r; c.bottom = -r;
    c.near = field.worldSize * 0.5;
    c.far = field.worldSize * 6;
    c.updateProjectionMatrix();
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.bias = -0.0012;
  }
  if (surface) surface.mesh.receiveShadow = state.shadows;
}

/* ---------------------------------------------------------- toggle logic */

function paletteMode() { return state.heightColors ? 'height' : 'biome'; }

function applyPalette() {
  if (!surface) return;
  recolorSurface(field, grid, surface.geometry, paletteMode());

  // In height-colour mode, flatten the lighting. The ramp only means anything
  // if the colour on screen is the colour in the legend, so trade some of the
  // directional shading for fidelity to the palette.
  if (state.heightColors) { hemi.intensity = 4.2; sun.intensity = 1.1; }
  else { hemi.intensity = 3.1; sun.intensity = 3.4; }
  if (surfaceDetail && player) {
    surfaceDetail.update(player.x, player.y, detailExtent(), grid, paletteMode(), true);
  }
}

function applyIsolation() {
  if (!surface) return;
  const on = state.feasible && state.isolate;
  const out = surface.materials[GROUP_OUTSIDE];
  out.transparent = on;
  out.opacity = on ? 0.18 : 1;
  out.depthWrite = !on;
  out.needsUpdate = true;
  decorations.setIsolate(on);
  if (water) water.visible = state.water && !on;
}

function refreshContours() {
  if (contourLines) { disposeTree(contourLines); contourLines = null; }
  if (!state.contours || !grid) { updateContourNote(); return; }

  const picked = chooseLevels(grid.zmin, grid.zmax, { step: state.contourStep, target: 40 });
  contourInfo = picked;
  contourLines = buildContours(field, grid, picked.levels || [], { width: state.pathWidth });
  if (contourLines) world.add(contourLines);
  updateContourNote();
  refreshProjection();
}

function updateContourNote() {
  const el = $('t-contours').closest('.check');
  const old = el.querySelector('.contour-step');
  if (old) old.remove();
  if (state.contours && contourInfo && contourInfo.step) {
    const s = document.createElement('kbd');
    s.className = 'contour-step';
    s.textContent = `Δz = ${fmt(contourInfo.step, 4)}` + (contourInfo.clamped ? ' ⚠' : '');
    if (contourInfo.clamped) s.title = t('map.clamped');
    el.querySelector('span').appendChild(s);
  }
}

/**
 * Half-width of the innermost detail ring, in math units.
 *
 * Seven metres at full size — comfortably past where an eye-level view resolves
 * individual triangles — and it shrinks with the explorer so the same relative
 * neighbourhood stays sharp at every notch of the zoom ruler.
 */
function detailExtent() {
  const metres = Math.max(7 * player.zoom, field.worldSize * 1e-7);
  return field.mathStep(metres);
}

function refreshOptimum() {
  if (state.showOpt && field) {
    optimum = maximize(field, state.feasible ? predicate : () => true, { coarse: 180, restarts: 8 });
  }
  renderOptimum();
}

function renderOptimum() {
  const report = $('opt-report');
  const goto = $('btn-goto');

  if (!state.showOpt || !field) {
    if (optMarker) optMarker.setVisible(false);
    $('r-opt').hidden = true;
    goto.disabled = true;
    report.textContent = t('opt.idle');
    return;
  }

  if (!optimum) {
    optMarker.setVisible(false);
    $('r-opt').hidden = true;
    goto.disabled = true;
    report.textContent = t('opt.none');
    return;
  }

  optMarker.set(optimum.x, optimum.y, optimum.z);
  goto.disabled = false;

  const where = state.feasible
    ? t(optimum.interior ? 'opt.interior' : 'opt.boundary')
    : t('opt.domain');
  report.innerHTML =
    `${t('opt.max')} <b>${fmt(optimum.z, 4)}</b>\n` +
    `${t('opt.at')} (${fmt(optimum.x, 4)}, ${fmt(optimum.y, 4)})\n` +
    `${t('opt.on')} ${where}\n` +
    `${t('opt.gradthere')} ${fmt(optimum.gradMag, 4)}`;

  const pill = $('r-opt');
  pill.textContent = t('opt.pill', {
    v: fmt(optimum.z, 3), x: fmt(optimum.x, 2), y: fmt(optimum.y, 2),
  });
  pill.hidden = false;
}

/* ------------------------------------------------------------- controls */

const keys = Object.create(null);
let pointerLocked = false;
let rightDown = false;

// True while ⌘/⊞ or Alt/Option is down. Held, the movement keys stop being
// movement keys and become a look control — the keyboard equivalent of the
// mouse, for anyone on a tablet keyboard or without a trackpad they can aim
// with. The state is tracked rather than read per-event because looking is
// continuous: it has to keep happening for as long as the key is held.
let lookMod = false;

const isTypingTarget = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');

const LOOK_CODES = ['KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

window.addEventListener('keydown', (e) => {
  lookMod = SIZE_MOD(e);
  if (isTypingTarget(e.target)) {
    if (e.key === 'Enter') { e.target.blur(); applyInputs(); }
    return;
  }
  keys[e.code] = true;

  // Alt+letter is a dead key on a Mac and a menu accelerator on Windows, so
  // e.key is not the letter that was pressed. Shortcuts only fire unmodified.
  if (e.ctrlKey || e.metaKey || e.altKey) {
    if (LOOK_CODES.includes(e.code)) e.preventDefault();
    return;
  }

  const k = e.key.toLowerCase();
  switch (k) {
    case '1': setMode(MODE_FIRST); break;
    case '2': setMode(MODE_THIRD); break;
    case '3': setMode(MODE_DRONE); break;
    case 't': player.topDown(camera); setMode(MODE_DRONE); break;
    case 'r': player.resetToDomainCentre(); break;
    case 'c': toggleCheckbox('t-contours'); break;
    case 'm': toggleCheckbox('t-heightcol'); break;
    case 'n': toggleCheckbox('t-surfgrid'); break;
    case 'i': toggleCheckbox('t-compass'); break;
    case 'f': toggleCheckbox('t-feas'); break;
    case 'g': toggleCheckbox('t-isolate'); break;
    case 'h': toggleCheckbox('t-disc'); break;
    case 'x': toggleCheckbox('t-dx'); break;
    case 'y': toggleCheckbox('t-dy'); break;
    case 'v': toggleCheckbox('t-grad'); break;
    case 'b': toggleCheckbox('t-dir'); break;
    case 'p': toggleCheckbox('t-tangent'); break;
    case 'j': toggleCheckbox('t-curcurve'); break;
    case 'k': toggleCheckbox('t-curtan'); break;
    case 'o': toggleCheckbox('t-opt'); break;
    default: break;
  }
  if (e.code === 'Tab') { e.preventDefault(); togglePanel(); }
  if (LOOK_CODES.includes(e.code) || e.code === 'Space') e.preventDefault();
});

window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
  lookMod = SIZE_MOD(e);
});
window.addEventListener('blur', () => {
  for (const k in keys) keys[k] = false;
  lookMod = false;
});

function toggleCheckbox(id) {
  const el = $(id);
  el.checked = !el.checked;
  el.dispatchEvent(new Event('change'));
}

canvas.addEventListener('mousedown', (e) => {
  if (e.button === 2) rightDown = true;
  // On a surface with no explorer placed yet, a left click means "stand here",
  // not "give me the mouse". Taking the pointer as well would hide the cursor
  // the moment you tried to aim the next one.
  const placing = state.surfaceKind !== 'graph' && altView.mode === MODE_DRONE;
  if (!pointerLocked && !(placing && e.button === 0)) canvas.requestPointerLock();
});
window.addEventListener('mouseup', (e) => { if (e.button === 2) rightDown = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

/**
 * The wheel moves the camera; the wheel with a modifier held resizes the
 * explorer. These are two different questions and used to share one control.
 *
 * ⌘ on a Mac and ⊞ on Windows both arrive as `metaKey`, so the key the user
 * reaches for is the key that works. Alt/Option is accepted as well, because
 * Windows swallows some ⊞ combinations before the browser ever sees them, and
 * a control with no fallback on one of the two platforms is not a control.
 *
 * A trackpad pinch arrives as a wheel event with ctrlKey set and a much finer
 * delta, and the three deltaMode units (pixels, lines, pages) differ by about
 * an order of magnitude each, so normalise before using any of it.
 */
const SIZE_MOD = (e) => e.metaKey || e.altKey;

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
  const steps = (e.deltaY * unit) / 500;

  // Modifier held: the explorer grows or shrinks, and the camera stays put.
  if (SIZE_MOD(e)) { applyZoom(state.zoom * Math.pow(10, -steps)); return; }

  // Otherwise the camera comes closer or pulls back, and the explorer is
  // exactly the size they were. Wheel up (negative deltaY) moves in, which is
  // what every map in the world does.
  applyCamZoom(state.camZoom * Math.exp(-steps * (e.ctrlKey ? 1.6 : 0.6)));
}, { passive: false });

$('click-catch').addEventListener('click', () => canvas.requestPointerLock());

/**
 * Click the surface to stand on it.
 *
 * An implicit surface has no natural "centre of the domain" to start from, and
 * a parametric one's parameter origin is an arbitrary artefact of how it was
 * written. Picking the spot is both the simplest interface and the honest one:
 * the student chooses a point, and the program lands them on it.
 *
 * The raycast returns the parameter pair straight from the mesh for parametric
 * surfaces — the uv attribute carries the real (u, v) — and a world point for
 * implicit ones, which Newton then pulls exactly onto F = 0.
 */
const picker = new THREE.Raycaster();
const pickPt = new THREE.Vector2();
canvas.addEventListener('pointerdown', (e) => {
  if (state.surfaceKind === 'graph' || !walker || !altSurface || pointerLocked) return;
  if (e.button !== 0) return;
  const r = canvas.getBoundingClientRect();
  pickPt.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  picker.setFromCamera(pickPt, camera);
  const hit = picker.intersectObject(altSurface, false)[0];
  if (!hit) return;
  if (walker.placeAtUV && hit.uv) walker.placeAtUV(hit.uv.x, hit.uv.y);
  else if (walker.placeAtWorld) walker.placeAtWorld(hit.point);
  if (altView.mode === MODE_DRONE) setMode(MODE_THIRD);
  setMessage('');
});

document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
  const cc = $('click-catch');
  if (cc) cc.hidden = pointerLocked;
  const first = state.surfaceKind === 'graph'
    ? (player && player.mode === MODE_FIRST)
    : altView.mode === MODE_FIRST;
  $('crosshair').hidden = !(pointerLocked && first);
});

document.addEventListener('mousemove', (e) => {
  // Escape gives the mouse back; moving it after that means you have stopped
  // flying and started reading the instruments. Light the compass up.
  if (!pointerLocked) { compassState.emphasis = 2.2; return; }
  const dx = e.movementX || 0, dy = e.movementY || 0;

  if (state.surfaceKind !== 'graph') {
    if (altView.mode === MODE_DRONE || !walker) {
      // Flying around a torus, the mouse aims the camera exactly as it aims
      // the explorer's head — two angles, and between them every direction on
      // the unit sphere with the aircraft at its centre.
      altCam.yaw -= dx * 0.0022;
      altCam.pitch = Math.max(-ALT_PITCH_LIM, Math.min(ALT_PITCH_LIM, altCam.pitch - dy * 0.0022));
      return;
    }
    if (altView.mode === MODE_FIRST) {
      // Turning is a rotation of the heading *in the tangent plane*, which is
      // the only thing "turn left" can mean on a surface with no fixed up.
      walker.turn(-dx * 0.0022);
      altView.pitch = Math.max(-1.4, Math.min(1.4, altView.pitch - dy * 0.0022));
    } else {
      altView.camYaw -= dx * 0.004;
      altView.camHeight = clampCamHeight(altView.camHeight - dy * altView.camDist * 0.004);
    }
    return;
  }
  if (!player) return;

  // In directional-derivative mode the mouse steers the direction vector u.
  // Hold the right button to look around instead.
  if (state.showDir && !rightDown) {
    state.dirAngle -= dx * 0.006;
    while (state.dirAngle > Math.PI) state.dirAngle -= Math.PI * 2;
    while (state.dirAngle < -Math.PI) state.dirAngle += Math.PI * 2;
    player.look(0, dy);
  } else {
    player.look(dx, dy);
  }
});

/* --- touch: left half drives, right half looks --------------------------- */

const touch = { move: null, look: null, mx: 0, my: 0 };

canvas.addEventListener('touchstart', (e) => {
  for (const t of e.changedTouches) {
    if (t.clientX < window.innerWidth / 2 && touch.move === null) {
      touch.move = { id: t.identifier, x0: t.clientX, y0: t.clientY };
    } else if (touch.look === null) {
      touch.look = { id: t.identifier, x: t.clientX, y: t.clientY };
    }
  }
}, { passive: true });

canvas.addEventListener('touchmove', (e) => {
  for (const t of e.changedTouches) {
    if (touch.move && t.identifier === touch.move.id) {
      const R = 60;
      touch.mx = Math.max(-1, Math.min(1, (t.clientX - touch.move.x0) / R));
      touch.my = Math.max(-1, Math.min(1, (touch.move.y0 - t.clientY) / R));
    } else if (touch.look && t.identifier === touch.look.id) {
      const dx = t.clientX - touch.look.x, dy = t.clientY - touch.look.y;
      touch.look.x = t.clientX; touch.look.y = t.clientY;
      if (state.showDir) state.dirAngle -= dx * 0.012;
      else player.look(dx * 2.2, dy * 2.2);
    }
  }
  e.preventDefault();
}, { passive: false });

const endTouch = (e) => {
  for (const t of e.changedTouches) {
    if (touch.move && t.identifier === touch.move.id) { touch.move = null; touch.mx = 0; touch.my = 0; }
    if (touch.look && t.identifier === touch.look.id) touch.look = null;
  }
};
canvas.addEventListener('touchend', endTouch, { passive: true });
canvas.addEventListener('touchcancel', endTouch, { passive: true });

function readInput() {
  // Held modifier: the same keys are aiming, not walking. Returning zero here
  // rather than filtering downstream keeps every caller — the heightfield
  // explorer, the walker, the orbit camera — from having to know about it.
  if (lookMod) return { forward: 0, right: 0, up: 0, sprint: false };

  let forward = 0, right = 0, up = 0;
  if (keys.KeyW || keys.ArrowUp) forward += 1;
  if (keys.KeyS || keys.ArrowDown) forward -= 1;
  if (keys.KeyD || keys.ArrowRight) right += 1;
  if (keys.KeyA || keys.ArrowLeft) right -= 1;
  if (keys.Space) up += 1;
  if (keys.ControlLeft || keys.ControlRight || keys.KeyC) up -= 1;

  forward += touch.my;
  right += touch.mx;

  return {
    forward: Math.max(-1, Math.min(1, forward)),
    right: Math.max(-1, Math.min(1, right)),
    up: Math.max(-1, Math.min(1, up)),
    sprint: !!(keys.ShiftLeft || keys.ShiftRight),
  };
}

/**
 * Point the direction indicator wherever the live camera is pointing.
 *
 * World axes into the plot's own: math x is world x, math y is world −z, math z
 * is world y — the same convention the terrain and the walker use, so the cage's
 * labelled x, y and z are the axes on screen and not a second set of them.
 */
function updateCompass(dt) {
  if (!compass || !state.compass) return;
  compassState.emphasis = Math.max(0, compassState.emphasis - dt);
  compass.active = lookMod ? 1 : Math.min(1, compassState.emphasis / 0.4);

  camera.getWorldDirection(_camDir);
  compass.setDirection(_camDir.x, -_camDir.z, _camDir.y);
  compass.setDrone(state.surfaceKind === 'graph'
    ? !!(player && player.mode === MODE_DRONE)
    : (altView.mode === MODE_DRONE || !walker));

  const wrap = $('compass-wrap');
  if (wrap) wrap.classList.toggle('on', compass.active > 0.5);

  const { az, el } = angles(compass.dir[0], compass.dir[1], compass.dir[2]);
  $('cmp-az').textContent = `${az}°`;
  $('cmp-el').textContent = `${el >= 0 ? '+' : ''}${el}°`;
  compass.draw();
}

/**
 * Aiming from the keyboard, in radians per second.
 *
 * The same gesture the mouse makes, at a rate that is comfortable to hold: a
 * little under a quarter turn a second, so a full look around takes about four
 * seconds and a small correction is a tap.
 */
const LOOK_RATE = 1.5;

function applyLookKeys(dt) {
  if (!lookMod) return;
  let dx = 0, dy = 0;
  if (keys.KeyA || keys.ArrowLeft) dx -= 1;
  if (keys.KeyD || keys.ArrowRight) dx += 1;
  if (keys.KeyW || keys.ArrowUp) dy -= 1;
  if (keys.KeyS || keys.ArrowDown) dy += 1;
  if (!dx && !dy) return;

  const a = LOOK_RATE * dt;
  if (state.surfaceKind !== 'graph') {
    if (altView.mode === MODE_DRONE || !walker) {
      altCam.yaw -= dx * a;
      altCam.pitch = Math.max(-ALT_PITCH_LIM, Math.min(ALT_PITCH_LIM, altCam.pitch - dy * a));
    } else if (altView.mode === MODE_FIRST) {
      // On a surface, "turn" is a rotation of the heading inside the tangent
      // plane; pitch is clamped short of vertical so the view never rolls under
      // the ground it is standing on.
      walker.turn(-dx * a);
      altView.pitch = Math.max(-1.4, Math.min(1.4, altView.pitch - dy * a));
    } else {
      altView.camYaw -= dx * a;
      altView.camHeight = clampCamHeight(altView.camHeight - dy * (altView.camDist || 1) * a * 0.9);
    }
    return;
  }
  // player.look takes a sensitivity, so one unit of key press times the
  // per-frame angle is exactly the rotation wanted. Its own pitch clamp keeps
  // the camera the right way up.
  if (player) player.look(dx, dy, a);
}

/* ------------------------------------------------------------ UI wiring */

function setMode(mode) {
  if (state.surfaceKind !== 'graph') {
    altView.mode = mode;
    for (const b of document.querySelectorAll('.mode')) b.classList.toggle('active', b.dataset.mode === mode);
    $('r-mode').textContent = t(mode === MODE_FIRST ? 'view.first' : mode === MODE_THIRD ? 'view.third' : 'view.drone');
    $('crosshair').hidden = !(pointerLocked && mode === MODE_FIRST);
    $('fld-dronecam').hidden = true;
    if (altHiker) altHiker.visible = mode !== MODE_FIRST;
    return;
  }
  player.setMode(mode);
  for (const b of document.querySelectorAll('.mode')) b.classList.toggle('active', b.dataset.mode === mode);
  $('r-mode').textContent = t(mode === MODE_FIRST ? 'view.first' : mode === MODE_THIRD ? 'view.third' : 'view.drone');
  $('crosshair').hidden = !(pointerLocked && mode === MODE_FIRST);
  $('fld-dronecam').hidden = mode !== MODE_DRONE;
}

function togglePanel(force) {
  const p = $('panel');
  const hidden = force !== undefined ? force : !p.classList.contains('hidden');
  p.classList.toggle('hidden', hidden);
  $('panel-show').hidden = !hidden;
}

/** Show only the inputs that belong to the chosen kind of surface. */
function applySurfaceKindUI() {
  const graph = state.surfaceKind === 'graph';
  $('grp-graph').hidden = !graph;
  $('grp-implicit').hidden = state.surfaceKind !== 'implicit';
  $('grp-parametric').hidden = state.surfaceKind !== 'parametric';
  $('note-alt').hidden = graph;

  if (projection) applyProjectionStyle();

  // Grey out the sections that only mean something on a graph.
  for (const id of ['sec-feasible', 'sec-map', 'sec-deriv', 'sec-curve', 'sec-zoom', 'sec-opt']) {
    const el = $(id);
    if (el) { el.style.opacity = graph ? '' : '0.4'; el.style.pointerEvents = graph ? '' : 'none'; }
  }
  // Walking works on all three kinds of surface, so the view buttons stay live.
  $('fld-orient').hidden = graph;
  $('note-alt').hidden = graph;
}

/**
 * Turn the consumer dials into the function box and the constraint box.
 *
 * Written into the visible inputs rather than kept in a parallel world, so a
 * student can see the formula the dials produced, edit it, and understand that
 * "the consumer problem" is not a separate program but a particular f and a
 * particular feasible set.
 */
function applyConsumer() {
  const a = state.alpha;
  const b = (1 - a).toFixed(2);
  const src = {
    cobb: `x^${a.toFixed(2)}*y^${b}`,
    // r must avoid 0, where CES degenerates to Cobb-Douglas in the limit.
    ces: `(x^${a.toFixed(2)}+y^${a.toFixed(2)})^(1/${a.toFixed(2)})`,
    subs: `${a.toFixed(2)}*x+${b}*y`,
    quasi: `${a.toFixed(2)}*ln(x)+y`,
  }[state.utility] || `x^0.5*y^0.5`;

  const { px, py, income } = state;
  $('in-fn').value = src;
  $('in-feas').value = `x>=0 && y>=0 && ${px}*x+${py}*y<=${income}`;

  // Frame the domain on the budget set with a margin, so the frontier is
  // visible rather than jammed against the edge of the world.
  const xcap = income / Math.max(px, 1e-6);
  const ycap = income / Math.max(py, 1e-6);
  $('in-xmin').value = 0; $('in-xmax').value = (xcap * 1.3).toPrecision(3);
  $('in-ymin').value = 0; $('in-ymax').value = (ycap * 1.3).toPrecision(3);

  $('t-feas').checked = true;
  state.feasible = true;
  $('t-isolate').checked = true;
  state.isolate = true;
}

/**
 * Swap the words on screen between the mathematician's and the economist's.
 *
 * Only the labels move. The same code computes the same numbers either way,
 * which is the point worth making to a class: an indifference curve *is* a
 * level curve, and the marginal rate of substitution *is* the slope of one.
 */
function applyVocabulary() {
  const c = state.consumer;
  const set = (sel, key) => { const el = document.querySelector(sel); if (el) el.textContent = t(key); };

  set('[data-i18n="map.contours"]', c ? 'cons.contours' : 'map.contours');
  set('[data-i18n="curve.show"]', c ? 'cons.curveshow' : 'curve.show');
  set('[data-i18n="sec.curve"]', c ? 'cons.seccurve' : 'sec.curve');
  set('[data-i18n="sec.feasible"]', c ? 'cons.budget' : 'sec.feasible');

  const rms = document.querySelector('[data-i18n-title="hud.rmshelp"]');
  if (rms) {
    rms.textContent = c ? t('cons.mrs') : 'RMS';
    rms.title = t(c ? 'cons.mrshelp' : 'hud.rmshelp');
  }
  $('grp-consumer').hidden = !c;
  $('lbl-alpha-name').textContent = t(state.utility === 'ces' ? 'cons.rho' : 'cons.alpha');
}

function applyInputs() {
  state.fnSrc = $('in-fn').value;
  state.feasSrc = $('in-feas').value;
  state.xmin = parseFloat($('in-xmin').value);
  state.xmax = parseFloat($('in-xmax').value);
  state.ymin = parseFloat($('in-ymin').value);
  state.ymax = parseFloat($('in-ymax').value);
  state.res = parseInt($('in-res').value, 10);
  state.sx = parseFloat($('in-sx').value);
  state.sy = parseFloat($('in-sy').value);
  state.sz = parseFloat($('in-sz').value);
  withLoading(() => rebuild());
}

/* ------------------------------------------- walking off the edge of it */

/**
 * When the explorer reaches an edge of the domain, move the domain.
 *
 * The plot is a window onto a function that has no edges, and until now the
 * window was fixed: walk far enough east and you stopped at a wall, which says
 * something false about f. So each side, on being reached, slides its own axis
 * along by a fraction of its own width in the direction of travel:
 *
 *     east  (x = b)  →  [a, b] becomes [a + G(b−a), b + G(b−a)]
 *     west  (x = a)  →  [a, b] becomes [a − G(b−a), b − G(b−a)]
 *     north (y = d)  →  [c, d] becomes [c + H(d−c), d + H(d−c)]
 *     south (y = c)  →  [c, d] becomes [c − H(d−c), d − H(d−c)]
 *
 * The width is unchanged — this is a pan, not a zoom — so the scale of the plot,
 * and with it every reading taken against the 1.80 m explorer, survives the
 * move. Reaching a corner moves both axes at once, which is what walking
 * south-east into (b, c) does.
 *
 * The specification wrote the east case out in full and left the other three to
 * be read off it; taken literally the west and north formulas give b' < a',
 * an inverted interval, so they are implemented as the translations the prose
 * describes.
 */
const FOLLOW_COOLDOWN = 0.35;    // seconds; a rebuild is not free
let followTimer = 0;

function followEdges(dt) {
  followTimer = Math.max(0, followTimer - dt);
  if (!state.follow || followTimer > 0) return;
  if (state.surfaceKind !== 'graph' || !field || !player) return;
  // In the consumer problem the domain is not a window, it is the set of
  // bundles a consumer could buy. Panning it into negative quantities would be
  // panning into bundles that do not exist.
  if (state.consumer) return;

  const w = state.xmax - state.xmin, h = state.ymax - state.ymin;
  if (!(w > 0 && h > 0)) return;

  // A hair inside the edge, because the walker is clamped exactly onto it and
  // floating-point equality is not something to bet a rebuild on.
  const tx = w * 1e-6, ty = h * 1e-6;
  let dx = 0, dy = 0;
  if (player.x >= state.xmax - tx) dx = 1;
  else if (player.x <= state.xmin + tx) dx = -1;
  if (player.y >= state.ymax - ty) dy = 1;
  else if (player.y <= state.ymin + ty) dy = -1;
  if (!dx && !dy) return;

  followTimer = FOLLOW_COOLDOWN;
  shiftDomain(dx, dy);
}

/** Slide the window, keeping the explorer exactly where they are standing. */
function shiftDomain(dx, dy) {
  const w = state.xmax - state.xmin, h = state.ymax - state.ymin;
  const before = {
    xmin: state.xmin, xmax: state.xmax, ymin: state.ymin, ymax: state.ymax,
  };
  const sx = dx * state.followG * w, sy = dy * state.followH * h;
  state.xmin += sx; state.xmax += sx;
  state.ymin += sy; state.ymax += sy;

  // The explorer does not move — the window does. Their math coordinates are
  // therefore unchanged, and are restored over the reset that rebuild does.
  const keep = {
    x: player.x, y: player.y, yaw: player.yaw,
    pitch: player.pitch, facing: player.facing,
  };

  if (!rebuild()) {
    // f is undefined on the whole of the new window. Put it back and stop; the
    // wall is real this time.
    Object.assign(state, before);
    rebuild();
    Object.assign(player, keep);
    return false;
  }

  Object.assign(player, keep);
  // Everything in the world just moved by the shift, so the smoothed camera
  // must be told to snap rather than sail across the terrain to catch up.
  player._camReady = false;
  syncDomainInputs();
  return true;
}

/** Write the domain back into the panel, so it never lies about the window. */
function syncDomainInputs() {
  const round = (v) => (Math.abs(v) < 1e-9 ? 0 : parseFloat(v.toPrecision(6)));
  $('in-xmin').value = round(state.xmin);
  $('in-xmax').value = round(state.xmax);
  $('in-ymin').value = round(state.ymin);
  $('in-ymax').value = round(state.ymax);
}

/** Run a heavy rebuild with the spinner up, so the UI never looks frozen. */
function withLoading(work) {
  const el = $('loading');
  el.classList.remove('done');
  el.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    try { work(); } finally { el.classList.add('done'); }
  }));
}

function bindCheck(id, key, after) {
  const el = $(id);
  el.checked = !!state[key];
  el.addEventListener('change', () => {
    state[key] = el.checked;
    if (after) after();
  });
}

function wireUI() {
  $('btn-apply').addEventListener('click', applyInputs);
  $('panel-toggle').addEventListener('click', () => togglePanel(true));
  $('panel-show').addEventListener('click', () => togglePanel(false));

  $('preset-fn').addEventListener('change', (e) => {
    if (!e.target.value) return;
    $('in-fn').value = e.target.value;
    // Presets centred on the origin want a symmetric window.
    if (/x\^0\.|\(x\*y\)/.test(e.target.value)) {
      $('in-xmin').value = 0; $('in-xmax').value = 2; $('in-ymin').value = 0; $('in-ymax').value = 2;
    } else {
      $('in-xmin').value = -2; $('in-xmax').value = 2; $('in-ymin').value = -2; $('in-ymax').value = 2;
    }
    e.target.value = '';
    applyInputs();
  });

  bindCheck('t-consumer', 'consumer', () => {
    applyVocabulary();
    if (state.consumer) applyConsumer();
    applyInputs();
  });

  $('sel-utility').addEventListener('change', (e) => {
    state.utility = e.target.value;
    applyVocabulary();
    applyConsumer();
    applyInputs();
  });

  $('in-alpha').addEventListener('input', (e) => {
    state.alpha = parseFloat(e.target.value);
    $('lbl-alpha').textContent = state.alpha.toFixed(2);
  });
  $('in-alpha').addEventListener('change', () => { applyConsumer(); applyInputs(); });

  for (const [id, key] of [['in-px2', 'px'], ['in-py2', 'py'], ['in-income', 'income']]) {
    $(id).addEventListener('change', (e) => {
      const v = parseFloat(e.target.value);
      if (!(v > 0)) { e.target.value = state[key]; return; }
      state[key] = v;
      applyConsumer();
      applyInputs();
    });
  }

  $('preset-feas').addEventListener('change', (e) => {
    if (!e.target.value) return;
    $('in-feas').value = e.target.value;
    e.target.value = '';
    $('t-feas').checked = true;
    state.feasible = true;
    applyInputs();
  });

  for (const id of ['in-fn', 'in-feas']) {
    $(id).addEventListener('blur', applyInputs);
  }

  $('in-res').addEventListener('input', (e) => { $('lbl-res').textContent = e.target.value; });
  $('in-res').addEventListener('change', applyInputs);
  for (const ax of ['sx', 'sy', 'sz']) {
    $(`in-${ax}`).addEventListener('input', (e) => {
      $(`lbl-${ax}`).textContent = `${parseFloat(e.target.value).toFixed(2)}×`;
    });
    $(`in-${ax}`).addEventListener('change', applyInputs);
  }
  $('btn-isotropic').addEventListener('click', () => {
    for (const ax of ['sx', 'sy', 'sz']) {
      $(`in-${ax}`).value = '1';
      $(`lbl-${ax}`).textContent = '1.00×';
    }
    applyInputs();
  });

  bindCheck('t-feas', 'feasible', () => {
    if (walls) walls.visible = state.feasible;
    applyIsolation();
    refreshOptimum();
  });
  bindCheck('t-isolate', 'isolate', () => { applyIsolation(); });
  bindCheck('t-contours', 'contours', refreshContours);
  bindCheck('t-heightcol', 'heightColors', applyPalette);
  bindCheck('t-surfgrid', 'surfGrid', () => withLoading(refreshSurfaceGrid));
  bindCheck('t-geogrid', 'geoGrid', () => withLoading(refreshSurfaceGrid));

  bindCheck('t-follow', 'follow', () => { $('grp-follow').hidden = !state.follow; });
  const followStep = (id, key) => $(id).addEventListener('change', (e) => {
    const v = parseFloat(e.target.value);
    // Zero would never move the window and one would jump a whole width, so
    // the useful range is the open interval between them.
    state[key] = isFinite(v) ? Math.max(0.05, Math.min(0.95, v)) : 0.2;
    e.target.value = state[key];
  });
  followStep('in-followg', 'followG');
  followStep('in-followh', 'followH');

  if ($('t-compass')) {
    $('t-compass').addEventListener('change', (e) => {
      state.compass = e.target.checked;
      $('compass-wrap').hidden = !state.compass;
    });
  }
  bindCheck('t-curcurve', 'curCurve', () => { if (state.curCurve) goToExplorer(); });
  bindCheck('t-curtan', 'curTangent', () => { if (state.curTangent) goToExplorer(); });

  $('in-cstep').addEventListener('change', (e) => {
    const v = parseFloat(e.target.value);
    state.contourStep = isFinite(v) && v > 0 ? v : 0;   // blank or 0 means auto
    if (state.contours) withLoading(refreshContours);
  });

  $('in-cwidth').addEventListener('input', (e) => {
    state.pathWidth = parseFloat(e.target.value);
    $('lbl-cwidth').textContent = `${state.pathWidth.toFixed(1)} m`;
  });
  $('in-cwidth').addEventListener('change', () => {
    if (state.contours) withLoading(refreshContours);
  });
  bindCheck('t-decor', 'decor', () => decorations.setVisible(state.decor));
  bindCheck('t-water', 'water', () => { if (water) water.visible = state.water && !(state.feasible && state.isolate); });
  bindCheck('t-shadow', 'shadows', () => {
    configureShadows();
    withLoading(() => decorations.build(field, grid, predicate, { density: state.density, shadows: state.shadows }));
  });

  $('in-den').addEventListener('input', (e) => { $('lbl-den').textContent = `${parseFloat(e.target.value).toFixed(1)}×`; });
  $('in-den').addEventListener('change', (e) => {
    state.density = parseFloat(e.target.value);
    withLoading(() => {
      decorations.build(field, grid, predicate, { density: state.density, shadows: state.shadows });
      decorations.setVisible(state.decor);
      decorations.setIsolate(state.feasible && state.isolate);
    });
  });

  bindCheck('t-disc', 'disc', () => { if (state.disc) goToExplorer(); });
  bindCheck('t-dx', 'showDx', ensureDisc);
  bindCheck('t-dy', 'showDy', ensureDisc);
  bindCheck('t-grad', 'showGrad', ensureDisc);
  bindCheck('t-tangent', 'tangent', () => { if (state.tangent) goToExplorer(); });
  bindCheck('t-dir', 'showDir', () => {
    ensureDisc();
    player.frozen = state.showDir;
    $('note-dir').hidden = !state.showDir;
    if (state.showDir) state.dirAngle = player.facing || 0;
  });

  $('in-rad').addEventListener('input', (e) => {
    state.radius = parseFloat(e.target.value);
    $('lbl-rad').textContent = `${state.radius} m`;
  });

  $('in-zoom').addEventListener('input', (e) => {
    applyZoom(Math.pow(10, -parseFloat(e.target.value)));
  });

  // The two dials on the right edge. A tablet has no wheel and no modifier
  // key, so everything the wheel does has to be reachable by dragging as well.
  if ($('in-camzoom')) {
    $('in-camzoom').addEventListener('input', (e) => {
      applyCamZoom(Math.pow(10, parseFloat(e.target.value)));
    });
    $('btn-camzoom-reset').addEventListener('click', () => applyCamZoom(1));
  }
  if ($('in-charscale')) {
    $('in-charscale').addEventListener('input', (e) => {
      applyZoom(Math.pow(10, parseFloat(e.target.value)));
    });
    $('btn-charscale-reset').addEventListener('click', () => applyZoom(1));
  }

  bindCheck('t-opt', 'showOpt', () => withLoading(refreshOptimum));

  $('btn-goto').addEventListener('click', () => {
    if (!optimum) return;
    player.x = optimum.x;
    player.y = optimum.y;
    player._camReady = false;
  });

  $('sel-surface').addEventListener('change', (e) => {
    state.surfaceKind = e.target.value;
    applySurfaceKindUI();
    withLoading(() => rebuild());
  });

  for (const [id, key] of [['in-implicit', 'implicitSrc'], ['in-px', 'pxSrc'],
    ['in-py', 'pySrc'], ['in-pz', 'pzSrc']]) {
    $(id).addEventListener('change', (e) => { state[key] = e.target.value; applyInputs(); });
  }
  for (const [id, key] of [['in-zmin', 'zmin'], ['in-zmax', 'zmax'], ['in-umin', 'umin'],
    ['in-umax', 'umax'], ['in-vmin', 'vmin'], ['in-vmax', 'vmax']]) {
    $(id).addEventListener('change', (e) => {
      const v = parseFloat(e.target.value);
      if (isFinite(v)) { state[key] = v; applyInputs(); }
    });
  }

  $('preset-implicit').addEventListener('change', (e) => {
    if (!e.target.value) return;
    $('in-implicit').value = e.target.value;
    state.implicitSrc = e.target.value;
    e.target.value = '';
    applyInputs();
  });

  $('preset-param').addEventListener('change', (e) => {
    if (!e.target.value) return;
    // X | Y | Z | umin | umax | vmin | vmax
    const parts = e.target.value.split('|');
    const ids = ['in-px', 'in-py', 'in-pz', 'in-umin', 'in-umax', 'in-vmin', 'in-vmax'];
    const keys = ['pxSrc', 'pySrc', 'pzSrc', 'umin', 'umax', 'vmin', 'vmax'];
    parts.forEach((v, i) => {
      $(ids[i]).value = v;
      state[keys[i]] = i < 3 ? v : parseFloat(v);
    });
    e.target.value = '';
    applyInputs();
  });

  $('sel-style').addEventListener('change', (e) => {
    state.charStyle = e.target.value;
    if (player) player.setStyle(state.charStyle);
    if (state.surfaceKind !== 'graph') ensureAltHiker();
  });

  $('sel-shape').addEventListener('change', (e) => {
    state.shape = e.target.value;
    applyShape();
    if (state.shape) applyInputs();
  });

  for (const [id, key, lbl] of [['in-pa', 'pa', 'lbl-pa'], ['in-pb', 'pb', 'lbl-pb']]) {
    $(id).addEventListener('input', (ev) => {
      state[key] = parseFloat(ev.target.value);
      $(lbl).textContent = state[key].toFixed(2);
    });
    $(id).addEventListener('change', () => { applyShape(); applyInputs(); });
  }

  bindCheck('t-inside', 'inside', () => {
    if (walker) walker.flip();
  });

  $('sel-up').addEventListener('change', (e) => { state.upAxis = e.target.value; });
  $('sel-dronecam').addEventListener('change', (e) => player.setDroneView(e.target.value));

  $('btn-top').addEventListener('click', () => { player.topDown(camera); setMode(MODE_DRONE); });
  $('btn-reset').addEventListener('click', () => player.resetToDomainCentre());

  for (const b of document.querySelectorAll('.mode')) {
    b.addEventListener('click', () => setMode(b.dataset.mode));
  }

  if (projection) {
    $('sel-proj').addEventListener('change', (e) => {
      projState.mode = e.target.value;
      applyProjectionStyle();
    });
    $('in-projop').addEventListener('input', (e) => {
      projState.opacity = parseFloat(e.target.value);
      $('lbl-projop').textContent = projState.opacity.toFixed(2);
      applyProjectionStyle();
    });
    $('in-projsize').addEventListener('input', (e) => {
      projState.size = parseFloat(e.target.value);
      $('lbl-projsize').textContent = `${projState.size.toFixed(2)}×`;
      applyProjectionStyle();
    });
    $('btn-full').addEventListener('click', toggleFullscreen);
  }

  updateZoomLabels();
}

/** Full screen, with the browser's own chrome out of the way. */
function toggleFullscreen() {
  const el = document.documentElement;
  if (document.fullscreenElement) {
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  } else if (el.requestFullscreen || el.webkitRequestFullscreen) {
    (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
  }
}

function wireLanguage() {
  const btn = $('lang-toggle');
  const flag = $('lang-flag');

  // A button rather than a menu: there are two languages, so a menu is one
  // click of ceremony around a thing that has only one possible answer. The
  // label shows the language you would switch *to*, which is the convention
  // every bilingual site converges on.
  const paint = () => {
    const here = getLanguage();
    const next = LANGUAGES.find((l) => l.code !== here) || LANGUAGES[0];
    flag.textContent = next.code.toUpperCase();
    btn.title = next.label;
    btn.setAttribute('aria-label', next.label);
  };

  setLanguage(detectLanguage());
  paint();
  btn.addEventListener('click', () => {
    const here = getLanguage();
    const next = LANGUAGES.find((l) => l.code !== here) || LANGUAGES[0];
    setLanguage(next.code);
  });

  // applyStatic() only reaches the markup. Anything the program composes for
  // itself — the mode pill, the optimum report, a visible parse error — has to
  // be rebuilt by hand, without recomputing the terrain or the optimiser.
  onLanguageChange(() => {
    paint();
    if (player) setMode(player.mode);
    applyVocabulary();
    updateZoomLabels();
    updateContourNote();
    renderOptimum();
    if (surface) reportStats();
    for (const id of ['err-fn', 'err-feas']) {
      if (lastError[id]) showError(id, lastError[id]);
    }
  });
}

/**
 * Turning on an arrow implies you want the neighbourhood shown — and that you
 * want to be somewhere you can see it.
 *
 * The gizmo is a few metres across, sized against a 1.80 m explorer, and the
 * opening shot is a drone several hundred metres up framing the whole surface.
 * Ticking "Gradient ∇f" from up there paints two pixels, which reads exactly
 * like a broken feature. Anything drawn at the explorer's feet therefore brings
 * the camera down to the explorer's shoulder, which is the view the whole
 * section is written for.
 */
function goToExplorer() {
  if (player && player.mode === MODE_DRONE && state.surfaceKind === 'graph') {
    setMode(MODE_THIRD);
  }
}

function ensureDisc() {
  if (state.showDx || state.showDy || state.showGrad || state.showDir) {
    if (!state.disc) { state.disc = true; $('t-disc').checked = true; }
  }
  goToExplorer();
}

const ZOOM_MIN = 1e-4;   // explorer 0.18 mm tall
const ZOOM_MAX = 100;    // explorer 180 m tall — a whole hillside at a stride

// Both size dials are log10 of the explorer's own height, which is what makes
// the six decades between a fifth of a millimetre and a hundred and eighty
// metres fit on one slider at all: a linear dial would spend nine tenths of its
// travel in the top decade and leave the interesting end unreachable.

// How far in and out the camera itself can be driven. Twenty times closer is
// enough to read the arrowheads; a twentieth is enough to lose the whole
// surface in the middle of the screen, which is as far out as is any use.
//
// The bounds are exactly ±1.3 decades because the dial's step is 0.01: a range
// input snaps to min + k·step, so a limit of ±1.301 would put 1× — the one
// value the control has to be able to return to — a hundredth of a decade off
// the grid, and the neutral position would be unreachable.
const CAM_DECADES = 1.3;
const CAM_MIN = Math.pow(10, -CAM_DECADES);
const CAM_MAX = Math.pow(10, CAM_DECADES);

function updateZoomLabels() {
  const z = state.zoom;
  const decades = -Math.log10(z);
  // Below 1:1 the explorer shrinks and the ratio reads 1 : n; above it they
  // grow and it reads n : 1, the way a map scale does in either direction.
  const ratio = Math.abs(decades) < 0.005
    ? '1 : 1'
    : decades > 0
      ? `1 : ${Math.round(1 / z).toLocaleString()}`
      : `${z >= 10 ? Math.round(z) : z.toPrecision(2)} : 1`;
  $('lbl-zoom').textContent = ratio;
  if ($('lbl-charscale')) $('lbl-charscale').textContent = ratio;
  // A height in metres, written the way a person would write it. toPrecision
  // alone turns 180 into "1.8e+2", which is not a sentence about a hiker.
  const m = 1.8 * z;
  const h = m >= 100 ? Math.round(m).toLocaleString()
    : m >= 1 ? m.toPrecision(2)
      : m >= 0.01 ? m.toFixed(3) : m.toPrecision(2);
  $('r-zoom').textContent = Math.abs(decades) < 0.005
    ? t('hud.scale11')
    : t('hud.tall', { h });
  updateRuler();
}

/** The one place the explorer's scale is set, whatever asked for it. */
function applyZoom(z) {
  const before = state.zoom;
  state.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
  if (player && state.surfaceKind === 'graph') player.setZoom(state.zoom);
  // The grid squares are one explorer tall, so they are no longer the right
  // size once the explorer is not.
  if (state.zoom !== before) scheduleGridRebuild();
  $('in-zoom').value = String(-Math.log10(state.zoom));
  // The panel dial and the dial on the right edge are two handles on one
  // number, so whichever was moved, both have to end up showing it. They run
  // in opposite directions on purpose: the panel dial is a zoom-in ruler and
  // counts decades of magnification downwards, while a vertical dial has to
  // obey the only thing a vertical dial can mean — up is more of the thing it
  // is labelled with, and it is labelled with the explorer's size.
  const side = $('in-charscale');
  if (side) side.value = String(Math.log10(state.zoom));
  updateZoomLabels();
}

/**
 * The one place the camera's magnification is set.
 *
 * Nothing about the mathematics or the explorer changes here: this only moves
 * the camera nearer, or — where there is nowhere nearer to be, because the
 * camera is somebody's eyes — puts a longer lens on it.
 */
function applyCamZoom(v) {
  state.camZoom = Math.max(CAM_MIN, Math.min(CAM_MAX, v));
  if (player) player.camZoom = state.camZoom;
  const dial = $('in-camzoom');
  if (dial) dial.value = String(Math.log10(state.camZoom));
  const lbl = $('lbl-camzoom');
  if (lbl) {
    const z = state.camZoom;
    lbl.textContent = z >= 1 ? `${z < 10 ? z.toFixed(1) : Math.round(z)}×` : `1/${(1 / z).toFixed(1)}`;
  }
}

/** The field of view to compose with, for the views main.js drives itself. */
function fovFor(throughTheEyes) {
  return throughTheEyes
    ? Math.max(FOV_MIN, Math.min(FOV_MAX, BASE_FOV / state.camZoom))
    : BASE_FOV;
}

function updateRuler() {
  const el = $('ruler');
  el.innerHTML = '';
  const decades = -Math.log10(state.zoom);
  for (let i = -2; i <= 4; i++) {
    const s = document.createElement('span');
    s.textContent = i === 0 ? '1.8 m' : i < 0 ? `×${Math.pow(10, -i)}` : `10^-${i}`;
    // The dial is continuous, so highlight the decade it is nearest to.
    if (Math.abs(decades - i) < 0.5) s.className = 'on';
    el.appendChild(s);
  }
}

/* --------------------------------------------------------------- readout */

const chipEls = {
  dx: $('c-dx'), dy: $('c-dy'), grad: $('c-grad'), dir: $('c-dir'),
};

function setChip(el, on, label, value, avg) {
  el.hidden = !on;
  if (on) el.innerHTML = `${label} <b>${value}</b> <i>${t('hud.avg')} ${avg}</i>`;
}

/**
 * |∂f/∂x ÷ ∂f/∂y| — the absolute slope of the level curve through the point.
 *
 * Implicit differentiation of f(x, y) = c gives dy/dx = −f_x / f_y, so this is
 * how many units of y one unit of x buys you along the curve: the marginal rate
 * of substitution. It is reported unsigned, as the rate itself, and it blows up
 * exactly where the level curve turns vertical (f_y = 0).
 */
function updateRMS(readout) {
  const el = $('r-rms');
  let fx = readout && readout.fx, fy = readout && readout.fy;
  if (fx === undefined || fx === null || !isFinite(fx) || !isFinite(fy)) {
    const g = field.gradient(player.x, player.y);
    fx = g[0]; fy = g[1];
  }
  if (!isFinite(fx) || !isFinite(fy)) { el.textContent = t('hud.undefined'); return; }
  if (Math.abs(fy) < Math.abs(fx) * 1e-9) { el.textContent = '∞'; return; }
  el.textContent = fmt(Math.abs(fx / fy), 3);
}

function updateHUD(readout) {
  if (state.surfaceKind !== 'graph') {
    // No f, so no height and no MRS — but there is still a point on a surface,
    // and where it is is exactly what a student loses track of on a torus.
    if (walker && walker.p) {
      $('r-x').textContent = fmt(walker.p.x, 3);
      $('r-y').textContent = fmt(walker.p.y, 3);
      $('r-z').textContent = fmt(walker.p.z, 3);
    } else if (walker) {
      $('r-x').textContent = `u ${fmt(walker.u, 3)}`;
      $('r-y').textContent = `v ${fmt(walker.v, 3)}`;
      $('r-z').textContent = walker.sign > 0 ? '+n' : '−n';
    } else {
      $('r-x').textContent = '—'; $('r-y').textContent = '—'; $('r-z').textContent = '—';
    }
    $('r-rms').textContent = '—';
    for (const k in chipEls) chipEls[k].hidden = true;
    return;
  }
  const z = player.height();
  $('r-x').textContent = fmt(player.x, 3);
  $('r-y').textContent = fmt(player.y, 3);
  $('r-z').textContent = isFinite(z) ? fmt(z, 3) : t('hud.undefined');
  updateRMS(readout);

  if (!readout) {
    for (const k in chipEls) chipEls[k].hidden = true;
    return;
  }

  setChip(chipEls.dx, state.showDx, '∂f/∂x', fmt(readout.fx, 3), fmt(readout.avgX, 3));
  setChip(chipEls.dy, state.showDy, '∂f/∂y', fmt(readout.fy, 3), fmt(readout.avgY, 3));
  setChip(chipEls.grad, state.showGrad, '‖∇f‖', fmt(readout.gradMag, 3), fmt(readout.avgG, 3));

  if (state.showDir) {
    const deg = ((readout.dirAngle ?? state.dirAngle) * 180 / Math.PI).toFixed(0);
    chipEls.dir.hidden = false;
    chipEls.dir.innerHTML = `D<sub>u</sub>f <b>${fmt(readout.dirSlope, 3)}</b> ` +
      `<i>${t('hud.avg')} ${fmt(readout.avgDir, 3)} · ${t('hud.uat', { deg })}</i>`;
  } else {
    chipEls.dir.hidden = true;
  }
}

/* ------------------------------------------------------- the flat map */

const projRGB = [0, 0, 0];

/** Point the panel at the current field, and rebuild its baked layer. */
function refreshProjection() {
  if (!projection || !field || !grid) return;
  const { levels } = chooseLevels(grid.zmin, grid.zmax, {
    step: state.contourStep, target: 40,
  });
  projection.setField(field, grid, levels);
  applyProjectionStyle();
}

function applyProjectionStyle() {
  if (!projection) return;
  const wrap = $('proj-wrap');
  projection.mode = projState.mode;
  projection.dirty = true;
  wrap.style.setProperty('--proj-opacity', projState.opacity);
  wrap.style.setProperty('--proj-scale', projState.size);
  // 'down' is a real render of the scene from above, not a 2D drawing, so the
  // canvas is left empty and the WebGL pass fills the same rectangle.
  wrap.hidden = projState.mode === 'off' || state.surfaceKind !== 'graph';
  wrap.classList.toggle('down', projState.mode === 'down');
}

function drawProjection() {
  if (!projection || $('proj-wrap').hidden) return;
  const wrap = $('proj-wrap');
  const r = wrap.getBoundingClientRect();
  projection.resize(r.width, r.height);

  if (projState.mode === 'down') {
    // The 2D canvas sits on top of the WebGL one, so it has to be wiped or the
    // last heat map keeps showing through where the render should be.
    projection.ctx.clearRect(0, 0, projection.canvas.width, projection.canvas.height);
    renderTopDown(r);
    return;
  }
  if (!field || !grid || !player) return;

  const z = player.height();
  let curve = null;
  if (state.curCurve && isFinite(z)) {
    curve = traceLevelCurve(field, player.x, player.y);
    heightColor(grid.norm(z), projRGB);
  }

  let tangent = null;
  if (state.curTangent && isFinite(z)) {
    const [gx, gy] = field.gradient(player.x, player.y);
    const gm = Math.hypot(gx, gy);
    if (gm > 1e-12) tangent = { x: player.x, y: player.y, ux: -gy / gm, uy: gx / gm };
  }

  projection.draw({
    contours: state.contours,
    curve, curveRGB: projRGB, tangent,
    player: { x: player.x, y: player.y },
    feasible: predicate, showFeasible: state.feasible || state.isolate,
  });
}

/**
 * The other panel mode: the scene itself, seen from directly overhead.
 *
 * Rendered with the scissor test into the same rectangle the 2D panel occupies,
 * which costs one extra pass and no render target. It is the honest version of
 * "project the surface onto z = 0" — trees, water and all — where the drawn map
 * is the idealised one.
 */
function renderTopDown(rect) {
  if (!field) return;
  if (!topCam) topCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1e5);

  const half = field.worldSize * 0.52;
  const aspect = rect.width / Math.max(1, rect.height);
  const hx = aspect >= 1 ? half * aspect : half;
  const hy = aspect >= 1 ? half : half / aspect;
  topCam.left = -hx; topCam.right = hx; topCam.top = hy; topCam.bottom = -hy;
  topCam.position.set(field.worldX(field.cx), field.worldSize * 4, field.worldZ(field.cy));
  topCam.up.set(0, 0, -1);
  topCam.lookAt(field.worldX(field.cx), 0, field.worldZ(field.cy));
  topCam.near = 0.1;
  topCam.far = field.worldSize * 12;
  topCam.updateProjectionMatrix();

  // Device pixels, and the y axis measured from the bottom of the canvas.
  const dpr = renderer.getPixelRatio();
  const x = Math.round(rect.left * dpr);
  const y = Math.round((window.innerHeight - rect.bottom) * dpr);
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);

  // Fog is calibrated for a camera standing on the terrain, and this one is
  // four world-widths above it: leaving it on washes the map to nearly the
  // colour of the sky. The sky sphere follows the main camera, so it has to be
  // brought along too or the pass looks through the back of it.
  const fog = scene.fog;
  const skyAt = sky ? sky.position.clone() : null;
  scene.fog = null;
  if (sky) sky.position.copy(topCam.position);

  renderer.setScissorTest(true);
  renderer.setViewport(x, y, w, h);
  renderer.setScissor(x, y, w, h);
  renderer.render(scene, topCam);
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, renderer.domElement.width, renderer.domElement.height);

  scene.fog = fog;
  if (sky && skyAt) sky.position.copy(skyAt);
}

/* ------------------------------------------------------------- the loop */

// Orbit state used only when an implicit or parametric surface is on screen:
// there is nothing to stand on, so the drone simply circles it.
//
// The pitch limit is a whisker short of vertical rather than the old 1.5 rad,
// so the orbit really does cover the sphere — a torus can be looked at squarely
// down its hole, which is the one view that shows what a torus is.
const altCam = { yaw: 0, pitch: -0.5, dist: 400 };
const ALT_PITCH_LIM = Math.PI / 2 - 1e-4;

let altWalkPhase = 0;

/** The same walk cycle the heightfield explorer uses, driven by distance. */
function animateAltHiker(dt, moving) {
  if (!altHiker) return;
  const p = altHiker.userData.parts;
  if (!p) return;
  const swing = moving ? 0.75 * Math.sin(altWalkPhase) : 0;
  if (!p.stiffLegs) { p.legL.rotation.x = swing; p.legR.rotation.x = -swing; }
  p.armL.rotation.x = -swing * 0.8;
  p.armR.rotation.x = swing * 0.8;
  p.hips.position.y = p.hipsY + (moving ? Math.abs(Math.sin(altWalkPhase)) * 0.045 : 0);
}

const clock = new THREE.Clock();
const curveRGB = [0, 0, 0];

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (state.surfaceKind !== 'graph') {
    const inp = readInput();
    applyLookKeys(dt);

    if (altView.mode === MODE_DRONE || !walker) {
      if (altHiker) altHiker.visible = !!walker;
      if (walker) placeAltHiker();
      altCam.yaw -= inp.right * dt * 1.2;
      altCam.pitch = Math.max(-ALT_PITCH_LIM, Math.min(ALT_PITCH_LIM, altCam.pitch + inp.up * dt * 1.2));
      altCam.dist *= Math.exp(-inp.forward * dt * (inp.sprint ? 2.2 : 0.9));
      const r = altCam.dist / state.camZoom;
      const cp = Math.cos(altCam.pitch);
      camera.position.set(Math.sin(altCam.yaw) * cp * r, -Math.sin(altCam.pitch) * r, Math.cos(altCam.yaw) * cp * r);
      // The orientation is the same two angles the position was built from,
      // which is exactly the attitude lookAt(0,0,0) would produce — but defined
      // at the poles, where lookAt's up vector becomes parallel to the view and
      // the frame collapses. Looking straight down the axis of a torus is a
      // view worth having, so it has to be a view that works.
      camera.up.set(0, 1, 0);
      camera.quaternion.setFromEuler(new THREE.Euler(altCam.pitch, altCam.yaw, 0, 'YXZ'));
      camera.fov = fovFor(false);
      camera.near = Math.max(0.05, r * 1e-4);
      camera.far = r * 20;
    } else {
      // Walking. Speed is in world metres, so a step feels the same whatever
      // the surface's own parameterisation happens to be doing.
      const speed = 4.2 * state.zoom * altView.charScale * (inp.sprint ? 2.6 : 1);
      const dist = speed * dt;
      if (Math.abs(inp.forward) > 1e-4 || Math.abs(inp.right) > 1e-4) {
        walker.move(dist, inp.forward, inp.right);
        altWalkPhase += (dist / (0.85 * state.zoom * altView.charScale)) * Math.PI;
      }
      const stance = placeAltHiker();
      animateAltHiker(dt, Math.abs(inp.forward) + Math.abs(inp.right) > 1e-4);

      const eye = 1.66 * state.zoom * altView.charScale;
      if (altView.mode === MODE_FIRST) {
        // Up is the surface normal, so the horizon tilts with the ground —
        // which on a sphere is exactly right and on a Möbius strip is the
        // whole point.
        // The same rigid basis the body is built on, aimed along the heading
        // rather than along the direction of travel — the eyes and the feet do
        // not have to agree.
        const q = new THREE.Quaternion().setFromRotationMatrix(
          standBasis(stance.up, stance.fwd, _cbasis),
        );
        q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), altView.pitch));
        camera.position.copy(stance.p).addScaledVector(stance.up, eye);
        camera.quaternion.copy(q);
      } else {
        // Third person from a camera that never rolls: its up is the world's,
        // so an explorer going round the underside of a torus is seen to go
        // upside down instead of the picture quietly turning with them. That
        // was the point of calling it static.
        //
        // It follows at a fixed offset from the explorer rather than orbiting
        // the origin, though, because orbiting the origin means zooming in
        // walks the camera towards the centre of the surface — and the centre
        // of a torus is inside the torus. You ended up looking at the far wall
        // in the dark with the explorer nowhere in frame.
        const d = (altView.camDist || (altCam.dist * 0.35)) / state.camZoom;
        const h = (altView.camHeight || 0) / state.camZoom;
        camera.position.set(
          stance.p.x + Math.sin(altView.camYaw) * d,
          stance.p.y + h,
          stance.p.z + Math.cos(altView.camYaw) * d,
        );
        camera.up.set(0, 1, 0);
        camera.lookAt(stance.p);
      }
      camera.fov = fovFor(altView.mode === MODE_FIRST);
      camera.near = Math.max(1e-4, 0.02 * state.zoom * altView.charScale);
      camera.far = altCam.dist * 20 + state.worldSize * 8;
    }

    camera.updateProjectionMatrix();
    if (sky) sky.position.copy(camera.position);
    updateCompass(dt);
    updateHUD(null);
    renderer.render(scene, camera);
    if (projection) projection.draw({});
    return;
  }

  // Teardown nulls these, and a frame can land between teardown and rebuild.
  if (!field || !player || !surfaceDetail || !gizmo) {
    renderer.render(scene, camera);
    return;
  }

  // The explorer stands on whatever is being drawn on the ground, so the disc
  // and the arrows are never buried under their own feet.
  player.extraLift = state.disc && gizmo.lift ? gizmo.lift : surfaceDetail.topLift;

  applyLookKeys(dt);
  player.update(dt, readInput());
  followEdges(dt);
  player.updateCamera(camera, dt);

  if (sky) sky.position.copy(camera.position);

  // High-resolution rings under the explorer.
  surfaceDetail.update(player.x, player.y, detailExtent(), grid, paletteMode(), false);

  // Derivative gizmo.
  const wantGizmo = state.disc && isFinite(player.height());
  gizmo.setVisible(wantGizmo);
  let readout = null;
  if (wantGizmo) {
    readout = gizmo.update(player.x, player.y, {
      radiusMetres: state.radius * player.zoom,
      clearance: surfaceDetail.topLift,
      showX: state.showDx,
      showY: state.showDy,
      showGrad: state.showGrad,
      showDir: state.showDir,
      dirAngle: state.dirAngle,
    });
  }

  if (state.tangent && isFinite(player.height())) {
    tangentPlane.update(player.x, player.y, state.radius * player.zoom,
      Math.max(player.extraLift, surfaceDetail.topLift * 2.6));
  } else {
    tangentPlane.setVisible(false);
  }

  // The contour through the player's feet, and its tangent. Both are traced
  // afresh from the player's exact height, so they follow continuously.
  const onGround = isFinite(player.height());
  if (state.curCurve && onGround) {
    heightColor(grid.norm(player.height()), curveRGB);
    curveGizmo.update(player.x, player.y, state.pathWidth * 1.35, curveRGB);
  } else {
    curveGizmo.setVisible(false);
  }

  if (state.curTangent && onGround) {
    tangentLine.update(player.x, player.y, field.worldSize * 0.22, state.pathWidth * 0.9);
  } else {
    tangentLine.setVisible(false);
  }

  if (state.showOpt && optimum) optMarker.animate(t, camera.position);

  updateCompass(dt);
  updateHUD(readout);
  renderer.render(scene, camera);
  drawProjection();
}

/* ---------------------------------------------------------------- start */

function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', onResize);

wireLanguage();
wireUI();
applyVocabulary();
applyShape();
applySurfaceKindUI();
onResize();

withLoading(() => {
  if (rebuild()) {
    // Open on the whole surface, then let them walk down onto it.
    player.establishingShot(camera);
    setMode(MODE_DRONE);
  }
});
animate();

// Offline caching, where the browser allows it. Opened straight off the disk as
// a file:// page there is no origin to register against and this simply does not
// apply, so failure here is never worth reporting.
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    try {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    } catch (err) { /* no origin, nothing to cache */ }
  });
}
