/**
 * terrain.js — turns a sampled field into meshes.
 *
 * The surface itself stays exactly as smooth as f is: it is a plain triangulated
 * graph of z = f(x,y) with analytic vertex normals. Everything rugged (trees,
 * rocks, grass) is a separate object placed *on top* of it by decor.js, so from
 * a distance the mountain reads as the smooth surface it really is.
 *
 * One BufferGeometry carries the whole surface, split into two draw groups:
 * group 0 = triangles inside the feasible set, group 1 = everything else. That
 * makes "make the rest translucent" a material swap rather than a rebuild.
 */

import * as THREE from '../vendor/three.module.js';

export const GROUP_INSIDE = 0;
export const GROUP_OUTSIDE = 1;

/* ------------------------------------------------------------- colouring */

/* ------------------------------------------------------------------ noise */

/**
 * Coherent value noise, sampled in world metres.
 *
 * Sampling in *world space* rather than per grid index is what makes the
 * colouring hold together: the main mesh and the detail patches disagree about
 * indices but agree about position, so they produce identical colours and the
 * seam between them disappears. It is also smooth by construction, where a
 * per-vertex hash produced visible static as soon as you stood close enough to
 * resolve individual vertices.
 */
function nhash(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Quintic fade: continuous first derivative, so no creases along cell edges.
function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }

function valueNoise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const ux = fade(x - ix), uy = fade(y - iy);
  const a = nhash(ix, iy, seed), b = nhash(ix + 1, iy, seed);
  const c = nhash(ix, iy + 1, seed), d = nhash(ix + 1, iy + 1, seed);
  const top = a + (b - a) * ux;
  const bot = c + (d - c) * ux;
  return top + (bot - top) * uy;
}

/**
 * Fractal noise in [0,1]. `scale` is the size of the largest feature in metres.
 *
 * Octave count is explicit because the finest octave has to stay comfortably
 * larger than the mesh spacing — detail finer than the triangles carrying it
 * aliases straight back into the per-vertex speckle this replaced.
 */
function fbm(wx, wz, scale, seed, octaves) {
  let f = 1 / scale, amp = 1, sum = 0, norm = 0;
  const n = octaves || 3;
  for (let o = 0; o < n; o++) {
    sum += amp * valueNoise(wx * f, wz * f, seed + o * 101);
    norm += amp;
    amp *= 0.5;
    f *= 2.13; // irrational-ish, to avoid octaves lining up into a grid
  }
  return sum / norm;
}

function smoothstep(a, b, t) {
  const u = Math.min(1, Math.max(0, (t - a) / (b - a || 1e-9)));
  return u * u * (3 - 2 * u);
}

function mix(a, b, t) { return a + (b - a) * t; }

function mixRGB(c1, c2, t, out) {
  out[0] = mix(c1[0], c2[0], t);
  out[1] = mix(c1[1], c2[1], t);
  out[2] = mix(c1[2], c2[2], t);
  return out;
}

/**
 * The height ramp: ten colours, interpolated continuously by normalised
 * height. This is the palette a heat map or a physical relief map uses, and it
 * drives both the contour paths and — when the height-colour toggle is on —
 * the whole surface, so the two always agree.
 */
const HEIGHT_RAMP = [
  [0.000, 0.427, 0.173],  // (0,109,44)     deepest
  [0.192, 0.639, 0.329],  // (49,163,84)
  [0.455, 0.769, 0.463],  // (116,196,118)
  [0.729, 0.894, 0.702],  // (186,228,179)
  [0.929, 0.973, 0.914],  // (237,248,233)
  [1.000, 1.000, 0.698],  // (255,255,178)
  [0.996, 0.800, 0.361],  // (254,204,92)
  [0.992, 0.553, 0.235],  // (253,141,60)
  [0.941, 0.231, 0.125],  // (240,59,32)
  [0.741, 0.000, 0.149],  // (189,0,38)     highest
];

/** Continuous interpolation along HEIGHT_RAMP. `h` is normalised height. */
export function heightColor(h, out) {
  const t = Math.min(1, Math.max(0, h)) * (HEIGHT_RAMP.length - 1);
  const i = Math.min(HEIGHT_RAMP.length - 2, Math.floor(t));
  return mixRGB(HEIGHT_RAMP[i], HEIGHT_RAMP[i + 1], t - i, out);
}

/**
 * The heat map: blue → cyan → green → yellow → red, low to high.
 *
 * This is the ramp on every heat map a student has ever met, and it is the one
 * the level curves are drawn in — everywhere, in the scene and on the flat map
 * alike. The topographic ramp above is a picture of *ground*, and its whole
 * point is that it changes slowly: a hillside spanning a hundred metres of a
 * five-hundred-metre window is one shade of green from bottom to top, so
 * contours drawn in it come out all the same colour and vanish into the grass.
 * The heat ramp spends its whole range on whatever range the window has, which
 * is what makes a set of level curves readable as a set: you can see at a
 * glance which way is up, and how far apart in height two curves are, without
 * reading a single label.
 *
 * Deliberately not the same ramp as the ground, then. A level curve is a
 * mathematical object drawn *on* the terrain, not a feature of it, and it
 * should not be camouflaged by the thing it is drawn on.
 */
const HEAT_RAMP = [
  [0.19, 0.22, 0.62],   // deep blue
  [0.13, 0.62, 0.75],   // cyan
  [0.35, 0.76, 0.35],   // green
  [0.96, 0.85, 0.24],   // yellow
  [0.85, 0.20, 0.15],   // red
];

