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
