/* Verify the complete notebook HTML inside a real iframe with actual keyboard input. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1140, height: 980 } }); const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const base = process.env.GAME_TEST_URL || 'http://127.0.0.1:8000/';
    await page.setContent(`<iframe src="${base}work/colab-bundle.html?test" width="1100" height="850" title="Colab game"></iframe><div style="height:2000px">outer page</div>`);
    const frame = page.frames().find(f => f.url().includes('colab-bundle'));
    await frame.waitForFunction(() => Boolean(window.__RUN188_TEST__));
    await frame.locator('#game').click({ position: { x: 740, y: 430 } });
    if (await frame.locator('#pause-panel').isVisible()) { await frame.locator('#resume-button').click(); await page.waitForTimeout(3200); }
    await page.keyboard.down('ArrowDown'); await page.keyboard.down('Shift'); await page.waitForTimeout(100);
    assert.equal(await frame.evaluate(() => __RUN188_TEST__.model.crouching), true);
    await page.keyboard.up('ArrowDown'); await page.waitForTimeout(100);
    assert.equal(await frame.evaluate(() => __RUN188_TEST__.model.crouching), true);
    await page.keyboard.up('Shift'); await page.waitForTimeout(100);
    assert.equal(await frame.evaluate(() => __RUN188_TEST__.model.crouching), false);
    await page.keyboard.down('s'); await page.waitForTimeout(100);
    assert.equal(await frame.evaluate(() => __RUN188_TEST__.model.straddling), true);
    await page.keyboard.up('s'); await page.waitForTimeout(100);
    assert.equal(await frame.evaluate(() => __RUN188_TEST__.model.straddling), false);
    await page.keyboard.press('Space'); await page.waitForTimeout(100);
    assert.ok(await frame.evaluate(() => __RUN188_TEST__.model.jumpY > 0));
    assert.equal(await page.evaluate(() => scrollY), 0);
    assert.equal(await frame.evaluate(() => scrollY), 0);
    // Holding E cannot silently collect an arriving item through key repeat.
    await frame.locator('#skip-checkbox').check(); await frame.locator('#skip-button').click();
    await frame.locator('#nickname-skip').click(); await frame.waitForFunction(() => __RUN188_TEST__.model.mode === 'playing');
    await frame.evaluate(() => { const g = __RUN188_TEST__.model; g.events = [g.makeItem(Run188.ITEMS[0], 0)]; g.spawnTimer = 100; });
    await page.keyboard.down('e'); assert.equal(await frame.evaluate(() => __RUN188_TEST__.model.items), 1);
    await frame.evaluate(() => { const g = __RUN188_TEST__.model; g.events = [g.makeItem(Run188.ITEMS[0], 0)]; });
    await page.keyboard.down('e'); assert.equal(await frame.evaluate(() => __RUN188_TEST__.model.items), 1);
    await page.keyboard.up('e'); await page.keyboard.press('e'); assert.equal(await frame.evaluate(() => __RUN188_TEST__.model.items), 2);
    assert.deepEqual(errors, []);
    console.log('PASS: standalone Colab bundle in real iframe; keyboard focus; two crouch keys; no page scroll; E requires fresh press');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