export function heatColor(h, out) {
  const t = Math.min(1, Math.max(0, h)) * (HEAT_RAMP.length - 1);
  const i = Math.min(HEAT_RAMP.length - 2, Math.floor(t));
  return mixRGB(HEAT_RAMP[i], HEAT_RAMP[i + 1], t - i, out);
}

/**
 * The qualitative gradient: eight terrain characters, low to high.
 *
 *   1 water   2 beach   3 deep vegetation   4 light vegetation
 *   5 arid    6 volcanic rock   7 snow   8 cloud
 *
 * Each band has a colour here and a population of scenery in decor.js, and both
 * are blended continuously rather than switched, so one character gives way to
 * the next the way a real mountainside does. Deliberately bright: these are
 * albedos, and a muddy albedo under a soft sky reads as grey mush.
 */
const BAND_WATER = [0.13, 0.42, 0.55];    // lake bed seen through the water
const BAND_BEACH = [0.95, 0.89, 0.66];    // pale sand
const BAND_VEG_DEEP = [0.15, 0.47, 0.17];
const BAND_VEG_LIGHT = [0.55, 0.78, 0.29];
const BAND_ARID = [0.82, 0.55, 0.34];     // Utah / Atacama red-tan
const BAND_VOLCANIC = [0.76, 0.69, 0.30]; // sulphur yellow over rock
const BAND_SNOW = [0.98, 0.98, 1.00];
const BAND_CLOUD = [0.96, 0.97, 1.00];

const BANDS = [
  BAND_WATER, BAND_BEACH, BAND_VEG_DEEP, BAND_VEG_LIGHT,
  BAND_ARID, BAND_VOLCANIC, BAND_SNOW, BAND_CLOUD,
];

// Where each band sits on the normalised height axis. Not evenly spaced: the
// vegetated middle is where the eye spends its time, so it gets more room.
// Two climates, same bands. The positions say at what normalised height each
// band is centred, and that is a fact about a climate, not about terrain in
// general. The temperate profile is the one the app has always had. The
// alpine profile is for a surface that really is a glaciated coastal massif:
// vegetation gives out a twentieth of the way up (treeline near Icy Bay is a
// few hundred metres, the summit is 5.4 km), bare rock and moraine take over,
// and everything above roughly a fifth of the relief is ice and snow — with
// the snow-rock band scattering dark boulders across it, which is what the
// nunataks of a real icefield look like from the air.
// The desert profile is for the border mountains of the Sahara and the
// Arabian sandstone — Bikku Bitti, Jabal Umm ad Dami. Nothing grows: the
// vegetated bands are squeezed into the very bottom of the range, arid rock
// takes almost the whole mountain, and the snow band is pushed above the
// summit so it never appears at all. It is the same eight bands; only where
// they sit changes, because that is what a climate is.
const PROFILES = {
  temperate: [0.00, 0.10, 0.22, 0.40, 0.56, 0.70, 0.84, 1.00],
  alpine: [0.00, 0.008, 0.025, 0.055, 0.085, 0.115, 0.155, 0.90],
  desert: [0.00, 0.02, 0.05, 0.09, 0.20, 0.55, 1.30, 1.60],
  // A two-thousand-metre border peak in the Cascades or the northern Rockies:
  // timber up the lower flanks, scree and rock above it, snow on the top third.
  // The cloud band is pushed past the top of the range on purpose — cloud is a
  // fact about absolute altitude, and a summit that would be under the cloud
  // base in life should not be wearing one here.
  peak: [0.00, 0.03, 0.13, 0.36, 0.50, 0.62, 0.76, 1.40],
  // Coastal chaparral: Otay and Tecate are a thousand metres of dry scrub in a
  // Mediterranean climate. Nothing above them is ever white.
  chaparral: [0.00, 0.04, 0.12, 0.32, 0.58, 0.82, 1.25, 1.60],
};
/**
 * Colours a climate substitutes for the shared ones.
 *
 * The two stony bands are the ones that give a climate away. Utah red-tan and
 * sulphur yellow are right over a desert and quite wrong on a Cascades ridge,
 * where the ground between the treeline and the snow is grey scree and grey
 * granite. Same eight bands, same positions machinery — only the pigment
 * changes, which is the smallest honest way to say "this is a different kind
 * of mountain".
 */
// Dark on purpose. These are albedos, and they are lit by a bright sky and a
// bright sun; picked at the value granite *looks* on a screen, they come back
// out of the lighting almost white, and a mountain whose rock is as bright as
// its snow has no shape at all — it reads as haze. Real granite reflects about
// a fifth of the light that falls on it, wet scree less.
const SCREE_GREY = [0.33, 0.31, 0.29];
const GRANITE_GREY = [0.38, 0.39, 0.42];
const BAND_TINTS = {
  peak: { 4: SCREE_GREY, 5: GRANITE_GREY },
  alpine: { 4: SCREE_GREY, 5: GRANITE_GREY },
};

let BAND_AT = PROFILES.temperate;
let BAND_RGB = BANDS;

/** Choose which climate the bands describe. Takes effect on the next build. */
export function setBiomeProfile(name) {
  BAND_AT = PROFILES[name] || PROFILES.temperate;
  const tint = BAND_TINTS[name];
  BAND_RGB = tint ? BANDS.map((b, i) => tint[i] || b) : BANDS;
}

/* ------------------------------------------------- surveyed land cover */

