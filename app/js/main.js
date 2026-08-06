/**
 * main.js — scene assembly, controls and the UI wiring.
 */

import * as THREE from '../vendor/three.module.js';
import { compile, compilePredicate, MathExprError } from './mathexpr.js';
import { Field, FieldGrid } from './field.js';
import {
  buildSurface, buildWater, buildFeasibleWalls, recolorSurface, SurfaceDetail,
  GROUP_OUTSIDE,
} from './terrain.js';
import { Decorations } from './decor.js';
import {
  buildContours, chooseLevels, DerivativeGizmo, TangentPlane,
  maximize, OptimumMarker,
} from './analysis.js';
import { Player, MODE_FIRST, MODE_THIRD, MODE_DRONE } from './player.js';

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
// No tone mapping on purpose: the topographic palette has to arrive on screen
// as the exact colours it was authored in, or the map legend stops matching.
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
const hemi = new THREE.HemisphereLight(0xbcd8ff, 0x6b5f4c, 2.35);
const sun = new THREE.DirectionalLight(0xfff4e2, 2.7);
sun.position.set(1, 1.4, 0.6);
scene.add(hemi, sun, sun.target);

let sky = null;

/* ------------------------------------------------------------- app state */

const state = {
  fnSrc: '(x*y)^0.5',
  feasSrc: 'x>=0 && y>=0 && x+y<=2',
  xmin: 0, xmax: 2, ymin: 0, ymax: 2,
  res: 300,
  vex: 1,
  worldSize: 220,

  feasible: false,
  isolate: false,
  contours: false,
  topo: false,
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

  zoomStep: 0,
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
let optimum = null;
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

function rebuild() {
  // --- parse first, so a typo never destroys a working scene -------------
  let fn, pred;
  try {
    fn = compile(state.fnSrc);
    $('err-fn').hidden = true;
  } catch (err) {
    showError('err-fn', err);
    return false;
  }
  try {
    pred = compilePredicate(state.feasSrc);
    pred(0, 0);
    $('err-feas').hidden = true;
  } catch (err) {
    showError('err-feas', err);
    return false;
  }

  if (!(state.xmax > state.xmin) || !(state.ymax > state.ymin)) {
    showError('err-fn', new Error('Domain is empty — check that x max > x min and y max > y min.'));
    return false;
  }

  predicate = pred;

  // --- tear the old world down ------------------------------------------
  if (surface) disposeTree(surface.mesh);
  disposeTree(water);
  disposeTree(walls);
  disposeTree(contourLines);
  if (surfaceDetail) { disposeTree(surfaceDetail.group); surfaceDetail.dispose(); }
  if (gizmo) { disposeTree(gizmo.group); gizmo.dispose(); }
  if (tangentPlane) { disposeTree(tangentPlane.mesh); tangentPlane.dispose(); }
  if (optMarker) { disposeTree(optMarker.group); optMarker.dispose(); }
  decorations.clear();
  surface = water = walls = contourLines = null;
  contourInfo = null;
  optimum = null;

  // --- sample -----------------------------------------------------------
  field = new Field({
    fn,
    xmin: state.xmin, xmax: state.xmax, ymin: state.ymin, ymax: state.ymax,
    worldSize: state.worldSize,
    vex: state.vex,
  });
  grid = new FieldGrid(field, state.res);
  field.zTop = grid.zmax;
  field.zBottom = grid.zmin;

  if (!grid.anyValid) {
    showError('err-fn', new Error('f(x,y) is undefined everywhere on this domain.'));
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
  player.setZoom(Math.pow(10, -state.zoomStep));

  applyPalette();
  applyIsolation();
  refreshContours();
  refreshOptimum();
  reportStats();
  return true;
}

function showError(elementId, err) {
  const el = $(elementId);
  const msg = err instanceof MathExprError && err.position !== undefined
    ? `${err.message} (at character ${err.position + 1})`
    : err.message || String(err);
  el.textContent = msg;
  el.hidden = false;
}

function reportStats() {
  const parts = [];
  if (surface.stats.undefinedFraction > 0.005) {
    parts.push(`f is undefined on ${Math.round(surface.stats.undefinedFraction * 100)}% of the domain`);
  }
  if (state.feasible && surface.stats.insideTris === 0) {
    parts.push('the feasible set is empty here');
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

function applyPalette() {
  if (!surface) return;
  recolorSurface(field, grid, surface.geometry, state.topo);

  // In map mode, flatten the lighting. Hypsometric tints only mean anything if
  // the colour on screen is the colour in the legend, so trade some of the
  // directional shading for fidelity to the palette.
  if (state.topo) { hemi.intensity = 3.7; sun.intensity = 1.0; }
  else { hemi.intensity = 2.35; sun.intensity = 2.7; }
  if (surfaceDetail && player) {
    surfaceDetail.update(player.x, player.y, detailExtent(), grid, state.topo, true);
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

  const picked = chooseLevels(grid.zmin, grid.zmax, 18);
  contourInfo = picked;
  contourLines = buildContours(field, grid, picked.levels || []);
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
    s.textContent = `Δz = ${fmt(contourInfo.step, 3)}`;
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
  const report = $('opt-report');
  const goto = $('btn-goto');

  if (!state.showOpt || !field) {
    if (optMarker) optMarker.setVisible(false);
    $('r-opt').hidden = true;
    goto.disabled = true;
    report.textContent = 'Maximise f over the feasible set.';
    return;
  }

  const pred = state.feasible ? predicate : () => true;
  optimum = maximize(field, pred, { coarse: 180, restarts: 8 });

  if (!optimum) {
    optMarker.setVisible(false);
    $('r-opt').hidden = true;
    goto.disabled = true;
    report.textContent = 'No feasible point found on this domain.';
    return;
  }

  optMarker.set(optimum.x, optimum.y, optimum.z);
  goto.disabled = false;

  const where = state.feasible
    ? (optimum.interior ? 'interior of the feasible set' : 'boundary of the feasible set')
    : 'domain';
  report.innerHTML =
    `max f = <b>${fmt(optimum.z, 4)}</b>\n` +
    `at (x, y) = (${fmt(optimum.x, 4)}, ${fmt(optimum.y, 4)})\n` +
    `on the ${where}\n` +
    `‖∇f‖ there = ${fmt(optimum.gradMag, 4)}`;

  const pill = $('r-opt');
  pill.textContent = `max ${fmt(optimum.z, 3)} at (${fmt(optimum.x, 2)}, ${fmt(optimum.y, 2)})`;
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
    case 'm': toggleCheckbox('t-topo'); break;
    case 'f': toggleCheckbox('t-feas'); break;
    case 'g': toggleCheckbox('t-isolate'); break;
    case 'h': toggleCheckbox('t-disc'); break;
    case 'x': toggleCheckbox('t-dx'); break;
    case 'y': toggleCheckbox('t-dy'); break;
    case 'v': toggleCheckbox('t-grad'); break;
    case 'b': toggleCheckbox('t-dir'); break;
    case 'p': toggleCheckbox('t-tangent'); break;
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
  $('r-mode').textContent = mode === MODE_FIRST ? 'First person' : mode === MODE_THIRD ? 'Third person' : 'Drone';
  $('crosshair').hidden = !(pointerLocked && mode === MODE_FIRST);
}

function togglePanel(force) {
  const p = $('panel');
  const hidden = force !== undefined ? force : !p.classList.contains('hidden');
  p.classList.toggle('hidden', hidden);
  $('panel-show').hidden = !hidden;
}

function applyInputs() {
  state.fnSrc = $('in-fn').value;
  state.feasSrc = $('in-feas').value;
  state.xmin = parseFloat($('in-xmin').value);
  state.xmax = parseFloat($('in-xmax').value);
  state.ymin = parseFloat($('in-ymin').value);
  state.ymax = parseFloat($('in-ymax').value);
  state.res = parseInt($('in-res').value, 10);
  state.vex = parseFloat($('in-vex').value);
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
  $('in-vex').addEventListener('input', (e) => { $('lbl-vex').textContent = `${parseFloat(e.target.value).toFixed(1)}×`; });
  $('in-vex').addEventListener('change', applyInputs);

  bindCheck('t-feas', 'feasible', () => {
    if (walls) walls.visible = state.feasible;
    applyIsolation();
    refreshOptimum();
  });
  bindCheck('t-isolate', 'isolate', () => { applyIsolation(); });
  bindCheck('t-contours', 'contours', refreshContours);
  bindCheck('t-topo', 'topo', applyPalette);
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
    state.zoomStep = parseInt(e.target.value, 10);
    const z = Math.pow(10, -state.zoomStep);
    player.setZoom(z);
    $('lbl-zoom').textContent = state.zoomStep === 0 ? '1 : 1' : `1 : 10^${state.zoomStep}`;
    $('r-zoom').textContent = state.zoomStep === 0
      ? 'scale 1 : 1'
      : `explorer ${(1.8 * z).toPrecision(2)} m tall`;
    updateRuler();
  });

  bindCheck('t-opt', 'showOpt', () => withLoading(refreshOptimum));

  $('btn-goto').addEventListener('click', () => {
    if (!optimum) return;
    player.x = optimum.x;
    player.y = optimum.y;
    player._camReady = false;
  });

  $('btn-top').addEventListener('click', () => { player.topDown(camera); setMode(MODE_DRONE); });
  $('btn-reset').addEventListener('click', () => player.resetToDomainCentre());

  for (const b of document.querySelectorAll('.mode')) {
    b.addEventListener('click', () => setMode(b.dataset.mode));
  }

  updateRuler();
}

/** Turning on an arrow implies you want the neighbourhood shown. */
function ensureDisc() {
  if (state.showDx || state.showDy || state.showGrad || state.showDir) {
    if (!state.disc) { state.disc = true; $('t-disc').checked = true; }
  }
}

function updateRuler() {
  const el = $('ruler');
  el.innerHTML = '';
  for (let i = 0; i <= 4; i++) {
    const s = document.createElement('span');
    s.textContent = i === 0 ? '1.8 m' : `10^-${i}`;
    if (i === state.zoomStep) s.className = 'on';
    el.appendChild(s);
  }
}

/* --------------------------------------------------------------- readout */

const chipEls = {
  dx: $('c-dx'), dy: $('c-dy'), grad: $('c-grad'), dir: $('c-dir'),
};

function setChip(el, on, label, value, avg) {
  el.hidden = !on;
  if (on) el.innerHTML = `${label} <b>${value}</b> <i>avg ${avg}</i>`;
}

function updateHUD(readout) {
  const z = player.height();
  $('r-x').textContent = fmt(player.x, 3);
  $('r-y').textContent = fmt(player.y, 3);
  $('r-z').textContent = isFinite(z) ? fmt(z, 3) : 'undefined';

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
    chipEls.dir.innerHTML =
      `D<sub>u</sub>f <b>${fmt(readout.dirSlope, 3)}</b> <i>avg ${fmt(readout.avgDir, 3)} · u at ${deg}°</i>`;
  } else {
    chipEls.dir.hidden = true;
  }
}

/* ------------------------------------------------------------- the loop */

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (!field || !player) { renderer.render(scene, camera); return; }

  player.update(dt, readInput());
  player.updateCamera(camera, dt);

  if (sky) sky.position.copy(camera.position);

  // High-resolution rings under the explorer.
  surfaceDetail.update(player.x, player.y, detailExtent(), grid, state.topo, false);

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

wireUI();
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
