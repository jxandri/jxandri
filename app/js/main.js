/**
 * main.js — scene assembly, controls and the UI wiring.
 */

import * as THREE from '../vendor/three.module.js';
import { compile, compilePredicate, MathExprError } from './mathexpr.js';
import { Field, FieldGrid } from './field.js';
import {
  buildSurface, buildWater, buildFeasibleWalls, recolorSurface, SurfaceDetail,
  GROUP_OUTSIDE, heightColor, setBiomeProfile,
} from './terrain.js';
import { ELIAS_INFO } from './elias.js';
import { BORDERS } from './borders-data.js';
import { feasibleFor, boundaryOf } from './borders.js';
import { photoFor } from './borders-photos.js';
import { Decorations } from './decor.js';
import {
  buildContours, chooseLevels, DerivativeGizmo, TangentPlane,
  maximize, OptimumMarker, LevelCurveGizmo, TangentLineGizmo, traceLevelCurve,
} from './analysis.js';
import {
  Player, buildCharacter, MODE_FIRST, MODE_THIRD, MODE_DRONE,
  BASE_FOV, FOV_MIN, FOV_MAX,
} from './player.js';
import { ParametricWalker, ImplicitWalker, standBasis, graphWalker } from './walker.js';
import { IntrinsicGizmo, GeodesicDisc } from './intrinsic.js';
import {
  buildImplicit, buildParametric, paintMesh, paintMobius,
  MOBIUS_WHITE, MOBIUS_BLUE,
} from './surfaces.js';
import { mapUV, setMapMaterial } from './worldmap.js';
import {
  buildGraphGrid, buildParametricGrid, buildImplicitGrid, buildGeodesicGrid,
  disposeGrid,
} from './gridlines.js';
import { Compass, angles } from './compass.js';
import { Pad, BTN } from './gamepad.js';
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
  // How wide a level curve is painted, in explorer heights. Two, so a contour
  // is exactly as wide as the side of a grid square and both read against the
  // same ruler — and so it stays walkable when the explorer changes size.
  pathHeights: 2,
  heightColors: false,
  worldMap: false,     // the Earth's map, laid on whatever surface is shown
  surfGrid: false,     // the coordinate grid, drawn on the surface itself
  geoGrid: false,      // ...built from geodesics rather than from coordinates
  compass: true,       // the direction indicator, top right
  holdKey: 'either',   // which key holds the look control: alt, meta, or both
  curCurve: false,
  curTangent: false,
  decor: true,
  rail: false,          // rope the explorer to the constraint curve
  curvesInside: false,  // draw level curves only inside the feasible set
  smoothCurves: true,   // trace them finer than the render mesh
  decorScale: 1,       // how big the trees, rocks and grass are drawn
  decorMatchPlayer: true, // ...and whether that also tracks the explorer's own scale dial
  water: true,

  // The window follows the explorer: reaching an edge slides that axis along by
  // this fraction of its own width, in the direction of travel.
  follow: true,
  followG: 0.2,
  followH: 0.2,

  density: 1,
  shadows: false,

  disc: false,
  geoDisc: false,      // measure the neighbourhood with geodesics, not with rays
  radius: 3,
  showDx: false,
  showDy: false,
  showGrad: false,
  showDir: false,
  dirAngle: 0,
  tangent: false,

  walkSpeed: 1,        // a multiple of the ordinary pace
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
let intrinsic = null;    // the geodesic circle, the arrows and the tangent plane
let graphGeo = null;     // a walker over z = f(x,y), for its geodesics
let graphDisc = null;    // ...and the geodesic circle drawn from it
let altSurface = null;   // the implicit or parametric mesh, when one is shown
let mobiusFlag = null;   // the two-faced golf flag at the Möbius strip's start
let stillMemo = null;    // last frame's at-the-feet geometry, kept while the
                         // explorer and the dials hold still
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
  camPitch: 0.32,       // third person: how high behind the explorer it rides
  camDist: 0,
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
  if (graphDisc) { disposeTree(graphDisc.group); graphDisc.dispose(); }
  if (optMarker) { disposeTree(optMarker.group); optMarker.dispose(); }
  if (curveGizmo) { disposeTree(curveGizmo.mesh); curveGizmo.dispose(); }
  if (tangentLine) { disposeTree(tangentLine.mesh); tangentLine.dispose(); }
  decorations.clear();
  surface = water = walls = contourLines = null;
  surfaceDetail = gizmo = tangentPlane = optMarker = curveGizmo = tangentLine = null;
  graphGeo = graphDisc = null;
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
  let noteText = spec.immersed ? `${note} ${t('shape.immersion')}` : note;
  if (state.shape === 'mobius') noteText += ` ${t('shape.mobiusflag')}`;
  $('note-orientable').textContent = noteText;
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
  chooseOutwardSide();

  // Sky and fog still want a sensible scale even without a Field.
  disposeTree(sky);
  sky = buildSky(ws * 8);
  scene.add(sky);
  scene.fog = new THREE.Fog(0xa9c3d8, ws * 1.6, ws * 8);
  const sunDist = ws * 2;
  sun.position.set(sunDist * 0.6, sunDist * 0.9, sunDist * 0.45);
  sun.target.position.set(0, 0, 0);
  configureShadows();

  if (player) player.group.visible = false;
  ensureAltHiker();
  applyOrientation();
  refreshSurfaceGrid();
  frameAlternate();
  applyPalette();
  refreshMobiusFlag();
  refreshAltDecor();
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
    // One rule everywhere: a square is two explorers on a side, measured along
    // the surface. The same number in all three regimes is what makes the grid
    // a ruler rather than three different rulers that happen to look alike.
    if (state.surfaceKind === 'graph') {
      if (field) surfGrid = buildGraphGrid(field, { unit: GRID_HEIGHTS * 1.8 * state.zoom, grid });
    } else {
      const unit = GRID_HEIGHTS * 1.8 * state.zoom * (altView.charScale || 1);
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

/**
 * How many explorer-heights a grid square is on a side.
 *
 * Two rather than one: a single height is a stride, and a mesh at one stride is
 * a haze on anything but a close view. Two is still a length the eye can carry
 * — look at the explorer, look at a square — and it is the same two on a graph,
 * on a parametric patch and on an implicit surface, so a square means the same
 * thing whichever is on screen.
 */
const GRID_HEIGHTS = 2;

/**
 * How wide a level curve is painted, in world metres.
 *
 * A width in metres would be a width in metres whatever the explorer's size,
 * and the explorer's size is the plot's whole sense of scale: shrink to a
 * tenth to look at local linearity and every contour would still be 1.4 m
 * across, which at that scale is a motorway. Tied to the explorer instead, a
 * contour is a footpath at every scale — and at the default two heights it is
 * exactly as wide as the side of a grid square, so the two rulers agree.
 */
function pathWidth() { return state.pathHeights * 1.8 * state.zoom; }

function updatePathWidthLabel() {
  const el = $('lbl-cwidth');
  if (!el) return;
  const n = state.pathHeights;
  const m = pathWidth();
  const metres = m >= 100 ? Math.round(m).toLocaleString()
    : m >= 1 ? m.toPrecision(3) : m.toPrecision(2);
  el.textContent = `${n} × 1.8 m = ${metres} m`;
}

/**
 * Say what the chosen key costs, if anything, and only then.
 *
 * A warning that is always on screen is furniture; one that appears exactly
 * when it applies is information.
 */
function applyHoldKeyNote() {
  const el = $('note-holdkey');
  if (!el) return;
  el.textContent = t(state.holdKey === 'alt' ? 'hold.notealt' : 'hold.note');
}

/**
 * Total decoration scale: the dial, and — by default — the explorer's own.
 *
 * "The vegetation is the same scale as the player" is a statement about the
 * *ratio* between the two, and the only way to keep a ratio fixed while one
 * side moves is to move the other side by the same factor. So when the toggle
 * is on, whatever the scale dial does to the explorer it does to a tree too:
 * shrink to a tenth for the tangent-plane demonstration and the forest shrinks
 * with you, rather than suddenly towering. The size-of-the-trees dial still
 * multiplies on top, for taste.
 */
function decorScaleFactor() {
  return state.decorScale * (state.decorMatchPlayer ? state.zoom : 1);
}

function decorOptions() {
  return { density: state.density, shadows: state.shadows, scale: decorScaleFactor() };
}

/** Rebuild whichever forest is on screen — a graph's or a curved surface's. */
function rebuildDecor() {
  if (state.surfaceKind !== 'graph') { refreshAltDecor(); return; }
  if (!field || !grid) return;
  decorations.build(field, grid, predicate, decorOptions());
  decorations.setVisible(state.decor);
  decorations.setIsolate(state.isolate && state.feasible);
}

/**
 * Scatter the same forest over a surface that is not a graph.
 *
 * Deliberately the same forest and the same rules: a student who has learned
 * to read the bands on a hillside — dark timber low down, thinning woodland,
 * scree, snow — reads a torus the same way, and the height that decides them
 * is the same height that coloured the surface. The scale is the explorer's,
 * so the trees say how big the explorer is exactly as they do on a graph.
 */
function refreshAltDecor() {
  if (state.surfaceKind === 'graph') return;
  if (!state.decor || !altSurface) { decorations.clear(); return; }
  decorations.buildOnMesh(altSurface, {
    ...decorOptions(),
    radius: altSurfaceRadius(),
    sign: walker ? walker.sign : 1,
  });
  decorations.setVisible(state.decor);
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
  const one = 1.8 * state.zoom * (state.surfaceKind === 'graph' ? 1 : (altView.charScale || 1));
  const heights = (side || 0) / one;
  el.hidden = false;
  el.textContent = t(geodesic ? 'map.gridgeo' : 'map.gridside', {
    n: Math.abs(heights - Math.round(heights)) < 0.05
      ? String(Math.round(heights)) : heights.toPrecision(2),
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

/** And for the forest, on any kind of surface — rebuilding is not free either. */
let decorTimer = 0;
function scheduleDecorRebuild() {
  if (!state.decor) return;
  clearTimeout(decorTimer);
  decorTimer = setTimeout(() => rebuildDecor(), 300);
}

/** The same, for the contour set, whose width is baked into its triangles. */
let contourTimer = 0;
function scheduleContourRebuild() {
  if (!state.contours || state.surfaceKind !== 'graph') return;
  clearTimeout(contourTimer);
  contourTimer = setTimeout(() => refreshContours(), 260);
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

/**
 * Decide which side of the surface counts as the outside.
 *
 * A walker's normal is whatever the formula hands it — r_u × r_v for a
 * parametric patch, ∇F for an implicit one — and neither has any obligation to
 * point away from the middle of the shape. The usual sphere is the case in
 * point: with v running from 0 to π, r_u × r_v points *inwards*, so the
 * explorer was standing on the inner wall with their head towards the centre,
 * while the checkbox that is supposed to say so was unticked. Everything built
 * on their up vector inherited that, the following camera included, which is
 * why it kept ending up inside the ball looking at the far wall.
 *
 * So the side is chosen rather than inherited: whichever way the normal has to
 * point to face away from the surface's own centre. That is the outside of
 * anything closed, and on a Möbius strip — which has no outside — it is at
 * least the side the explorer is standing on when they arrive.
 */
function chooseOutwardSide() {
  if (!walker) return;
  const b = altSurface && altSurface.geometry.boundingSphere;
  const centre = b ? b.center : new THREE.Vector3();
  const away = walker.position(new THREE.Vector3()).sub(centre);
  walker.baseSign = away.lengthSq() > 1e-12
    && walker.normal(new THREE.Vector3()).dot(away) < 0 ? -1 : 1;
  applyOrientation();
}

function applyOrientation() {
  // Through flip(), not by assignment: swapping sides swaps which way is right,
  // and with it the sense of the angle the body is held at.
  const base = walker && walker.baseSign ? walker.baseSign : 1;
  const want = base * (state.inside ? -1 : 1);
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
 * Keep the following camera short of straight overhead and straight underneath
 * — at either the view is parallel to the up it is being oriented against, and
 * lookAt has nothing left to work with.
 */
function clampCamPitch(a) {
  const lim = 1.35;                      // ~77°, comfortably short of vertical
  return Math.max(-lim, Math.min(lim, a));
}

/**
 * How far behind the explorer the following camera may ride.
 *
 * Near enough that the surface underfoot is what fills the screen, and — the
 * point of the clamp — never so far that it leaves the neighbourhood. Beyond
 * about half the surface's own radius a camera behind someone standing on a
 * sphere is no longer looking at a hillside, it is looking at a ball; and on a
 * torus it is inside the hole.
 */
function clampCamDist(d) {
  const body = 1.8 * state.zoom * (altView.charScale || 1);
  return Math.max(body * 1.6, Math.min(d, altSurfaceRadius() * 0.55));
}

/**
 * Stop the surface from getting between the camera and the explorer.
 *
 * A distance clamp is not enough on its own. Standing in the hole of a torus
 * and backing away puts the far wall of the tube in the way long before any
 * fixed limit is reached, and what the student then sees is a solid colour.
 * So the last word belongs to the surface itself: cast a ray out along the
 * camera's own direction and, if it meets the surface, stop short of it. This
 * is the ordinary camera-collision test of a third-person game, and here it is
 * also the guarantee the view stays local — the camera can never be on the
 * other side of a wall from the person it is following.
 */
const camRay = new THREE.Raycaster();
function clearOfSurface(from, dir, d) {
  if (!altSurface) return d;
  const body = 1.8 * state.zoom * (altView.charScale || 1);
  const near = body * 0.25;                   // clear of the ground underfoot
  camRay.set(from.clone().addScaledVector(dir, near), dir);
  camRay.near = 0;
  camRay.far = d - near;
  const hit = camRay.intersectObject(altSurface, false)[0];
  if (!hit) return d;
  return Math.max(body * 1.2, near + hit.distance * 0.82);
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
  altView.camPitch = 0.32;
}

/**
 * The golf flag at the Möbius strip's start: one pole, two pennants.
 *
 * It stands where the explorer's journey begins — mid-lap, mid-width — and runs
 * straight through the surface: a blue pennant on the side they start on, and
 * the same pole carrying a white pennant out the other face. The lap gradient
 * (paintMobius) is white here on both faces, so the flag is the only thing that
 * can tell the two visits apart: walk one full lap and you return to the very
 * same point, on white ground, facing the *white* pennant. There is no "other
 * side" to a Möbius strip — only the other side of the flag.
 *
 * Rebuilt with the surface, so it tracks the shape's parameters; anchored at
 * the *default* start, not wherever the explorer happens to be now.
 */
function refreshMobiusFlag() {
  if (mobiusFlag) { world.remove(mobiusFlag); disposeTree(mobiusFlag); mobiusFlag = null; }
  if (state.surfaceKind !== 'parametric' || state.shape !== 'mobius'
    || !walker || !altSurface) return;

  // Read position, normal and tangent at the default start without disturbing
  // the walker: it may already have been sent somewhere else.
  const saved = walker.snapshot();
  const p = new THREE.Vector3(), n = new THREE.Vector3(), e = new THREE.Vector3();
  try {
    walker.u = (state.umin + state.umax) / 2;
    walker.v = (state.vmin + state.vmax) / 2;
    walker.position(p);
    walker.normal(n);
    walker.tangentSeed(e).normalize();
  } finally {
    walker.restore(saved);
  }
  if (!isFinite(p.x) || !isFinite(n.x) || n.lengthSq() < 1e-12) return;

  const body = 1.8 * (altView.charScale || 1);
  const H = body * 2.6;               // the pole's reach, each side of the strip
  const g = new THREE.Group();
  g.name = 'mobius-flag';
  g.position.copy(p);
  g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
    e, n, new THREE.Vector3().crossVectors(e, n)));

  const poleGeom = new THREE.CylinderGeometry(body * 0.045, body * 0.045, H * 2, 10);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0xd9dee6 });
  g.add(new THREE.Mesh(poleGeom, poleMat));

  // Two triangular pennants, one per end. The far one is the near one rotated
  // half a turn about the pole's foot — the same flag, seen from the far face.
  const pennant = (rgb, sgn) => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute([
      0, sgn * H * 0.98, 0,
      0, sgn * H * 0.60, 0,
      sgn * body * 1.5, sgn * H * 0.79, 0,
    ], 3));
    geom.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(rgb[0], rgb[1], rgb[2]),
      side: THREE.DoubleSide, toneMapped: false,
    });
    g.add(new THREE.Mesh(geom, mat));
  };
  pennant(MOBIUS_BLUE, 1);            // the side the journey starts on
  pennant(MOBIUS_WHITE, -1);          // the face a full lap turns you onto

  world.add(g);
  mobiusFlag = g;
}

