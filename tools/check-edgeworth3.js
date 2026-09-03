/**
 * check-edgeworth3.js — the three-good tab, checked against the .ggb it was
 * translated from and against arithmetic that can be done by hand.
 *
 * The source file stores the value of every one of its objects, which makes it
 * a test fixture as well as a specification: the numbers below are lifted
 * straight out of Edgeworth_box__2_agents_3_goods.ggb at its saved slider
 * positions, and the applet has to reproduce them.
 *
 * Four of them it deliberately does not reproduce, because the source formula
 * is wrong there; those are checked the other way round, against the identity
 * the source breaks. See the README.
 *
 * Serve edgeworth-box/ on 8131 first:
 *   python3 -m http.server 8131 --directory edgeworth-box
 *   node tools/check-edgeworth3.js
 */
const { chromium } = require('playwright-core');
const URL = 'http://127.0.0.1:8131/index.html';

let fails = 0;
const ok = (n, pass, d) => {
  if (!pass) fails++;
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${n}${d ? '  [' + d + ']' : ''}`);
};
const near = (n, got, want, tol) => {
  const d = Math.abs(got - want);
  ok(n, d <= tol, `${fmt(got)} vs ${fmt(want)}`);
};
const fmt = v => Number.isFinite(v) ? (Math.abs(v) < 1e-4 && v !== 0 ? v.toExponential(2) : v.toFixed(6)) : String(v);

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await b.newPage({ viewport: { width: 1360, height: 950 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(400);

  const ev = fn => page.evaluate(fn);

  /* ---------------------------------------------------------------- the tab */
  console.log('\n--- the tab itself ---');
  ok('the page opens on the two-good box', await ev(() => !document.getElementById('pane-g2').hidden));
  await page.click('#tab-g3');
  await page.waitForTimeout(300);
  ok('clicking the tab swaps the panes', await ev(() =>
    document.getElementById('pane-g2').hidden && !document.getElementById('pane-g3').hidden));
  ok('and the challenge switch goes with the two-good box', await ev(() =>
    document.querySelector('.masthead-actions .seg').hidden));
  ok('the three-good canvas draws something', await ev(() => {
    const c = document.getElementById('c3');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4) seen.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
    return seen.size > 40;
  }));

  /* -------------------------------------------------- against the .ggb file */
  console.log('\n--- every value the .ggb stores, at its saved sliders ---');
  const r = await ev(() => {
    const E = window.__edgeworth3, g = E.g3;
    const at = E.g3At(g, g.zeta);
    return { ...at, O: E.g3Tot(g), uMaxA: E.g3UA(g, E.g3Tot(g)), uMaxB: E.g3UB(g, E.g3Tot(g)) };
  });
  near('O_1', r.O[0], 3, 0);
  near('O_2', r.O[1], 4, 0);
  near('O_3', r.O[2], 4, 0);
  near('x_a', r.xA[0], 0.9675044981189683, 1e-12);
  near('y_a', r.xA[1], 1.8230016189798912, 1e-12);
  near('z_a', r.xA[2], 1.8199999999999996, 1e-12);
  near('p_1eq', r.p[0], 0.15284166666666665, 1e-15);
  near('p_2eq', r.p[1], 0.08261375, 1e-15);
  near('p_3eq', r.p[2], 0.08125, 1e-15);
  near('p_1NORM', r.pNorm[0], 48.25988398788043, 1e-11);
  near('p_2NORM', r.pNorm[1], 26.085360607188857, 1e-11);
  near('p_3NORM', r.pNorm[2], 25.65475540493071, 1e-11);
  near('M_aMarket', r.mA, 0.4805691666666666, 1e-15);
  near('M_bMarket', r.mB, 0.6334108333333333, 1e-15);
  near('M_a2nd, A\'s expenditure', r.eA, 0.44635499999999995, 1e-15);
  near('u_Pa', r.uA, 1.4661585547704064, 1e-12);
  near('u_Pb', r.uB, 2.494987668771398, 1e-12);
  near('m_a = U_a at the far corner', r.uMaxA, 3.5482626691008834, 1e-12);
  near('m_b = U_b at the far corner', r.uMaxB, 4.6377614841870285, 1e-12);
  near('Def_A, as the .ggb computes it', r.defA, 0.034214166666666726, 1e-12);

  /* ------------------------------------------- where the source is corrected */
  console.log('\n--- the four formulas the source file gets wrong ---');
  near('A and B exhaust good 1', r.xA[0] + r.xB[0], r.O[0], 1e-12);
  near('A and B exhaust good 2', r.xA[1] + r.xB[1], r.O[1], 1e-12);
  near('A and B exhaust good 3', r.xA[2] + r.xB[2], r.O[2], 1e-12);
  ok('so B\'s demand is not the .ggb\'s x_b', Math.abs(r.xB[0] - 1.6968540428548062) > 0.3,
    `x_b = ${fmt(r.xB[0])}, .ggb has 1.696854`);
  near('and the transfers net to zero, which the .ggb\'s do not', r.tA + r.tB, 0, 1e-15);
  near('a transfer TO A is the negation of the .ggb\'s Def_A', r.tA, -r.defA, 1e-15);

  const tang = await ev(() => {
    const E = window.__edgeworth3, g = E.g3;
    const a = E.g3At(g, g.zeta), p = a.p;
    /* the two directions the applet draws, dotted into the price vector: a
       direction along the budget plane has to be orthogonal to it */
    const t1 = [1, 0, -p[0] / p[2]], t2 = [0, 1, -p[1] / p[2]];
    /* and the .ggb's own ParcialX, for comparison */
    const ggb = [p[0] / p[2], 0, -p[0] / p[2]];
    const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    return { d1: dot(p, t1), d2: dot(p, t2), dGgb: dot(p, ggb) };
  });
  near('trade direction 1 lies in the budget plane', tang.d1, 0, 1e-15);
  near('trade direction 2 lies in the budget plane', tang.d2, 0, 1e-15);
  ok('the .ggb\'s ParcialX does not', Math.abs(tang.dGgb) > 1e-6, `p·v = ${fmt(tang.dGgb)}`);

  /* --------------------------------------------------- economics done by hand */
  console.log('\n--- the economics, checked against arithmetic ---');
  const mrs = await ev(() => {
    const E = window.__edgeworth3, g = E.g3, a = E.g3At(g, g.zeta);
    const eA = E.g3CDExp(g, 'A'), eB = E.g3CDExp(g, 'B');
    const m = (e, x, i, j) => (e[i] / x[i]) / (e[j] / x[j]);
    return [[0, 1], [0, 2], [1, 2]].map(([i, j]) => ({
      i, j, A: m(eA, a.xA, i, j), B: m(eB, a.xB, i, j), p: a.p[i] / a.p[j]
    }));
  });
  for (const m of mrs) {
    near(`MRS_A(${m.i + 1},${m.j + 1}) = p${m.i + 1}/p${m.j + 1}`, m.A, m.p, 1e-11);
    near(`MRS_B(${m.i + 1},${m.j + 1}) = p${m.i + 1}/p${m.j + 1}`, m.B, m.p, 1e-11);
  }

  const ends = await ev(() => {
    const E = window.__edgeworth3, g = E.g3;
    return { at0: E.g3Pareto(g, 0), at1: E.g3Pareto(g, 1), O: E.g3Tot(g) };
  });
  ok('at weight 0 A gets nothing', ends.at0.every(v => v === 0), ends.at0.join(', '));
  ok('at weight 1 A gets the whole cube', ends.at1.every((v, j) => Math.abs(v - ends.O[j]) < 1e-12),
    ends.at1.join(', '));

  const mono = await ev(() => {
    const E = window.__edgeworth3, g = E.g3;
    const xs = [];
    for (let i = 0; i <= 40; i++) xs.push(E.g3Pareto(g, i / 40));
    let rising = true;
    for (let i = 1; i < xs.length; i++) for (let j = 0; j < 3; j++)
      if (xs[i][j] < xs[i - 1][j] - 1e-12) rising = false;
    return { rising, mid: xs[20] };
  });
  ok('raising the weight never takes a good away from A', mono.rising, mono.mid.map(v => v.toFixed(3)).join(', '));

  /* the Pareto curve runs corner to corner on screen, not just in the maths */
  const proj = await ev(() => {
    const E = window.__edgeworth3, g = E.g3, O = E.g3Tot(g);
    const c = document.getElementById('c3').getBoundingClientRect();
    const cam = E.g3Cam(g, Math.round(c.width), Math.round(c.height));
    const V = E.g3Corners(O), P = q => cam.project(q);
    const near0 = P(V[0]), far = P(V[6]);
    const e0 = P(E.g3Pareto(g, 0)), e1 = P(E.g3Pareto(g, 1));
    return {
      d0: Math.hypot(near0[0] - e0[0], near0[1] - e0[1]),
      d1: Math.hypot(far[0] - e1[0], far[1] - e1[1]),
      spread: Math.max(...V.map(v => P(v)[0])) - Math.min(...V.map(v => P(v)[0])),
      w: Math.round(c.width)
    };
  });
  near('the Pareto set starts exactly at A\'s corner on screen', proj.d0, 0, 0.01);
  near('and ends exactly at B\'s', proj.d1, 0, 0.01);
  ok('the cube fills a usable part of the frame', proj.spread > proj.w * 0.25,
    `${proj.spread.toFixed(0)}px across a ${proj.w}px canvas`);

  /* ------------------------------------------------------------- Negishi */
  console.log('\n--- Negishi ---');
  await page.click('#g3-negishi');
  await page.waitForTimeout(350);
  const neg = await ev(() => {
    const E = window.__edgeworth3, g = E.g3, a = E.g3At(g, g.zeta);
    return { zeta: g.zeta, tA: a.tA, tB: a.tB, eA: a.eA, mA: a.mA, eB: a.eB, mB: a.mB,
             flagged: document.getElementById('verdict3').classList.contains('is-eq'),
             slider: +document.getElementById('g3zeta').value };
  });
  near('the button lands on a weight with no transfers', neg.tA, 0, 1e-9);
  near('for B as well', neg.tB, 0, 1e-9);
  near('A spends exactly its endowment', neg.eA, neg.mA, 1e-12);
  near('and so does B', neg.eB, neg.mB, 1e-12);
  ok('the slider follows the button', Math.abs(neg.slider - neg.zeta) < 1e-3, `${neg.slider} vs ${neg.zeta}`);
  ok('and the readout calls it an equilibrium', neg.flagged);

  /* an equilibrium found this way is the one a market would find: at those
     prices each agent's Cobb-Douglas demand is share * income */
  const walras = await ev(() => {
    const E = window.__edgeworth3, g = E.g3, a = E.g3At(g, g.zeta);
    const dem = (e, m) => {
      const S = e[0] + e[1] + e[2];
      return [0, 1, 2].map(j => (e[j] / S) * m / a.p[j]);
    };
    const dA = dem(E.g3CDExp(g, 'A'), a.mA), dB = dem(E.g3CDExp(g, 'B'), a.mB);
    return { dA, dB, xA: a.xA, xB: a.xB };
  });
  for (let j = 0; j < 3; j++) {
    near(`A's textbook demand for good ${j + 1} is what it holds`, walras.dA[j], walras.xA[j], 1e-9);
    near(`B's textbook demand for good ${j + 1} is what it holds`, walras.dB[j], walras.xB[j], 1e-9);
  }

  /* ------------------------------------------------------ moving the dials */
  console.log('\n--- the controls ---');
  await ev(() => {
    const s = document.getElementById('g3a1');
    s.value = '2.5'; s.dispatchEvent(new Event('input'));
  });
  await page.waitForTimeout(300);
  const moved = await ev(() => {
    const E = window.__edgeworth3;
    return { a1: E.g3.a[0], O1: E.g3Tot(E.g3)[0],
             note: document.getElementById('t3-endow-note').textContent };
  });
  near('dragging a_1 moves it', moved.a1, 2.5, 1e-9);
  near('and the cube grows with it', moved.O1, 4.5, 1e-9);
  ok('the note reports the new cube', /4\.50/.test(moved.note), moved.note.slice(0, 46));

  await ev(() => {
    const s = document.getElementById('g3zeta');
    s.value = '0.8'; s.dispatchEvent(new Event('input'));
  });
  await page.waitForTimeout(300);
  const heavy = await ev(() => {
    const E = window.__edgeworth3, g = E.g3, a = E.g3At(g, g.zeta);
    return { zeta: g.zeta, xA: a.xA, O: a.O, tA: a.tA, tAlight: E.g3At(g, 0.2).tA };
  });
  ok('a heavier weight for A gives A more of everything',
    heavy.xA.every((v, j) => v > heavy.O[j] * 0.5), heavy.xA.map(v => v.toFixed(2)).join(', '));
  ok('and A now needs a transfer to afford it', heavy.tA > 0, fmt(heavy.tA));
  ok('while at a weight that light A was handing income over', heavy.tAlight < 0, fmt(heavy.tAlight));

  const layer = await ev(() => {
    const cb = document.querySelector('#g3-layers input[data-g3="setA"]');
    cb.click();
    return window.__edgeworth3.g3.layers.setA;
  });
  ok('a layer toggle reaches the model', layer === true);

  /* the budget set really is the half of the cube A can pay for */
  const solid = await ev(() => {
    const E = window.__edgeworth3, g = E.g3, a = E.g3At(g, g.zeta);
    const solA = E.g3HalfSolid(a.O, a.p, a.eA, true);
    const solB = E.g3HalfSolid(a.O, a.p, a.eA, false);
    const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    const worst = (sol, sign) => {
      let m = 0;
      for (const f of sol.faces) for (const q of f) m = Math.max(m, sign * (dot(a.p, q) - a.eA));
      return m;
    };
    let capOff = 0;
    if (solA.cap) for (const q of solA.cap) capOff = Math.max(capOff, Math.abs(dot(a.p, q) - a.eA));
    return { aOver: worst(solA, 1), bOver: worst(solB, -1), capOff,
             capN: solA.cap ? solA.cap.length : 0 };
  });
  ok('nothing in A\'s set costs more than A can pay', solid.aOver < 1e-9, fmt(solid.aOver));
  ok('nothing in B\'s set costs less than the plane', solid.bOver < 1e-9, fmt(solid.bOver));
  ok('and the shared face is exactly the budget plane', solid.capOff < 1e-9,
    `${solid.capN} corners, off by ${fmt(solid.capOff)}`);

  /* ------------------------------------------------- the other four families */
  console.log('\n--- the families beyond Cobb-Douglas ---');

  const setFam = async (who, key) => {
    await page.selectOption('#g3-fam-' + (who === 'A' ? 'a' : 'b'), key);
    await page.waitForTimeout(260);
  };

  /* the CES limit: as rho goes to zero the weighted CES IS Cobb-Douglas with
     those weights, so the applet must not show a seam crossing it */
  const lim = await ev(() => {
    const E = window.__edgeworth3, F = E.G3_FAMS;
    const p = { a: 0.5, b: 0.3, r: 0.0005 };
    const x = [1.7, 2.3, 0.9];
    const w = F.ces.w(p);
    return { ces: F.ces.u(p, x), cd: F.cd.u({ a: w[0], b: w[1], c: w[2] }, x),
             cesJustOver: F.ces.u({ ...p, r: 0.05 }, x),
             cdW: w };
  });
  near('CES at rho -> 0 is Cobb-Douglas with the same weights', lim.ces, lim.cd, 1e-12);
  ok('and the weights still sum to one', Math.abs(lim.cdW.reduce((a, b) => a + b, 0) - 1) < 1e-12,
    lim.cdW.join(' + '));
  near('with no visible seam just outside the snap band', lim.cesJustOver, lim.cd, 0.02);

  /* perfect substitutes really are linear, and the third weight is 1-a-b */
  const sub = await ev(() => {
    const F = window.__edgeworth3.G3_FAMS, p = { a: 0.5, b: 0.2 };
    const u = q => F.sub.u(p, q);
    return { w: F.sub.w(p), one: u([1, 1, 1]), dbl: u([2, 2, 2]),
             mix: u([3, 0, 0]) + u([0, 5, 0]), joint: u([3, 5, 0]) };
  });
  ok('the three substitute weights sum to one', Math.abs(sub.w.reduce((a, b) => a + b, 0) - 1) < 1e-12,
    sub.w.join(' + '));
  near('doubling the bundle doubles utility', sub.dbl, 2*sub.one, 1e-12);
  near('and utility is additive across goods', sub.joint, sub.mix, 1e-12);

  /* quasilinear: the numeraire slider really moves which good is the linear one */
  const ql = await ev(() => {
    const F = window.__edgeworth3.G3_FAMS;
    const base = { a: 2, b: 1.5, s: 0.5 };
    const lin = k => {
      const p = { ...base, k };
      /* utility should rise by exactly 1 per unit of the numeraire */
      const x = [2, 2, 2];
      const y = x.slice(); y[k - 1] += 1;
      return F.ql.u(p, y) - F.ql.u(p, x);
    };
    return [1, 2, 3].map(lin);
  });
  for (let k = 0; k < 3; k++)
    near(`with the numeraire on x${k + 1}, a unit of it adds exactly 1`, ql[k], 1, 1e-12);

  /* typed by hand: x1, x2, x3 tokenise, and a broken expression is reported */
  const typed = await ev(() => {
    const E = window.__edgeworth3;
    const good = E.buildUtility3('x1^0.5*x2^0.25*x3^0.25');
    let bad = null;
    try { E.buildUtility3('x1 + oops('); } catch (e) { bad = String(e.message || e); }
    const kink = E.buildUtility3('min(x1, x2) + x3');
    return {
      u: good.u(4, 4, 4), exact: good.exactPartials,
      g: good.g(1, 1, 1),
      bad,
      kinkU: kink.u(2, 5, 1), kinkExact: kink.exactPartials, kinkG: kink.g(2, 5, 1)
    };
  });
  near('a typed Cobb-Douglas evaluates correctly', typed.u, 4, 1e-12);
  ok('and differentiates symbolically', typed.exact === true);
  near('its partial in x1 is the exponent at the unit bundle', typed.g[0], 0.5, 1e-9);
  ok('a broken expression is reported, not thrown away', !!typed.bad, typed.bad);
  near('min() still evaluates', typed.kinkU, 3, 1e-12);
  ok('and falls back to numeric partials at the kink', typed.kinkExact === false);
  near('where the gradient still points along the slack good', typed.kinkG[1], 0, 1e-6);

  /* every pair of families has to keep the two identities the model rests on:
     the bundles exhaust the cube, and the transfers cancel */
  const KEYS = await ev(() => window.__edgeworth3.G3_FAM_KEYS);
  let worstSum = 0, worstNet = 0, worstOut = 0, pairs = 0;
  for (const ka of KEYS) {
    await setFam('A', ka);
    for (const kb of KEYS) {
      await setFam('B', kb);
      const q = await ev(() => {
        const E = window.__edgeworth3, g = E.g3, O = E.g3Tot(g);
        const r = E.g3At(g, 0.42);
        let sum = 0;
        for (let j = 0; j < 3; j++) sum = Math.max(sum, Math.abs(r.xA[j] + r.xB[j] - O[j]));
        const c = E.g3Curve(g, 24);
        let out = 0;
        for (const x of c) for (let j = 0; j < 3; j++)
          out = Math.max(out, Math.max(-x[j], x[j] - O[j]));
        return { sum, net: Math.abs(r.tA + r.tB), out };
      });
      worstSum = Math.max(worstSum, q.sum);
      worstNet = Math.max(worstNet, q.net);
      worstOut = Math.max(worstOut, q.out);
      pairs++;
    }
  }
  ok(`all ${pairs} family pairs exhaust the cube`, worstSum < 1e-9, `worst ${fmt(worstSum)}`);
  ok('all of them net their transfers to zero', worstNet < 1e-12, `worst ${fmt(worstNet)}`);
  ok('and none lets the Pareto set leave the box', worstOut < 1e-9, `worst ${fmt(worstOut)}`);

  /* Negishi has to work off Cobb-Douglas too, where nothing is closed form */
  await setFam('A', 'ces');
  await setFam('B', 'ql');
  await page.click('#g3-negishi');
  await page.waitForTimeout(500);
  const negGen = await ev(() => {
    const E = window.__edgeworth3, g = E.g3, a = E.g3At(g, g.zeta);
    return { zeta: g.zeta, tA: a.tA, eA: a.eA, mA: a.mA, eB: a.eB, mB: a.mB };
  });
  near('Negishi clears the transfers with CES against quasilinear', negGen.tA, 0, 1e-7);
  near('A spends its endowment there', negGen.eA, negGen.mA, 1e-7);
  near('and so does B', negGen.eB, negGen.mB, 1e-7);
  ok('at a weight strictly inside (0, 1)', negGen.zeta > 0 && negGen.zeta < 1, fmt(negGen.zeta));

  /* the interior first-order condition, now checked through the reported gap */
  const gapCD = await ev(() => {
    const E = window.__edgeworth3, g = E.g3;
    g.famA = 'ces'; g.famB = 'ces'; E.g3BuildFams(); E.g3Invalidate();
    return E.g3At(g, 0.5).gap;
  });
  near('two CES agents meet the first-order condition exactly', gapCD, 0, 1e-6);

  await setFam('A', 'cd');
  await setFam('B', 'cd');
  await page.waitForTimeout(250);

  /* ----------------------------------------------------- the productive sector */
  console.log('\n--- the firm ---');

  await page.check('#g3-prod-on');
  await page.waitForTimeout(700);
  ok('turning the firm on reveals its controls', await ev(() =>
    !document.getElementById('g3-firm-body').hidden && window.__edgeworth3.g3.prod.on));

  const firm = await ev(() => {
    const E = window.__edgeworth3, g = E.g3;
    g.prod.z = 3.2; g.prod.m = 0.4; g.prod.n = 0.4; E.g3Invalidate();
    const r = E.g3At(g, g.zeta);
    const w = E.g3Endow(g), { k, i } = E.g3ProdIdx(g);
    const dot = (u, v) => u[0]*v[0] + u[1]*v[1] + u[2]*v[2];
    const mp = E.g3MP(g, r.t);
    return {
      w, O: r.O, t: r.t, k, i, F: E.g3F(g, r.t), profit: r.profit,
      pO: dot(r.p, r.O), pwPi: dot(r.p, w) + r.profit,
      wealth: r.mA + r.mB, spend: r.eA + r.eB, net: r.tA + r.tB,
      exhaust: Math.max(...r.xA.map((v, j) => Math.abs(v + r.xB[j] - r.O[j]))),
      foc: [0, 1].map(q => r.p[k]*mp[q] - r.p[i[q]]),
      mrtGap: r.mrtGap, gap: r.gap, p: r.p, mp
    };
  });
  ok('two goods go in and the third comes out', firm.k === 2 && firm.i[0] === 0 && firm.i[1] === 1,
    `x${firm.k + 1} from x${firm.i[0] + 1}, x${firm.i[1] + 1}`);
  ok('inputs are drawn down and the output added', 
    firm.O[0] < firm.w[0] && firm.O[1] < firm.w[1] && firm.O[2] > firm.w[2],
    firm.O.map(v => v.toFixed(3)).join(' x '));
  near('the cube loses exactly the first input', firm.w[0] - firm.O[0], firm.t[0], 1e-12);
  near('and gains exactly what is produced', firm.O[2] - firm.w[2], firm.F, 1e-12);

  /* the identity the whole thing rests on: what the box is worth is what the
     endowment is worth plus the profit, so the transfers still cancel */
  near('p·O = p·w + profit', firm.pO, firm.pwPi, 1e-12);
  near('and that is exactly what the two agents can pay', firm.wealth, firm.pO, 1e-12);
  near('which is exactly what they spend', firm.spend, firm.pO, 1e-12);
  near('so the transfers still net to zero', firm.net, 0, 1e-12);
  near('and the bundles still exhaust the cube', firm.exhaust, 0, 1e-9);

  /* the firm's own tangency: MRT = the price ratio = the common MRS */
  near('the first input is paid its marginal product', firm.foc[0], 0, 1e-7);
  near('and so is the second', firm.foc[1], 0, 1e-7);
  near('so the plan sits on the firm\'s tangency', firm.mrtGap, 0, 1e-6);
  near('and the split on the consumers\'', firm.gap, 0, 1e-6);
  near('MRT between the two inputs equals their price ratio',
    firm.mp[0]/firm.mp[1], firm.p[0]/firm.p[1], 1e-6);

  /* profit shares move wealth between the agents without moving the plan */
  const share = await ev(() => {
    const E = window.__edgeworth3, g = E.g3;
    const at = th => { g.prod.theta = th; E.g3Invalidate(); const r = E.g3At(g, g.zeta);
                       return { mA: r.mA, mB: r.mB, t: r.t.slice(), profit: r.profit }; };
    const lo = at(0), hi = at(1);
    g.prod.theta = 0.5; E.g3Invalidate();
    return { lo, hi };
  });
  near('all the profit to A raises A\'s wealth by the whole profit',
    share.hi.mA - share.lo.mA, share.lo.profit, 1e-9);
  near('and lowers B\'s by the same', share.lo.mB - share.hi.mB, share.lo.profit, 1e-9);
  near('the production plan does not care who owns the firm',
    Math.abs(share.hi.t[0] - share.lo.t[0]) + Math.abs(share.hi.t[1] - share.lo.t[1]), 0, 1e-9);

  /* each of the three outputs is reachable and each behaves */
  for (let k = 0; k < 3; k++) {
    const q = await page.evaluate((kk) => {
      const E = window.__edgeworth3, g = E.g3;
      g.prod.out = kk; E.g3Invalidate();
      const r = E.g3At(g, 0.5), w = E.g3Endow(g), { i } = E.g3ProdIdx(g);
      return { grew: r.O[kk] > w[kk], shrank: r.O[i[0]] <= w[i[0]] && r.O[i[1]] <= w[i[1]],
               net: Math.abs(r.tA + r.tB), exhaust: Math.max(...r.xA.map((v, j) => Math.abs(v + r.xB[j] - r.O[j]))) };
    }, k);
    ok(`making x${k + 1} grows x${k + 1} and spends the other two`, q.grew && q.shrank);
    ok(`and keeps the accounts straight`, q.net < 1e-12 && q.exhaust < 1e-9,
      `net ${fmt(q.net)}, exhaust ${fmt(q.exhaust)}`);
  }

  /* Negishi still has to find a zero-transfer weight with the firm running */
  await ev(() => { const E = window.__edgeworth3; E.g3.prod.out = 2; E.g3Invalidate(); });
  await page.click('#g3-negishi');
  await page.waitForTimeout(700);
  const negProd = await ev(() => {
    const E = window.__edgeworth3, g = E.g3, r = E.g3At(g, g.zeta);
    return { zeta: g.zeta, tA: r.tA, eA: r.eA, mA: r.mA, profit: r.profit };
  });
  near('Negishi clears the transfers with a firm in the loop', negProd.tA, 0, 1e-6);
  near('A spends its endowment plus its share of the profit', negProd.eA, negProd.mA, 1e-6);
  ok('and the firm is actually running there', negProd.profit > 0, fmt(negProd.profit));

  /* m + n is held below one, or the firm has no determinate scale */
  const rts = await ev(() => {
    const E = window.__edgeworth3, g = E.g3;
    const sl = document.getElementById('g3-m');
    sl.value = '0.9'; sl.dispatchEvent(new Event('input'));
    return { m: g.prod.m, n: g.prod.n, sum: g.prod.m + g.prod.n };
  });
  ok('pushing one elasticity up pulls the other down', rts.sum < 1,
    `m + n = ${rts.sum.toFixed(3)}`);

  await ev(() => {
    const E = window.__edgeworth3, g = E.g3;
    g.prod.on = false; g.prod.m = 0.35; g.prod.n = 0.35; g.prod.z = 1.2; g.prod.theta = 0.5;
    E.paintG3Firm(); E.g3Invalidate();
  });
  await page.waitForTimeout(300);
  ok('switching the firm off restores the pure endowment cube', await ev(() => {
    const E = window.__edgeworth3, g = E.g3, O = E.g3Tot(g), w = E.g3Endow(g);
    return O.every((v, j) => Math.abs(v - w[j]) < 1e-12);
  }));

  /* ------------------------------------------------------------- languages */
  console.log('\n--- both languages ---');
  await page.click('#lang-en');
  await page.waitForTimeout(300);
  const en = await ev(() => ({
    tab: document.getElementById('tab-g3').textContent,
    head: [...document.querySelectorAll('#pane-g3 .rail h2')].map(h => h.textContent),
    keys: [...document.querySelectorAll('#readout3 dt')].map(d => d.textContent),
    note: document.getElementById('t3-endow-note').textContent
  }));
  ok('the tab is in English', en.tab === 'Three goods', en.tab);
  ok('so are the rail headings',
    en.head.join('|') === 'Endowments|Preferences|Productive sector|Pareto weight|Layers',
    en.head.join('|'));
  ok('and the readout', en.keys[0] === 'Totals' && en.keys.includes('Transfer to A'), en.keys[0]);
  ok('and nothing is left undefined', !/undefined/.test(en.note + en.keys.join('') + en.head.join('')));

  await page.click('#lang-es');
  await page.waitForTimeout(250);
  ok('and back to Spanish', (await ev(() => document.getElementById('tab-g3').textContent)) === 'Tres bienes');

  /* ----------------------------------------------------- the two-good tab */
  console.log('\n--- the two-good tab still works ---');
  await page.click('#tab-g2');
  await page.waitForTimeout(400);
  ok('switching back restores it', await ev(() =>
    !document.getElementById('pane-g2').hidden && document.getElementById('pane-g3').hidden));
  ok('and the challenge switch comes back', await ev(() =>
    !document.querySelector('.masthead-actions .seg').hidden));
  ok('its canvas still paints', await ev(() => {
    const c = document.getElementById('cbox');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4) seen.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
    return seen.size > 40;
  }));

  ok('no page errors at the end', errs.length === 0, errs.slice(0, 3).join(' | '));

  await b.close();
  console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})();
