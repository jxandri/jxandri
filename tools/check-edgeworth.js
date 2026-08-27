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

  // --- quasilinear: a vertical contract curve at a computable place --------
  // u_A = 2sqrt(x)+y, u_B = ln(x)+y  =>  MRS_A = 1/sqrt(x_A), MRS_B = 1/x_B.
  // Tangency: sqrt(x_A) = 8 - x_A, so x_A = ((sqrt(33)-1)/2)^2 = 5.6277...
  const ql = await p.evaluate(async () => {
    const E = window.__edgeworth, st = E.st;
    document.getElementById('ua-expr').value = '2sqrt(x)+y';
    document.getElementById('ub-expr').value = 'ln(x)+y';
    document.getElementById('ua-expr').dispatchEvent(new Event('change'));
    document.getElementById('ub-expr').dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 400));
    const mid = st.contract.filter(q => q.y > 1 && q.y < st.Wy - 1);
    const xs = mid.map(q => q.x);
    return { n:mid.length, lo:Math.min(...xs), hi:Math.max(...xs), Wx:st.Wx };
  });
  const target = Math.pow((Math.sqrt(33) - 1) / 2, 2);
  say('quasilinear contract curve is vertical', ql.n > 5 && (ql.hi - ql.lo) < 0.02,
      `x in [${ql.lo.toFixed(3)}, ${ql.hi.toFixed(3)}]`);
  say('and stands at the analytic x_A', Math.abs((ql.lo + ql.hi)/2 - target) < 0.01,
      `${((ql.lo+ql.hi)/2).toFixed(3)} vs ${target.toFixed(3)}`);

  // --- perfect substitutes: the kinked cases must not fall over ------------
  const subs = await p.evaluate(async () => {
    const st = window.__edgeworth.st;
    document.getElementById('ua-expr').value = 'x+2y';
    document.getElementById('ub-expr').value = '2x+y';
    document.getElementById('ua-expr').dispatchEvent(new Event('change'));
    document.getElementById('ub-expr').dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 400));
    return { curve:st.contract.length, eq:st.eq.length };
  });
  say('perfect substitutes still produce a Pareto set', subs.curve > 3, `${subs.curve} points`);
  const comp = await p.evaluate(async () => {
    const st = window.__edgeworth.st;
    document.getElementById('ua-expr').value = 'min(x,y)';
    document.getElementById('ub-expr').value = 'min(x,2y)';
    document.getElementById('ua-expr').dispatchEvent(new Event('change'));
    document.getElementById('ub-expr').dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 400));
    return { curve:st.contract.length };
  });
  say('perfect complements too, through the kink', comp.curve > 3, `${comp.curve} points`);

  // --- the lens really is a wall ------------------------------------------
  const wall = await p.evaluate(async () => {
    const E = window.__edgeworth, st = E.st;
    document.getElementById('ua-expr').value = 'x^0.5*y^0.5';
    document.getElementById('ub-expr').value = 'x^0.5*y^0.5';
    document.getElementById('ua-expr').dispatchEvent(new Event('change'));
    document.getElementById('ub-expr').dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 400));
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