/**
 * When the ground is a real place, stop guessing what grows on it.
 *
 * Everything above infers vegetation from height: a band ramp says this
 * fraction of the relief is forest, that fraction is scree. For an invented
 * function that is the only thing available and it is a good story. For a
 * surveyed square kilometre it is a worse story than the survey, which knows
 * at ten metres whether a patch is trees, scrub, dry grass, bare or paved.
 *
 * So a surface may hand in a land-cover source — a function of *world*
 * coordinates returning an ESA WorldCover class — and the colour comes from
 * that instead of from the height bands. The height-driven texture stays:
 * noise, mottling and the bare rock that steep ground sheds are all still
 * true, and are what stop the result looking like a classified raster.
 *
 * COVER_RGB is keyed by the ESA class code, so the numbers here are the
 * numbers in the published legend and can be checked against it.
 */
// Two tones a class, not one.
//
// A single colour per class paints the hillside in flat blocks, and under a
// strong sky light flat blocks read as a milky wash rather than as ground —
// which is what made a perfectly smooth surface look like a haze with nothing
// in it. Every class therefore carries its dry, pale extreme and its lush,
// dark one, and the vegetation noise field mixes between them. That is not
// invention on top of the survey: the survey says "this ten metres is
// matorral", and matorral in a Santiago summer really is straw-gold on the
// sun-facing ribs and dark green in the gullies. The class is data; where
// within the class a patch sits is texture.
const COVER_A = {                            // dry, pale, sun-facing
  10: [0.24, 0.34, 0.16],   // tree cover
  20: [0.56, 0.47, 0.27],   // shrubland — matorral, straw-gold in late summer
  30: [0.64, 0.56, 0.31],   // grassland, dry for most of the year here
  40: [0.50, 0.51, 0.24],   // cropland
  50: [0.58, 0.55, 0.50],   // built-up: roofs, tarmac and courtyards
  60: [0.62, 0.53, 0.40],   // bare / sparse vegetation
  70: [0.96, 0.97, 0.99],   // snow and ice
  80: [0.21, 0.40, 0.50],   // permanent water
  90: [0.38, 0.46, 0.30],   // herbaceous wetland
  95: [0.26, 0.38, 0.24],   // mangroves
  100: [0.62, 0.63, 0.47],  // moss and lichen
};
const COVER_B = {                            // lush, dark, shaded
  10: [0.09, 0.19, 0.08],
  20: [0.28, 0.31, 0.17],
  30: [0.41, 0.42, 0.22],
  40: [0.24, 0.36, 0.14],
  50: [0.33, 0.31, 0.30],
  60: [0.40, 0.34, 0.27],
  70: [0.84, 0.87, 0.93],
  80: [0.09, 0.22, 0.32],
  90: [0.22, 0.33, 0.22],
  95: [0.15, 0.27, 0.18],
  100: [0.44, 0.48, 0.34],
};

let coverSource = null;
/** @param fn (wx, wz) -> ESA class code, or null to go back to the bands. */
export function setCoverSource(fn) { coverSource = fn || null; }
export function hasCoverSource() { return !!coverSource; }

/**
 * ...and when there is a photograph of the ground, use the photograph.
 *
 * A land-cover class is a statement about a ten-metre square: this one is
 * scrub. A satellite image is the square itself. Where one exists it is the
 * better albedo, and the only thing worth keeping from the synthetic treatment
 * is the bare rock that steep ground sheds — the image already contains its own
 * illumination, and piling the band ramps, the lichen and the snow line on top
 * of a photograph would be painting over the evidence.
 *
 * @param fn (wx, wz, out[3]) -> out in LINEAR rgb, or null if outside the image
 */
let satSource = null;
export function setSatelliteSource(fn) { satSource = fn || null; }
export function hasSatelliteSource() { return !!satSource; }

/**
 * ...and when the photograph can be a *texture*, let the graphics card sample
 * it instead of the CPU.
 *
 * Vertex colours are the right tool for everything else here, because
 * everything else is a function of position that we can evaluate anywhere. A
 * photograph is not: it is a fixed raster, and painting it through vertex
 * colours ties how much of it you can see to how many triangles the surface
 * happens to have. On the campus that is the difference between a picture of a
 * university and a wash of grey-green — the mesh is three hundred squares
 * across, the image was ten metres a pixel, and between the two the buildings
 * disappeared.
 *
 * With a texture the drape is resampled per *pixel of the screen*, with
 * mipmaps and anisotropic filtering, so walking towards a roof shows more of
 * the roof rather than more of the mesh. The vertex colours are still there and
 * still multiply in — they carry the shading (the fine ground modulation, the
 * bare rock on steep faces) — but the photograph itself now comes from the map.
 *
 * @param tex a THREE.Texture already set up with the right offset/repeat for
 *            the current domain window, or null for every other surface
 */
let groundTexture = null;
export function setGroundTexture(tex) { groundTexture = tex || null; }
export function hasGroundTexture() { return !!groundTexture; }

/**
 * Whether this climate has cloud in it at all.
 *
 * Cloud is a fact about absolute altitude, not about a fraction of the local
 * relief: a 2 400 m border peak in the Cascades stands below the cloud base
 * on a fine day, and putting a puff on its summit because the summit is the
 * top of *this window* is simply wrong. A profile that parks its cloud band
 * above the top of the normalised range is saying "no cloud here", and the
 * decoration honours that rather than interpolating a little of it anyway.
 */
export function cloudsPossible() { return BAND_AT[7] <= 1.02; }

export const BAND_COUNT = BANDS.length;

