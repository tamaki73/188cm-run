'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1140,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await require('./offline-config.cjs')(page);
  await page.addInitScript(()=>{localStorage.setItem('188cm-run:skipTutorial','true');});await page.goto((process.env.GAME_TEST_URL||'http://127.0.0.1:8000/')+'?test');
  // Real first-play nickname flow, followed by persistent name after reload.
  await page.locator('#start-button').click();assert.ok(await page.locator('#ranking-dialog').isVisible());
  await page.locator('#nickname').fill('たまき');await page.locator('#nickname-form button').click();await page.waitForFunction(()=>__RUN188_TEST__.model.mode==='playing');
  await page.reload();await page.locator('#start-button').click();assert.equal(await page.locator('#ranking-dialog').isVisible(),false);
  const pose=await page.evaluate(()=>{
    const t=__RUN188_TEST__;t.model.paused=true;
    const poses=[t.armPose([32,-207],[106,-158],1),t.armPose([32,-207],[40,-348],1),t.armPose([32,-207],[70,-100],.25)];
    return poses.map(p=>({length:p.length,a:Math.hypot(p.elbow[0]-p.shoulder[0],p.elbow[1]-p.shoulder[1]),b:Math.hypot(p.hand[0]-p.elbow[0],p.hand[1]-p.elbow[1]),straight:Math.hypot(p.hand[0]-p.shoulder[0],p.hand[1]-p.shoulder[1])}));
  });
  for(const p of pose){assert.ok(Math.abs(p.a+p.b-p.length)<1e-8);assert.ok(p.straight<=p.length+1e-8);}assert.ok(Math.abs(pose[0].straight-pose[1].straight)<1e-8);
  for(const [name,height,jump]of [['low',140,0],['high',325,75]]){
   await page.evaluate(({height,jump})=>{const t=__RUN188_TEST__,g=t.model;g.start();g.paused=true;g.jumpY=jump;g.events=[];g.effects=[{type:'reach',height,high:height>252,life:.2}];t.syncUI();t.draw();}, {height,jump});
   await page.addStyleTag({content:'#pause-panel{display:none!important}'});await page.locator('#game').screenshot({path:'work/arm-'+name+'.png'});
  }
  // Capture adjacent frames around BOTH previous wrap boundaries, plus an area boundary.
  const stats=await page.evaluate(()=>{
   const t=__RUN188_TEST__,g=t.model,ctx=document.getElementById('canvas').getContext('2d');g.start();g.paused=true;g.events=[];g.effects=[];
   const diffs=[];
   for(const point of [7,15,180,360,1260,8400]){
    const images=[];for(const d of [point-.005,point+.005]){g.distance=d;g.elapsed=10;t.draw();images.push(ctx.getImageData(0,0,960,680).data);}
    let total=0,large=0;for(let i=0;i<images[0].length;i+=4){const diff=Math.abs(images[0][i]-images[1][i])+Math.abs(images[0][i+1]-images[1][i+1])+Math.abs(images[0][i+2]-images[1][i+2]);total+=diff;if(diff>120)large++;}
    diffs.push({point,average:total/(960*680*3),large});
   }
   const start=performance.now();for(let i=0;i<240;i++){g.distance=8000+i*.9333;t.draw();}const frameMs=(performance.now()-start)/240;
   return{diffs,frameMs,caches:t.skyCache.size};
  });
  for(const d of stats.diffs){assert.ok(d.average<.8,JSON.stringify(d));assert.ok(d.large<3500,JSON.stringify(d));}assert.ok(stats.caches<=7);
  console.log('PASS: fixed-length straight low/high arms, nickname onboarding/persistence, continuous ground/fixture/area wrap, bounded background cache; measured',JSON.stringify(stats));
  await page.evaluate(()=>__RUN188_TEST__.openRanking());assert.match(await page.locator('#ranking-status').innerText(),/未設定/);
  await page.locator('#nickname').fill('<img src=x onerror=alert(1)>');await page.locator('#nickname-form button').click();assert.match(await page.locator('#nickname-error').innerText(),/1〜16/);
  await page.locator('#ranking-close').click();
  await page.evaluate(()=>{
    const t=__RUN188_TEST__,r=t.ranking,g=t.model;
    r.config={season:'season-1',firebase:{apiKey:'test',projectId:'demo',appId:'test'}};
    r.adapter={save:()=>new Promise(resolve=>window.__saveResolve=resolve)};
    r.lastSend=-Infinity;g.start();t.syncUI();g.distance=100;g.elapsed=10;g.gameOver('遅延通信');t.syncUI();
  });
  await page.waitForFunction(()=>Boolean(window.__saveResolve));
  await page.evaluate(()=>{const t=__RUN188_TEST__,g=t.model;g.start();t.syncUI();g.distance=200;g.elapsed=20;g.gameOver('次の走行');t.syncUI();});
  await page.waitForFunction(()=>document.getElementById('save-status').textContent.includes('確認できません'));
  await page.evaluate(()=>window.__saveResolve({distance:100,changed:true}));
  await page.waitForFunction(()=>!__RUN188_TEST__.ranking.busy);
  assert.equal(await page.evaluate(()=>__RUN188_TEST__.ranking.pending),200);
  assert.match(await page.locator('#save-status').innerText(),/確認できません/);
  assert.doesNotMatch(await page.locator('#save-status').innerText(),/保存しました/);
  console.log('PASS: a delayed previous-run response never reports a newer unsent record as saved');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
