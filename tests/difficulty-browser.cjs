'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});const results=[];try{
 for(const mobile of[false,true]){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1080},isMobile:mobile,hasTouch:mobile});await require('./offline-config.cjs')(context);await context.addInitScript(()=>{localStorage.setItem('188cm-run:skipTutorial','true');localStorage.setItem('188cm-run:nicknameAsked','true');});
  const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto((process.env.GAME_TEST_URL||'http://127.0.0.1:8000/')+'?test');if(mobile)await p.locator('#start-button').tap();else await p.locator('#start-button').click();
  await p.evaluate(()=>{const t=__RUN188_TEST__;window.__difficultyAudio=[];t.sound.onPlay=e=>__difficultyAudio.push(e.name);window.__spawnTimes=[];const spawn=t.model.spawn.bind(t.model);t.model.spawn=function(){const start=performance.now();const result=spawn();__spawnTimes.push(performance.now()-start);return result;};});
  const cdp=await context.newCDPSession(p);let held='';
  async function hold(next){if(held===next)return;if(mobile){if(held)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});if(next){const b=await p.locator(next==='crouch'?'#touch-crouch':'#touch-straddle').boundingBox();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2,id:1}]});}}else{if(held)await p.keyboard.up(held==='crouch'?'Shift':'s');if(next)await p.keyboard.down(next==='crouch'?'Shift':'s');}held=next;}
  for(const pattern of['A','B','C','D','E']){
   await hold('');const count=await p.evaluate(id=>{const t=__RUN188_TEST__,g=t.model;g.start();g.distance=900;g.speed=Run188.speedAt(900);g.route=Array(7).fill(Run188.AREAS.find(a=>a.id==='school'));g.spawnTimer=Infinity;const pattern=Run188.PATTERNS.find(p=>p.id===id);g.events=g.planPattern(pattern.actions,2,.86,id);t.syncUI();document.getElementById('game').focus();return g.events.length;},pattern);
   const jumped=new Set(),grabbed=new Set();let sawRequest=false,sawSuccess=false,completed=false,safePauses=0;
   for(let n=0;n<650;n++){
    const s=await p.evaluate(()=>{const t=__RUN188_TEST__,g=t.model,e=g.events.find(e=>!e.completed&&!e.collected);return{mode:g.mode,reason:g.reason,paused:g.paused,completed:g.completedEvents,air:g.jumpY>0||g.jumpVelocity>0,e:e?{uid:e.uid,kind:e.kind,action:Run188.actionOf(e),high:e.high,time:e.z/g.speed,z:e.z,length:e.length}:null,request:document.getElementById('next-event').textContent,notice:document.getElementById('play-hint-message').textContent};});
    assert.equal(s.mode,'playing',`${mobile?'touch':'keyboard'} ${pattern}: ${s.reason}`);
    if(s.paused){assert.ok(++safePauses<=3,'repeated browser stalls');await hold('');if(mobile)await p.locator('#resume-button').tap();else await p.locator('#resume-button').click();const e=s.e;if(e&&['crouch','straddle'].includes(e.action)&&e.time<=.18&&e.z>=-e.length)await hold(e.action);await p.waitForFunction(()=>!__RUN188_TEST__.model.paused);continue;}
    sawRequest ||= s.request.startsWith('頼まれごと：');sawSuccess ||= await p.evaluate(text=>Run188.MESSAGES.highSuccess.includes(text),s.notice);
    if(s.completed===count){completed=true;break;}
    const e=s.e;
    await hold(e&&['crouch','straddle'].includes(e.action)&&e.time<=.18&&e.z>=-e.length?e.action:'');
    if(e&&['jump','high-item'].includes(e.action)&&e.time<=(e.high?.50:.44)&&e.z>=0&&!s.air&&!jumped.has(e.uid)){jumped.add(e.uid);if(mobile)await p.locator('#touch-jump').tap();else await p.keyboard.press('Space');}
    if(e&&e.kind==='item'&&e.time<=.23&&e.z>=-.1&&!grabbed.has(e.uid)&&(e.high?s.air:!s.air)){grabbed.add(e.uid);if(mobile)await p.locator('#touch-grab').tap();else await p.keyboard.press('e');}
    await p.waitForTimeout(14);
   }
   await hold('');assert.ok(completed,pattern);if(['C','D'].includes(pattern)){assert.ok(sawRequest);assert.ok(sawSuccess);}
   results.push({device:mobile?'native touch emulation':'keyboard',pattern,events:count,passed:true,safePauses});
  }
  const sounds=await p.evaluate(()=>__difficultyAudio);for(const name of['foot','jump','land','crouch','straddle','collect'])assert.ok(sounds.includes(name),name);
  await p.waitForFunction(()=>__RUN188_TEST__.music.running);assert.equal(await p.evaluate(()=>__RUN188_TEST__.sound.context.state),'running');
  const boxes=await p.evaluate(()=>{const hint=document.getElementById('play-hint').getBoundingClientRect(),canvas=document.getElementById('canvas').getBoundingClientRect();return{hint:hint.toJSON(),canvas:canvas.toJSON(),fits:document.documentElement.scrollWidth<=innerWidth};});assert.ok(boxes.hint.bottom<=boxes.canvas.top);assert.ok(boxes.fits);
  await p.evaluate(()=>{const t=__RUN188_TEST__,g=t.model;g.start();g.spawnTimer=Infinity;g.events=[g.makeObstacle(Run188.OBSTACLES.find(e=>e.id==='tatami'),175,1)];});await p.waitForFunction(()=>__RUN188_TEST__.model.mode==='gameover');assert.ok(await p.evaluate(()=>Run188.MESSAGES.head.includes(__RUN188_TEST__.model.reason)));
  await p.evaluate(()=>{const t=__RUN188_TEST__,g=t.model;g.start();g.spawnTimer=Infinity;g.events=[g.makeItem(Run188.ITEMS.find(e=>e.id==='towel'),0)];});await p.waitForFunction(()=>__RUN188_TEST__.model.mode==='gameover');assert.ok(await p.evaluate(()=>Run188.MESSAGES.highMiss.includes(__RUN188_TEST__.model.reason)));
  assert.deepEqual(errors,[]);console.log('PASS: A–E continuous '+(mobile?'native touch':'keyboard')+' input, requests/success/causes, external notice, graphics/audio/BGM');await context.close();
 }
 const p=await browser.newPage();await require('./offline-config.cjs')(p);await p.goto((process.env.GAME_TEST_URL||'http://127.0.0.1:8000/')+'?test');
 const timing=await p.evaluate(()=>{const samples=[];for(let seed=1;seed<=60;seed++){let state=seed;const g=new Run188.GameModel(()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/2**32;});g.start();g.distance=850;g.speed=Run188.speedAt(850);g.nextChallengeDistance=1e9;const start=performance.now();g.spawn();samples.push(performance.now()-start);}samples.sort((a,b)=>a-b);return{count:samples.length,meanMs:samples.reduce((a,b)=>a+b,0)/samples.length,p95Ms:samples[Math.floor(samples.length*.95)],maxMs:samples.at(-1)};});
 fs.mkdirSync('work',{recursive:true});fs.writeFileSync('work/difficulty-browser-results.json',JSON.stringify({cases:results,generation:timing},null,2));console.log('MEASURE: validated generation in native browser',timing);
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