/**
 * How strongly band `i` is present at normalised height `h`.
 * A tent function over the neighbouring stops — the same weights decor.js uses
 * to decide how often to plant a tree or drop a boulder, so the scenery and the
 * colour always agree about what kind of ground this is.
 */
export function bandWeight(i, h) {
  const c = BAND_AT[i];
  const lo = i > 0 ? BAND_AT[i - 1] : c - 0.12;
  const hi = i < BAND_AT.length - 1 ? BAND_AT[i + 1] : c + 0.12;
  if (h <= lo || h >= hi) return 0;
  return h < c ? (h - lo) / (c - lo) : (hi - h) / (hi - c);
}

// Rock families still vary the high ground, so a summit is not one grey slab.
const ROCK_COOL = [0.62, 0.62, 0.64];   // grey granite
const ROCK_WARM = [0.78, 0.60, 0.42];   // ochre sandstone
const ROCK_DARK = [0.40, 0.37, 0.36];   // dark basalt
const LICHEN = [0.58, 0.65, 0.40];

const ROCK_TMP = [0, 0, 0];

/** Two rock families blended over a long wavelength, plus strata banding. */
function rockTint(macro, meso, h, rugged, out) {
  mixRGB(ROCK_COOL, ROCK_WARM, smoothstep(0.30, 0.78, macro), out);
  mixRGB(out, ROCK_DARK, smoothstep(0.58, 0.95, meso) * 0.55, out);

  const strata = 0.5 + 0.5 * Math.sin(h * 52 + macro * 7.0);
  const k = 1 + (strata - 0.5) * 0.20 * rugged;
  out[0] *= k; out[1] *= k; out[2] *= k;
  return out;
}

/**
 * Surface colour under the qualitative gradient.
 *
 * @param h      normalised height in [0,1]
 * @param z      raw height (so the waterline at z = 0 means something)
 * @param slope  |grad f| divided by the surface's median slope (1 = typical)
 * @param wx,wz  world position in metres, used to sample the noise fields
 */
export function biomeColor(h, z, slope, wx, wz, out) {
  // Four scales, because terrain varies at all of them. Without the finest one
  // a hillside seen from eye level spans less than a single noise feature and
  // reads as one flat wash of colour.
  const macro = fbm(wx, wz, 62, 17);        // which soil / rock: tens of metres
  const meso = fbm(wx, wz, 15, 91);         // mottling within it
  const veg = fbm(wx, wz, 31, 211);         // meadow / woodland patchiness
  const fine = fbm(wx, wz, 7, 331, 2);      // ground texture at walking range

  const steep = smoothstep(1.35, 3.2, slope);
  const rugged = Math.min(1, 0.60 * smoothstep(0.70, 2.60, slope)
                           + 0.40 * smoothstep(0.45, 0.95, h));

  // Let the band boundaries wander instead of tracking the level curves
  // exactly — nothing in nature changes colour along a contour, and a band that
  // does is the giveaway that you are looking at a plot rather than a place.
  const t = Math.min(1, Math.max(0, h + (macro - 0.5) * 0.11 + (meso - 0.5) * 0.045));

  // Blend the two bands `t` falls between — unless the ground was surveyed,
  // in which case take the class the survey recorded.
  //
  // The lookup is jittered by the finest noise field before it is taken. That
  // is not decoration: the raster is ten metres a cell and the mesh is finer
  // than that, so an unjittered read would draw the cell boundaries as a
  // staircase across the hillside. Dithering the sample turns the staircase
  // into an interlocking edge of the two classes, which is both prettier and
  // more honest — the boundary between scrub and grass is not a straight line
  // ten metres long.
  const painted = satSource && satSource(wx, wz, out);
  if (painted) {
    // When the photograph is a texture the map carries it, and these vertex
    // colours are the shading that multiplies into it: start from white and
    // let the modulation below do its work. Painting the photograph *here* as
    // well would apply it twice and square the image.
    if (groundTexture) { out[0] = 1; out[1] = 1; out[2] = 1; }
    // A ten-metre pixel is coarser than the mesh, so neighbouring vertices
    // share one colour and the ground reads as flat facets of photograph. The
    // finest noise field breaks that up by a couple of per cent — far too
    // little to invent anything, enough to stop the pixel grid showing.
    const g = 1 + (fine - 0.5) * 0.06;
    out[0] *= g; out[1] *= g; out[2] *= g;
  } else if (coverSource) {
    const cls = coverSource(wx + (fine - 0.5) * 9, wz + (veg - 0.5) * 9);
    const a = COVER_A[cls] || COVER_A[30];
    const b = COVER_B[cls] || COVER_B[30];
    // Where within the class this patch sits: the vegetation field for the
    // large pattern, the fine field to break its edges.
    mixRGB(a, b, smoothstep(0.22, 0.78, veg * 0.72 + fine * 0.28), out);
  } else {
    let i = 0;
    while (i < BAND_AT.length - 2 && t > BAND_AT[i + 1]) i++;
    const span = BAND_AT[i + 1] - BAND_AT[i] || 1e-6;
    mixRGB(BAND_RGB[i], BAND_RGB[i + 1], (t - BAND_AT[i]) / span, out);
  }

  // Anything actually below the waterline is lake bed, whatever the band says.
  if (z < 0) mixRGB(out, BAND_WATER, 0.75, out);

  // The vegetation bands break into patches of lighter and darker growth.
  // Under a survey the class already says what grows here, so the band-derived
  // patchiness would be a second opinion nobody asked for: mottle the class
  // colour instead, which keeps the texture without overruling the data.
  const vegetated = (coverSource || painted) ? 0 : bandWeight(2, t) + bandWeight(3, t);
  if (vegetated > 0.01) {
    mixRGB(out, BAND_VEG_LIGHT, smoothstep(0.35, 0.85, veg) * 0.35 * vegetated, out);
    mixRGB(out, BAND_VEG_DEEP, smoothstep(0.55, 0.95, meso) * 0.35 * vegetated, out);
  }

  // Steep ground sheds soil at any height: it goes to bare rock. Kept even
  // under a photograph, but at a third of the strength: the image knows what
  // colour the crag is, and this only keeps the form readable where the ten
  // metre pixel cannot resolve the face.
  if (steep > 0.001 && painted) {
    mixRGB(out, rockTint(macro, meso, h, rugged, ROCK_TMP), steep * 0.24, out);
  } else if (steep > 0.001) {
    mixRGB(out, rockTint(macro, meso, h, rugged, ROCK_TMP), steep * 0.72, out);
  }

  // Lichen colonises the gentler faces of the arid and volcanic bands.
  const stony = (coverSource || painted) ? 0 : bandWeight(4, t) + bandWeight(5, t);
  const lichen = smoothstep(0.62, 0.92, meso) * (1 - steep * 0.6) * stony * 0.28;
  if (lichen > 0.001) mixRGB(out, LICHEN, lichen, out);

  // Snow lies in patches, and only where it can settle — starting at the
  // snowline this climate actually has. That used to be hardcoded at 0.80 of
  // the relief whatever the profile said, so a climate could place its snow
  // band two thirds of the way up and still get snow only on the last fifth:
  // the mountains came out green to the shoulders. A profile that parks its
  // snow band above the top of the range still gets none, which is what a
  // thousand metres of Baja chaparral should get.
  //
  // Patchy, not a gradient. A wide ramp with a little noise on it produces a
  // smooth wash of white that reads as haze over the whole upper mountain; a
  // *narrow* ramp with a lot of noise on it produces what a snowline actually
  // looks like — fingers of snow reaching down the gullies, bare rock standing
  // out of it on the ribs, and the two interleaved for hundreds of metres
  // rather than a line drawn round the peak. Steep ground sheds it.
  // ...and where the ground was surveyed, snow is not a matter of opinion
  // either: the class raster puts it where it was, which on a Santiago
  // hillside in the growing season is nowhere.
  const snowAt = BAND_AT[6];
  const drift = (meso - 0.5) * 0.30 + (macro - 0.5) * 0.20 + (fine - 0.5) * 0.06;
  const snow = (coverSource || painted) ? 0 : smoothstep(snowAt - 0.02, snowAt + 0.06,
    t + drift - steep * 0.16);
  if (snow > 0.001) mixRGB(out, BAND_SNOW, snow, out);

  // Brightness variation — subtle on gentle ground, strong on tough.
  const amp = painted ? 0.03 : 0.11 + 0.30 * rugged;
  const swing = (fine - 0.5) * 0.40 + (meso - 0.5) * 0.35 + (macro - 0.5) * 0.25;
  const shade = 1 + swing * 2 * amp;
  out[0] *= shade; out[1] *= shade; out[2] *= shade;
  return out;
}

