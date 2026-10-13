'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const url=(process.env.GAME_TEST_URL||'http://127.0.0.1:8000/')+'?test';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const errors=[],measurements={};
 try {
  fs.mkdirSync('work',{recursive:true});
  for(const mobile of [false,true]){
   const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1080},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:2});
   await require('./offline-config.cjs')(context);
   await context.addInitScript(()=>{localStorage.setItem('188cm-run:skipTutorial','true');localStorage.setItem('188cm-run:nicknameAsked','true');});
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.bringToFront();
   const layout=await page.evaluate(()=>{
    const t=__RUN188_TEST__,r=el=>{const b=el.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height}};
    return{card:r(document.querySelector('.title-card')),canvas:r(document.querySelector('canvas')),font:parseFloat(getComputedStyle(document.querySelector('#start-button')).fontSize),enabled:t.sound.enabled,volume:t.sound.volume,context:t.sound.context,camera:t.camera};
   });
   measurements[mobile?'mobile':'desktop']=layout;
   assert.equal(layout.enabled,true);assert.equal(layout.volume,.7);assert.equal(layout.context,null);assert.ok(layout.font>=14);
   if(!mobile){assert.ok(layout.card.width>=layout.canvas.width*.20&&layout.card.width<=layout.canvas.width*.25);assert.ok(layout.card.height>=380&&layout.card.height<=438);assert.equal(layout.canvas.width,1178);assert.equal(layout.canvas.height,834.40625);assert.ok(layout.card.x+layout.card.width<layout.canvas.x+layout.canvas.width*.40);}
   else{assert.equal(layout.card.width,280);assert.ok(layout.card.height>=300&&layout.card.height<=362);assert.equal(layout.canvas.width,378);assert.ok(layout.card.y>=layout.canvas.y+layout.canvas.height);}
   assert.deepEqual(layout.camera,{HORIZON:246,GROUND:636,CM:1.38});
   assert.equal(await page.locator('#title-panel .settings-open').count(),1);
   await page.screenshot({path:`work/menu-title-${mobile?'mobile':'desktop'}.png`,fullPage:true,scale:'css'});
   await page.evaluate(()=>{window.__soundEvents=[];__RUN188_TEST__.sound.onPlay=e=>__soundEvents.push({...e,state:__RUN188_TEST__.sound.context.state});});
   await page.locator('#title-panel .settings-open').click();assert.equal(await page.locator('#settings-dialog').isVisible(),true);
   await page.waitForFunction(()=>__RUN188_TEST__.sound.context.state==='running');
   assert.ok(await page.evaluate(()=>__soundEvents.some(e=>e.name==='ui'&&e.state==='running')));
   await page.locator('#settings-close').click();
   await page.locator('#title-panel .ranking-open').click();assert.ok(await page.locator('#ranking-dialog').isVisible());await page.locator('#ranking-close').click();
   await page.locator('#tutorial-button').click();
   await page.addStyleTag({content:'#pause-panel{display:none!important}'});
   for(let step=0;step<9;step++){
    await page.evaluate(step=>{const t=__RUN188_TEST__;t.model.paused=true;t.model.tutorial.step=step;t.model.setupLesson();t.syncUI();t.draw();},step);
    const p=await page.locator('#tutorial-panel').boundingBox(),c=await page.locator('#canvas').boundingBox(),text=await page.locator('#lesson-text').boundingBox();
    assert.ok(mobile?p.y+p.height<=c.y:p.x+p.width<=c.x);
    assert.ok(text.y+text.height<=p.y+p.height);
    if(!mobile){assert.ok(c.width>=layout.canvas.width);assert.equal(await page.locator('#play-layout').evaluate(e=>getComputedStyle(e).display),'grid');}
    if(step===2){assert.equal(await page.locator('#lesson-text').innerText(),'↓キーまたはShiftキーを押してしゃがみます。完全に障害物が消えるまでしゃがみ続けてください。');await page.screenshot({path:`work/menu-tutorial-${mobile?'mobile':'desktop'}.png`,fullPage:true,scale:'css'});}
   }
   await page.locator('#lesson-title-button').click();await page.locator('#start-button').click();
   await page.evaluate(()=>{const t=__RUN188_TEST__;t.model.spawnTimer=100;t.model.events=[];});
   await page.waitForFunction(()=>__soundEvents.some(e=>e.name==='foot'));
   assert.ok(await page.evaluate(()=>__soundEvents.filter(e=>e.name==='foot').every(e=>e.level>=.13&&e.state==='running')));
   if(mobile)await page.locator('#touch-jump').tap();else await page.keyboard.press('Space');
   await page.waitForFunction(()=>__soundEvents.some(e=>e.name==='land'));
   assert.ok(await page.evaluate(()=>__soundEvents.some(e=>e.name==='jump')));
   await page.evaluate(()=>{const t=__RUN188_TEST__;t.model.events=[t.model.makeItem(Run188.ITEMS.find(d=>d.id==='student-id'),0)];});
   if(mobile)await page.locator('#touch-grab').tap();else await page.keyboard.press('e');
   await page.waitForFunction(()=>__soundEvents.some(e=>e.name==='collect'));
   await page.evaluate(()=>{const t=__RUN188_TEST__;t.model.events=[t.model.makeObstacle(Run188.OBSTACLES.find(d=>d.id==='strap'),160,.01)];});
   await page.waitForFunction(()=>__RUN188_TEST__.model.mode==='gameover');assert.ok(await page.evaluate(()=>__soundEvents.some(e=>e.name==='over'&&e.cause==='collision')));
   const count=await page.evaluate(()=>__soundEvents.filter(e=>e.name==='foot').length);await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>__soundEvents.filter(e=>e.name==='foot').length),count);
   await page.locator('#restart-button').click();await page.evaluate(()=>{__RUN188_TEST__.model.spawnTimer=100;__RUN188_TEST__.model.events=[];});
   await page.waitForFunction(count=>__soundEvents.filter(e=>e.name==='foot').length>count,count);
   await page.locator('#sound-button').click();await page.reload();assert.equal(await page.locator('#sound-button').getAttribute('aria-pressed'),'false');assert.equal(await page.evaluate(()=>__RUN188_TEST__.sound.context),null);
   await page.evaluate(()=>{window.__soundEvents=[];__RUN188_TEST__.sound.onPlay=e=>__soundEvents.push({...e,state:__RUN188_TEST__.sound.context.state});});
   await page.locator('#sound-button').click();await page.waitForFunction(()=>__soundEvents.some(e=>e.confirmation&&e.state==='running'));
   await page.locator('#settings-button').click();await page.locator('#sound-volume').fill('0');assert.match(await page.locator('#sound-status').innerText(),/0％/);await page.locator('#sound-volume').fill('65');await page.locator('#sound-volume').dispatchEvent('change');await page.locator('#settings-close').click();await page.reload();
   assert.equal(await page.evaluate(()=>__RUN188_TEST__.sound.volume),.65);assert.equal(await page.locator('#sound-button').getAttribute('aria-pressed'),'true');assert.equal(await page.evaluate(()=>__RUN188_TEST__.sound.context),null);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   console.log('PASS:',mobile?'mobile touch':'desktop keyboard','compact title/buttons, outside tutorial, default ON/70%, actual audio events, restart, explicit OFF/volume persistence, confirmation');
   await context.close();
  }
  // Exercise suspended/closed real audio contexts and the first-gesture pending sound.
  // Short desktop windows keep the card inside Canvas and allow scrolling its buttons.
  const page=await browser.newPage();await require('./offline-config.cjs')(page);await page.goto(url);await page.locator('#sound-button').click();await page.locator('#sound-button').click();
  await page.waitForFunction(()=>__RUN188_TEST__.sound.context.state==='running');
  await page.setViewportSize({width:1280,height:650});await page.evaluate(()=>{__RUN188_TEST__.model.title();__RUN188_TEST__.syncUI();});
  const shortCard=await page.locator('.title-card').boundingBox(),shortCanvas=await page.locator('#canvas').boundingBox();
  assert.ok(shortCard.y>=shortCanvas.y&&shortCard.y+shortCard.height<=shortCanvas.y+shortCanvas.height);
  await page.locator('#title-panel .settings-open').scrollIntoViewIfNeeded();
  await page.locator('#sound-button').click();
  await page.evaluate(async()=>{const s=__RUN188_TEST__.sound;await s.context.suspend();window.__resumeCalls=0;window.__sounds=[];s.onPlay=e=>__sounds.push({...e,state:s.context.state});const resume=s.context.resume.bind(s.context);s.context.resume=()=>{__resumeCalls++;return new Promise(resolve=>{window.__releaseAudio=()=>resume().then(resolve);});};});
  await page.locator('#sound-button').click();
  await page.evaluate(()=>{const s=__RUN188_TEST__.sound;for(let i=0;i<8;i++){s.unlock();s.play('foot');}s.stopMovement();});
  assert.equal(await page.evaluate(()=>__resumeCalls),1);assert.equal(await page.evaluate(()=>__RUN188_TEST__.sound.pending.length),1);
  await page.evaluate(()=>__releaseAudio());await page.waitForFunction(()=>__sounds.some(e=>e.confirmation&&e.state==='running'));
  assert.equal(await page.evaluate(()=>__sounds.filter(e=>e.name==='foot').length),0);
  await page.evaluate(()=>__RUN188_TEST__.sound.context.close());await page.locator('#sound-button').click();await page.waitForTimeout(100);await page.locator('#sound-button').click();
  await page.waitForFunction(()=>__RUN188_TEST__.sound.context.state==='running');assert.equal(await page.evaluate(()=>__RUN188_TEST__.sound.error),'');
  console.log('PASS: real suspended-context resume, one resume request, bounded/cancelled pending footsteps, confirmation after resume, closed-context recovery');
  // Gain.value can remain at its intrinsic value when a live graph is silent.
  // Render the real automation with an active source to verify volume scaling.
  const volumes=await page.evaluate(async()=>{
   const results=[];
   for(const volume of [0,.4,.65]){
    const c=new OfflineAudioContext(1,48000,48000),s=new Run188Audio.Sound({get:(k,d)=>d,set:()=>{}});
    s.context=c;s.master=c.createGain();s.master.gain.value=.3;s.master.connect(c.destination);
    s.setVolume(0);s.setVolume(volume);s.play('collect');const b=await c.startRendering();let energy=0;
    for(const v of b.getChannelData(0))energy+=v*v;results.push({volume,rms:Math.sqrt(energy/b.length)});
   }
   return results;
  });
  assert.equal(volumes[0].rms,0);assert.ok(volumes[2].rms/volumes[1].rms>1.25);
  console.log('PASS: real rendered gain automation at zero/40%/65%',volumes);
  fs.writeFileSync('work/menu-results.json',JSON.stringify(measurements,null,2)+'\n');console.log('MEASURE:',measurements);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
