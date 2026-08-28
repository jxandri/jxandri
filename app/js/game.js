/**
 * game.js — Border Run: constrained maximisation, played rather than plotted.
 *
 * The sandbox asks a student to press O and watch the optimiser find the
 * answer. This asks them to find it themselves, on foot, with a controller in
 * their hands.
 *
 * The mission is always the same shape, because it is the shape of the
 * mathematics. You are dropped in the country that does NOT own the summit.
 * The peak is in plain sight across the frontier and it is not yours. Somewhere
 * along the line there is a highest point you can legally stand on — that is
 * argmax f subject to g ≤ 0 — and your job is to walk until you are standing on
 * it and plant your flag. The score is how many metres you left on the table.
 *
 * Why this teaches something a plot does not
 * ------------------------------------------
 * Reading "the constrained maximum lies on the boundary" is a sentence. Walking
 * uphill, hitting the frontier, and discovering that the only way left to gain
 * height is to slide *along* it — and that you keep gaining until the ground
 * stops rising in the direction the line runs — is the Lagrange condition
 * happening to you. Students arrive at "the level curve is tangent to the
 * constraint" as a description of something they did, which is a different kind
 * of knowing from having been told it.
 *
 * The trip wire, deliberately kept
 * --------------------------------
 * Crossing the border is allowed. It has to be: the whole lesson is that the
 * higher ground over there is *reachable but not permitted*, and a wall that
 * physically stopped you would quietly turn a constrained maximisation into an
 * unconstrained one on a smaller domain. So you may walk to the summit, stand
 * on it, and watch the game refuse to accept your flag. That refusal is the
 * constraint, and feeling it is the point.
 *
 * Everything here is a layer over the ordinary app: the same surfaces, the same
 * walker, the same optimiser marking the answer at the end. It adds an
 * objective, a controller-first interface, and a reason to care.
 *
 * One program, not two
 * --------------------
 * The game does not have its own page. It sits dormant over the sandbox —
 * screen 'off', nothing drawn, every control still the student's — and wakes up
 * when a border mountain is chosen from the examples list, offering the run as
 * a card the student can wave away. That is deliberate: the sandbox and the
 * game are the same mathematics looked at twice, and a student who has just
 * walked the frontier should be one keystroke away from the level curves, the
 * gradient arrows and the flat map that explain what they felt.
 */

import { BTN } from './gamepad.js';
import { t, getLanguage } from './i18n.js';

/** Metres of altitude given away, and what that is worth. */
const MEDALS = [
  { within: 10, key: 'gold', stars: 3 },
  { within: 30, key: 'silver', stars: 2 },
  { within: 80, key: 'bronze', stars: 1 },
];

/** How close to the line counts as "on the frontier" for the hint readout. */
const NEAR_LINE_KM = 0.15;

const $ = (id) => document.getElementById(id);

export class BorderRun {
  /**
   * @param ctx everything the game borrows from the app:
   *   { missions, load, player, field, state, pad, optimumOf, setMode,
   *     MODE_THIRD, MODE_DRONE, toggle, say }
   */
  constructor(ctx) {
    this.ctx = ctx;
    // 'off' — dormant, the sandbox has the screen to itself
    // 'offer' — a mountain was chosen; the run is on the table, not imposed
    // 'menu' | 'brief' | 'run' | 'result' — the game proper
    this.screen = 'off';
    this.pick = 0;
    this.mission = null;
    this.best = -Infinity;
    this.bestAt = null;
    this.started = 0;
    this.planted = null;
    this.warned = 0;
    this.offered = null;           // mountain id the open offer is about
    this.scores = this._loadScores();
    this._wire();
    this.show('off');
  }

  /* ------------------------------------------------------------ storage */

  /**
   * Medals survive a reload, per browser. It is a classroom toy, not a
   * gradebook: localStorage can be unavailable (private windows, blocked site
   * data) and losing it costs nobody anything, so every access is guarded and
   * the game plays identically when it fails.
   */
  _loadScores() {
    try { return JSON.parse(localStorage.getItem('border-run') || '{}') || {}; }
    catch { return {}; }
  }

  _saveScores() {
    try { localStorage.setItem('border-run', JSON.stringify(this.scores)); }
    catch { /* nothing to do, and nothing lost that matters */ }
  }

  /* ---------------------------------------------------------------- UI */