/* --------------------------------------------------------- surface build */

/**
 * Build the main surface mesh from a FieldGrid.
 * Returns { mesh, geometry, materials, stats } — stats reports how much of the
 * domain was undefined (NaN), which the UI surfaces to the student.
 */
export function buildSurface(field, grid, predicate) {
  const { n, w } = grid;
  const vcount = w * w;

  const positions = new Float32Array(vcount * 3);
  const normals = new Float32Array(vcount * 3);
  const colors = new Float32Array(vcount * 3);
  // The domain, mapped to the unit square. Always written, whether or not
  // anything is textured today: it costs two floats a vertex, it is the only
  // parameterisation of a graph that means anything, and having it there means
  // a drape can be hung on the surface without rebuilding it.
  const uvs = new Float32Array(vcount * 2);
  const uSpan = (field.xmax - field.xmin) || 1;
  const vSpan = (field.ymax - field.ymin) || 1;

  const nrm = new THREE.Vector3();
  const rgb = [0, 0, 0];
  const grad = [0, 0];

  for (let j = 0; j <= n; j++) {
    const yy = grid.y(j);
    for (let i = 0; i <= n; i++) {
      const k = j * w + i;
      const xx = grid.x(i);
      const z = grid.valid[k] ? grid.z[k] : 0;

      const px = field.worldX(xx), pz = field.worldZ(yy);
      positions[k * 3] = px;
      positions[k * 3 + 1] = field.worldY(z);
      positions[k * 3 + 2] = pz;
      uvs[k * 2] = (xx - field.xmin) / uSpan;
      uvs[k * 2 + 1] = (yy - field.ymin) / vSpan;

      // One gradient per vertex, reused for both the normal and the slope.
      grid.gradientAt(i, j, grad);
      field.normalFromGrad(grad[0], grad[1], nrm);
      normals[k * 3] = nrm.x; normals[k * 3 + 1] = nrm.y; normals[k * 3 + 2] = nrm.z;

      const slope = isFinite(grad[0]) && isFinite(grad[1])
        ? Math.hypot(grad[0], grad[1]) / grid.slopeRef : 0;
      biomeColor(grid.landNorm(z), z, slope, px, pz, rgb);
      colors[k * 3] = rgb[0]; colors[k * 3 + 1] = rgb[1]; colors[k * 3 + 2] = rgb[2];
    }
  }

  // Triangulate, dropping any cell that touches an undefined sample, and
  // sorting each cell into the inside / outside group.
  const inside = [];
  const outside = [];
  let cellsTotal = 0, cellsDropped = 0;

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      cellsTotal++;
      const a = j * w + i, b = j * w + i + 1, c = (j + 1) * w + i, d = (j + 1) * w + i + 1;
      if (!(grid.valid[a] && grid.valid[b] && grid.valid[c] && grid.valid[d])) { cellsDropped++; continue; }

      const cxm = (grid.x(i) + grid.x(i + 1)) / 2;
      const cym = (grid.y(j) + grid.y(j + 1)) / 2;
      const target = predicate(cxm, cym) ? inside : outside;

      // Winding chosen so the surface faces up in world space.
      target.push(a, c, b, b, c, d);
    }
  }

  const index = new Uint32Array(inside.length + outside.length);
  index.set(inside, 0);
  index.set(outside, inside.length);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.addGroup(0, inside.length, GROUP_INSIDE);
  geometry.addGroup(inside.length, outside.length, GROUP_OUTSIDE);
  geometry.computeBoundingSphere();

  const matInside = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.95, metalness: 0.0, side: THREE.DoubleSide,
    map: groundTexture,
  });
  const matOutside = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.95, metalness: 0.0, side: THREE.DoubleSide,
    map: groundTexture,
  });

  const mesh = new THREE.Mesh(geometry, [matInside, matOutside]);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.name = 'surface';

  return {
    mesh,
    geometry,
    materials: [matInside, matOutside],
    stats: {
      cellsTotal,
      cellsDropped,
      insideTris: inside.length / 3,
      outsideTris: outside.length / 3,
      undefinedFraction: cellsTotal ? cellsDropped / cellsTotal : 0,
    },
  };
}

