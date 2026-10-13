'use strict';
const{chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']}),results={environment:'Chromium / Linux container; emulated viewports; software rendering can differ from a physical PC',runs:[],memory:[]};
 try{
  async function open(url,mobile=false,quality='high'){
   const c=await b.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1080},deviceScaleFactor:2,isMobile:mobile,hasTouch:mobile});await require('./offline-config.cjs')(c);
   await c.addInitScript(q=>{localStorage.setItem('188cm-run:skipTutorial','true');localStorage.setItem('188cm-run:nicknameAsked','true');localStorage.setItem('188cm-run:quality',q);},quality);
   const p=await c.newPage();await p.goto(url+'?test');await p.locator('#start-button').click();
   await p.evaluate(()=>{const t=__RUN188_TEST__;t.model.events=[];t.model.spawnTimer=1e9;t.model.route=Run188.AREAS.slice();for(let i=0;i<7;i++){t.model.distance=i*180+45;t.draw();}t.model.distance=30;});return{p,c};
  }
  for(const baseline of process.env.COMPARE_BASELINE? [true,false]:[false])for(const device of(baseline?['desktop','mobile']:['desktop','desktop-auto','mobile'])){
   const mobile=device==='mobile';
   const{p,c}=await open(baseline?'http://127.0.0.1:8001/':(process.env.GAME_TEST_URL||'http://127.0.0.1:8000/'),mobile,(mobile||device==='desktop-auto')?'auto':'high');
   for(const audio of[false,true]){
    await p.evaluate(audio=>{const t=__RUN188_TEST__;t.sound.setEnabled(audio);if(t.music)t.music.setEnabled(audio);t.model.paused=false;t.model.distance=30;t.model.events=[];t.model.spawnTimer=1e9;document.getElementById('game').focus();},audio);
    await p.waitForTimeout(device==='desktop-auto'?7000:700);
    const stats=await p.evaluate(()=>new Promise(resolve=>{
     const gaps=[],costs=[];let prev=null,start=null,peakSfx=0,peakNotes=0;
     function sample(now){const t=__RUN188_TEST__;if(start===null)start=now;if(prev!==null)gaps.push(now-prev);prev=now;costs.push(t.performanceStats?.lastCost||0);peakSfx=Math.max(peakSfx,t.sound.voices.size);peakNotes=Math.max(peakNotes,t.music?.notes.size||0);
      if(now-start<8000)requestAnimationFrame(sample);else{const sorted=gaps.slice().sort((a,b)=>a-b),average=gaps.reduce((a,b)=>a+b,0)/gaps.length;resolve({frames:gaps.length,meanMs:average,p95Ms:sorted[Math.floor(sorted.length*.95)],fps:1000/average,drawMeanMs:costs.reduce((a,b)=>a+b,0)/costs.length,peakSfx,peakNotes,quality:t.quality?.level||'legacy',sky:t.skyCache.size,fixtures:t.scenery?.cache.size||0,canvasPixels:document.querySelector('canvas').width});}}
     requestAnimationFrame(sample);
    }));results.runs.push({version:baseline?'before':'after',device:device+' emulation',audio,...stats});console.log('MEASURE',results.runs.at(-1));
   }
   await c.close();
  }
  const{p,c}=await open(process.env.GAME_TEST_URL||'http://127.0.0.1:8000/',false,'auto'),cdp=await c.newCDPSession(p);await cdp.send('Performance.enable');
  await p.evaluate(()=>{const t=__RUN188_TEST__;t.model.distance=850;t.pause();});await p.waitForTimeout(500);await cdp.send('HeapProfiler.collectGarbage');
  const initial=(await cdp.send('Performance.getMetrics')).metrics;results.baseListeners=initial.find(m=>m.name==='JSEventListeners').value;results.baseHeapMiB=initial.find(m=>m.name==='JSHeapUsedSize').value/1048576;
  await p.locator('#resume-button').click();await p.waitForFunction(()=>!__RUN188_TEST__.model.paused);results.safePauses=0;
  const duration=Number(process.env.SOAK_SECONDS||180),start=Date.now();
  async function snapshot(){const all=(await cdp.send('Performance.getMetrics')).metrics,get=k=>all.find(m=>m.name===k)?.value;const state=await p.evaluate(()=>{const t=__RUN188_TEST__;return{sky:t.skyCache.size,fixtures:t.scenery.cache.size,materials:t.materials.size,voices:t.sound.voices.size,notes:t.music.notes.size,quality:t.quality.level,distance:t.model.distance,mode:t.model.mode,paused:t.model.paused}});results.memory.push({seconds:Math.round((Date.now()-start)/1000),heapMiB:get('JSHeapUsedSize')/1048576,listeners:get('JSEventListeners'),nodes:get('Nodes'),...state});console.log('MEMORY',results.memory.at(-1));if(state.paused){results.safePauses++;await p.locator('#resume-button').click();await p.waitForFunction(()=>!__RUN188_TEST__.model.paused);}}
  await snapshot();for(let elapsed=0;elapsed<duration;elapsed+=30){await p.waitForTimeout(Math.min(30,duration-elapsed)*1000);await snapshot();}
  for(const m of results.memory){assert.ok(m.sky<=7&&m.fixtures<=21&&m.materials<=64&&m.voices<=6&&m.notes<=48);assert.equal(m.mode,'playing');}
  await p.evaluate(()=>__RUN188_TEST__.pause());await p.waitForTimeout(500);await cdp.send('HeapProfiler.collectGarbage');const final=(await cdp.send('Performance.getMetrics')).metrics;results.finalListeners=final.find(m=>m.name==='JSEventListeners').value;results.finalHeapMiB=final.find(m=>m.name==='JSHeapUsedSize').value/1048576;
  assert.ok(results.finalHeapMiB-results.baseHeapMiB<8);assert.ok(Math.abs(results.finalListeners-results.baseListeners)<4);// Mid-run listener metrics include unreachable AudioNodes until browser GC; compare settled, collected endpoints above.
  console.log('PASS: bounded caches/audio/listeners and bounded retained heap growth over timed soak');
  await c.close();
 }finally{fs.writeFileSync('work/presentation-performance.json',JSON.stringify(results,null,2));await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