  show(screen) {
    this.screen = screen;
    for (const s of ['offer', 'menu', 'brief', 'run', 'result']) {
      const el = $(`g-${s}`);
      if (el) el.hidden = s !== screen;
    }
    $('game').dataset.screen = screen;
    // Also on <body>, because the sandbox chrome the cards need to hide sits
    // BEFORE #game in the document and a sibling selector cannot reach
    // backwards. One attribute at the root can reach everything.
    document.body.dataset.screen = screen;
    if (screen === 'menu') this._paintMenu();
    if (screen === 'off') this.offered = null;
  }

  /**
   * A border mountain has just been loaded in the sandbox. Offer the run.
   *
   * This is the whole join between the two halves of the program, and it is an
   * offer rather than a switch on purpose: choosing "Kinnerly Peak" from the
   * examples list is something a student does to look at a mountain, and having
   * it seize the screen and start a timed challenge would be rude. The card
   * names the mission, says what the objective is, and gets out of the way on
   * one keypress — after which the sandbox is exactly as it was.
   */
  offer(id) {
    const i = this.ctx.missions.findIndex((m) => m.id === id);
    if (i < 0) return;
    // Already playing this mountain, or already asked about it: don't nag.
    if (this.screen !== 'off' || this.offered === id) return;
    this.pick = i;
    this.offered = id;
    const m = this.ctx.missions[i];
    const es = getLanguage() === 'es';
    $('g-offer-name').textContent = es ? m.es : m.name;
    $('g-offer-text').innerHTML = t('game.offer', {
      other: `<b>${(es ? m.countriesEs : m.countries)[1].split(' (')[0]}</b>`,
      line: es ? m.boundaryEs : m.boundary,
    });
    const score = this.scores[id];
    const badge = $('g-offer-stars');
    if (badge) {
      badge.textContent = score ? '★'.repeat(score.stars) + '☆'.repeat(3 - score.stars) : '';
      badge.hidden = !score;
    }
    this.show('offer');
  }

  /** Put the sandbox back exactly as it was. */
  dismiss() {
    const id = this.offered;
    this.show('off');
    this.offered = id;            // asked once; don't ask again for this load
  }

  _paintMenu() {
    const list = $('g-list');
    list.innerHTML = '';
    const es = getLanguage() === 'es';
    this.ctx.missions.forEach((m, i) => {
      const row = document.createElement('div');
      row.className = 'g-row' + (i === this.pick ? ' on' : '');
      const score = this.scores[m.id];
      const stars = score ? '★'.repeat(score.stars) + '☆'.repeat(3 - score.stars) : '☆☆☆';
      row.innerHTML = `<span class="g-name">${es ? m.es : m.name}</span>`
        + `<span class="g-where">${(es ? m.countriesEs : m.countries)[1].split(' (')[0]}</span>`
        + `<span class="g-stars">${stars}</span>`;
      list.appendChild(row);
    });
    const m = this.ctx.missions[this.pick];
    if (m) {
      const es2 = getLanguage() === 'es';
      $('g-preview').src = m.photo || '';
      $('g-preview').hidden = !m.photo;
      $('g-blurb').textContent = es2 ? m.blurbEs : m.blurb;
    }
  }

  move(d) {
    const n = this.ctx.missions.length;
    this.pick = ((this.pick + d) % n + n) % n;
    this._paintMenu();
  }

  /* -------------------------------------------------------------- play */

  /**
   * Show the briefing and start loading behind it.
   *
   * The card is not a loading screen dressed up: reading who you are, where the
   * line is and how high the peak you cannot have takes about as long as the
   * mountain takes to build, so the two happen at once and the player presses A
   * when they are ready rather than when the machine is.
   */
  begin() {
    const m = this.ctx.missions[this.pick];
    this.mission = m;
    this.show('brief');
    const es = getLanguage() === 'es';
    $('g-brief-name').textContent = es ? m.es : m.name;
    const [own, other] = es ? m.countriesEs : m.countries;
    $('g-brief-text').innerHTML = t('game.brief', {
      other: `<b>${other.split(' (')[0]}</b>`,
      own: `<b>${own.split(' (')[0]}</b>`,
      line: es ? m.boundaryEs : m.boundary,
      summit: Math.round(m.summitMetres),
    });
    this.loading = this.ctx.load(m.id);
  }

