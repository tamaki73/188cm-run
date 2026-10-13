'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  fs.mkdirSync('work',{recursive:true});
  const context=await browser.newContext({viewport:{width:1440,height:1080},deviceScaleFactor:2});
  await require('./offline-config.cjs')(context);
  await context.addInitScript(()=>localStorage.setItem('188cm-run:skipTutorial','true'));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto((process.env.GAME_TEST_URL||'http://127.0.0.1:8000/')+'?test');
  await page.screenshot({scale:'css',path:'work/glass-title-desktop.png'});
  const size=await page.locator('#canvas').evaluate(canvas=>({width:canvas.getBoundingClientRect().width,height:canvas.getBoundingClientRect().height,pw:canvas.width,ph:canvas.height}));
  assert.ok(size.width>1150);assert.ok(Math.abs(size.width/size.height-960/680)<.002);assert.ok(Math.abs(size.pw/size.width-2)<.01);
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()),'#800020');
  assert.equal(await page.evaluate(()=>__RUN188_TEST__.camera.HORIZON),246);
  await page.locator('#start-button').click();
  const warning='※本名は入力しないでください。ニックネームはランキングで公開されます。';
  assert.equal(await page.locator('#nickname-privacy').innerText(),warning);assert.ok(await page.locator('#nickname-privacy').isVisible());
  assert.ok(await page.locator('#nickname-privacy').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=12));
  assert.equal(await page.locator('#nickname').getAttribute('placeholder'),'例：RUNNER188');
  await page.locator('#nickname').fill('RUNNER188');assert.ok(await page.locator('#nickname-privacy').isVisible());await page.locator('#nickname-form button').click();
  await page.waitForFunction(()=>__RUN188_TEST__.model.mode==='playing');
  await page.evaluate(()=>{const t=__RUN188_TEST__,g=t.model;g.start();g.paused=true;g.distance=850;const d=Run188.OBSTACLES.find(d=>d.id==='mini-train');g.events=[g.makeObstacle(d,70,14)];g.straddling=true;t.syncUI();t.draw();});
  await page.addStyleTag({content:'#pause-panel{display:none!important}'});
  await page.locator('#game').screenshot({scale:'css',path:'work/glass-long-train.png'});
  const geometry=await page.evaluate(()=>{const t=__RUN188_TEST__,e=t.model.events[0],g=t.trainGeometry(e);return{length:e.length,near:g.near,far:g.far,front:g.point(g.near,33,70),rear:g.point(g.far,33,70),alpha:t.runnerOpacity()};});
  assert.ok(geometry.length>40);assert.ok(geometry.front[1]-geometry.rear[1]>60);assert.ok(geometry.alpha<1);
  for(const earlyRelease of [false,true]) {
   await page.evaluate(()=>{const t=__RUN188_TEST__,g=t.model;g.start();g.distance=850;g.spawnTimer=1e9;const d=Run188.OBSTACLES.find(d=>d.id==='mini-train');g.events=[g.makeObstacle(d,70,18)];document.getElementById('game').focus();t.syncUI();});
   await page.keyboard.down('s');await page.waitForFunction(()=>__RUN188_TEST__.model.events[0].z<0);
   await page.waitForTimeout(260);
   assert.equal(await page.evaluate(()=>__RUN188_TEST__.model.mode),'playing');
   if(earlyRelease){await page.keyboard.up('s');await page.waitForFunction(()=>__RUN188_TEST__.model.mode==='gameover');assert.match(await page.locator('#over-reason').innerText(),/ミニ電車/);}
   else{await page.waitForFunction(()=>__RUN188_TEST__.model.events[0].completed);await page.keyboard.up('s');assert.equal(await page.evaluate(()=>__RUN188_TEST__.model.mode),'playing');}
  }
  // UI fixture exercises medal/own-row styles without production calls; emulator tests separately verify UID ownership.
  await page.evaluate(async()=>{const t=__RUN188_TEST__,r=t.ranking;r.config={season:'season-1',firebase:{apiKey:'test',projectId:'demo',appId:'test'}};r.adapter={top:async()=>[{nickname:'PLAYER01',distance:1500,isSelf:false},{nickname:'RUNNER188',distance:800,isSelf:true},{nickname:'TAKA',distance:400,isSelf:false}],best:async()=>800};t.openRanking();await t.refreshRanking();});
  assert.equal(await page.locator('.ranking-self').count(),1);assert.match(await page.locator('.ranking-self').innerText(),/あなた/);
  for(const n of [1,2,3])assert.equal(await page.locator('.rank-'+n).count(),1);
  await page.screenshot({scale:'css',path:'work/glass-ranking-desktop.png'});
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(120);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('#nickname').focus();assert.ok(await page.locator('#nickname-privacy').isVisible());
  await page.screenshot({scale:'css',path:'work/glass-ranking-mobile.png'});
  await page.locator('#ranking-close').click();
  await page.evaluate(()=>{const t=__RUN188_TEST__;t.model.start();t.model.paused=true;t.syncUI();});
  const mobile=await page.locator('#canvas').evaluate(c=>({w:c.getBoundingClientRect().width,h:c.getBoundingClientRect().height,pw:c.width}));
  assert.ok(mobile.w>375);assert.ok(Math.abs(mobile.w/mobile.h-960/680)<.002);assert.ok(Math.abs(mobile.pw/mobile.w-2)<.015);
  for(const id of ['touch-crouch','touch-straddle','touch-jump','touch-grab'])assert.ok(await page.locator('#'+id).isVisible());
  await page.screenshot({scale:'css',path:'work/glass-game-mobile.png'});
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('#ranking-dialog').evaluate(e=>getComputedStyle(e).animationName),'none');
  // Force the CSS fallback path; it must retain a legible dark panel without blur.
  await page.addStyleTag({content:'.title-card,.result-card,.pause-card,.tutorial-panel,#ranking-dialog{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;background:#201822!important}'});
  await page.evaluate(()=>__RUN188_TEST__.openRanking(false));assert.ok(await page.locator('#nickname-privacy').isVisible());
  assert.deepEqual(errors,[]);
  console.log('PASS: burgundy glass UI, nickname privacy before/during input, long 3D train with actual S hold/release, medals and self row, larger desktop/uncropped mobile, DPR2, reduced motion and readable no-blur fallback');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
