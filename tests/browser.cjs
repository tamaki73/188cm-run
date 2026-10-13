/* Run with a local HTTP server on port 8000 and Playwright + Chromium installed. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const url = process.env.GAME_TEST_URL || 'http://127.0.0.1:8000/';
const get = (page, fn) => page.evaluate(fn);
const state = page => get(page, () => { const g = __RUN188_TEST__.model; return { mode: g.mode, step: g.tutorial.step, done: g.tutorial.done, crouching: g.crouching, straddling: g.straddling, jumpY: g.jumpY, items: g.items, paused: g.paused, score: g.score, strain: g.strain }; });

(async () => {
  fs.mkdirSync(path.join(__dirname, '../work'), { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1140, height: 940 } });
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(url + '?test'); await page.locator('#game').click({ position: { x: 700, y: 400 } });
    assert.equal((await state(page)).mode, 'tutorial');
    await page.screenshot({ path: path.join(__dirname, '../work/tutorial.png') });
    if ((await state(page)).paused) { await page.locator('#resume-button').click(); await page.waitForTimeout(3200); }
    await page.keyboard.down('ArrowDown'); await page.waitForTimeout(130);
    assert.equal((await state(page)).crouching, true);
    await page.keyboard.up('ArrowDown'); await page.waitForTimeout(100); assert.equal((await state(page)).crouching, false);
    await page.keyboard.down('s'); await page.waitForTimeout(100); assert.equal((await state(page)).straddling, true);
    await page.keyboard.up('s'); await page.waitForTimeout(100); assert.equal((await state(page)).straddling, false);
    await page.keyboard.press('Space'); await page.waitForTimeout(100); assert.ok((await state(page)).jumpY > 0);
    await page.keyboard.press('e');
    assert.equal((await state(page)).done, true);
    assert.equal(await page.evaluate(() => window.scrollY), 0);
    await page.locator('#next-button').click();
    while ((await state(page)).mode === 'tutorial') {
      const step = (await state(page)).step;
      if (step === 7) {
        await page.keyboard.down('ArrowDown'); await page.waitForFunction(() => __RUN188_TEST__.model.tutorial.peak);
        await page.keyboard.up('ArrowDown'); await page.waitForFunction(() => __RUN188_TEST__.model.tutorial.recovered);
        await page.keyboard.press('Space');
      } else {
        const count = step === 8 ? 5 : 1;
        for (let i = 0; i < count; i++) {
          await page.waitForFunction(() => __RUN188_TEST__.model.events.some(e => !e.completed));
          const info = await page.evaluate(() => { const e=__RUN188_TEST__.model.events.find(e=>!e.completed); return { uid:e.uid, kind:e.kind, rule:e.rule, low:e.clearance<190, high:e.high }; });
          if (info.kind === 'item') {
            if (info.high) {
              await page.waitForFunction(uid => { const g=__RUN188_TEST__.model,e=g.events.find(e=>e.uid===uid); return e.z/g.speed<=.50; }, info.uid);
              await page.keyboard.press('Space');
              await page.waitForFunction(uid => { const g=__RUN188_TEST__.model,e=g.events.find(e=>e.uid===uid); return g.jumpY>0 && g.handHeight+Run188.CONFIG.REACH_TOLERANCE>=e.height && Math.abs(e.z)<e.reachDistance*.8; }, info.uid);
            } else await page.waitForFunction(uid => { const e=__RUN188_TEST__.model.events.find(e=>e.uid===uid); return Math.abs(e.z)<e.reachDistance*.65; }, info.uid);
            await page.keyboard.press('e');
            assert.ok(await page.evaluate(uid => __RUN188_TEST__.model.events.find(e=>e.uid===uid)?.collected,info.uid));
          } else if (info.rule === 'jump') {
            await page.waitForFunction(uid => { const g=__RUN188_TEST__.model,e=g.events.find(e=>e.uid===uid); return e.z/g.speed<=.44; },info.uid);
            await page.keyboard.press('Space');
          } else if (info.rule === 'straddle' || info.low) {
            await page.waitForFunction(uid => { const g=__RUN188_TEST__.model,e=g.events.find(e=>e.uid===uid); return e.z/g.speed<=.13; },info.uid);
            await page.keyboard.down(info.rule==='straddle'?'s':'Shift');
          }
          await page.waitForFunction(uid => { const g=__RUN188_TEST__.model,e=g.events.find(e=>e.uid===uid); return e?.completed || g.tutorial.done; },info.uid);
          await page.keyboard.up('Shift'); await page.keyboard.up('s');
          if ((await state(page)).done) break;
        }
      }
      await page.waitForFunction(() => __RUN188_TEST__.model.tutorial.done);
      assert.equal((await state(page)).step,step); await page.locator('#next-button').click();
    }
    assert.equal((await state(page)).mode, 'playing');
    console.log('PASS: all nine lessons and five-event combination completed with actual keyboard inputs');
    // Deterministic scenarios exercise the browser input layer against real simulation.
    await page.evaluate(() => { const g = __RUN188_TEST__.model; g.events = [g.makeObstacle(Run188.OBSTACLES.find(d=>d.id==='club-door'),175,17)]; g.spawnTimer = 100; });
    await page.screenshot({ path: path.join(__dirname, '../work/gameplay.png') });
    assert.equal(await page.locator('#tutorial-panel').isVisible(), false);
    const normalText = await page.locator('#game').innerText();
    assert.ok(!/182cm|183cm|184cm|185cm|186cm|187cm|しゃがめ|安全|ジャンプが必要/.test(normalText));
    await page.waitForFunction(() => __RUN188_TEST__.model.mode === 'gameover');
    assert.match(await page.locator('#over-reason').innerText(), /頭をぶつけ/);
    await page.screenshot({ path: path.join(__dirname, '../work/gameover.png') });
    await page.keyboard.press('Enter'); assert.equal((await state(page)).mode, 'playing'); assert.equal((await state(page)).items, 0);
    await page.keyboard.press('Escape'); assert.equal((await state(page)).paused, true);
    const d = await page.evaluate(() => __RUN188_TEST__.model.distance); await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => __RUN188_TEST__.model.distance), d);
    await page.locator('#resume-button').click(); await page.waitForTimeout(3300); assert.equal((await state(page)).paused, false);
    console.log('PASS: gameplay collision, hidden answers, Enter restart and pause/resume');
    await page.evaluate(() => { const {model:g,pause}=__RUN188_TEST__; g.start(); g.spawnTimer=100; const d=Run188.OBSTACLES.find(e=>e.id==='strap'); g.events=[g.makeObstacle(d,160,-.5)]; g.crouching=true; pause(); });
    await page.locator('#resume-button').click(); await page.keyboard.down('Shift'); await page.waitForTimeout(3500);
    assert.equal((await state(page)).mode,'playing'); await page.keyboard.up('Shift');
    console.log('PASS: holding crouch during countdown safely resumes inside an occupied low passage');
    await page.locator('#home-link').click(); await page.screenshot({ path: path.join(__dirname, '../work/title.png') });
    await page.locator('#tutorial-button').click();
    assert.equal(await page.locator('#skip-button').isDisabled(), true);
    await page.locator('#skip-checkbox').check(); assert.equal((await state(page)).mode, 'tutorial');
    await page.locator('#skip-button').click(); assert.equal((await state(page)).mode, 'playing');
    await page.reload(); assert.equal((await state(page)).mode, 'title');
    await page.locator('#tutorial-button').click(); assert.equal((await state(page)).mode, 'tutorial');
    console.log('PASS: skip setting persists, checking does not start play, tutorial replay works');
    // Render every dedicated fixture and doorway; a broken drawer must fail the test.
    await page.evaluate(() => {
      const { model, draw } = __RUN188_TEST__;
      for (const def of Run188.OBSTACLES) { model.events = [model.makeObstacle(def, def.min, 5)]; draw(); }
      for (let i=0;i<Run188.AREAS.length;i++) { model.distance=i*Run188.CONFIG.AREA_LENGTH; draw(); }
      for (const def of Run188.ITEMS) { model.events = [model.makeItem(def, 5)]; draw(); }
    });
    // Storage-denied mode simulates browser restrictions common in embedded outputs.
    const blocked = await browser.newContext({ viewport: { width: 1100, height: 940 } });
    await blocked.addInitScript(() => { Storage.prototype.getItem = function () { throw new DOMException('blocked', 'SecurityError'); }; Storage.prototype.setItem = function () { throw new DOMException('blocked', 'SecurityError'); }; });
    const blockedPage = await blocked.newPage(); blockedPage.on('pageerror', e => errors.push(e.message));
    await blockedPage.goto(url + '?test'); assert.equal((await state(blockedPage)).mode, 'tutorial');
    await blockedPage.locator('#skip-checkbox').check(); await blockedPage.locator('#skip-button').click();
    assert.equal((await state(blockedPage)).mode, 'playing'); await blocked.close();
    console.log('PASS: all 40 event designs and seven areas render and localStorage denial does not stop play');
    await page.setViewportSize({ width: 390, height: 850 }); await page.goto(url + '?test');
    await page.locator('#tutorial-button').click(); await page.screenshot({ path: path.join(__dirname, '../work/mobile.png') });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.locator('#touch-crouch').scrollIntoViewIfNeeded();
    const touchBox = await page.locator('#touch-crouch').boundingBox();
    await page.mouse.move(touchBox.x + touchBox.width / 2, touchBox.y + touchBox.height / 2);
    await page.mouse.down(); await page.waitForTimeout(100);
    assert.equal((await state(page)).crouching, true); await page.mouse.up();
    await page.waitForTimeout(100); assert.equal((await state(page)).crouching, false);
    for (const [id, field] of [['touch-straddle','straddling'],['touch-jump','jumpY'],['touch-grab','grab']]) {
      await page.locator('#'+id).scrollIntoViewIfNeeded();
      const box=await page.locator('#'+id).boundingBox(); await page.mouse.move(box.x+box.width/2,box.y+box.height/2); await page.mouse.down(); await page.waitForTimeout(100);
      if(field==='grab') assert.ok(await page.evaluate(()=>__RUN188_TEST__.model.tutorial.actions.has('grab')));
      else assert.ok((await state(page))[field]);
      await page.mouse.up(); await page.waitForTimeout(100);
      if(field==='straddling') assert.equal((await state(page)).straddling,false);
    }
    console.log('PASS: narrow layout and hold/release touch controls');
    assert.deepEqual(errors, []); console.log('PASS: no browser JavaScript errors');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
