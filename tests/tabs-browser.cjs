'use strict';
// Raw CDP deliberately avoids Playwright's per-session forced focus/visibility.
const fs=require('node:fs'),{spawn}=require('node:child_process'),assert=require('node:assert/strict');
const {stopNativeBrowser}=require('./native-browser-lifecycle.cjs');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const profile=fs.mkdtempSync('work/tabs-profile-'),args=['--no-sandbox','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${require('node:path').resolve(profile)}`,'about:blank'];if(process.env.TABS_HEADLESS)args.unshift('--headless=new');
 const child=spawn(process.env.CHROMIUM_PATH||'/usr/bin/chromium',args,{stdio:'ignore',detached:true});let ws,requestClose;
 try{
  for(let i=0;!fs.existsSync(profile+'/DevToolsActivePort');i++){if(i>100)throw Error('Chromium did not start');await wait(100);}
  const[port,path]=fs.readFileSync(profile+'/DevToolsActivePort','utf8').split('\n');ws=new WebSocket(`ws://127.0.0.1:${port}${path}`);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let id=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(p)m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}};
  function send(method,params={},sessionId){return new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params,...sessionId?{sessionId}:{}}));});}
  ws.onclose=()=>{for(const p of pending.values())p.reject(Error('Browser connection closed'));pending.clear();};
  requestClose=()=>send('Browser.close');
  const target=(await send('Target.createTarget',{url:'about:blank',newWindow:false})).targetId,session=(await send('Target.attachToTarget',{targetId:target,flatten:true})).sessionId;
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true},session);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  async function click(id){await evaluate(`document.getElementById('${id}').scrollIntoView({block:'center'})`);await wait(120);const box=await evaluate(`(()=>{const r=document.getElementById('${id}').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...box},session);await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...box},session);}
  async function until(expression){for(let i=0;i<150;i++){if(await evaluate(expression))return;await wait(100);}throw Error('Timed out: '+expression+' '+await evaluate(`JSON.stringify({hidden:document.hidden,paused:__RUN188_TEST__.model.paused,context:__RUN188_TEST__.sound.context?.state,error:__RUN188_TEST__.sound.error,music:__RUN188_TEST__.music.error,button:document.getElementById('resume-button').getBoundingClientRect().toJSON()})`));}
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false},session);await send('Page.enable',{},session);await send('Page.addScriptToEvaluateOnNewDocument',{source:"Object.defineProperty(window,'RUN188_ONLINE_CONFIG',{get:()=>({season:'season-1',firebase:null,appCheckSiteKey:''}),set:()=>{}});localStorage.setItem('188cm-run:skipTutorial','true');localStorage.setItem('188cm-run:nicknameAsked','true');"},session);
  await send('Page.navigate',{url:(process.env.GAME_TEST_URL||'http://127.0.0.1:8000/')+'?test'},session);await until('Boolean(window.__RUN188_TEST__)');await click('start-button');await evaluate("__RUN188_TEST__.model.events=[];__RUN188_TEST__.model.spawnTimer=1e9;");await until('__RUN188_TEST__.music.running');
  const expression="(()=>{const t=__RUN188_TEST__;return{hidden:document.hidden,frames:t.performanceStats.frames,draws:t.performanceStats.drawn,distance:t.model.distance,paused:t.model.paused,context:t.sound.context.state,music:t.music.running,notes:t.music.notes.size,voices:t.sound.voices.size}})()",stats=[];
  for(let i=0;i<3;i++){
   const other=(await send('Target.createTarget',{url:'about:blank',newWindow:false,background:false})).targetId;await send('Target.activateTarget',{targetId:other});await until('document.hidden');await wait(180);const before=await evaluate(expression);await wait(1800);const after=await evaluate(expression);
   assert.equal(before.hidden,true);assert.equal(before.paused,true);assert.equal(before.context,'suspended');assert.equal(before.music,false);assert.equal(before.notes,0);assert.equal(before.voices,0);assert.equal(after.frames,before.frames);assert.equal(after.draws,before.draws);assert.equal(after.distance,before.distance);
   await send('Target.activateTarget',{targetId:target});await until('!document.hidden');assert.equal(await evaluate('__RUN188_TEST__.model.paused'),true);await click('resume-button');await until('!__RUN188_TEST__.model.paused&&__RUN188_TEST__.music.running');const resumed=await evaluate(expression);assert.ok(resumed.distance-before.distance<20);stats.push({before,after,resumed});
  }
  fs.writeFileSync('work/tabs-results.json',JSON.stringify(stats,null,2));console.log('PASS: four native tabs / three switches; actual visibility, stopped rAF/audio/context, controlled resume',stats);
 }finally{await stopNativeBrowser({child,socket:ws,requestClose,profile});}
})().catch(e=>{console.error(e);process.exitCode=1});