/** Recolour an existing surface in place (topographic <-> realistic). */
export function recolorSurface(field, grid, geometry, palette) {
  const colors = geometry.getAttribute('color');
  const arr = colors.array;
  const { n, w } = grid;
  const rgb = [0, 0, 0];
  const grad = [0, 0];

  for (let j = 0; j <= n; j++) {
    const yy = grid.y(j);
    for (let i = 0; i <= n; i++) {
      const k = j * w + i;
      const z = grid.valid[k] ? grid.z[k] : 0;
      if (palette === 'height') {
        heightColor(grid.norm(z), rgb);
      } else {
        grid.gradientAt(i, j, grad);
        const slope = isFinite(grad[0]) && isFinite(grad[1])
          ? Math.hypot(grad[0], grad[1]) / grid.slopeRef : 0;
        biomeColor(grid.landNorm(z), z, slope, field.worldX(grid.x(i)), field.worldZ(yy), rgb);
      }
      arr[k * 3] = rgb[0]; arr[k * 3 + 1] = rgb[1]; arr[k * 3 + 2] = rgb[2];
    }
  }
  colors.needsUpdate = true;
}

/* ------------------------------------------------------------------ water */

/**
 * A translucent sheet at z = 0 filling every depression. Only built when the
 * function actually goes below zero.
 */
export function buildWater(field, grid) {
  if (grid.zmin >= 0) return null;

  const geom = new THREE.PlaneGeometry(
    (field.xmax - field.xmin) * field.S,
    (field.ymax - field.ymin) * field.S,
    1, 1,
  );
  geom.rotateX(-Math.PI / 2);

  const mat = new THREE.MeshStandardMaterial({
    color: 0x2e6f9e,
    transparent: true,
    opacity: 0.62,
    roughness: 0.12,
    metalness: 0.25,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(field.worldX(field.cx), field.worldY(0), field.worldZ(field.cy));
  mesh.renderOrder = 1;
  mesh.name = 'water';
  return mesh;
}

/* ---------------------------------------------------- feasible-set walls */

/**
 * Bright walls standing on the boundary of the feasible set — "the frontiers of
 * the country". Built by walking the sample grid and emitting a quad wherever
 * two neighbouring cells disagree about membership.
 */
export function buildFeasibleWalls(field, grid, predicate, heightMetres) {
  const { n, w } = grid;
  const wallH = heightMetres ?? field.worldSize * 0.042;

  const cellIn = new Uint8Array(n * n);
  const cellOk = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * w + i, b = j * w + i + 1, c = (j + 1) * w + i, d = (j + 1) * w + i + 1;
      const ok = grid.valid[a] && grid.valid[b] && grid.valid[c] && grid.valid[d];
      cellOk[j * n + i] = ok ? 1 : 0;
      cellIn[j * n + i] = ok && predicate((grid.x(i) + grid.x(i + 1)) / 2, (grid.y(j) + grid.y(j + 1)) / 2) ? 1 : 0;
    }
  }

  const pos = [];
  const col = [];
  const idx = [];
  const base = new THREE.Color(0x59f7d6);
  const top = new THREE.Color(0xeafffb);

  const pushEdge = (i0, j0, i1, j1) => {
    // Two grid corners define the foot of the wall; extrude straight up.
    const k0 = j0 * w + i0, k1 = j1 * w + i1;
    if (!grid.valid[k0] || !grid.valid[k1]) return;

    const x0 = field.worldX(grid.x(i0)), z0 = field.worldZ(grid.y(j0)), y0 = field.worldY(grid.z[k0]);
    const x1 = field.worldX(grid.x(i1)), z1 = field.worldZ(grid.y(j1)), y1 = field.worldY(grid.z[k1]);

    const v = pos.length / 3;
    pos.push(x0, y0, z0, x1, y1, z1, x1, y1 + wallH, z1, x0, y0 + wallH, z0);
    col.push(base.r, base.g, base.b, base.r, base.g, base.b, top.r, top.g, top.b, top.r, top.g, top.b);
    idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
  };

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const here = cellIn[j * n + i];
      if (!here) continue;

      const left = i > 0 ? cellIn[j * n + i - 1] : 0;
      const right = i < n - 1 ? cellIn[j * n + i + 1] : 0;
      const down = j > 0 ? cellIn[(j - 1) * n + i] : 0;
      const up = j < n - 1 ? cellIn[(j + 1) * n + i] : 0;

      if (!left) pushEdge(i, j, i, j + 1);
      if (!right) pushEdge(i + 1, j, i + 1, j + 1);
      if (!down) pushEdge(i, j, i + 1, j);
      if (!up) pushEdge(i, j + 1, i + 1, j + 1);
    }
  }

  if (idx.length === 0) return null;

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geom.setIndex(idx);
  geom.computeBoundingSphere();

  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    // Additive, so standing inside a wall should not white out the screen.
    opacity: 0.42,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    fog: false,
  });

  const mesh = new THREE.Mesh(geom, mat);
  mesh.renderOrder = 3;
  mesh.name = 'feasible-walls';
  return mesh;
}

