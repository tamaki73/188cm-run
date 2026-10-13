'use strict';
const{chromium}=require('playwright'),fs=require('node:fs');
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});try{
 fs.mkdirSync('docs/previews',{recursive:true});const c=await b.newContext({viewport:{width:1440,height:1080},deviceScaleFactor:1});await require('../tests/offline-config.cjs')(c);await c.addInitScript(()=>{localStorage.setItem('188cm-run:skipTutorial','true');localStorage.setItem('188cm-run:quality','high');localStorage.setItem('188cm-run:soundEnabled','false');localStorage.setItem('188cm-run:bgmEnabled','false');});
 const p=await c.newPage();await p.goto((process.env.GAME_TEST_URL||'http://127.0.0.1:8000/')+'?test');await p.waitForTimeout(250);await p.screenshot({path:'docs/previews/liquid-title-desktop.png',fullPage:true});
 await p.locator('#tutorial-button').click();await p.evaluate(()=>{const t=__RUN188_TEST__;t.model.tutorial.step=2;t.model.setupLesson();t.model.paused=true;t.syncUI();});await p.addStyleTag({content:'#pause-panel{display:none!important}'});await p.waitForTimeout(250);await p.screenshot({path:'docs/previews/liquid-tutorial-desktop.png',fullPage:true});
 await p.setViewportSize({width:390,height:844});await p.waitForTimeout(100);await p.waitForTimeout(250);await p.screenshot({path:'docs/previews/liquid-tutorial-mobile.png',fullPage:true});await p.locator('#lesson-title-button').click();await p.waitForTimeout(250);await p.screenshot({path:'docs/previews/liquid-title-mobile.png',fullPage:true});
 await p.setViewportSize({width:1440,height:1080});
 for(const gallery of['themes','poses']){
  await p.evaluate(gallery=>{
   const t=__RUN188_TEST__,g=t.model,source=document.getElementById('canvas'),wrap=document.createElement('div');wrap.id='preview-gallery';Object.assign(wrap.style,{position:'absolute',inset:'0 auto auto 0',width:'1440px',padding:'24px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:'18px',background:'#121018',zIndex:100,color:'#eddde5',font:'16px sans-serif'});document.body.append(wrap);
   const entries=gallery==='themes'?Run188.AREAS.map(a=>({name:a.name,area:a.id})): [{name:'走行 — 黒Tシャツ／デニム／オレンジスニーカー',phase:2},{name:'ジャンプ — 上昇',jump:40,velocity:205},{name:'ジャンプ — 下降',jump:28,velocity:-236},{name:'着地 — 膝で吸収',land:true},{name:'しゃがみ — 安全な頭頂高122cm',crouch:true},{name:'またぎ — 障害物との重なりは38％表示',straddle:true}];
   for(const e of entries){g.start();g.paused=true;g.route=[Run188.AREAS.find(a=>a.id===(e.area||'street'))];g.distance=40;g.events=[];g.effects=[];g.crouching=!!e.crouch;g.straddling=!!e.straddle;g.jumpY=e.jump||0;g.jumpVelocity=e.velocity||0;g.gaitPhase=e.phase??1.8;
    if(e.straddle)g.events=[g.makeObstacle(Run188.OBSTACLES.find(x=>x.id==='mini-train'),70,1.5)];
    if(e.area){const id={street:'suitcase',school:'vault',station:'rack-bar',bus:'bus-roof',store:'supermarket',park:'panda',home:'tatami'}[e.area],d=Run188.OBSTACLES.find(x=>x.id===id);g.events=[g.makeObstacle(d,(d.min+d.max)/2,15)];}
    for(let i=0;i<20;i++)t.rig.update(g,1/60,0,t.project);if(e.land)t.rig.landing=1;
    t.syncUI();t.draw();const card=document.createElement('figure');card.style.margin='0';const pic=document.createElement('canvas');pic.width=960;pic.height=680;pic.style.width='100%';pic.getContext('2d').drawImage(source,0,0,960,680);const caption=document.createElement('figcaption');caption.textContent=e.name;caption.style.padding='10px 0';card.append(pic,caption);wrap.append(card);
   }
  },gallery);
  await p.locator('#preview-gallery').screenshot({path:`docs/previews/liquid-${gallery}.png`});await p.evaluate(()=>document.getElementById('preview-gallery').remove());
 }
 console.log('Saved title/tutorial desktop/mobile, seven themes and six poses.');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
