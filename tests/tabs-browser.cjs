'use strict';
// CI uses Xvfb + headed Chromium: real document.visibilityState, not a mocked event.
const{chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const b=await chromium.launch({headless:false,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const stats=[];
 try{
  const c=await b.newContext({viewport:{width:1280,height:900}});await require('./offline-config.cjs')(c);await c.addInitScript(()=>{localStorage.setItem('188cm-run:skipTutorial','true');localStorage.setItem('188cm-run:nicknameAsked','true');});
  const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto((process.env.GAME_TEST_URL||'http://127.0.0.1:8000/')+'?test');const pc=await c.newCDPSession(p);await pc.send('Emulation.setFocusEmulationEnabled',{enabled:false});await p.bringToFront();await p.locator('#start-button').click();
  await p.evaluate(()=>{__RUN188_TEST__.model.events=[];__RUN188_TEST__.model.spawnTimer=1e9;});await p.waitForFunction(()=>__RUN188_TEST__.music.running);
  for(let i=0;i<3;i++){
   // window.open creates a genuine sibling tab in the same browser window.
   const promise=c.waitForEvent('page');const info=await pc.send('Target.getTargetInfo');await pc.send('Target.createTarget',{url:'about:blank',browserContextId:info.targetInfo.browserContextId,newWindow:false,background:false});const other=await promise;const oc=await c.newCDPSession(other);await oc.send('Emulation.setFocusEmulationEnabled',{enabled:false});await other.bringToFront();console.log('TAB WINDOWS',await pc.send('Browser.getWindowForTarget'),await oc.send('Browser.getWindowForTarget'));
   await p.waitForFunction(()=>document.hidden,null,{polling:100});await p.waitForTimeout(150);
   const before=await p.evaluate(()=>{const t=__RUN188_TEST__;return{hidden:document.hidden,frames:t.performanceStats.frames,draws:t.performanceStats.drawn,distance:t.model.distance,paused:t.model.paused,context:t.sound.context.state,music:t.music.running,notes:t.music.notes.size,voices:t.sound.voices.size}});
   await other.waitForTimeout(1800);
   const after=await p.evaluate(()=>{const t=__RUN188_TEST__;return{frames:t.performanceStats.frames,draws:t.performanceStats.drawn,distance:t.model.distance}});
   assert.equal(before.hidden,true);assert.equal(before.paused,true);assert.equal(before.context,'suspended');assert.equal(before.music,false);assert.equal(before.notes,0);assert.equal(before.voices,0);assert.equal(after.frames,before.frames);assert.equal(after.draws,before.draws);assert.equal(after.distance,before.distance);
   await p.bringToFront();await p.waitForFunction(()=>!document.hidden);assert.equal(await p.evaluate(()=>__RUN188_TEST__.model.paused),true);
   await p.locator('#resume-button').click();await p.waitForFunction(()=>!__RUN188_TEST__.model.paused);await p.waitForFunction(()=>__RUN188_TEST__.music.running);await p.waitForTimeout(150);
   const resumed=await p.evaluate(()=>({distance:__RUN188_TEST__.model.distance,mode:__RUN188_TEST__.model.mode}));assert.ok(resumed.distance-before.distance<20);assert.equal(resumed.mode,'playing');stats.push({before,after,resumed});
  }
  assert.deepEqual(errors,[]);fs.writeFileSync('work/tabs-results.json',JSON.stringify(stats,null,2));console.log('PASS: four real tabs / three switches; hidden rAF/audio fully stop, context suspends, 3-second controlled resume without teleport',stats);
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