/* ------------------------------------------------------------ local patch */

/**
 * Nested, finely-sampled sheets that follow the player.
 *
 * Two jobs. First, close-range smoothness: the global mesh is sized to cover the
 * whole domain, so at eye level its cells are metres across and the ground reads
 * as facets. These rings re-sample f around the explorer at a spacing measured
 * in centimetres, and each successive ring is a few times wider and proportionally
 * coarser, which buys detail underfoot and coverage out to the middle distance
 * for a fixed vertex budget.
 *
 * Second, the zoom demonstration: without them, shrinking the character to 10^-4
 * would park them on one enormous flat triangle and the surface would look
 * linear for entirely the wrong reason. The rings re-sample at the current zoom,
 * so what flattens out is the actual function.
 */
export class SurfaceDetail {
  /**
   * @param rings     how many nested squares; each is `growth` times wider than
   *                  the last, so a fixed vertex budget buys detail where the
   *                  eye is and coverage where it is not
   * @param segments  grid resolution of every ring
   */
  constructor(field, options) {
    const o = options || {};
    this.field = field;
    this.seg = o.segments ?? 96;
    this.growth = o.growth ?? 3.4;
    this.extent = 0;
    this.topographic = false;
    this.topLift = 0;

    this.group = new THREE.Group();
    this.group.name = 'surface-detail';
    this.rings = [];

    const count = o.rings ?? 2;
    for (let r = 0; r < count; r++) this.rings.push(this._makeRing(r, count));
    for (const ring of this.rings) this.group.add(ring.mesh);
  }

