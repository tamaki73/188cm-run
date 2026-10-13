/* Local emulator + locally installed identical Firebase SDK. No production service or key. */
'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const url=process.env.GAME_TEST_URL||'http://127.0.0.1:8000/';
 const sdk=process.env.FIREBASE_SDK_PATH||path.resolve('node_modules/firebase');
 try{
  const contexts=[];
  async function create(viewport={width:1140,height:960}){
   const context=await browser.newContext({viewport});contexts.push(context);
   await context.addInitScript(()=>{localStorage.setItem('188cm-run:skipTutorial','true');});
   await context.route('**/online-config.js',route=>route.fulfill({contentType:'text/javascript',body:`window.RUN188_ONLINE_CONFIG={season:'season-1',firebase:{apiKey:'demo-key',projectId:'demo-188cm-run',appId:'demo-app'}};`}));
   await context.route('https://www.gstatic.com/firebasejs/**',async route=>{
    const file=route.request().url().split('/').pop().replace('firebase-','').replace('.js','');
    let body=fs.readFileSync(path.join(sdk,'firebase-'+file+'.js'),'utf8');
    // The npm browser bundle references shared modules; redirect those to local gstatic stubs too.
    
    const name=file==='auth'?'getAuth':file==='firestore'?'getFirestore':null;
    if(name){
     const match=body.match(new RegExp('([A-Za-z0-9_$]+) as '+name+'(?=[,}])'));
     const original=match?match[1]:name;
     const connector=file==='auth'?'connectAuthEmulator':'connectFirestoreEmulator';
     const cm=body.match(new RegExp('([A-Za-z0-9_$]+) as '+connector+'(?=[,}])'));
     const connect=cm?cm[1]:connector;
     const call=file==='auth'?connect+"(service,'http://127.0.0.1:9099',{disableWarnings:true})":connect+"(service,'127.0.0.1',8080)";
     body=body.replace(match?match[0]:new RegExp('(?<=[,{])'+name+'(?=[,}])'),'emulatorService as '+name);
     body+=`\nfunction emulatorService(app){const service=${original}(app);if(!service.__testConnected){${call};service.__testConnected=true;}return service;}\n`;
    }
    await route.fulfill({contentType:'text/javascript',headers:{'Access-Control-Allow-Origin':'*'},body});
   });
   const page=await context.newPage();await page.goto(url+'?test');return page;
  }
  const a=await create();await a.locator('#start-button').click();await a.locator('#nickname').fill('友達');await a.locator('#nickname-form button').click();
  assert.equal(await a.evaluate(()=>__RUN188_TEST__.ranking.name),'友達');
  // Drive a completed normal run with coherent distance/time, then use the production save code.
  async function finish(page,distance){await page.evaluate(distance=>{const t=__RUN188_TEST__,g=t.model;g.start();t.syncUI();g.distance=distance;g.elapsed=distance/16+1;g.gameOver('テスト終了');t.syncUI();},distance);await page.waitForFunction(()=>document.getElementById('save-status').textContent.includes('オンラインに自己ベストを保存'),null,{timeout:30000});}
  await finish(a,500);
  const b=await create({width:390,height:844});await b.locator('#start-button').click();await b.locator('#nickname').fill('友達');await b.locator('#nickname-form button').click();await finish(b,1250);
  await a.locator('#over-panel .ranking-open').click();await a.waitForFunction(()=>document.querySelectorAll('#ranking-rows tr').length===2);
  const rows=await a.locator('#ranking-rows').innerText();assert.match(rows,/1[\s\S]*1,250 m[\s\S]*100％[\s\S]*2[\s\S]*500 m[\s\S]*50％/);
  assert.equal(await a.locator('#ranking-rows tr').count(),2);assert.equal(await a.locator('#nickname').inputValue(),'友達');
  await b.locator('#over-panel .ranking-open').click();await b.waitForFunction(()=>document.querySelectorAll('#ranking-rows tr').length===2);await b.screenshot({path:'work/online-mobile.png'});
  await a.locator('#nickname').fill('<img src=x>');await a.locator('#nickname-form button').click();assert.ok((await a.locator('#nickname-error').innerText()).includes('1〜16'));
  await a.locator('#ranking-close').click();await a.reload();assert.equal(await a.evaluate(()=>__RUN188_TEST__.ranking.name),'友達');
  await a.locator('#title-panel .ranking-open').click();await a.waitForFunction(()=>document.querySelectorAll('#ranking-rows tr').length===2);
  // Fail the actual network without substituting a successful save.
  await a.locator('#ranking-close').click();await a.context().setOffline(true);
  await a.evaluate(()=>{const t=__RUN188_TEST__;t.ranking.lastSend=-Infinity;const g=t.model;g.start();t.syncUI();g.distance=700;g.elapsed=60;g.gameOver('通信テスト');t.syncUI();});
  await a.waitForFunction(()=>document.getElementById('save-status').textContent.includes('確認できません'),null,{timeout:20000});
  assert.equal(await a.evaluate(()=>__RUN188_TEST__.ranking.pending),700);assert.ok(await a.locator('#restart-button').isVisible());await a.locator('#restart-button').click();assert.equal(await a.evaluate(()=>__RUN188_TEST__.model.mode),'playing');
  console.log('PASS: two independent browser identities share distance-ranked records, same-name separation, persistence, understanding, mobile UI and actual network failure leaves gameplay usable');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
