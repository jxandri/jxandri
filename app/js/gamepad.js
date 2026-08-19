/**
 * gamepad.js — the two sticks, read the way a game reads them.
 *
 * The browser's Gamepad API is polled, not evented: there is no "stick moved"
 * to listen for, so the state is fetched fresh every frame. That suits this
 * program, which already has a frame loop and already turns held keys into a
 * per-frame amount.
 *
 * On iOS this is the whole story. Safari has supported the Gamepad API since
 * 10.3 and MFi / Bluetooth controllers since 14.5, so an Xbox-layout pad
 * paired to an iPhone arrives here as a standard-mapping gamepad with the
 * sticks on axes 0-3 — no app, no install, nothing to sign. There is one
 * quirk worth knowing and worth telling the user about: for privacy, a browser
 * does not admit that a gamepad exists until a button on it is pressed. Until
 * then getGamepads() returns nothing at all, which looks exactly like a broken
 * cable. Hence `connected` and `name`, which the panel reports.
 *
 * Two details separate a stick that feels right from one that does not.
 *
 * The dead zone is *radial*, not per-axis. A stick at rest does not sit at
 * exactly zero — it wanders by a few per cent, and more as it wears — so some
 * dead zone is compulsory. Applying it to each axis independently is the
 * classic mistake: it carves a square hole out of a circular stick, so a
 * gentle diagonal push registers as nothing at all while the same push along
 * an axis moves, and near the threshold motion snaps to the four compass
 * directions. Measuring the *distance from centre* and rescaling what is left
 * keeps the hole round and diagonals honest.
 *
 * And the response is curved. A stick is a position, not a rate, and a linear
 * map from position to speed makes the first millimetre of travel as coarse as
 * the last. Raising the magnitude to a power above one buys fine control near
 * the centre — where the small corrections are — while leaving the far edge at
 * full speed, which is exactly the trade a person wants when they are lining
 * up on a contour.
 */

/** Below this fraction of full deflection the stick is treated as centred. */
const DEAD = 0.18;

/**
 * The last few per cent of travel are given away, because a worn stick often
 * cannot quite reach 1.0 in the corners and "full speed" should be reachable.
 */
const SATURATE = 0.95;

/** Position-to-rate curve. 1 is linear; higher is finer near the centre. */
const CURVE = 1.6;

/**
 * Standard-mapping button numbers, named. The layout is the Xbox one, which
 * is what the API calls "standard" and what a Machenike, a DualSense, an
 * 8BitDo and an Xbox pad all report.
 */
export const BTN = {
  A: 0, B: 1, X: 2, Y: 3,
  LB: 4, RB: 5, LT: 6, RT: 7,
  BACK: 8, START: 9,
  L3: 10, R3: 11,
  UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15,
};

/** One stick, dead-zoned radially and curved. Returns [x, y] in the unit disc. */
function stick(x, y) {
  if (!isFinite(x) || !isFinite(y)) return [0, 0];
  const m = Math.hypot(x, y);
  if (m <= DEAD) return [0, 0];
  // How far past the dead zone we are, as a fraction of the usable travel.
  const t = Math.min(1, (m - DEAD) / (SATURATE - DEAD));
  const scale = Math.pow(t, CURVE) / m;
  return [x * scale, y * scale];
}

export class Pad {
  constructor() {
    this.connected = false;
    this.name = '';
    this.move = { x: 0, y: 0 };     // left stick: +x right, +y forward
    this.look = { x: 0, y: 0 };     // right stick: +x right, +y up
    this.lift = 0;                  // shoulders: +1 up, −1 down
    this.sprint = false;
    this.invertLook = false;
    this._down = [];
    this._edge = [];
  }

  /**
   * The first gamepad the browser will admit to.
   *
   * getGamepads() returns a fixed-length array with holes, and — in every
   * engine — objects that are snapshots rather than live views, so this has to
   * be called again every frame rather than kept.
   */
  _find() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    let pads;
    try {
      pads = navigator.getGamepads();
    } catch (err) {
      return null;                  // some engines throw in insecure contexts
    }
    if (!pads) return null;
    for (const p of pads) {
      if (p && p.connected && p.axes && p.axes.length >= 2) return p;
    }
    return null;
  }

  /** Read the hardware. Call once a frame, before anything asks for the state. */
  poll() {
    const p = this._find();
    if (!p) {
      if (this.connected) this.reset();
      this.connected = false;
      this.name = '';
      return this;
    }

    this.connected = true;
    this.name = p.id || 'gamepad';

    const ax = p.axes;
    const [mx, my] = stick(ax[0] || 0, ax[1] || 0);
    this.move.x = mx;
    // Axis 1 is negative when the stick is pushed away from you, which is the
    // direction that should mean "forward".
    this.move.y = -my;

    // A pad that reports no right stick — some report only four axes on one
    // controller and two on another — simply contributes no look.
    const [lx, ly] = ax.length >= 4 ? stick(ax[2] || 0, ax[3] || 0) : [0, 0];
    this.look.x = lx;
    this.look.y = (this.invertLook ? ly : -ly);

    const b = p.buttons || [];
    const held = (i) => !!(b[i] && (b[i].pressed || b[i].value > 0.5));

    this.lift = (held(BTN.RB) ? 1 : 0) - (held(BTN.LB) ? 1 : 0);
    this.sprint = held(BTN.RT);

    // Edge detection: a button "press" is the frame it goes down, so that a
    // toggle fires once however long it is held.
    this._edge.length = 0;
    for (let i = 0; i < b.length; i++) {
      const now = held(i);
      if (now && !this._down[i]) this._edge.push(i);
      this._down[i] = now;
    }
    return this;
  }

  /** Buttons that went down this frame. */
  get pressed() { return this._edge; }

  justPressed(i) { return this._edge.indexOf(i) !== -1; }

  /** Forget everything — on disconnect, or on losing the window. */
  reset() {
    this.move.x = this.move.y = 0;
    this.look.x = this.look.y = 0;
    this.lift = 0;
    this.sprint = false;
    this._down.length = 0;
    this._edge.length = 0;
  }
}