  _makeRing(index, count) {
    const seg = this.seg;
    const w = seg + 1;

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(w * w * 3), 3));
    geom.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(w * w * 3), 3));
    geom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(w * w * 3), 3));
    // Rewritten every time the ring moves, exactly like the positions: a ring
    // is a window that slides over the domain, so its parameterisation slides
    // with it or the drape would swim under the explorer's feet.
    geom.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(w * w * 2), 2));

    const idx = [];
    for (let j = 0; j < seg; j++) {
      for (let i = 0; i < seg; i++) {
        const a = j * w + i, b = j * w + i + 1, c = (j + 1) * w + i, d = (j + 1) * w + i + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    geom.setIndex(idx);

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0.0,
      side: THREE.DoubleSide,
      map: groundTexture,
      polygonOffset: true,
      // Finer rings win over coarser ones and over the main mesh.
      polygonOffsetFactor: -4 * (count - index),
      polygonOffsetUnits: -8 * (count - index),
    });

    const mesh = new THREE.Mesh(geom, material);
    mesh.name = `surface-detail-${index}`;
    mesh.frustumCulled = false;
    mesh.visible = false;
    // Innermost ring draws last, so it is the one you see underfoot.
    mesh.renderOrder = index;

    return {
      index,
      mesh,
      geometry: geom,
      material,
      z: new Float32Array(w * w),
      extent: 0,
      cx: NaN,
      cy: NaN,
    };
  }

  /**
   * @param baseExtent half-width of the innermost ring, in math units
   */
  update(cx, cy, baseExtent, grid, topographic, force) {
    const paletteChanged = topographic !== this.topographic;
    this.topographic = topographic;
    this.extent = baseExtent;

    for (const ring of this.rings) {
      const extent = baseExtent * Math.pow(this.growth, ring.index);
      // Each ring only rebuilds on its own terms: the small one follows every
      // few steps, the large one hardly ever.
      const moved = !isFinite(ring.cx) || Math.hypot(cx - ring.cx, cy - ring.cy) > extent * 0.22;
      const resized = Math.abs(extent - ring.extent) > extent * 1e-3;
      if (force || moved || resized || paletteChanged) {
        this._buildRing(ring, cx, cy, extent, grid, topographic);
      }
    }

    // How far the rings float above the mathematical surface.
    //
    // Everything drawn *on* the ground — the neighbourhood disc, the arrows,
    // the tangent plane — has to clear the rings, not the surface, or a ring
    // quietly covers it and the student sees nothing. Publishing the number is
    // better than every overlay guessing at it: this is precisely why the disc
    // and the arrows used to disappear on a gentle slope.
    let top = 0;
    for (const ring of this.rings) {
      if (ring.mesh.visible && ring.mesh.position.y > top) top = ring.mesh.position.y;
    }
    this.topLift = top;
  }

  _buildRing(ring, cx, cy, extent, grid, topographic) {
    ring.cx = cx; ring.cy = cy; ring.extent = extent;

    const field = this.field;
    const seg = this.seg;
    const w = seg + 1;
    const step = (2 * extent) / seg;

    const pos = ring.geometry.getAttribute('position');
    const nor = ring.geometry.getAttribute('normal');
    const colAttr = ring.geometry.getAttribute('color');
    const uvAttr = ring.geometry.getAttribute('uv');
    const P = pos.array, N = nor.array, C = colAttr.array, U = uvAttr.array;
    const uSpan = (field.xmax - field.xmin) || 1;
    const vSpan = (field.ymax - field.ymin) || 1;
    const Z = ring.z;

    // Pass 1: sample f once per vertex.
    let anyValid = false;
    for (let j = 0; j < w; j++) {
      const yy = cy + (j - seg / 2) * step;
      for (let i = 0; i < w; i++) {
        const xx = cx + (i - seg / 2) * step;
        // The window is the window. f may well be defined past the edge of it —
        // the campus is one fit seen through two rectangles, and the narrow
        // quadrant sits inside a survey two kilometres across — but a detail
        // ring that answers anyway drew a stray patch of hillside floating in
        // the air beside the strip, ground that the student had explicitly not
        // asked to see.
        const z = field.inDomain(xx, yy) ? field.height(xx, yy) : NaN;
        if (isFinite(z)) { Z[j * w + i] = z; anyValid = true; }
        else Z[j * w + i] = NaN;
      }
    }

    // Pass 2: positions, normals and colours, with gradients differenced from
    // the samples above rather than costing four more evaluations each.
    const nrm = new THREE.Vector3();
    const rgb = [0, 0, 0];

    for (let j = 0; j < w; j++) {
      const yy = cy + (j - seg / 2) * step;
      for (let i = 0; i < w; i++) {
        const k = j * w + i;
        const xx = cx + (i - seg / 2) * step;
        const raw = Z[k];
        const zz = isFinite(raw) ? raw : 0;

        const px = field.worldX(xx), pz = field.worldZ(yy);
        P[k * 3] = px;
        P[k * 3 + 1] = field.worldY(zz);
        P[k * 3 + 2] = pz;
        U[k * 2] = (xx - field.xmin) / uSpan;
        U[k * 2 + 1] = (yy - field.ymin) / vSpan;

        let gx, gy;
        const l = i > 0 && isFinite(Z[k - 1]), r = i < seg && isFinite(Z[k + 1]);
        if (l && r) gx = (Z[k + 1] - Z[k - 1]) / (2 * step);
        else if (r) gx = (Z[k + 1] - zz) / step;
        else if (l) gx = (zz - Z[k - 1]) / step;

        const d = j > 0 && isFinite(Z[k - w]), u = j < seg && isFinite(Z[k + w]);
        if (d && u) gy = (Z[k + w] - Z[k - w]) / (2 * step);
        else if (u) gy = (Z[k + w] - zz) / step;
        else if (d) gy = (zz - Z[k - w]) / step;

        if (!isFinite(gx) || !isFinite(gy)) {
          const g = field.gradient(xx, yy, step * 0.5);
          gx = g[0]; gy = g[1];
        }

        field.normalFromGrad(gx, gy, nrm);
        N[k * 3] = nrm.x; N[k * 3 + 1] = nrm.y; N[k * 3 + 2] = nrm.z;

        if (topographic === 'height') {
          heightColor(grid.norm(zz), rgb);
        } else {
          const slope = isFinite(gx) && isFinite(gy) ? Math.hypot(gx, gy) / grid.slopeRef : 0;
          biomeColor(grid.landNorm(zz), zz, slope, px, pz, rgb);
        }
        C[k * 3] = rgb[0]; C[k * 3 + 1] = rgb[1]; C[k * 3 + 2] = rgb[2];
      }
    }

    pos.needsUpdate = true;
    nor.needsUpdate = true;
    colAttr.needsUpdate = true;
    uvAttr.needsUpdate = true;
    ring.geometry.computeBoundingSphere();
    ring.mesh.visible = anyValid;

    // Float the ring just clear of what it covers.
    //
    // Depth-buffer tricks alone are not enough: the surfaces differ by real
    // geometry, and the chord error of a coarse cell can be centimetres. Once
    // the explorer is a fraction of a millimetre tall, centimetres is a chasm
    // and the coarser triangles would swallow the ring. So measure the gap.
    let gap = 0;
    const probes = [[0, 0], [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]];
    for (const [dx, dy] of probes) {
      const sx = cx + dx * extent, sy = cy + dy * extent;
      const coarse = grid.meshHeight(sx, sy);
      const exact = field.height(sx, sy);
      if (isFinite(coarse) && isFinite(exact)) gap = Math.max(gap, coarse - exact);
    }
    // Separation is measured against the ring's own size, never against the
    // world. An absolute epsilon is invisible at 1:1 and catastrophic at
    // 1:10000, where it would stand taller than the explorer and bury them.
    const worldExtent = extent * field.S;
    const rank = this.rings.length - ring.index;
    ring.mesh.position.y = field.worldY(gap) + worldExtent * 0.0009 * (1 + rank);
  }

  dispose() {
    for (const ring of this.rings) {
      ring.geometry.dispose();
      ring.material.dispose();
    }
    this.rings = [];
  }
}