  /** Put the player on the ground and start the clock. */
  async dropIn() {
    const m = this.mission;
    if (!m) return;
    this.show('run');
    await this.loading;

    // Spawn inside the feasible strip, not on the line and not past it.
    //
    // The strip is only as deep as the window was allowed to reach across the
    // frontier — a few hundred metres on the tightest mountains — so the
    // set-back has to be measured against the strip and not chosen as a round
    // number, or the drop lands on the wrong side of the border or outside the
    // survey window altogether.
    const L = m.line;
    const back = Math.max(0.05, Math.min(m.strip * 0.45, 0.8));
    const p = this.ctx.player;
    p.x = L.nx * (L.c - back);
    p.y = L.ny * (L.c - back);
    // Face the summit, which is across the line: the constraint and the prize
    // are the first two things in shot.
    p.yaw = Math.atan2(-(m.summit.x - p.x), -(m.summit.y - p.y)) + Math.PI;
    p._camReady = false;
    this.ctx.setMode(this.ctx.MODE_THIRD);

    this.best = -Infinity;
    this.bestAt = null;
    this.planted = null;
    this.started = performance.now();
  }

  /** Is the explorer standing where the rules allow a flag? */
  legal() {
    const m = this.mission;
    if (!m) return false;
    const p = this.ctx.player;
    return m.line.nx * p.x + m.line.ny * p.y - m.line.c <= 0;
  }

  plant() {
    const m = this.mission;
    if (!m || this.planted) return;
    const p = this.ctx.player;
    const z = p.height();
    if (!isFinite(z)) return;
    if (!this.legal()) {
      // The refusal IS the constraint. Say which country they are standing in
      // and leave them to walk back.
      this.warned = performance.now();
      const es = getLanguage() === 'es';
      $('g-warn').textContent = t('game.trespass', {
        country: (es ? m.countriesEs : m.countries)[0].split(' (')[0],
      });
      $('g-warn').hidden = false;
      return;
    }

    const mine = z * 1000;
    const target = m.constrained.metres;
    const gap = Math.max(0, target - mine);
    const medal = MEDALS.find((x) => gap <= x.within);
    const secs = (performance.now() - this.started) / 1000;

    this.planted = { mine, target, gap, medal, secs };
    const prev = this.scores[m.id];
    if (!prev || (medal ? medal.stars : 0) > prev.stars || (prev.gap ?? 1e9) > gap) {
      this.scores[m.id] = { stars: medal ? medal.stars : 0, gap: Math.round(gap), secs: Math.round(secs) };
      this._saveScores();
    }

    // Show the true answer only now, so the search was genuinely a search.
    this.ctx.revealOptimum();
    this._paintResult();
    this.show('result');
  }

  _paintResult() {
    const r = this.planted, m = this.mission;
    const es = getLanguage() === 'es';
    $('g-medal').textContent = r.medal ? '★'.repeat(r.medal.stars) + '☆'.repeat(3 - r.medal.stars) : '☆☆☆';
    $('g-medal').dataset.tier = r.medal ? r.medal.key : 'none';
    $('g-verdict').textContent = t(r.medal ? `game.${r.medal.key}` : 'game.miss');
    $('g-numbers').innerHTML = t('game.result', {
      mine: Math.round(r.mine),
      target: Math.round(r.target),
      gap: Math.round(r.gap),
      secs: r.secs.toFixed(0),
    });
    $('g-lesson').textContent = t('game.lesson', {
      country: (es ? m.countriesEs : m.countries)[1].split(' (')[0],
      line: es ? m.boundaryEs : m.boundary,
      summit: Math.round(m.summitMetres),
      best: Math.round(m.constrained.metres),
      cost: Math.round(m.summitMetres - m.constrained.metres),
    });
  }

  /* ------------------------------------------------------- every frame */

  update() {
    const pad = this.ctx.pad;

    // Dormant: the pad belongs entirely to the sandbox's explorer. START is
    // the way back in, so a student who waved the offer away is never stuck
    // without a controller route to the game.
    if (this.screen === 'off') {
      if (pad.justPressed(BTN.START)) this.show('menu');
      return;
    }

    // Menu and cards are driven by button edges, so a held stick does not
    // race through a list of twelve mountains in a tenth of a second.
    if (this.screen === 'offer') {
      if (pad.justPressed(BTN.A)) this.begin();
      if (pad.justPressed(BTN.B)) this.dismiss();
      if (pad.justPressed(BTN.Y)) this.show('menu');
      return;
    }
    if (this.screen === 'menu') {
      if (pad.justPressed(BTN.DOWN)) this.move(1);
      if (pad.justPressed(BTN.UP)) this.move(-1);
      if (pad.justPressed(BTN.A) || pad.justPressed(BTN.START)) this.begin();
      if (pad.justPressed(BTN.B)) this.dismiss();
      return;
    }
    if (this.screen === 'brief') {
      if (pad.justPressed(BTN.A) || pad.justPressed(BTN.START)) this.dropIn();
      if (pad.justPressed(BTN.B)) this.show('menu');
      return;
    }
    if (this.screen === 'result') {
      // A hands the mountain back to the sandbox with the answer now marked on
      // it: the natural next move is to switch on the level curves and see why
      // the point you were looking for was where it was.
      if (pad.justPressed(BTN.A) || pad.justPressed(BTN.B)) this.dismiss();
      if (pad.justPressed(BTN.X) || pad.justPressed(BTN.START)) this.show('menu');
      if (pad.justPressed(BTN.Y)) this.begin();                 // run it again
      return;
    }

    // --- in the run ------------------------------------------------------
    if (pad.justPressed(BTN.A)) this.plant();
    if (pad.justPressed(BTN.B) || pad.justPressed(BTN.BACK)) this.show('menu');
    if (pad.justPressed(BTN.X)) this.ctx.toggle('t-contours');
    if (pad.justPressed(BTN.Y)) this.ctx.toggle('t-feas');
    if (pad.justPressed(BTN.START)) this.ctx.toggle('t-curvesin');
    this._paintHud();
  }