function rebuild() {
  if (state.surfaceKind !== 'graph') return rebuildAlternate();

  disposeTree(altSurface);
  altSurface = null;
  walker = null;
  refreshMobiusFlag();      // no strip on screen, so no flag either
  if (altHiker) altHiker.visible = false;
  if (player) player.group.visible = true;

  // The climate follows the surface. A formula that calls the Saint Elias
  // model is a glaciated coastal massif and gets the alpine bands — snowline
  // a fifth of the way up, vegetation only at the very foot; anything else
  // gets the temperate bands the app has always used. Derived from the
  // formula itself rather than kept as a switch, so it can never be left
  // pointing at the wrong climate.
  // The climate follows the surface. A formula that calls the Saint Elias
  // model, or any of the glaciated border peaks, is a high cold massif and
  // gets the alpine bands; the desert mountains get almost nothing growing on
  // them; anything else gets the temperate bands the app has always used.
  // Derived from the formula itself rather than kept as a switch, so it can
  // never be left pointing at the wrong climate.
  const borderId = currentBorder();
  setBiomeProfile(/\belias\s*\(/.test(state.fnSrc) ? 'alpine'
    : borderId ? BORDERS[borderId].meta.biome
      : 'temperate');

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
  applyRail();

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

  // A graph is a surface, and can be asked a surface's questions: this walker
  // carries the geodesics of z = f(x,y), which is what the geodesic circle
  // needs and what the compass-direction disc cannot supply.
  graphGeo = graphWalker(field);
  graphDisc = new GeodesicDisc();
  world.add(graphDisc.group);

  optMarker = new OptimumMarker(field);
  world.add(optMarker.group);

  curveGizmo = new LevelCurveGizmo(field);
  world.add(curveGizmo.mesh);

  tangentLine = new TangentLineGizmo(field);
  world.add(tangentLine.mesh);

  decorations.build(field, grid, predicate, decorOptions());
  decorations.setVisible(state.decor);
  decorations.setIsolate(state.isolate && state.feasible);

  // --- sky, fog, sun ----------------------------------------------------
  disposeTree(sky);
  sky = buildSky(field.worldSize * 8);
  scene.add(sky);
  // Fog starts beyond the establishing shot, not inside it. The camera frames
  // the whole domain from about 1.8 world-sizes out, so a fog that began at
  // 1.1 put the far half of every surface into haze before the student had
  // looked at it — which on the border mountains, whose relief is the thing
  // being shown, read as a washed-out sky-blue film over the peaks.
  scene.fog = new THREE.Fog(0xa9c3d8, field.worldSize * 2.1, field.worldSize * 9);

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
  player.speedScale = state.walkSpeed;

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
  // state.worldSize rather than field.worldSize: the same number sizes
  // whichever kind of surface is actually on screen, and field is null on a
  // parametric or implicit one.
  if (state.shadows) {
    const r = state.worldSize * 0.75;
    const c = sun.shadow.camera;
    c.left = -r; c.right = r; c.top = r; c.bottom = -r;
    c.near = state.worldSize * 0.5;
    c.far = state.worldSize * 6;
    c.updateProjectionMatrix();
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.bias = -0.0012;
  }
  if (surface) surface.mesh.receiveShadow = state.shadows;
  if (altSurface) altSurface.receiveShadow = state.shadows;
}

/* ---------------------------------------------------------- toggle logic */

/** Rope the explorer to the frontier, or let them off it. */
function applyRail() {
  if (!player) return;
  // Same reasoning as the contour clipping: the rope follows the constraint
  // itself, not the visibility of the walls drawn on it.
  const g = state.rail && hasConstraint() ? railFor(state.feasSrc) : null;
  player.onRail = g;
  // Stepping onto the rope should not leave you standing off it.
  if (g && isFinite(player.x)) {
    const saved = { x: player.x, y: player.y };
    player.snapToRail && player.snapToRail();
    if (!isFinite(player.height())) { player.x = saved.x; player.y = saved.y; }
  }
}

/** Is there a constraint at all — as opposed to a constraint being *drawn*? */
function hasConstraint() {
  return typeof state.feasSrc === 'string' && state.feasSrc.trim() !== '';
}

function paletteMode() { return state.heightColors ? 'height' : 'biome'; }

function applyPalette() {
  // The lighting change below applies whichever kind of surface is on screen,
  // and a curved one has its own painter.
  if (state.surfaceKind !== 'graph') {
    if (state.surfaceKind === 'parametric' && state.shape === 'mobius' && !state.heightColors) {
      // The strip's own colouring is the lap gradient: white at the explorer's
      // default start, deepest blue at the far side, white again on return.
      // The height ramp stays available through its toggle, like everywhere.
      paintMobius(altSurface, (state.umin + state.umax) / 2, state.umin, state.umax);
    } else {
      paintMesh(altSurface, paletteMode());
    }
  } else if (surface) {
    recolorSurface(field, grid, surface.geometry, paletteMode());
  }
  applyWorldMap();

  // In height-colour mode, flatten the lighting. The ramp only means anything
  // if the colour on screen is the colour in the legend, so trade some of the
  // directional shading for fidelity to the palette.
  // Exposure follows the palette AND the climate.
  //
  // The bright setting exists for the pastel surfaces the app opens with, whose
  // albedos are high and whose shapes are simple. Point it at a real mountain —
  // dark granite, dark timber, snow — and the sum of a 3.1 sky and a 3.4 sun
  // drives everything above about a fifth albedo straight to white: the rock
  // and the snow come out the same colour, the relief disappears, and the whole
  // massif reads as a pale blue haze. Turning the lights down does not darken
  // the picture so much as give it back its range, because what was being lost
  // was the top end.
  const rocky = /\belias\s*\(/.test(state.fnSrc || '') || !!currentBorder();
  if (state.heightColors) { hemi.intensity = 4.2; sun.intensity = 1.1; }
  else if (rocky) { hemi.intensity = 1.55; sun.intensity = 2.25; }
  else { hemi.intensity = 3.1; sun.intensity = 3.4; }
  if (surfaceDetail && player && state.surfaceKind === 'graph') {
    surfaceDetail.update(player.x, player.y, detailExtent(), grid, paletteMode(), true);
  }
}

/**
 * Lay the Earth's map on whatever is on screen, or take it off.
 *
 * Where the map's rectangle goes is decided per kind of surface — see
 * worldmap.js — and the answer is different for each because "where is the
 * rectangle" is a different question for each. The detail patch under the
 * explorer stands down while the map is on: it is a second, terrain-coloured
 * copy of the ground drawn over the first, and it would show through the
 * Atlantic.
 */
function applyWorldMap() {
  const on = state.worldMap;
  const graph = state.surfaceKind === 'graph';
  const mesh = graph ? (surface && surface.mesh) : altSurface;
  if (!mesh) return;

  if (on) {
    const ok = graph
      ? mapUV(mesh, 'graph', { field })
      : state.surfaceKind === 'parametric'
        ? mapUV(mesh, 'parametric', {
          umin: state.umin, umax: state.umax, vmin: state.vmin, vmax: state.vmax,
        })
        : mapUV(mesh, 'implicit', {
          centre: mesh.geometry.boundingSphere ? mesh.geometry.boundingSphere.center : null,
        });
    if (!ok) return;
  }
  setMapMaterial(graph ? surface.materials : mesh.material, on);
  if (surfaceDetail) surfaceDetail.group.visible = !on;
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
  // Refine the marching-squares lattice past the render mesh on a real
  // mountain. Terrain has structure between mesh nodes; a level curve traced
  // at mesh resolution shows it as corners, and a level curve is exactly the
  // object a student is being asked to believe is smooth.
  const smooth = state.smoothCurves !== false;
  const refine = smooth ? (currentBorder() || /\belias\s*\(/.test(state.fnSrc) ? 3 : 2) : 1;
  contourLines = buildContours(field, grid, picked.levels || [], {
    width: pathWidth(),
    refine,
    // Indifference-curve view: stop the curves at the constraint.
    // Deliberately NOT gated on state.feasible: that flag is the "show
    // frontier walls" checkbox, and a student who ticks "only inside the
    // feasible set" has said what they want regardless of whether the walls
    // happen to be drawn. Tying the two together made this toggle look broken.
    only: state.curvesInside && hasConstraint() ? predicate : null,
  });
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
// with. Held, not toggled: it is read from the modifier flag every event
// carries, so the moment the key is up the mode is over.
//
// The state is tracked rather than read per-event because looking is
// continuous: it has to keep happening for as long as the key is held.
let lookMod = false;

/**
 * Enter or leave look mode, forgetting every key that was down.
 *
 * This is not tidiness, it is the whole of the bug. While Command is held,
 * macOS does not deliver keyup for character keys — so hold ⌘, tap W, release
 * W, release ⌘, and the program still believes W is down. The instant ⌘ comes
 * up, W means "walk", and the explorer sets off across the surface on their
 * own. From the outside that is indistinguishable from the modifier having been
 * a toggle, which is exactly how it was reported.
 *
 * Clearing on both transitions also settles the ambiguous case honestly: keys
 * held at the moment the mode changes are neither carried over nor half
 * carried over. Hold-to-modify means the direction key is pressed inside the
 * mode, which is what every game that does this expects of you anyway.
 */
function setLookMod(next) {
  if (next === lookMod) return;
  lookMod = next;
  for (const k in keys) keys[k] = false;
}

const isTypingTarget = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');

const LOOK_CODES = ['KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

window.addEventListener('keydown', (e) => {
  setLookMod(SIZE_MOD(e));
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
    case 'b': toggleCheckbox('t-rail'); break;
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
  setLookMod(SIZE_MOD(e));
});

// Leaving the page at all — alt-tabbing, switching desktop, ⌘-tab — ends every
// key that was down, and the browser will not tell us they came back up.
const releaseEverything = () => {
  for (const k in keys) keys[k] = false;
  lookMod = false;
  pad.reset();
};
window.addEventListener('blur', releaseEverything);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) releaseEverything();
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
/**
 * Which key has to be down. A setting, because the three candidates are not
 * equal and which one is safe depends on the machine.
 *
 * The operating system takes some combinations before any web page sees them.
 * ⌘+W closes a tab on a Mac and nothing a page does can stop it; ⊞+arrows is
 * window snapping on Windows and never arrives at all. Alt/Option is the only
 * one free with every key on every platform. Rather than ask a student to
 * remember that, the choice is theirs and it is remembered: lose a tab once to
 * ⌘+W and you can switch to Option and never think about it again.
 *
 * The default accepts either, which is the widest thing that can be offered
 * without knowing whose keyboard this is.
 */
const HOLD_KEYS = ['either', 'alt', 'meta'];
const HOLD_STORE = 'gradient-peaks-holdkey';

function readHoldKey() {
  try {
    const v = localStorage.getItem(HOLD_STORE);
    if (HOLD_KEYS.includes(v)) return v;
  } catch (err) { /* storage blocked */ }
  return 'either';
}

const SIZE_MOD = (e) => (state.holdKey === 'alt' ? e.altKey
  : state.holdKey === 'meta' ? e.metaKey
    : e.metaKey || e.altKey);

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
    // Turning is a rotation of the heading *in the tangent plane*, which is
    // the only thing "turn left" can mean on a surface with no fixed up. It is
    // the same gesture in both views on purpose: in third person the camera
    // rides behind the heading, so steering the explorer swings the camera
    // round with them, and changing view does not change what the mouse does.
    walker.turn(-dx * 0.0022);
    if (altView.mode === MODE_FIRST) {
      altView.pitch = Math.max(-1.4, Math.min(1.4, altView.pitch - dy * 0.0022));
    } else {
      altView.camPitch = clampCamPitch(altView.camPitch + dy * 0.0022);
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

/* ----------------------------------------------------------- the gamepad */

/**
 * An Xbox-layout controller, if there is one. Polled once a frame at the top
 * of animate(); everything downstream reads the snapshot rather than the
 * hardware, so the sticks behave like a third set of held keys.
 *
 *   left stick    walk and strafe          right stick   look / turn
 *   LB / RB       drone altitude           RT            sprint
 *   A             next view (1 / 2 / 3)    Y             world map
 *   B             neighbourhood            X             coordinate grid
 *   D-pad ↑↓      explorer scale           D-pad ←→      camera zoom
 *   Start         show / hide the panel
 */
const pad = new Pad();

const PAD_STORE = 'gradient-peaks-padinvert';

function readPadInvert() {
  try { return localStorage.getItem(PAD_STORE) === '1'; } catch (err) { return false; }
}

/** The look rate for a stick held to the stop, in radians per second. */
const PAD_LOOK_RATE = 2.4;

/**
 * Everything the pad does that is not a stick: the buttons, on the frame they
 * go down. Toggles are driven through the checkboxes rather than through
 * `state` so that the panel and the controller can never disagree about what
 * is switched on.
 */
function applyPadButtons() {
  if (!pad.connected || !pad.pressed.length) return;
  for (const b of pad.pressed) {
    switch (b) {
      case BTN.A: cycleMode(); break;
      case BTN.B: toggleCheckbox('t-disc'); break;
      case BTN.X: toggleCheckbox('t-surfgrid'); break;
      case BTN.Y: toggleCheckbox('t-worldmap'); break;
      case BTN.START: togglePanel(); break;
      case BTN.UP: applyZoom(state.zoom * 1.6); break;
      case BTN.DOWN: applyZoom(state.zoom / 1.6); break;
      case BTN.LEFT: applyCamZoom(state.camZoom / 1.4); break;
      case BTN.RIGHT: applyCamZoom(state.camZoom * 1.4); break;
      default: break;
    }
  }
}

/** First → third → drone → first, on the A button. */
function cycleMode() {
  const now = state.surfaceKind === 'graph'
    ? (player ? player.mode : MODE_THIRD)
    : altView.mode;
  setMode(now === MODE_FIRST ? MODE_THIRD : now === MODE_THIRD ? MODE_DRONE : MODE_FIRST);
}

/** The right stick, turned into the same swing a held key would make. */
function applyPadLook(dt) {
  if (!pad.connected) return;
  const { x, y } = pad.look;
  if (!x && !y) return;
  // The stick's y is positive upwards and applyLook counts a positive dy as
  // looking down, so it is negated here rather than in the reader — the
  // reader's job is to say where the stick is, not what it means.
  applyLook(x, -y, PAD_LOOK_RATE * dt);
}

/** Show which controller is talking, because a silent one looks broken. */
function updatePadStatus() {
  const el = $('pad-status');
  if (!el) return;
  const was = el.dataset.on === '1';
  if (was === pad.connected) return;
  el.dataset.on = pad.connected ? '1' : '0';
  el.textContent = pad.connected ? t('view.padon', { name: pad.name }) : t('view.padoff');
  el.classList.toggle('on', pad.connected);
}

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
      // A finger drag is in pixels, and the mouse's own rate — 0.0022 rad per
      // pixel — is the one already tuned against this scene, times a little
      // for a thumb having less room than a mouse.
      if (state.showDir && state.surfaceKind === 'graph') state.dirAngle -= dx * 0.012;
      else applyLook(dx, dy, 0.0048);
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
  // Held modifier: the same *keys* are aiming, not walking. The gamepad has a
  // stick for each job and is never ambiguous, so it keeps driving throughout.
  if (lookMod) {
    return {
      forward: pad.move.y, right: pad.move.x, up: pad.lift, sprint: pad.sprint,
    };
  }

  let forward = 0, right = 0, up = 0;
  if (keys.KeyW || keys.ArrowUp) forward += 1;
  if (keys.KeyS || keys.ArrowDown) forward -= 1;
  if (keys.KeyD || keys.ArrowRight) right += 1;
  if (keys.KeyA || keys.ArrowLeft) right -= 1;
  if (keys.Space) up += 1;
  if (keys.ControlLeft || keys.ControlRight || keys.KeyC) up -= 1;

  forward += touch.my;
  right += touch.mx;

  forward += pad.move.y;
  right += pad.move.x;
  up += pad.lift;

  return {
    forward: Math.max(-1, Math.min(1, forward)),
    right: Math.max(-1, Math.min(1, right)),
    up: Math.max(-1, Math.min(1, up)),
    sprint: !!(keys.ShiftLeft || keys.ShiftRight) || pad.sprint,
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
  applyLook(dx, dy, LOOK_RATE * dt);
}

/**
 * Swing the view, whatever is doing the swinging and whatever is on screen.
 *
 * Three things now steer — held keys, a dragged finger, a gamepad stick — and
 * "turn left" means four different operations depending on the surface and the
 * camera: yaw the orbiting drone, rotate the walker's heading inside the
 * tangent plane, tilt the following camera, or turn the heightfield explorer.
 * Written out once per input device that would be four chances to get it
 * wrong, and it had already gone wrong once: the touch look never reached the
 * curved-surface branch at all, so dragging to look did nothing on a sphere.
 *
 * @param dx,dy  how much to turn, in whatever unit the caller counts in
 * @param a      radians per unit of that
 */
function applyLook(dx, dy, a) {
  if (state.surfaceKind !== 'graph') {
    if (altView.mode === MODE_DRONE || !walker) {
      altCam.yaw -= dx * a;
      altCam.pitch = Math.max(-ALT_PITCH_LIM, Math.min(ALT_PITCH_LIM, altCam.pitch - dy * a));
    } else {
      // On a surface, "turn" is a rotation of the heading inside the tangent
      // plane; pitch is clamped short of vertical so the view never rolls under
      // the ground it is standing on.
      walker.turn(-dx * a);
      if (altView.mode === MODE_FIRST) {
        altView.pitch = Math.max(-1.4, Math.min(1.4, altView.pitch - dy * a));
      } else {
        altView.camPitch = clampCamPitch(altView.camPitch + dy * a);
      }
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

  // Grey out the sections that only mean something on a graph. The derivatives
  // and the tangent plane are not among them any more: a surface has a
  // neighbourhood, coordinate directions, a velocity and a tangent plane
  // whether or not it happens to be the graph of anything. Nor, now, is the
  // whole of Map & terrain: the terrain palette, the vegetation and the world
  // map are all built straight off the mesh (paintMesh, buildOnMesh, mapUV)
  // and owe nothing to f. What is left genuinely graph-only inside that
  // section — level curves, which need a height to be curves of — is hidden
  // in its own block below rather than greying the whole section over them.
  for (const id of ['sec-feasible', 'sec-curve', 'sec-opt']) {
    const el = $(id);
    if (el) { el.style.opacity = graph ? '' : '0.4'; el.style.pointerEvents = graph ? '' : 'none'; }
  }
  $('fld-contours').hidden = !graph;
  // Water is a flat plane at z = 0, which is a statement about a graph's own
  // domain; a closed surface has no comparable "sea level" to cut it with.
  $('fld-water').hidden = !graph;

  // Within the derivatives section, the two rows that really do need an f: the
  // gradient is a gradient of something, and the free directional derivative is
  // steered by the mouse while the explorer is frozen, which is a heightfield
  // control. On a curved surface those rows are replaced rather than greyed.
  $('row-grad').hidden = !graph;
  $('fld-geodisc').hidden = !graph;
  for (const [id, key] of [
    ['lbl-dx', graph ? 'deriv.dx' : 'deriv.axisa'],
    ['lbl-dy', graph ? 'deriv.dy' : 'deriv.axisb'],
    ['lbl-dir', graph ? 'deriv.dir' : 'deriv.velocity'],
    ['lbl-disc', graph ? 'deriv.disc' : 'deriv.geocircle'],
    ['lbl-tangent', graph ? 'deriv.tangent' : 'deriv.tangentp'],
  ]) {
    const el = $(id);
    if (el) { el.dataset.i18n = key; el.textContent = t(key); }
  }
  $('note-intrinsic').hidden = graph;
  $('note-arcnote').hidden = !graph;
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

/**
 * The Nash–Kuiper crochet-ball formula (PDF eq. 13, N₀ = 1), verbatim — this
 * exact string is both the preset's option value and the thing compared
 * against to decide whether its explanatory note belongs on screen. a = 1/√3
 * is written out as 1/sqrt(3) and sqrt(3) rather than as a decimal, so a
 * student reading the formula box sees the same symbol the derivation uses.
 */
const CROCHET_FN = 'y/(hypot(x,y)+1e-9)*sqrt(2*((1/3)*sinh(hypot(x,y)*sqrt(3))^2-hypot(x,y)^2))';

/** Mount Saint Elias: the baked elevation model, as a formula. */
const ELIAS_FN = 'elias(x, y)';

/**
 * The Alaska side of the frontier, as one linear inequality.
 *
 * Locally the 1903 tribunal line really is straight — a segment through the
 * boundary peaks, fitted here from Natural Earth's rendering of the treaty
 * line — so "stay in the United States" is exactly a budget constraint:
 * a half-plane whose boundary passes 470 m from the summit, with the summit
 * on the Canadian side. (The full frontier also turns due north along the
 * 141°W meridian at the window's northwest edge; one line keeps the algebra
 * the lesson's, and inside this window the difference is a sliver of the
 * far corner.)
 */
function eliasFeasible() {
  const b = ELIAS_INFO.boundary;
  return `y <= ${b.m.toFixed(4)}*x ${b.b < 0 ? '-' : '+'} ${Math.abs(b.b).toFixed(4)}`;
}

/* ------------------------------------------------- the border mountains */

/**
 * Which border mountain, if any, the formula box is currently showing.
 *
 * Read off the formula rather than remembered in a variable, so that typing
 * `natazhat(x, y)` by hand is exactly as good as choosing it from the menu —
 * the same rule the rest of the program follows, where the formula is the
 * single source of truth about what surface is on screen.
 */
function currentBorder() {
  const m = /^\s*([a-z]+)\s*\(\s*x\s*,\s*y\s*\)\s*$/.exec(state.fnSrc || '');
  return m && BORDERS[m[1]] ? m[1] : null;
}

/**
 * The photograph and the sentence that says where you are.
 *
 * The card carries what the atlas carries: the two countries, which line the
 * frontier is, which side the summit is on and by how far. The distance is
 * the one computed from the elevation model and the exact boundary, not the
 * atlas's stated figure — the program should quote its own arithmetic.
 *
 * When the atlas admits a photograph is regional context rather than the
 * mountain itself, the caption says so. A picture captioned as something it
 * is not would be worse than no picture at all.
 */
function updatePeakCard() {
  const card = $('peak-card');
  if (!card) return;
  const id = currentBorder();
  if (!id) { card.hidden = true; return; }

  const s = BORDERS[id];
  const m = s.meta;
  const es = getLanguage() === 'es';
  const photo = photoFor(id);
  const img = $('peak-photo');
  if (photo) { img.src = photo; img.hidden = false; } else { img.hidden = true; }
  img.alt = es ? m.es : m.name;

  $('peak-name').textContent = es ? m.es : m.name;
  const [own, other] = es ? m.countriesEs : m.countries;
  const km = s.frontierKm;
  const dist = km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(2)} km`;
  $('peak-where').innerHTML = es
    ? `${own} / ${other}<br>Frontera: ${m.boundaryEs}.<br>`
      + `Cima <b>${Math.round(s.summit.metres)} m</b>, a <b>${dist}</b> de la línea,`
      + ` del lado de ${own.replace(/\s*\(.*\)/, '')}.`
    : `${own} / ${other}<br>Frontier: ${m.boundary}.<br>`
      + `Summit <b>${Math.round(s.summit.metres)} m</b>, <b>${dist}</b> from the line,`
      + ` on the ${own.replace(/\s*\(.*\)/, '')} side.`;
  $('peak-credit').textContent = (m.ofItself ? '' : (es ? 'Vista regional. ' : 'Regional view. ')) + m.credit;
  card.hidden = false;
}

/**
 * The constraint curve, as a function that vanishes on it.
 *
 * The feasible set is whatever inequality the student typed, so the frontier
 * is read straight back out of that text: split the comparison at its top
 * level and subtract. `x + y <= 2` becomes x + y − 2, `x^2+y^2 <= 1` becomes
 * the circle, and a border mountain's half-plane becomes its treaty line. The
 * explorer is then projected onto the zero set of that function, which is why
 * walking the frontier works for a curved constraint and not only a straight
 * one.
 *
 * A conjunction of several constraints has several edges and no single curve;
 * the first comparison wins, which is the right answer for a budget line and
 * an honest limitation everywhere else.
 */
function railFor(src) {
  if (typeof src !== 'string' || !src.trim()) return null;
  let depth = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (depth === 0 && (c === '<' || c === '>')) {
      const skip = src[i + 1] === '=' ? 2 : 1;
      const lhs = src.slice(0, i), rhs = src.slice(i + skip);
      try {
        const L = compile(lhs, ['x', 'y']);
        const R = compile(rhs, ['x', 'y']);
        const g = (x, y) => L(x, y) - R(x, y);
        if (!isFinite(g(0.3, 0.4))) return null;
        return g;
      } catch { return null; }
    }
  }
  return null;
}

/** Show each formula's explanatory note exactly when it is the one loaded. */
function updateCrochetNote() {
  const fn = $('in-fn').value.trim();
  const crochet = $('note-crochet');
  if (crochet) crochet.hidden = fn !== CROCHET_FN;
  const elias = $('note-elias');
  if (elias) elias.hidden = fn !== ELIAS_FN;
  const border = $('note-border');
  const id = currentBorder();
  if (border) {
    border.hidden = !id;
    if (id) {
      const m = BORDERS[id].meta;
      border.textContent = (getLanguage() === 'es' ? m.blurbEs : m.blurb) + ' ' + t('fn.bordernote');
    }
  }
  updatePeakCard();
}

/**
 * @param reframe  after a graph rebuilds, put the camera back on the
 *   establishing shot — the whole surface, from a three-quarter angle, in
 *   drone mode. Only asked for when the caller has just swapped in a
 *   genuinely different surface (the examples menu): the camera is otherwise
 *   left exactly where the student put it, because jumping it on every
 *   domain or axis-scale tweak would fight whatever they were doing with it.
 *
 *   A curved surface does not need this parameter: rebuildAlternate calls
 *   frameAlternate on every rebuild regardless, because there the camera
 *   orbits a fixed point (the origin) rather than free-flying, so refitting
 *   the distance to a shape that just changed size is never a surprise.
 *   A graph's drone camera free-flies, and would otherwise never move.
 */
function applyInputs(reframe = false) {
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
  updateCrochetNote();
  withLoading(() => {
    const ok = rebuild();
    if (ok && reframe && state.surfaceKind === 'graph' && player) {
      // Both calls, in this order, exactly as the very first surface gets
      // them: the player-level call frames the shot, the page-level one
      // updates the mode buttons and HUD to agree that this is what happened.
      player.establishingShot(camera);
      setMode(MODE_DRONE);
    }
  });
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

  // Against the *field's* domain, not the state's. Applying a preset or typing
  // a new domain sets state.xmin/xmax synchronously, but the rebuild that
  // actually moves the player and remeshes the surface is deferred two frames
  // by withLoading, so there is a short window where state describes a domain
  // the player has not been placed in yet. Comparing to field — which only
  // ever changes at the moment the player does — reads the domain the player
  // is actually standing in, so nothing here fires against a domain that has
  // been asked for but not yet built. (It used to fire: switching to a
  // preset with a much smaller domain than the player's previous position
  // could read as "already past the edge" before the rebuild ever ran, and
  // pan the brand-new window before anyone had seen it.)
  const w = field.xmax - field.xmin, h = field.ymax - field.ymin;
  if (!(w > 0 && h > 0)) return;

  // A hair inside the edge, because the walker is clamped exactly onto it and
  // floating-point equality is not something to bet a rebuild on.
  const tx = w * 1e-6, ty = h * 1e-6;
  let dx = 0, dy = 0;
  if (player.x >= field.xmax - tx) dx = 1;
  else if (player.x <= field.xmin + tx) dx = -1;
  if (player.y >= field.ymax - ty) dy = 1;
  else if (player.y <= field.ymin + ty) dy = -1;
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
  $('btn-apply').addEventListener('click', () => applyInputs());
  $('panel-toggle').addEventListener('click', () => togglePanel(true));
  $('panel-show').addEventListener('click', () => togglePanel(false));

  $('preset-fn').addEventListener('change', (e) => {
    if (!e.target.value) return;
    $('in-fn').value = e.target.value;
    if (e.target.value === ELIAS_FN) {
      // The real mountain: the domain is the survey's own window, the
      // feasible set is Alaska, and the window must not follow the explorer —
      // the data has edges, and panning past them would be panning off the
      // survey. Isolation stays off so both countries stay solid; the wall
      // marks the line.
      $('in-xmin').value = ELIAS_INFO.xmin; $('in-xmax').value = ELIAS_INFO.xmax;
      $('in-ymin').value = ELIAS_INFO.ymin; $('in-ymax').value = ELIAS_INFO.ymax;
      $('in-feas').value = eliasFeasible();
      state.feasSrc = $('in-feas').value;
      $('t-feas').checked = true; state.feasible = true;
      $('t-isolate').checked = false; state.isolate = false;
      $('t-follow').checked = false; state.follow = false;
      // The surface itself is a smooth Fourier fit; the crags are costume.
      // The preset insists on the costume, so the smoothing stays invisible.
      $('t-decor').checked = true; state.decor = true;
    } else if (/^([a-z]+)\(x, y\)$/.test(e.target.value)
      && BORDERS[e.target.value.replace(/\(.*/, '')]) {
      // A border mountain: the survey window is the domain, and the feasible
      // set is the *other* country — the one that does not own the summit.
      // That is what forces the answer onto the frontier, and it is why these
      // examples are worth having: the constraint was negotiated, not invented
      // for a problem set.
      const id = e.target.value.replace(/\(.*/, '');
      const s = BORDERS[id];
      const h = s.half.toFixed(3);
      $('in-xmin').value = -h; $('in-xmax').value = h;
      $('in-ymin').value = -h; $('in-ymax').value = h;
      // Open with the z axis stretched, the way a relief model or an atlas
      // does. At true scale two kilometres of mountain across an eighteen
      // kilometre window is a swelling, not a peak — honestly so, but an
      // example nobody recognises as a mountain teaches nothing. This is a
      // display scale only: f, its gradients and every readout stay in real
      // kilometres, and the dial is right there to put it back to 1.
      $('in-sz').value = s.exaggeration;
      $('in-sz').dispatchEvent(new Event('input'));
      $('in-feas').value = feasibleFor(id);
      state.feasSrc = $('in-feas').value;
      $('t-feas').checked = true; state.feasible = true;
      $('t-isolate').checked = false; state.isolate = false;
      $('t-follow').checked = false; state.follow = false;   // the survey has edges
      $('t-decor').checked = true; state.decor = true;
    } else if (e.target.value === CROCHET_FN) {
      // The construction is only claimed valid out to ρ = a = 1/√3; beyond
      // that the single-wave amplitude keeps growing and stops being the
      // mild correction the derivation is about. A domain a hair wider than
      // a, masked to the disk ρ ≤ a by the feasible set exactly as the
      // Consumer problem masks a budget line, shows precisely that disk and
      // nothing past its edge.
      const A = 1 / Math.sqrt(3);
      const w = (A * 1.08).toFixed(4);
      $('in-xmin').value = -w; $('in-xmax').value = w;
      $('in-ymin').value = -w; $('in-ymax').value = w;
      $('in-feas').value = `x^2+y^2<=${(A * A).toFixed(6)}`;
      state.feasSrc = $('in-feas').value;
      $('t-feas').checked = true; state.feasible = true;
      $('t-isolate').checked = true; state.isolate = true;
    } else {
      // Presets centred on the origin want a symmetric window.
      if (/x\^0\.|\(x\*y\)/.test(e.target.value)) {
        $('in-xmin').value = 0; $('in-xmax').value = 2; $('in-ymin').value = 0; $('in-ymax').value = 2;
      } else {
        $('in-xmin').value = -2; $('in-xmax').value = 2; $('in-ymin').value = -2; $('in-ymax').value = 2;
      }
    }
    e.target.value = '';
    // A preset can land the surface somewhere the camera — left wherever the
    // student last put it — no longer frames at all: the crochet ball's disk
    // is a fifth the width of the default domain and its one ripple stands
    // taller than that, so the establishing shot the very first surface got
    // is exactly what a newly-loaded one needs too.
    applyInputs(true);
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
    $(id).addEventListener('blur', () => applyInputs());
  }

  $('in-res').addEventListener('input', (e) => { $('lbl-res').textContent = e.target.value; });
  $('in-res').addEventListener('change', () => applyInputs());
  for (const ax of ['sx', 'sy', 'sz']) {
    $(`in-${ax}`).addEventListener('input', (e) => {
      $(`lbl-${ax}`).textContent = `${parseFloat(e.target.value).toFixed(2)}×`;
    });
    $(`in-${ax}`).addEventListener('change', () => applyInputs());
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
  bindCheck('t-curvesin', 'curvesInside', refreshContours);
  bindCheck('t-rail', 'rail', applyRail);
  bindCheck('t-heightcol', 'heightColors', applyPalette);
  bindCheck('t-worldmap', 'worldMap', () => withLoading(applyPalette));
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

  if ($('sel-holdkey')) {
    const sel = $('sel-holdkey');
    sel.value = state.holdKey;
    sel.addEventListener('change', () => {
      state.holdKey = HOLD_KEYS.includes(sel.value) ? sel.value : 'either';
      try { localStorage.setItem(HOLD_STORE, state.holdKey); } catch (err) { /* blocked */ }
      // Changing the modifier mid-hold would leave the old one latched.
      setLookMod(false);
      applyHoldKeyNote();
    });
  }

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
    state.pathHeights = parseFloat(e.target.value);
    updatePathWidthLabel();
  });
  $('in-cwidth').addEventListener('change', () => {
    if (state.contours) withLoading(refreshContours);
  });
  bindCheck('t-decor', 'decor', () => {
    decorations.setVisible(state.decor);
    // On a curved surface the forest is not built until it is asked for, so
    // the first tick has to build it rather than just unhide nothing.
    if (state.decor && state.surfaceKind !== 'graph' && !decorations.layers.length) {
      withLoading(refreshAltDecor);
    }
  });
  bindCheck('t-water', 'water', () => { if (water) water.visible = state.water && !(state.feasible && state.isolate); });
  bindCheck('t-shadow', 'shadows', () => {
    configureShadows();
    withLoading(rebuildDecor);
  });

  // Logarithmic: a tenth and five times sit the same distance from the middle.
  $('in-decsize').addEventListener('input', (e) => {
    state.decorScale = Math.pow(10, parseFloat(e.target.value));
    $('lbl-decsize').textContent = state.decorScale >= 1
      ? `${state.decorScale.toFixed(1)}×` : `${state.decorScale.toFixed(2)}×`;
  });
  $('in-decsize').addEventListener('change', () => withLoading(rebuildDecor));

  if ($('t-padinvert')) {
    const el = $('t-padinvert');
    el.checked = pad.invertLook;
    el.addEventListener('change', () => {
      pad.invertLook = el.checked;
      try { localStorage.setItem(PAD_STORE, el.checked ? '1' : '0'); } catch (err) { /* blocked */ }
    });
  }

  if ($('t-decormatch')) {
    $('t-decormatch').addEventListener('change', (e) => {
      state.decorMatchPlayer = e.target.checked;
      withLoading(rebuildDecor);
    });
  }

  $('in-den').addEventListener('input', (e) => { $('lbl-den').textContent = `${parseFloat(e.target.value).toFixed(1)}×`; });
  $('in-den').addEventListener('change', (e) => {
    state.density = parseFloat(e.target.value);
    withLoading(rebuildDecor);
  });

  bindCheck('t-disc', 'disc', () => { if (state.disc) goToExplorer(); });
  bindCheck('t-dx', 'showDx', ensureDisc);
  bindCheck('t-dy', 'showDy', ensureDisc);
  bindCheck('t-grad', 'showGrad', ensureDisc);
  bindCheck('t-tangent', 'tangent', () => { if (state.tangent) goToExplorer(); });
  bindCheck('t-geodisc', 'geoDisc');
  bindCheck('t-dir', 'showDir', () => {
    ensureDisc();
    // The mouse is repurposed to swing u while the arrow is on (hold the
    // right button to look), but walking stays free — it used to freeze the
    // explorer here, and because that freeze outlived the checkbox's context
    // it could leave a later surface with an explorer that would not move at
    // all. Nothing about showing a direction requires standing still.
    const graph = state.surfaceKind === 'graph';
    $('note-dir').hidden = !(graph && state.showDir);
    if (graph && state.showDir) state.dirAngle = player.facing || 0;
  });

  $('in-rad').addEventListener('input', (e) => {
    state.radius = parseFloat(e.target.value);
    $('lbl-rad').textContent = `${state.radius} m`;
  });

  $('in-zoom').addEventListener('input', (e) => {
    applyZoom(Math.pow(10, -parseFloat(e.target.value)));
  });

  // Logarithmic, so a quarter pace and four times pace are the same distance
  // from the middle and neither end of the dial is a dead zone.
  $('in-speed').addEventListener('input', (e) => {
    state.walkSpeed = Math.pow(10, parseFloat(e.target.value));
    if (player) player.speedScale = state.walkSpeed;
    $('lbl-speed').textContent = state.walkSpeed >= 10
      ? `${Math.round(state.walkSpeed)}×`
      : `${state.walkSpeed.toFixed(state.walkSpeed < 1 ? 2 : 1)}×`;
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
    applyHoldKeyNote();
    updateGridUI();
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
  if (state.surfaceKind !== 'graph') {
    if (walker && altView.mode === MODE_DRONE) setMode(MODE_THIRD);
    return;
  }
  if (player && player.mode === MODE_DRONE) setMode(MODE_THIRD);
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
  // The grid squares and the contour paths are both measured in explorer
  // heights, so neither is the right size once the explorer is not. Nor is the
  // vegetation, while it is set to track the explorer's own scale.
  if (state.zoom !== before) {
    scheduleGridRebuild();
    scheduleContourRebuild();
    if (state.decorMatchPlayer) scheduleDecorRebuild();
  }
  updatePathWidthLabel();
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

/** What to call the two coordinate directions, per kind of grid. */
const GRID_AXIS_NAMES = {
  param: ['∂r/∂u', '∂r/∂v'],
  coord: ['∂/∂x', '∂/∂y'],
  geodesic: ['e₁', 'e₂'],
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
    chipEls.grad.hidden = true;                 // there is no f, so no ∇f
    if (!readout) {
      for (const k in chipEls) chipEls[k].hidden = true;
      return;
    }

    // What the two coordinate arrows are, and the angle between them — which
    // is the whole content of a coordinate system on a curved surface. On the
    // usual sphere the parameter lines meet at 90°, on a helicoid they do not,
    // and the geodesic axes meet at 90° by construction.
    const names = GRID_AXIS_NAMES[gridMode()];
    const deg = (a) => (isFinite(a) ? `${(a * 180 / Math.PI).toFixed(1)}°` : '—');
    for (const [chip, on, name, have] of [
      [chipEls.dx, state.showDx, names[0], readout.hasA],
      [chipEls.dy, state.showDy, names[1], readout.hasB],
    ]) {
      chip.hidden = !on;
      if (on) {
        chip.innerHTML = have
          ? `${name} <i>${t('hud.angle')} ${deg(readout.angleAB)}</i>`
          : `${name} <i>${t('hud.noaxis')}</i>`;
      }
    }

    chipEls.dir.hidden = !state.showDir;
    if (state.showDir) {
      const c = isFinite(readout.circumference)
        ? ` · C/2πr ${fmt(readout.ratio, 4)}` : '';
      chipEls.dir.innerHTML = `<b>v</b> <i>${t('hud.frombase', {
        a: names[0], deg: deg(readout.headingAngle),
      })}${c}</i>`;
    }
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

/**
 * Which coordinate system the partial derivatives are partial *with respect
 * to* — which is a question about the grid on screen, and has no answer
 * without one.
 */
function gridMode() {
  if (state.geoGrid) return 'geodesic';
  return state.surfaceKind === 'parametric' ? 'param' : 'coord';
}

/**
 * The derivatives of a surface with no f: the geodesic circle, the coordinate
 * vectors of the grid in force, the velocity, and the tangent plane.
 *
 * Built on demand rather than at surface-build time, because it belongs to the
 * walker and not to the mesh — change the formula and the same gizmo goes on
 * answering, about the new surface.
 */
function updateIntrinsic() {
  if (!walker) {
    if (intrinsic) intrinsic.setVisible(false);
    return null;
  }
  const anyOn = state.disc || state.showDx || state.showDy || state.showDir || state.tangent;
  if (!anyOn) {
    if (intrinsic) intrinsic.setVisible(false);
    return null;
  }
  if (!intrinsic) {
    intrinsic = new IntrinsicGizmo();
    world.add(intrinsic.group);
  }
  const r = altSurfaceRadius();
  return intrinsic.update(walker, {
    radiusMetres: state.radius * state.zoom * (altView.charScale || 1),
    clearance: r * 0.0016,
    gridMode: gridMode(),
    showDisc: state.disc,
    showA: state.showDx,
    showB: state.showDy,
    showVel: state.showDir,
    showPlane: state.tangent,
  });
}

const clock = new THREE.Clock();
const curveRGB = [0, 0, 0];

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  // The gamepad is polled, not evented, so it is read once here and everything
  // downstream — readInput, the look, the buttons — sees one consistent
  // snapshot for the frame. Before any early return, so a controller works
  // even on the frames where there is nothing yet to draw.
  pad.poll();
  applyPadButtons();
  updatePadStatus();

  if (state.surfaceKind !== 'graph') {
    const inp = readInput();
    applyLookKeys(dt);
    applyPadLook(dt);

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
      const speed = 4.2 * state.zoom * altView.charScale * state.walkSpeed
        * (inp.sprint ? 2.6 : 1);
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
        // Third person, over the shoulder — built entirely in the explorer's
        // own frame, because on a sphere there is no other frame to build it
        // in. The camera sits behind the heading, raised by its own elevation
        // angle, with the explorer's up as its up. Turn, and it comes round
        // with you; walk under a torus, and it goes under with you.
        //
        // The two things this replaces were both world-space, and both broke
        // here. A camera at a fixed world yaw does not follow a turn, so in
        // third person there was no way to steer. And a camera placed at a
        // world offset walks through the surface as soon as the offset is
        // larger than the surface — zoom out on a sphere and you came out the
        // far side, looking at the inside of it.
        //
        // Staying in the frame fixes the first. The distance clamp fixes the
        // second: back along a tangent from a point of a convex surface never
        // re-enters it, and capping the reach at a fraction of the surface's
        // own radius keeps it from wandering off into a torus's hole either.
        const c = Math.cos(altView.camPitch), s = Math.sin(altView.camPitch);
        const eye = 1.66 * state.zoom * altView.charScale;
        const target = stance.p.clone().addScaledVector(stance.up, eye * 0.6);
        const back = new THREE.Vector3()
          .addScaledVector(stance.fwd, -c)
          .addScaledVector(stance.up, s)
          .normalize();
        const d = clearOfSurface(target, back,
          clampCamDist((altView.camDist || (altCam.dist * 0.35)) / state.camZoom));
        camera.position.copy(target).addScaledVector(back, d);
        camera.up.copy(stance.up);
        camera.lookAt(target);
      }
      camera.fov = fovFor(altView.mode === MODE_FIRST);
      camera.near = Math.max(1e-4, 0.02 * state.zoom * altView.charScale);
      camera.far = altCam.dist * 20 + state.worldSize * 8;
    }

    camera.updateProjectionMatrix();
    if (sky) sky.position.copy(camera.position);
    updateCompass(dt);
    updateHUD(updateIntrinsic());
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
  applyPadLook(dt);
  player.update(dt, readInput());
  followEdges(dt);
  player.updateCamera(camera, dt);

  if (sky) sky.position.copy(camera.position);

  // High-resolution rings under the explorer.
  surfaceDetail.update(player.x, player.y, detailExtent(), grid, paletteMode(), false);

  // Derivative gizmo — and everything else drawn afresh at the explorer's
  // feet. Each of these is a pure function of where the explorer stands and
  // of a handful of settings, so while they stand still with the dials
  // untouched, recomputing any of it draws the identical picture. That used
  // to be a harmless habit; on the Fourier terrain, where every scattered
  // evaluation of f costs a full double sum, it is the frame budget. One key
  // covers the lot: when it repeats, last frame's geometry stands.
  const wantGizmo = state.disc && isFinite(player.height());
  gizmo.setVisible(wantGizmo);
  let readout = null;
  const stillKey = `${player.x},${player.y},${player.zoom},${state.radius},` +
    `${surfaceDetail.topLift},${player.extraLift},${state.geoDisc},${state.showDx},` +
    `${state.showDy},${state.showGrad},${state.showDir},${state.dirAngle},` +
    `${state.disc},${state.tangent},${state.curCurve},${state.curTangent},${state.zoom}`;
  const still = stillMemo && stillMemo.gizmo === gizmo && stillMemo.key === stillKey;
  if (wantGizmo) {
    if (still) {
      readout = stillMemo.readout;
    } else {
      readout = gizmo.update(player.x, player.y, {
        radiusMetres: state.radius * player.zoom,
        clearance: surfaceDetail.topLift,
        showDisc: !state.geoDisc,
        showX: state.showDx,
        showY: state.showDy,
        showGrad: state.showGrad,
        showDir: state.showDir,
        dirAngle: state.dirAngle,
      });
    }
  }

  // The other neighbourhood: the set of points a fixed walk away along the
  // straightest path, rather than along a fixed compass bearing. The two agree
  // to second order and part company exactly where the surface curves, which is
  // the comparison the toggle exists to make.
  if (wantGizmo && state.geoDisc && graphGeo && graphDisc) {
    if (!still) {
      graphGeo.placeAtUV(player.x, player.y);
      if (!graphDisc.update(graphGeo, state.radius * player.zoom, gizmo.lift)) {
        graphDisc.setVisible(false);
      }
    }
  } else if (graphDisc) {
    graphDisc.setVisible(false);
  }

  if (state.tangent && isFinite(player.height())) {
    if (!still) {
      tangentPlane.update(player.x, player.y, state.radius * player.zoom,
        Math.max(player.extraLift, surfaceDetail.topLift * 2.6));
    }
  } else {
    tangentPlane.setVisible(false);
  }

  // The contour through the player's feet, and its tangent. Both are traced
  // afresh from the player's exact height, so they follow continuously.
  const onGround = isFinite(player.height());
  if (state.curCurve && onGround) {
    if (!still) {
      heightColor(grid.norm(player.height()), curveRGB);
      curveGizmo.update(player.x, player.y, pathWidth() * 1.35, curveRGB);
    }
  } else {
    curveGizmo.setVisible(false);
  }

  if (state.curTangent && onGround) {
    if (!still) tangentLine.update(player.x, player.y, field.worldSize * 0.22, pathWidth() * 0.9);
  } else {
    tangentLine.setVisible(false);
  }

  stillMemo = { gizmo, key: stillKey, readout };

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

/**
 * A window onto the scene, for the checks in tools/.
 *
 * Read-only by convention and never used by the application itself. What it
 * buys is that a test can ask "is the geodesic circle actually being drawn"
 * and get an answer about the scene graph, instead of diffing screenshots and
 * arguing about pixels. Anything reachable here is reachable from the page's
 * own source in any case.
 */
window.__peaks = {
  THREE, scene, world, state, camera, altView,
  get walker() { return walker; },
  get altSurface() { return altSurface; },
  get player() { return player; },
  get optimum() { return optimum; },
  get field() { return field; },
  get grid() { return grid; },
};

state.holdKey = readHoldKey();
pad.invertLook = readPadInvert();

wireLanguage();
wireUI();
applyHoldKeyNote();
applyVocabulary();
applyShape();
applySurfaceKindUI();
updatePathWidthLabel();
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
