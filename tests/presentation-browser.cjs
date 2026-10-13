'use strict';
const{chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const renderMusic=require('./render-music.cjs');
const url=(process.env.GAME_TEST_URL||'http://127.0.0.1:8000/')+'?test';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const errors=[];fs.mkdirSync('work',{recursive:true});
 try{
  for(const mobile of[false,true]){
   const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1080},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:2});
   await require('./offline-config.cjs')(context);await context.addInitScript(()=>{localStorage.setItem('188cm-run:skipTutorial','true');localStorage.setItem('188cm-run:nicknameAsked','true');});
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.bringToFront();
   assert.equal(await page.evaluate(()=>__RUN188_TEST__.sound.context),null);
   await page.screenshot({path:`work/liquid-title-${mobile?'mobile':'desktop'}.png`,scale:'css',fullPage:true});
   await page.locator('#title-panel .settings-open').click();
   await page.waitForFunction(()=>__RUN188_TEST__.music.running&&__RUN188_TEST__.music.notes.size>0);
   assert.equal(await page.evaluate(()=>__RUN188_TEST__.music.scene),'title');
   assert.equal(await page.locator('#sound-volume').inputValue(),'70');assert.equal(await page.locator('#bgm-volume').inputValue(),'35');assert.equal(await page.locator('#quality-select').inputValue(),'auto');
   const widths=[];
   for(const level of['low','medium','high']){
    await page.locator('#quality-select').selectOption(level);widths.push(await page.locator('canvas').evaluate(c=>({css:c.getBoundingClientRect().width,pixels:c.width})));
    assert.equal(await page.evaluate(()=>document.body.dataset.quality),level);
   }
   assert.equal(new Set(widths.map(w=>w.css)).size,1);assert.ok(widths[0].pixels<widths[1].pixels&&widths[1].pixels<widths[2].pixels);
   await page.locator('#quality-select').selectOption('auto');
   // Test the real resize callback, not just the standalone quality policy.
   await page.evaluate(()=>{const t=__RUN188_TEST__;for(let i=0;i<100;i++)t.quality.sample(1/30,15);});
   assert.equal(await page.evaluate(()=>__RUN188_TEST__.quality.level),'medium');
   await page.locator('#bgm-toggle').uncheck();assert.equal(await page.evaluate(()=>__RUN188_TEST__.music.running),false);
   await page.locator('#bgm-toggle').check();await page.locator('#bgm-volume').fill('21');await page.locator('#master-volume').fill('62');await page.locator('#sound-volume').fill('78');
   await page.screenshot({path:`work/liquid-settings-${mobile?'mobile':'desktop'}.png`,scale:'css',fullPage:true});
   await page.locator('#settings-close').click();await page.locator('#start-button').click();
   await page.evaluate(()=>{const t=__RUN188_TEST__;t.model.spawnTimer=10000;t.model.events=[];window.__notes=[];window.__sfx=[];t.music.onNote=e=>{if(__notes.length<1000)__notes.push(e)};t.sound.onPlay=e=>{if(__sfx.length<1000)__sfx.push(e)};});
   await page.waitForFunction(()=>__RUN188_TEST__.music.scene==='play');
   for(const [distance,stage]of[[0,0],[110,1],[310,2],[510,3],[850,4]]){
    await page.evaluate(d=>{__RUN188_TEST__.model.distance=d;},distance);
    await page.waitForFunction(stage=>__RUN188_TEST__.music.stage===stage,stage);
   }
   await page.waitForFunction(()=>__notes.some(e=>e.kind==='lead')&&__notes.some(e=>e.kind==='bass'));
   await page.locator('#pause-button').click();
   assert.equal(await page.evaluate(()=>__RUN188_TEST__.music.running),false);assert.equal(await page.evaluate(()=>__RUN188_TEST__.music.notes.size),0);
   const frozen=await page.evaluate(()=>__RUN188_TEST__.music.step);await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>__RUN188_TEST__.music.step),frozen);
   await page.locator('#resume-button').click();await page.waitForFunction(()=>!__RUN188_TEST__.model.paused);await page.waitForFunction(()=>__RUN188_TEST__.music.running);
   if(mobile)await page.locator('#touch-jump').tap();else await page.keyboard.press('Space');
   await page.waitForFunction(()=>__sfx.some(e=>e.name==='land'));
   await page.evaluate(()=>{const t=__RUN188_TEST__;t.model.events=[t.model.makeItem(Run188.ITEMS.find(x=>x.id==='student-id'),0)];});
   if(mobile)await page.locator('#touch-grab').tap();else await page.keyboard.press('e');
   assert.ok(await page.evaluate(()=>__sfx.some(e=>e.name==='collect')));
   await page.evaluate(()=>{const t=__RUN188_TEST__;t.model.gameOver('確認','collision');t.syncUI();});
   assert.equal(await page.evaluate(()=>__RUN188_TEST__.music.running),false);
   await page.waitForTimeout(550);assert.equal(await page.evaluate(()=>__RUN188_TEST__.music.notes.size),0);assert.equal(await page.evaluate(()=>__RUN188_TEST__.music.timer),null);
   await page.locator('#restart-button').click();await page.evaluate(()=>{__RUN188_TEST__.model.spawnTimer=10000;__RUN188_TEST__.model.events=[];});await page.waitForFunction(()=>__RUN188_TEST__.music.running&&__RUN188_TEST__.music.stage===0);
   await page.locator('#settings-button').click();await page.locator('#bgm-toggle').uncheck();await page.locator('#sound-toggle').uncheck();await page.reload();
   const saved=await page.evaluate(()=>{const t=__RUN188_TEST__;return{bgm:t.music.enabled,sfx:t.sound.enabled,bv:t.music.volume,sv:t.sound.volume,mv:t.sound.masterVolume,q:t.quality.mode,c:t.sound.context}});
   assert.deepEqual(saved,{bgm:false,sfx:false,bv:.21,sv:.78,mv:.62,q:'auto',c:null});
   console.log('PASS:',mobile?'mobile touch':'desktop keyboard','title BGM, five bar-aligned arrangements, separate mixer persistence, quality/DPR, pause/resume/end/restart');
   await context.close();
  }
  const page=await browser.newPage();await require('./offline-config.cjs')(page);await page.goto(url);page.on('pageerror',e=>errors.push(e.message));
  const rendered=await page.evaluate(renderMusic,{bars:34,preview:Boolean(process.env.RENDER_PREVIEW)});
  if(rendered.wav){fs.writeFileSync('work/burgundy-motion.wav',Buffer.from(rendered.wav,'base64'));delete rendered.wav;}
  assert.ok(rendered.peak>0.05&&rendered.peak<.93);assert.ok(rendered.rms>.002);assert.ok(rendered.maxDelta<.6);assert.ok(rendered.maxNotes<=RunMax());assert.equal(rendered.remaining,0);
  assert.ok(rendered.windows.every(w=>w.rms>.0001));assert.equal(rendered.scheduled,34*16);
  for(const key of['kick','clap','hat','bass','pad','arp','lead','sweep'])assert.ok(rendered.kinds[key]>0);
  fs.writeFileSync('work/edm-render.json',JSON.stringify(rendered,null,2));console.log('PASS: real 34-bar full score + loop boundary, all eight instruments, no clipping, bounded nodes/cleanup',rendered);
  // The complete mixer, including six simultaneous impacts + dense music at 100%.
  const peak=await page.evaluate(async()=>{
   const c=new OfflineAudioContext(1,48000,48000),s=new Run188Audio.Sound({get:(k,d)=>d,set:()=>{}});s.context=c;s.volume=1;s.masterVolume=1;s.initGraph(c);
   const m=new Run188Music.Music(s,{get:(k,d)=>d,set:()=>{}});s.music=m;m.volume=1;m.ensureGraph();m.fade.gain.value=1;m.wantedScene='play';m.wantedStage=4;m.renderStep(192,0);
   for(let i=0;i<10;i++)s.play('collision');const b=await c.startRendering();return Math.max(...b.getChannelData(0).map(Math.abs));
  });assert.ok(peak>0&&peak<.93);console.log('PASS: full-volume dense BGM + six impacts limited without sample clipping',peak);
  // Unsupported audio is a visible status, not a game failure.
  await page.addInitScript(()=>{window.AudioContext=undefined;window.webkitAudioContext=undefined;});await page.reload();await page.locator('#settings-button').click();assert.match(await page.locator('#sound-status').innerText(),/利用できません/);await page.locator('#settings-close').click();assert.ok(await page.evaluate(()=>Boolean(__RUN188_TEST__.model)));
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
 function RunMax(){return 48;}
})().catch(e=>{console.error(e);process.exitCode=1});
