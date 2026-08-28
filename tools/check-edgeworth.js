// The claims the Edgeworth applet makes, checked against arithmetic that can
// be done by hand: where the contract curve of two symmetric Cobb-Douglas
// consumers runs, what the equilibrium price ratio is, where the quasilinear
// contract curve stands, and that the lens really does hold the allocation in.
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const p = await (await b.newContext({ viewport:{ width:1400, height:900 } })).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if(m.type() === 'error') errs.push('console: ' + m.text()); });
  let ok = true;
  const say = (n, pass, extra) => { ok = ok && pass; console.log(`${pass?'ok  ':'FAIL'} ${n}${extra?'  ['+extra+']':''}`); };

  await p.goto('http://127.0.0.1:8130/index.html', { waitUntil:'load' });
  await p.waitForTimeout(900);

  // --- it boots ------------------------------------------------------------
  say('boots without a page error', errs.length === 0, errs.slice(0,2).join(' | '));
  say('exposes the model', await p.evaluate(() => !!window.__edgeworth));

  // --- symmetric Cobb-Douglas ---------------------------------------------
  // u = sqrt(xy) for both, total (8,8): the contract curve is the diagonal.
  const diag = await p.evaluate(() => {
    const { st } = window.__edgeworth;
    let worst = 0;
    for(const q of st.contract){
      if(q.x < 0.5 || q.x > st.Wx - 0.5) continue;      // ignore the corners
      worst = Math.max(worst, Math.abs(q.y - q.x));
    }
    return { worst, n:st.contract.length, Wx:st.Wx, Wy:st.Wy };
  });
  say('box is 8 x 8', Math.abs(diag.Wx - 8) < 1e-9 && Math.abs(diag.Wy - 8) < 1e-9,
      `${diag.Wx} x ${diag.Wy}`);
  say('contract curve of two symmetric Cobb-Douglas is the diagonal',
      diag.worst < 0.005, `max |y - x| = ${diag.worst.toFixed(4)} over ${diag.n} points`);

  // Each spends half of income on x: x_A + x_B = (m_A + m_B)/(2p) = (8p+8)/2p,
  // which equals the 8 available exactly at p = 1.
  const eq = await p.evaluate(() => window.__edgeworth.st.eq.map(e => e.p));
  say('one equilibrium, at p = 1', eq.length === 1 && Math.abs(eq[0] - 1) < 0.005,
      JSON.stringify(eq.map(v => +v.toFixed(4))));

  // and it must clear both markets, not just the one it solved
  const z = await p.evaluate(() => {
    const m = window.__edgeworth.marketAt(window.__edgeworth.st, 1);
    return { zx:m.zx, zy:m.zy };
  });
  say('both markets clear there (Walras)', Math.abs(z.zx) < 1e-3 && Math.abs(z.zy) < 1e-3,
      `z=(${z.zx.toExponential(1)}, ${z.zy.toExponential(1)})`);

  // --- the core is where it should be -------------------------------------
  const core = await p.evaluate(() => {
    const { st } = window.__edgeworth;
    return { n:st.core.n, uAe:st.core.uAe, uBe:st.core.uBe,
             lo:st.contract[st.core.from], hi:st.contract[st.core.to] };
  });
  say('the core is a non-degenerate stretch of the contract curve', core.n > 3, `${core.n} points`);
  say('every point of the core beats the endowment for both',
      core.lo.uA >= core.uAe - 1e-9 && core.lo.uB >= core.uBe - 1e-9 &&
      core.hi.uA >= core.uAe - 1e-9 && core.hi.uB >= core.uBe - 1e-9);
  // omega = (6,2) so u_A(omega) = sqrt(12); the equal-split point sqrt(16) = 4 beats it
  say('the equal split is inside the core',
      await p.evaluate(() => window.__edgeworth.inLens(4, 4)));

  // --- families are chosen per agent, and driven by their dials -----------
  const setPrefs = (A, B, w) => p.evaluate(([A, B, w]) => {
    const E = window.__edgeworth, st = E.st;
    E.setFamily('a', A[0], A[1]);
    E.setFamily('b', B[0], B[1]);
    if(w){ [st.wAx, st.wAy, st.wBx, st.wBy] = w; }
    E.applyPrefs(); E.recomputeModel(); E.syncState(); E.render();
    return { srcA:st.srcA, srcB:st.srcB };
  }, [A, B, w]);

  // Cobb-Douglas with a = 0.8 against a = 0.5 on an 8x8 box. Tangency is
  // (a/(1-a))(y/x) = (y_B/x_B), i.e. 4y(8-x) = x(8-y), so y = 8x/(32-3x) and
  // the curve passes through (4, 1.6).
  await setPrefs(['cd',{a:0.8}], ['cd',{a:0.5}], [4,4,4,4]);
  const cdA = await p.evaluate(() => {
    const st = window.__edgeworth.st;
    const q = window.__edgeworth.nearestOnCurve(st.contract, 4, 8 * 4 / (32 - 3 * 4));
    return { dist:q.dist, at:st.contract.filter(c => Math.abs(c.x - 4) < 0.06).map(c => c.y) };
  });
  say("a Cobb-Douglas weight dial bends the contract curve to its analytic place",
      cdA.dist < 0.05 && cdA.at.length > 0 && Math.abs(cdA.at[0] - 1.6) < 0.06,
      `y(4) = ${cdA.at.map(v => v.toFixed(3)).join(",")} vs 1.600`);

  // Quasilinear a*x^b + y with b = 0.5 for both: MRS = a/(2 sqrt(x)), so
  // tangency needs x_B = (a_B/a_A)^2 x_A, and with a = 2 against 3 on an
  // 8-wide box that pins the vertical contract curve at 8/3.25.
  await setPrefs(['ql',{a:2,b:0.5}], ['ql',{a:3,b:0.5}], [4,4,4,4]);
  const ql = await p.evaluate(() => {
    const st = window.__edgeworth.st;
    const mid = st.contract.filter(q => q.y > 1 && q.y < st.Wy - 1).map(q => q.x);
    return { n:mid.length, lo:Math.min(...mid), hi:Math.max(...mid) };
  });
  const qlTarget = 8 / (1 + (3 / 2) ** 2);
  say("quasilinear contract curve is vertical", ql.n > 5 && (ql.hi - ql.lo) < 0.02,
      `x in [${ql.lo.toFixed(3)}, ${ql.hi.toFixed(3)}]`);
  say("and the scale dials put it where they say",
      Math.abs((ql.lo + ql.hi) / 2 - qlTarget) < 0.02,
      `${((ql.lo + ql.hi) / 2).toFixed(3)} vs ${qlTarget.toFixed(3)}`);

  // moving one dial has to move it, in the direction the algebra says
  await setPrefs(['ql',{a:2,b:0.5}], ['ql',{a:5,b:0.5}], [4,4,4,4]);
  const ql2 = await p.evaluate(() => {
    const st = window.__edgeworth.st;
    const mid = st.contract.filter(q => q.y > 1 && q.y < st.Wy - 1).map(q => q.x);
    return (Math.min(...mid) + Math.max(...mid)) / 2;
  });
  const ql2Target = 8 / (1 + (5 / 2) ** 2);
  say("raising B's scale dial moves it, to the new analytic place",
      ql2 < qlTarget - 0.3 && Math.abs(ql2 - ql2Target) < 0.02,
      `${ql2.toFixed(3)} vs ${ql2Target.toFixed(3)}`);

  // --- the two agents can hold different families -------------------------
  const mixed = await setPrefs(['cd',{a:0.5}], ['com',{a:1,b:1}], [6,2,2,6]);
  const mix = await p.evaluate(() => {
    const st = window.__edgeworth.st;
    return { curve:st.contract.length, srcA:st.srcA, srcB:st.srcB };
  });
  say("A and B can hold different families at once",
      mix.curve > 3 && /\^/.test(mix.srcA) && /^min\(/.test(mix.srcB),
      `${mix.srcA}  |  ${mix.srcB}`);

  // every family has to produce something the parser accepts, at both ends
  // of every dial it owns
  const allFam = await p.evaluate(() => {
    const E = window.__edgeworth;
    const bad = [];
    for(const F of E.FAMILIES){
      if(!F.expr) continue;
      const corners = [{}, {}];
      for(const q of F.params){ corners[0][q.k] = q.min; corners[1][q.k] = q.max; }
      for(const par of corners){
        E.setFamily('a', F.id, { ...par });
        if(!E.applyPrefs()) bad.push(F.id + " " + JSON.stringify(par) + " -> " + E.st.srcA);
      }
    }
    return bad;
  });
  say("every family parses at both ends of every dial", allFam.length === 0, allFam.join(" | "));

  // --- the improving set --------------------------------------------------
  await setPrefs(['cd',{a:0.5}], ['cd',{a:0.5}], [6,2,2,6]);
  const lens = await p.evaluate(async () => {
    const E = window.__edgeworth, st = E.st;
    E.setMethod('free');
    // ω is off the contract curve, so the lens there is a real oval
    st.P = [st.wAx, st.wAy]; E.syncState();
    const off = st.lensArea;
    // The reported share comes off the sampling grid. Cross-check it against
    // the utility closures themselves by Monte Carlo, so a bug in the grid
    // or in the bilinear read cannot agree with itself.
    const a0 = st.uA(st.PA[0], st.PA[1]);
    const b0 = st.uB(st.Wx - st.PB[0], st.Wy - st.PB[1]);
    const N = 40000;
    let hit = 0;
    for(let i = 0; i < N; i++){
      const x = Math.random() * st.Wx, y = Math.random() * st.Wy;
      if(st.uA(x, y) > a0 && st.uB(st.Wx - x, st.Wy - y) > b0) hit++;
    }
    const mc = hit / N;
    // on the contract curve it has to close up
    const mid = st.contract[Math.floor(st.contract.length / 2)];
    st.P = [mid.x, mid.y]; E.syncState();
    const on = st.lensArea;
    return { off, on, mc };
  });
  say("off the contract curve the improving set is a real region",
      lens.off > 0.02, `${(lens.off * 100).toFixed(1)}% of the box`);
  say("on the contract curve it closes up",
      lens.on < 0.002, `${(lens.on * 100).toFixed(3)}% of the box`);
  say("and its size agrees with the utility functions themselves",
      Math.abs(lens.off - lens.mc) < 0.006,
      `grid ${(lens.off * 100).toFixed(2)}% vs Monte Carlo ${(lens.mc * 100).toFixed(2)}%`);

  // it also has to actually reach the canvas
  const painted = await p.evaluate(async () => {
    const E = window.__edgeworth, st = E.st;
    st.P = [st.wAx, st.wAy];
    st.layers.lens = true; st.map = "none";
    E.syncState(); E.render();
    await new Promise(r => setTimeout(r, 300));
    const cv = document.getElementById('cbox');
    const g = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    // count pixels carrying the lens ramp: green-to-gold, so g clearly over b
    let n = 0;
    for(let i = 0; i < g.length; i += 4)
      if(g[i+1] > g[i+2] + 30 && g[i+1] > 90) n++;
    return n;
  });
  say("the improving set is painted on the box", painted > 3000, `${painted} px`);

  await setPrefs(['cd',{a:0.5}], ['cd',{a:0.5}], [6,2,2,6]);

  // --- the kinked and linear families must not fall over ------------------
  for(const [name, A, B] of [
        ["perfect substitutes", ['sub',{a:1,b:2}], ['sub',{a:2,b:1}]],
        ["perfect complements", ['com',{a:1,b:1}], ['com',{a:1,b:2}]],
        ["CES across the sign of r", ['ces',{a:0.5,r:0.7}], ['ces',{a:0.5,r:-3}]]]){
    await setPrefs(A, B, [6,2,2,6]);
    const k = await p.evaluate(() => window.__edgeworth.st.contract.length);
    say(`${name} still produces a Pareto set`, k > 3, `${k} points`);
  }
  await setPrefs(['cd',{a:0.5}], ['cd',{a:0.5}], [6,2,2,6]);

  // --- driving the actual controls, not just the model --------------------
  const viaUI = await p.evaluate(async () => {
    const sel = document.getElementById('fam-b');
    sel.value = 'sub'; sel.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 300));
    const before = window.__edgeworth.st.srcB;
    const dial = document.querySelector('#par-b input[type=range][data-p="b"]');
    dial.value = 4.5; dial.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 300));
    return { before, after:window.__edgeworth.st.srcB,
             shown:document.getElementById('ub-out').textContent };
  });
  say("the family select and its dial rewrite the function",
      /^1x\+2y$/.test(viaUI.before) && /^1x\+4.5y$/.test(viaUI.after) &&
      viaUI.shown.includes(viaUI.after),
      `${viaUI.before} -> ${viaUI.after}`);
  await setPrefs(['cd',{a:0.5}], ['cd',{a:0.5}], [6,2,2,6]);

  // --- the lens really is a wall ------------------------------------------
  const wall = await p.evaluate(async () => {
    const E = window.__edgeworth, st = E.st;
    document.querySelector('input[name="method"][value="trade"]').checked = true;
    document.querySelector('input[name="method"][value="trade"]')
      .dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 200));
    const before = st.P.slice();
    // drag hard toward a corner that ruins B
    const cv = document.getElementById('cbox');
    const r = cv.getBoundingClientRect();
    cv.dispatchEvent(new PointerEvent('pointerdown', { clientX:r.left + r.width - 6, clientY:r.top + 6, pointerId:1, bubbles:true }));
    cv.dispatchEvent(new PointerEvent('pointermove', { clientX:r.left + r.width - 6, clientY:r.top + 6, pointerId:1, bubbles:true }));
    cv.dispatchEvent(new PointerEvent('pointerup', { pointerId:1, bubbles:true }));
    await new Promise(r2 => setTimeout(r2, 200));
    return { before, after:st.P.slice(), inLens:E.inLens(st.P[0], st.P[1]) };
  });
  say('trade mode keeps the allocation inside the lens', wall.inLens,
      `P = (${wall.after[0].toFixed(2)}, ${wall.after[1].toFixed(2)})`);


  // --- under an announced price both set MRS equal to it -------------------
  const auc = await p.evaluate(async () => {
    const E = window.__edgeworth, st = E.st;
    E.setMethod('auction');
    const sl = document.getElementById('pr');
    sl.value = Math.log10(1.75); sl.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 250));
    const a = st.uAx(st.PA[0], st.PA[1]) / st.uAy(st.PA[0], st.PA[1]);
    const bx = st.Wx - st.PB[0], by = st.Wy - st.PB[1];
    const b = st.uBx(bx, by) / st.uBy(bx, by);
    return { p:st.p, a, b };
  });
  say('at an announced price both MRS equal it',
      Math.abs(auc.a - auc.p) < 0.02 && Math.abs(auc.b - auc.p) < 0.02,
      `p=${auc.p.toFixed(3)} MRS=(${auc.a.toFixed(3)}, ${auc.b.toFixed(3)})`);

  // --- challenge mode ------------------------------------------------------
  const chal = await p.evaluate(async () => {
    document.getElementById('mode-challenge').click();
    await new Promise(r => setTimeout(r, 700));
    const st = window.__edgeworth.st;
    const locked = document.getElementById('ua-expr').disabled;
    // answer it: drop the allocation on the middle of the contract curve
    const mid = st.contract[Math.floor(st.contract.length / 2)];
    st.P = [mid.x, mid.y];
    window.__edgeworth.syncState();
    document.getElementById('btn-check').click();
    await new Promise(r => setTimeout(r, 400));
    return { locked, score:st.score, checked:st.checked,
             unlocked:st.unlocked, missionVisible:!document.getElementById('mission').hidden };
  });
  say('a challenge locks the preferences while it runs', chal.locked);
  say('answering on the contract curve scores', chal.score > 0 && chal.checked, `${chal.score} points`);
  say('and unlocks the next level', chal.unlocked >= 2, `${chal.unlocked} unlocked`);

  await p.evaluate(() => document.getElementById('mode-explore').click());
  await p.waitForTimeout(300);


  // === welfare weights, Negishi, and the second welfare theorem ===========
  // Identical homothetic tastes give a STRAIGHT utility frontier, against
  // which the weighted sum is flat and lambda singles nothing out. The tie
  // must resolve to the middle; the weight tests then use tastes that differ,
  // where the frontier is curved and lambda is a real coordinate.
  await setPrefs(['cd',{a:0.5}], ['cd',{a:0.5}], [6,2,2,6]);
  const tie = await p.evaluate(() => {
    const E = window.__edgeworth, q = E.paretoAtWeight(E.st, 0.5);
    return { x:q.x, y:q.y };
  });
  say("a flat weighted sum resolves to the middle of the tie, not a corner",
      Math.abs(tie.x - 4) < 0.12 && Math.abs(tie.y - 4) < 0.12,
      `(${tie.x.toFixed(3)}, ${tie.y.toFixed(3)})`);

  await setPrefs(['cd',{a:0.7}], ['cd',{a:0.3}], [6,2,2,6]);

  // lambda has to walk the Pareto set monotonically, and land in the middle
  // of a symmetric economy at lambda = 1/2
  const lam = await p.evaluate(() => {
    const E = window.__edgeworth, st = E.st;
    const R = st.lamRange;
    return [0.05,0.3,0.5,0.7,0.95].map(t => {
      const l = R.lo + t * (R.hi - R.lo);
      const q = E.paretoAtWeight(st, l);
      return { l, x:q.x, y:q.y, uA:st.uA(q.x,q.y) };
    });
  });
  const mono = lam.every((v,i) => i === 0 || v.uA > lam[i-1].uA);
  say("raising lambda walks the Pareto set toward A", mono,
      lam.map(v => v.uA.toFixed(2)).join(" < ") +
      `  over lambda in [${lam[0].l.toFixed(3)}, ${lam[4].l.toFixed(3)}]`);
  say("and every weight lands on the Pareto set itself",
      await p.evaluate(() => {
        const E = window.__edgeworth, st = E.st;
        const sc = Math.hypot(st.Wx, st.Wy);
        return [0.2,0.4,0.6,0.8].every(l => {
          const q = E.paretoAtWeight(st, l);
          return E.nearestOnCurve(st.contract, q.x, q.y).dist < 0.01 * sc;
        });
      }));

  // the supporting price is the common MRS, and the transfers net to zero
  const sup = await p.evaluate(() => {
    const E = window.__edgeworth, st = E.st;
    const out = [];
    const R = st.lamRange;
    for(const t of [0.3, 0.5, 0.7]){
      const l = R.lo + t * (R.hi - R.lo);
      const q = E.paretoAtWeight(st, l);
      const S = E.supportAt(st, q.x, q.y);
      out.push({ l, p:S.p, mrsA:S.mrsA, mrsB:S.mrsB, tA:S.tA, tB:S.tB,
                 onLine: Math.abs(S.p * q.x + q.y - S.incA) });
    }
    return out;
  });
  say("the supporting price is the marginal rate both share",
      sup.every(o => Math.abs(o.mrsA - o.mrsB) < 0.01 && Math.abs(o.p - o.mrsA) < 0.01),
      sup.map(o => `${o.p.toFixed(3)}`).join(", "));
  say("the transfers net to zero at every weight",
      sup.every(o => Math.abs(o.tA + o.tB) < 1e-9),
      sup.map(o => (o.tA + o.tB).toExponential(1)).join(", "));
  say("and the budget line passes through the allocation it implements",
      sup.every(o => o.onLine < 1e-9));

  // Negishi against the excess-demand root: two algorithms that share no code
  const neg = await p.evaluate(() => {
    const E = window.__edgeworth, st = E.st;
    const r = E.negishiSolve(st);
    const q = E.paretoAtWeight(st, r.lam);
    const S = E.supportAt(st, q.x, q.y);
    return { lam:r.lam, t:S.tA, p:S.p, x:q.x, y:q.y,
             walras: st.eq.length ? st.eq[0].p : NaN,
             walrasX: st.eq.length ? st.eq[0].A[0] : NaN,
             walrasY: st.eq.length ? st.eq[0].A[1] : NaN };
  });
  say("Negishi drives the transfer to zero", Math.abs(neg.t) < 1e-4,
      `T_A = ${neg.t.toExponential(1)} at lambda = ${neg.lam.toFixed(4)}`);
  say("and finds the same equilibrium the excess-demand root does",
      Math.abs(neg.p - neg.walras) < 0.01 &&
      Math.abs(neg.x - neg.walrasX) < 0.03 && Math.abs(neg.y - neg.walrasY) < 0.03,
      `Negishi (${neg.x.toFixed(3)}, ${neg.y.toFixed(3)}) at p=${neg.p.toFixed(3)} vs ` +
      `Walras (${neg.walrasX.toFixed(3)}, ${neg.walrasY.toFixed(3)}) at p=${neg.walras.toFixed(3)}`);

  // the inverse map: which weight would have chosen this allocation
  const inv = await p.evaluate(() => {
    const E = window.__edgeworth, st = E.st;
    const R = st.lamRange, l = R.lo + 0.6 * (R.hi - R.lo);
    const q = E.paretoAtWeight(st, l);
    return { want:l, back:E.weightFor(st, q.x, q.y) };
  });
  say("and the weight can be read back off the allocation it chose",
      Math.abs(inv.back - inv.want) < 0.004,
      `${inv.back.toFixed(4)} vs ${inv.want.toFixed(4)}`);

  // === the firm ===========================================================
  const setModel = (m, F) => p.evaluate(([m, F]) => {
    const E = window.__edgeworth, st = E.st;
    if(F){ st.Fx = F[0]; st.Fy = F[1]; st.Fc = F[2]; }
    E.setModel(m);
    return { Wx:st.Wx, Wy:st.Wy, n:st.contract.length };
  }, [m, F]);

  // Robinson: one consumer, quarter-circle frontier, sqrt(xy).  MRS = y/x and
  // MRT = x/y, so the optimum is x = y = 8/sqrt(2).
  await setPrefs(['cd',{a:0.5}], ['cd',{a:0.5}], [6,2,2,6]);
  await setModel('robinson', [8, 8, 2]);
  const rob = await p.evaluate(() => {
    const st = window.__edgeworth.st;
    return { n:st.contract.length, x:st.contract[0].x, y:st.contract[0].y };
  });
  say("Robinson has a single Pareto point", rob.n === 1, `${rob.n} point(s)`);
  say("and it sits where MRS meets MRT",
      Math.abs(rob.x - 8/Math.SQRT2) < 0.01 && Math.abs(rob.y - 8/Math.SQRT2) < 0.01,
      `(${rob.x.toFixed(3)}, ${rob.y.toFixed(3)}) vs (${(8/Math.SQRT2).toFixed(3)}, ${(8/Math.SQRT2).toFixed(3)})`);

  // asymmetric: u = x^0.7 y^0.3 on the same circle.  7y/(3x) = x/y gives
  // y = x sqrt(3/7) and x^2 (1 + 3/7) = 64.
  await p.evaluate(() => {
    const E = window.__edgeworth;
    E.setFamily('a','cd',{a:0.7}); E.applyPrefs(); E.recomputeModel(); E.syncState();
  });
  const rob2 = await p.evaluate(() => {
    const c = window.__edgeworth.st.contract[0];
    return { x:c.x, y:c.y };
  });
  const rx = Math.sqrt(64 * 7 / 10), ry = rx * Math.sqrt(3 / 7);
  say("a lopsided taste tilts it to the analytic place",
      Math.abs(rob2.x - rx) < 0.02 && Math.abs(rob2.y - ry) < 0.02,
      `(${rob2.x.toFixed(3)}, ${rob2.y.toFixed(3)}) vs (${rx.toFixed(3)}, ${ry.toFixed(3)})`);

  // Production with two consumers: square the frontier off against the corner
  // and it has to reproduce the exchange box it is the limit of.
  await p.evaluate(() => {
    const E = window.__edgeworth;
    E.setFamily('a','cd',{a:0.5}); E.applyPrefs();
  });
  await setModel('production', [8, 8, 14]);
  const prod = await p.evaluate(() => {
    const E = window.__edgeworth, st = E.st;
    const R = st.lamRange;
    const q = E.paretoAtWeight(st, (R.lo + R.hi) / 2);
    const S = E.supportAt(st, q.x, q.y);
    return { n:st.contract.length, x:q.x, y:q.y, p:S.p, tsum:S.tA + S.tB,
             prodX:S.Wx, prodY:S.Wy, profit:S.profit };
  });
  // the frontier's own symmetric point is 8*(1/2)^(1/c), and two identical
  // consumers split whatever the firm makes there down the middle
  const sym = 8 * Math.pow(0.5, 1 / 14);
  say("the firm produces at the symmetric point of its frontier",
      Math.abs(prod.prodX - sym) < 0.05 && Math.abs(prod.prodY - sym) < 0.05,
      `(${prod.prodX.toFixed(3)}, ${prod.prodY.toFixed(3)}) vs (${sym.toFixed(3)}, ${sym.toFixed(3)})`);
  // With the frontier squared off, the whole model has to reduce to the
  // exchange box: two identical consumers put the Pareto set on the diagonal,
  // exactly as they do without a firm. That is the residual field — a
  // maximisation per grid cell — agreeing with the plain complementary bundle.
  const prodDiag = await p.evaluate(() => {
    const st = window.__edgeworth.st;
    let worst = 0, n = 0;
    for(const q of st.contract){
      if(q.x < 0.6 || q.y < 0.6 || q.x > st.Wx - 1.2 || q.y > st.Wy - 1.2) continue;
      worst = Math.max(worst, Math.abs(q.y - q.x)); n++;
    }
    return { worst, n };
  });
  say("and its Pareto set is the diagonal, as in the box it reduces to",
      prodDiag.n > 8 && prodDiag.worst < 0.08,
      `max |y - x| = ${prodDiag.worst.toFixed(4)} over ${prodDiag.n} interior points`);
  say("and transfers still net to zero with a firm in the room",
      Math.abs(prod.tsum) < 1e-9, prod.tsum.toExponential(1));

  // a rounded frontier: at the efficient point both consumers' MRS must equal
  // the firm's MRT, which is the whole three-way condition
  await setModel('production', [8, 8, 2]);
  const three = await p.evaluate(() => {
    const E = window.__edgeworth, st = E.st;
    const R = st.lamRange;
    const q = E.paretoAtWeight(st, (R.lo + R.hi) / 2);
    const S = E.supportAt(st, q.x, q.y);
    return { mrsA:S.mrsA, mrsB:S.mrsB, mrt:S.mrt, x:q.x, y:q.y };
  });
  say("MRS_A = MRS_B = MRT at a production optimum",
      Math.abs(three.mrsA - three.mrsB) < 0.03 &&
      Math.abs(three.mrsA - three.mrt) < 0.05,
      `${three.mrsA.toFixed(3)} / ${three.mrsB.toFixed(3)} / ${three.mrt.toFixed(3)}`);

  // Negishi with a firm, where income is a share of profit rather than goods
  const negP = await p.evaluate(() => {
    const E = window.__edgeworth, st = E.st;
    st.theta = 0.5;
    const r = E.negishiSolve(st);
    const q = r.viaCurve ? { x:r.x, y:r.y } : E.paretoAtWeight(st, r.lam);
    const S = E.supportAt(st, q.x, q.y);
    return { lam:r.lam, tA:S.tA, x:q.x, y:q.y, ownA:S.ownA, incA:S.incA };
  });
  say("Negishi clears a production economy too, on profit shares",
      Math.abs(negP.tA) < 1e-3,
      `T_A = ${negP.tA.toExponential(1)} at lambda = ${negP.lam.toFixed(4)}`);
  // an equal share of the firm, and identical tastes, has to give each half
  // of whatever the firm makes
  const negHalf = await p.evaluate(() => {
    const E = window.__edgeworth, st = E.st;
    const r = E.negishiSolve(st);
    const q = r.viaCurve ? { x:r.x, y:r.y } : E.paretoAtWeight(st, r.lam);
    const S = E.supportAt(st, q.x, q.y);
    return { x:q.x, y:q.y, X:S.Wx, Y:S.Wy };
  });
  say("with an equal share, each gets half of what the firm makes",
      Math.abs(negHalf.x - negHalf.X/2) < 0.08 && Math.abs(negHalf.y - negHalf.Y/2) < 0.08,
      `(${negHalf.x.toFixed(3)}, ${negHalf.y.toFixed(3)}) of (${negHalf.X.toFixed(3)}, ${negHalf.Y.toFixed(3)})`);

  // the frontier really is the edge of the world
  const edge = await p.evaluate(() => {
    const st = window.__edgeworth.st;
    const out = st.fA.g[st.fA.n * st.fA.n - 1];         // the far corner
    const mid = window.__edgeworth.bUtilAt(st, 1, 1);
    return { outside:!Number.isFinite(out), inside:Number.isFinite(mid) };
  });
  say("outside the frontier there is nothing to have", edge.outside && edge.inside);

  await setModel('exchange');
  await setPrefs(['cd',{a:0.5}], ['cd',{a:0.5}], [6,2,2,6]);



  // === driving the actual controls =======================================
  // The model API can be right while the buttons are wired to the wrong code,
  // so these go through the DOM the way a student would.
  const ui = await p.evaluate(async () => {
    const $ = id => document.getElementById(id);
    const out = {};
    $('mdl-production').click();
    await new Promise(r => setTimeout(r, 500));
    out.prodModel   = window.__edgeworth.st.model;
    out.firmShown   = !$('g-firm').hidden;
    out.endowHidden = $('g-endow').hidden;
    out.auctionHidden = $('radio-auction').hidden;

    $('mdl-robinson').click();
    await new Promise(r => setTimeout(r, 500));
    out.robModel = window.__edgeworth.st.model;
    out.bHidden  = document.querySelectorAll('.agent')[1].hidden;
    out.thetaHidden = $('row-theta').hidden;

    $('mdl-exchange').click();
    await new Promise(r => setTimeout(r, 500));
    out.backModel  = window.__edgeworth.st.model;
    out.firmHidden = $('g-firm').hidden;
    return out;
  });
  say("the model buttons switch the economy",
      ui.prodModel === 'production' && ui.robModel === 'robinson' && ui.backModel === 'exchange');
  say("and the rail shows the controls that model has",
      ui.firmShown && ui.endowHidden && ui.auctionHidden && ui.bHidden &&
      ui.thetaHidden && ui.firmHidden);

  // the planner scrubber has to move lambda, and say so
  await setPrefs(['cd',{a:0.7}], ['cd',{a:0.3}], [6,2,2,6]);
  const plan = await p.evaluate(async () => {
    const E = window.__edgeworth, st = E.st;
    document.querySelector('input[name="method"][value="planner"]').click();
    await new Promise(r => setTimeout(r, 300));
    const read = () => ({ lam:st.lam, shown:document.getElementById('scrub-val').textContent,
                          x:st.P[0], cells:document.getElementById('readoutAux').textContent });
    const sc = document.getElementById('scrub');
    sc.value = 0.15; sc.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 250));
    const lo = read();
    sc.value = 0.85; sc.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 250));
    const hi = read();
    return { lo, hi, range:st.lamRange };
  });
  say("the planner scrubber moves the weight and reports it",
      plan.hi.lam > plan.lo.lam && plan.hi.x > plan.lo.x &&
      plan.lo.shown === plan.lo.lam.toFixed(3) && plan.hi.shown === plan.hi.lam.toFixed(3),
      `lambda ${plan.lo.lam.toFixed(3)} -> ${plan.hi.lam.toFixed(3)}, ` +
      `x ${plan.lo.x.toFixed(2)} -> ${plan.hi.x.toFixed(2)}`);
  // the page is still in its default language here, so match either
  say("and the readout carries the weight, the price and both transfers",
      /Transf(er)?\.? A/i.test(plan.hi.cells) && /Transf(er)?\.? B/i.test(plan.hi.cells) &&
      /(Support price|Precio de apoyo)/i.test(plan.hi.cells) &&
      /(Negishi)/i.test(plan.hi.cells),
      plan.hi.cells.replace(/\s+/g, " ").slice(0, 90));

  // arrow keys on the box step the weight in planner mode
  const keys = await p.evaluate(async () => {
    const st = window.__edgeworth.st, before = st.lam;
    const cv = document.getElementById('cbox');
    cv.dispatchEvent(new KeyboardEvent('keydown', { key:'ArrowLeft', bubbles:true }));
    await new Promise(r => setTimeout(r, 250));
    return { before, after:st.lam };
  });
  say("arrow keys step the weight too", keys.after < keys.before,
      `${keys.before.toFixed(4)} -> ${keys.after.toFixed(4)}`);

  // the Negishi button lands on the competitive equilibrium
  const negBtn = await p.evaluate(async () => {
    const E = window.__edgeworth, st = E.st;
    document.getElementById('btn-negishi').click();
    await new Promise(r => setTimeout(r, 400));
    const S = E.supportAt(st, st.PA[0], st.PA[1]);
    return { lam:st.lam, tA:S.tA, x:st.P[0], y:st.P[1],
             wx:st.eq.length ? st.eq[0].A[0] : NaN, wy:st.eq.length ? st.eq[0].A[1] : NaN };
  });
  say("the Negishi button lands on the competitive equilibrium",
      Math.abs(negBtn.tA) < 1e-3 && Math.abs(negBtn.x - negBtn.wx) < 0.05 &&
      Math.abs(negBtn.y - negBtn.wy) < 0.05,
      `(${negBtn.x.toFixed(3)}, ${negBtn.y.toFixed(3)}) vs Walras (${negBtn.wx.toFixed(3)}, ${negBtn.wy.toFixed(3)})`);

  // the two budget sets have to be painted, in their owners' colours
  const paint = await p.evaluate(async () => {
    const E = window.__edgeworth, st = E.st;
    st.layers.swt = true; st.layers.lens = false;
    E.syncState(); E.render();
    await new Promise(r => setTimeout(r, 350));
    const cv = document.getElementById('cbox');
    const g = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let red = 0, blue = 0;
    for(let i = 0; i < g.length; i += 4){
      if(g[i] > g[i+2] + 12 && g[i] > g[i+1] + 12) red++;
      if(g[i+2] > g[i] + 12 && g[i+2] > g[i+1] + 6) blue++;
    }
    /* and they must be on the right SIDES: A's set holds A's origin at the
       bottom left, B's holds B's at the top right. Counting alone would pass
       just as happily with the two swapped. */
    const w = cv.width, h = cv.height;
    const at = (fx, fy) => {
      const i = ((Math.round(fy * h) * w) + Math.round(fx * w)) * 4;
      return [g[i], g[i+1], g[i+2]];
    };
    const nearA = at(0.18, 0.86);          // near O_A, bottom left
    const nearB = at(0.82, 0.14);          // near O_B, top right
    return { red, blue, nearA, nearB };
  });
  say("A's budget set is painted red and B's blue",
      paint.red > 4000 && paint.blue > 4000, `${paint.red} red px, ${paint.blue} blue px`);
  say("and on the right sides of the line: A's holds A's origin",
      paint.nearA[0] > paint.nearA[2] + 8 && paint.nearB[2] > paint.nearB[0] + 8,
      `by O_A rgb(${paint.nearA}) · by O_B rgb(${paint.nearB})`);

  // each set has its own switch, and the line survives both being off
  const toggles = await p.evaluate(async () => {
    const E = window.__edgeworth, st = E.st;
    const count = async () => {
      E.syncState(); E.render();
      await new Promise(r => setTimeout(r, 300));
      const cv = document.getElementById('cbox');
      const g = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      let red = 0, blue = 0, gold = 0;
      for(let i = 0; i < g.length; i += 4){
        if(g[i] > g[i+2] + 12 && g[i] > g[i+1] + 12) red++;
        if(g[i+2] > g[i] + 12 && g[i+2] > g[i+1] + 6) blue++;
        if(g[i] > 180 && g[i+1] > 140 && g[i+2] < 120) gold++;
      }
      return { red, blue, gold };
    };
    st.layers.budgetA = true;  st.layers.budgetB = false; const aOnly = await count();
    st.layers.budgetA = false; st.layers.budgetB = true;  const bOnly = await count();
    st.layers.budgetA = false; st.layers.budgetB = false; const none  = await count();
    st.layers.budgetA = true;  st.layers.budgetB = true;
    return { aOnly, bOnly, none };
  });
  say("A's set can be shown without B's, and the other way round",
      toggles.aOnly.red > 3 * toggles.bOnly.red &&
      toggles.bOnly.blue > 3 * toggles.aOnly.blue &&
      toggles.none.red < toggles.aOnly.red / 3 &&
      toggles.none.blue < toggles.bOnly.blue / 3,
      `A only: ${toggles.aOnly.red}r/${toggles.aOnly.blue}b · B only: ${toggles.bOnly.red}r/${toggles.bOnly.blue}b`);
  say("and the budget line itself stays drawn with both sets off",
      toggles.none.gold > 200, `${toggles.none.gold} px of line`);

  await p.evaluate(() => { const st = window.__edgeworth.st; st.map = "gains"; st.layers.lens = true; });
  await setPrefs(['cd',{a:0.5}], ['cd',{a:0.5}], [6,2,2,6]);



  // === dragging the endowment ============================================
  await p.evaluate(() => { const E = window.__edgeworth; E.setMethod('free'); });
  const drag = await p.evaluate(async () => {
    const E = window.__edgeworth, st = E.st;
    const before = { w:[st.wAx, st.wAy, st.wBx, st.wBy], Wx:st.Wx, Wy:st.Wy,
                     eq:st.eq.length ? st.eq[0].p : NaN,
                     eqA:st.eq.length ? st.eq[0].A.slice() : null,
                     contract:st.contract.map(q => q.x + q.y) };
    const cv = document.getElementById('cbox');
    const r = cv.getBoundingClientRect();
    // grab exactly on the omega marker and drop it somewhere else
    const box = { x0:0, y0:0 };
    const sx = x => r.left + 46 + (x / st.Wx) * (r.width - 92);
    const sy = y => r.top + r.height - 36 - (y / st.Wy) * (r.height - 70);
    cv.dispatchEvent(new PointerEvent('pointerdown', { clientX:sx(st.wAx), clientY:sy(st.wAy), pointerId:7, bubbles:true }));
    await new Promise(res => setTimeout(res, 60));
    const grabbed = st.wAx;
    cv.dispatchEvent(new PointerEvent('pointermove', { clientX:sx(1.5), clientY:sy(1.5), pointerId:7, bubbles:true }));
    await new Promise(res => setTimeout(res, 250));
    cv.dispatchEvent(new PointerEvent('pointerup', { pointerId:7, bubbles:true }));
    return { before, after:{ w:[st.wAx, st.wAy, st.wBx, st.wBy], Wx:st.Wx, Wy:st.Wy,
                             eq:st.eq.length ? st.eq[0].p : NaN,
                             eqA:st.eq.length ? st.eq[0].A.slice() : null,
                             contract:st.contract.map(q => q.x + q.y),
                             slider:+document.getElementById('eax').value } };
  });
  const moved = Math.abs(drag.after.w[0] - drag.before.w[0]) > 1;
  say("the endowment can be dragged in the diagram", moved,
      `(${drag.before.w[0]}, ${drag.before.w[1]}) -> (${drag.after.w[0].toFixed(2)}, ${drag.after.w[1].toFixed(2)})`);
  say("and the box keeps its size: what A drops, B picks up",
      Math.abs(drag.after.Wx - drag.before.Wx) < 1e-9 &&
      Math.abs(drag.after.Wy - drag.before.Wy) < 1e-9 &&
      Math.abs(drag.after.w[0] + drag.after.w[2] - drag.after.Wx) < 1e-9 &&
      Math.abs(drag.after.w[1] + drag.after.w[3] - drag.after.Wy) < 1e-9,
      `${drag.after.Wx} x ${drag.after.Wy}`);
  say("the sliders follow the drag",
      Math.abs(drag.after.slider - drag.after.w[0]) < 1e-9,
      `slider ${drag.after.slider} vs state ${drag.after.w[0].toFixed(2)}`);
  say("the Pareto set is untouched — only who owns what changed",
      drag.before.contract.length === drag.after.contract.length &&
      drag.before.contract.every((v, i) => Math.abs(v - drag.after.contract[i]) < 1e-9));
  // Two identical Cobb-Douglas consumers clear at p = 1 whatever the split —
  // each spends half of income on each good — so it is the equilibrium
  // ALLOCATION that has to follow the endowment, not the price.
  say("and the competitive equilibrium follows it",
      drag.before.eqA && drag.after.eqA &&
      Math.abs(drag.after.eqA[0] - drag.before.eqA[0]) > 2,
      `equilibrium x_A ${drag.before.eqA[0].toFixed(3)} -> ${drag.after.eqA[0].toFixed(3)} ` +
      `(p* stays ${drag.after.eq.toFixed(3)}, as it must for identical Cobb-Douglas)`);

  await p.evaluate(() => { const E = window.__edgeworth; E.moveEndowment([6, 2]); });


  // --- language ------------------------------------------------------------
  await p.click('#lang-en');
  await p.waitForTimeout(200);
  say('the interface switches to English',
      (await p.textContent('#t-title')).indexOf('Edgeworth Box') >= 0,
      await p.textContent('#t-title'));

  // --- excess demand panel draws -------------------------------------------
  await p.click('.tool[data-aux="excess"]');
  await p.waitForTimeout(300);
  say('the excess demand panel draws', (await p.evaluate(() => {
    const cv = document.getElementById('caux');
    const g = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let n = 0;
    for(let i = 0; i < g.length; i += 4000) if(g[i+3] > 0) n++;
    return n;
  })) > 10);

  say('no page errors at the end', errs.length === 0, errs.slice(0,3).join(' | '));
  await b.close();
  process.exit(ok ? 0 : 1);
})();