  _paintHud() {
    const m = this.mission;
    if (!m) return;
    const p = this.ctx.player;
    const z = p.height();
    if (!isFinite(z)) return;
    const metres = z * 1000;
    const legal = this.legal();
    if (legal && metres > this.best) { this.best = metres; this.bestAt = [p.x, p.y]; }

    $('g-alt').textContent = `${Math.round(metres)} m`;
    $('g-best').textContent = this.best > -Infinity ? `${Math.round(this.best)} m` : '—';

    // How far the frontier is, and which side of it you are on. The sign is
    // the constraint function, which is the number the mathematics cares
    // about, so it is the number on screen.
    const g = m.line.nx * p.x + m.line.ny * p.y - m.line.c;
    const side = $('g-side');
    side.textContent = legal
      ? t('game.inside', { km: Math.abs(g).toFixed(2) })
      : t('game.outside', { km: Math.abs(g).toFixed(2) });
    side.dataset.legal = legal ? 'yes' : 'no';
    $('g-frontier').hidden = !(legal && Math.abs(g) < NEAR_LINE_KM);

    if (!$('g-warn').hidden && performance.now() - this.warned > 2600) $('g-warn').hidden = true;

    const secs = (performance.now() - this.started) / 1000;
    $('g-time').textContent = `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;
  }

  /* ------------------------------------------------- keyboard fallback */

  _wire() {
    // A controller is the point, but one pad between four students is normal
    // and a laptop trackpad has to be able to play too.
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      if (this.screen === 'off') return;         // the sandbox owns the keyboard
      if (this.screen === 'offer') {
        if (k === 'enter') { this.begin(); e.preventDefault(); }
        if (k === 'escape') { this.dismiss(); e.preventDefault(); }
      } else if (this.screen === 'menu') {
        if (k === 'arrowdown') { this.move(1); e.preventDefault(); }
        if (k === 'arrowup') { this.move(-1); e.preventDefault(); }
        if (k === 'enter') { this.begin(); e.preventDefault(); }
        if (k === 'escape') { this.dismiss(); e.preventDefault(); }
      } else if (this.screen === 'brief') {
        if (k === 'enter') { this.dropIn(); e.preventDefault(); }
        if (k === 'escape') this.show('menu');
      } else if (this.screen === 'result') {
        if (k === 'enter' || k === 'escape') { this.dismiss(); e.preventDefault(); }
        if (k === 'r') this.begin();
      } else if (this.screen === 'run') {
        if (k === 'enter') { this.plant(); e.preventDefault(); }
        if (k === 'escape') this.show('menu');
      }
    });

    for (const [id, fn] of [
      ['g-offer-go', () => this.begin()],
      ['g-offer-no', () => this.dismiss()],
      ['g-offer-all', () => this.show('menu')],
      ['g-start', () => this.begin()],
      ['g-close', () => this.dismiss()],
      ['g-go', () => this.dropIn()],
      ['g-plant', () => this.plant()],
      ['g-again', () => this.begin()],
      ['g-back', () => this.show('menu')],
      ['g-explore', () => this.dismiss()],
      ['g-menu', () => this.show('menu')],
    ]) {
      const el = $(id);
      if (el) el.addEventListener('click', fn);
    }
    const list = $('g-list');
    if (list) {
      list.addEventListener('click', (e) => {
        const row = e.target.closest('.g-row');
        if (!row) return;
        this.pick = [...list.children].indexOf(row);
        this._paintMenu();
        this.begin();
      });
    }
  }
}
