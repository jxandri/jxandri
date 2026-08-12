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
  maximize, OptimumMarker, LevelCurveGizmo, TangentLineGizmo,
} from './analysis.js';
import { Player, MODE_FIRST, MODE_THIRD, MODE_DRONE } from './player.js';
import { buildImplicit, buildParametric } from './surfaces.js';
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
  curCurve: false,
  curTangent: false,
  decor: true,
  water: true,
  density: 1,
  shadows: false,

  disc: false,
  radius: 2,
  showDx: false,
  showDy: false,
  showGrad: false,
  showDir: false,
  dirAngle: 0,
  tangent: false,

  zoom: 1,             // continuous, and never above 1
  showOpt: false,
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
let decorations = new Decorations();
let player = null;

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
 * Build an implicit or parametric surface.
 *
 * Neither is the graph of a function, so none of the heightfield machinery
 * applies: the explorer, the derivative disc, the contours and the optimiser are
 * all torn down and the view is handed to the drone.
 */
function rebuildAlternate() {
  clearGraphWorld();
  disposeTree(altSurface);
  altSurface = null;

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
  frameAlternate();
  return true;
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
}

function rebuild() {
  if (state.surfaceKind !== 'graph') return rebuildAlternate();

  disposeTree(altSurface);
  altSurface = null;
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

const isTypingTarget = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');

window.addEventListener('keydown', (e) => {
  if (isTypingTarget(e.target)) {
    if (e.key === 'Enter') { e.target.blur(); applyInputs(); }
    return;
  }
  keys[e.code] = true;

  const k = e.key.toLowerCase();
  switch (k) {
    case '1': setMode(MODE_FIRST); break;
    case '2': setMode(MODE_THIRD); break;
    case '3': setMode(MODE_DRONE); break;
    case 't': player.topDown(camera); setMode(MODE_DRONE); break;
    case 'r': player.resetToDomainCentre(); break;
    case 'c': toggleCheckbox('t-contours'); break;
    case 'm': toggleCheckbox('t-heightcol'); break;
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
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(e.code)) e.preventDefault();
});

window.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

function toggleCheckbox(id) {
  const el = $(id);
  el.checked = !el.checked;
  el.dispatchEvent(new Event('change'));
}

canvas.addEventListener('mousedown', (e) => {
  if (e.button === 2) rightDown = true;
  if (!pointerLocked) canvas.requestPointerLock();
});
window.addEventListener('mouseup', (e) => { if (e.button === 2) rightDown = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

$('click-catch').addEventListener('click', () => canvas.requestPointerLock());

document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
  $('click-catch').hidden = pointerLocked;
  $('crosshair').hidden = !(pointerLocked && player && player.mode === MODE_FIRST);
});

document.addEventListener('mousemove', (e) => {
  if (!pointerLocked || !player) return;
  const dx = e.movementX || 0, dy = e.movementY || 0;

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

/* ------------------------------------------------------------ UI wiring */

function setMode(mode) {
  player.setMode(mode);
  for (const b of document.querySelectorAll('.mode')) b.classList.toggle('active', b.dataset.mode === mode);
  $('r-mode').textContent = t(mode === MODE_FIRST ? 'view.first' : mode === MODE_THIRD ? 'view.third' : 'view.drone');
  $('crosshair').hidden = !(pointerLocked && mode === MODE_FIRST);
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

  // Grey out the sections that only mean something on a graph.
  for (const id of ['sec-feasible', 'sec-map', 'sec-deriv', 'sec-curve', 'sec-zoom', 'sec-opt']) {
    const el = $(id);
    if (el) { el.style.opacity = graph ? '' : '0.4'; el.style.pointerEvents = graph ? '' : 'none'; }
  }
  for (const b of document.querySelectorAll('.mode')) b.disabled = !graph;
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
  bindCheck('t-curcurve', 'curCurve');
  bindCheck('t-curtan', 'curTangent');

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

  bindCheck('t-disc', 'disc');
  bindCheck('t-dx', 'showDx', ensureDisc);
  bindCheck('t-dy', 'showDy', ensureDisc);
  bindCheck('t-grad', 'showGrad', ensureDisc);
  bindCheck('t-tangent', 'tangent');
  bindCheck('t-dir', 'showDir', () => {
    ensureDisc();
    player.frozen = state.showDir;
    $('note-dir').hidden = !state.showDir;
    if (state.showDir) state.dirAngle = player.facing || 0;
  });

  $('in-rad').addEventListener('input', (e) => {
    state.radius = parseInt(e.target.value, 10);
    $('lbl-rad').textContent = `${state.radius} m`;
  });

  $('in-zoom').addEventListener('input', (e) => {
    // The dial reads in decades of shrinkage and starts at zero, so the
    // explorer can only ever get smaller — which is the whole point of it.
    state.zoom = Math.pow(10, -parseFloat(e.target.value));
    player.setZoom(state.zoom);
    updateZoomLabels();
  });

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

  $('sel-style').addEventListener('change', (e) => player.setStyle(e.target.value));

  $('btn-top').addEventListener('click', () => { player.topDown(camera); setMode(MODE_DRONE); });
  $('btn-reset').addEventListener('click', () => player.resetToDomainCentre());

  for (const b of document.querySelectorAll('.mode')) {
    b.addEventListener('click', () => setMode(b.dataset.mode));
  }

  updateZoomLabels();
}

function wireLanguage() {
  const sel = $('lang-select');
  for (const { code, label } of LANGUAGES) {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = label;
    sel.appendChild(opt);
  }

  setLanguage(detectLanguage());
  sel.value = getLanguage();
  sel.addEventListener('change', () => setLanguage(sel.value));

  // applyStatic() only reaches the markup. Anything the program composes for
  // itself — the mode pill, the optimum report, a visible parse error — has to
  // be rebuilt by hand, without recomputing the terrain or the optimiser.
  onLanguageChange(() => {
    sel.value = getLanguage();
    if (player) setMode(player.mode);
    updateZoomLabels();
    updateContourNote();
    renderOptimum();
    if (surface) reportStats();
    for (const id of ['err-fn', 'err-feas']) {
      if (lastError[id]) showError(id, lastError[id]);
    }
  });
}

/** Turning on an arrow implies you want the neighbourhood shown. */
function ensureDisc() {
  if (state.showDx || state.showDy || state.showGrad || state.showDir) {
    if (!state.disc) { state.disc = true; $('t-disc').checked = true; }
  }
}

function updateZoomLabels() {
  const z = state.zoom;
  const decades = -Math.log10(z);
  $('lbl-zoom').textContent = decades < 0.005 ? '1 : 1' : `1 : ${Math.round(1 / z).toLocaleString()}`;
  $('r-zoom').textContent = decades < 0.005
    ? t('hud.scale11')
    : t('hud.tall', { h: (1.8 * z).toPrecision(2) });
  updateRuler();
}

function updateRuler() {
  const el = $('ruler');
  el.innerHTML = '';
  const decades = -Math.log10(state.zoom);
  for (let i = 0; i <= 4; i++) {
    const s = document.createElement('span');
    s.textContent = i === 0 ? '1.8 m' : `10^-${i}`;
    // The dial is continuous now, so highlight the decade it is nearest to.
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

function updateHUD(readout) {
  if (state.surfaceKind !== 'graph') {
    $('r-x').textContent = '—'; $('r-y').textContent = '—'; $('r-z').textContent = '—';
    for (const k in chipEls) chipEls[k].hidden = true;
    return;
  }
  const z = player.height();
  $('r-x').textContent = fmt(player.x, 3);
  $('r-y').textContent = fmt(player.y, 3);
  $('r-z').textContent = isFinite(z) ? fmt(z, 3) : t('hud.undefined');

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

/* ------------------------------------------------------------- the loop */

// Orbit state used only when an implicit or parametric surface is on screen:
// there is nothing to stand on, so the drone simply circles it.
const altCam = { yaw: 0, pitch: -0.5, dist: 400 };

const clock = new THREE.Clock();
const curveRGB = [0, 0, 0];

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (state.surfaceKind !== 'graph') {
    const inp = readInput();
    altCam.yaw -= inp.right * dt * 1.2;
    altCam.pitch = Math.max(-1.5, Math.min(1.5, altCam.pitch + inp.up * dt * 1.2));
    altCam.dist *= Math.exp(-inp.forward * dt * (inp.sprint ? 2.2 : 0.9));
    const r = altCam.dist;
    const cp = Math.cos(altCam.pitch);
    camera.position.set(Math.sin(altCam.yaw) * cp * r, -Math.sin(altCam.pitch) * r, Math.cos(altCam.yaw) * cp * r);
    camera.lookAt(0, 0, 0);
    camera.near = Math.max(0.05, r * 1e-4);
    camera.far = r * 20;
    camera.updateProjectionMatrix();
    if (sky) sky.position.copy(camera.position);
    updateHUD(null);
    renderer.render(scene, camera);
    return;
  }

  // Teardown nulls these, and a frame can land between teardown and rebuild.
  if (!field || !player || !surfaceDetail || !gizmo) {
    renderer.render(scene, camera);
    return;
  }

  player.update(dt, readInput());
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
      showX: state.showDx,
      showY: state.showDy,
      showGrad: state.showGrad,
      showDir: state.showDir,
      dirAngle: state.dirAngle,
    });
  }

  if (state.tangent && isFinite(player.height())) {
    tangentPlane.update(player.x, player.y, state.radius * player.zoom);
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

  updateHUD(readout);
  renderer.render(scene, camera);
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
