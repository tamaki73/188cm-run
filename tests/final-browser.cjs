'use strict';
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1140, height: 960 } }); const errors=[];
    page.on('pageerror',e=>errors.push(e.message)); fs.mkdirSync('work',{recursive:true});
    await page.addInitScript(() => { try { localStorage.setItem('188cm-run:nicknameAsked', 'true'); } catch {} });
    await page.goto((process.env.GAME_TEST_URL || 'http://127.0.0.1:8000/')+'?test');
    await page.locator('#skip-checkbox').check(); await page.locator('#skip-button').click();
    await page.addStyleTag({content:'#pause-panel{display:none!important}'});
    for (const id of ['mini-train','suitcase','cone','double-cone','vault','panda']) {
      await page.evaluate(id=>{const{model:g,syncUI,draw}=__RUN188_TEST__;g.start();g.paused=true;const d=Run188.OBSTACLES.find(e=>e.id===id);g.events=[g.makeObstacle(d,d.min,10)];g.straddling=d.rule==='straddle';syncUI();draw();},id);
      assert.equal(await page.locator('#next-event').innerText(),await page.evaluate(()=> '次の障害物：'+__RUN188_TEST__.model.nextEvent.name));
      await page.locator('#game').screenshot({path:`work/final-${id}.png`});
    }
    const geometry = await page.evaluate(()=>{const t=__RUN188_TEST__;t.model.straddling=false;t.model.events[0].z=10;const near=t.runnerOpacity();t.model.events[0].z=200;return{near,far:t.runnerOpacity(),horizon:t.camera.HORIZON,cm:t.camera.CM,ground:t.camera.GROUND};});
    assert.ok(geometry.horizon<344);assert.ok(geometry.near<1);assert.equal(geometry.far,1);assert.ok(geometry.ground-190*geometry.cm>340);
    const gameBox=await page.locator('#game').boundingBox(),nameBox=await page.locator('#next-event').boundingBox();
    assert.ok(Math.abs(nameBox.x+nameBox.width/2-gameBox.x-gameBox.width/2)<2);assert.ok(nameBox.y-gameBox.y<110);
    await page.evaluate(()=>{const g=__RUN188_TEST__.model;g.events=[g.makeObstacle(Run188.OBSTACLES.find(d=>d.id==='cone'),50,10),g.makeItem(Run188.ITEMS.find(d=>d.id==='student-id'),30)];__RUN188_TEST__.syncUI();const ctx=document.getElementById('canvas').getContext('2d'),old=ctx.fillText;window.__drawnText=[];ctx.fillText=function(text,...args){__drawnText.push(String(text));return old.call(this,text,...args)};__RUN188_TEST__.draw();ctx.fillText=old;});
    assert.ok(!(await page.evaluate(()=>__drawnText)).includes('カラーコーン'));
    await page.evaluate(()=>{__RUN188_TEST__.model.events[0].completed=true;__RUN188_TEST__.syncUI();});
    assert.equal(await page.locator('#next-event').innerText(),'次のアイテム：学生証');
    console.log('PASS: elevated camera, overlap-only transparency, centered single next-event label, and no floating names');
    for (const [load,level,color] of [[0,'low','rgb(134, 223, 158)'],[59,'low','rgb(134, 223, 158)'],[60,'medium','rgb(242, 214, 109)'],[79,'medium','rgb(242, 214, 109)'],[80,'high','rgb(241, 162, 89)'],[94,'high','rgb(241, 162, 89)'],[95,'critical','rgb(250, 119, 119)'],[99,'critical','rgb(250, 119, 119)']]) {
      await page.evaluate(load=>{const g=__RUN188_TEST__.model;g.crouchStrain=load;g.ankleStrain=0;__RUN188_TEST__.syncUI();},load);
      assert.equal(await page.locator('#game').getAttribute('data-strain-level'),level);
      assert.equal(await page.locator('#strain-bar').evaluate(el=>el.style.backgroundColor),color);
      assert.equal(await page.locator('#strain-warning').isVisible(),load>=80);
    }
    await page.locator('#effects-button').click();assert.equal(await page.locator('#effects-button').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#strain-warning').evaluate(el=>getComputedStyle(el).animationName),'none');
    await page.reload();assert.equal(await page.locator('#effects-button').getAttribute('aria-pressed'),'true');
    // Instrument real Web Audio oscillators; assert a warning tone is suppressed in reduced mode.
    await page.evaluate(()=>{window.__frequencies=[];const Native=window.AudioContext;window.AudioContext=class extends Native{createOscillator(){const node=super.createOscillator(),set=node.frequency.setValueAtTime.bind(node.frequency);node.frequency.setValueAtTime=(v,t)=>{__frequencies.push(v);return set(v,t)};return node;}};});
    await page.locator('#effects-button').click(); await page.locator('#sound-button').click();
    await page.evaluate(()=>{const g=__RUN188_TEST__.model;g.start();g.spawnTimer=100;g.crouchStrain=95.5;g.elapsed=100;__RUN188_TEST__.syncUI();g.paused=true;});
    assert.ok(await page.evaluate(()=>__frequencies.includes(620)));
    await page.locator('#effects-button').click();
    const count=await page.evaluate(()=>__frequencies.filter(f=>f===620).length);
    await page.evaluate(()=>{const g=__RUN188_TEST__.model;g.elapsed=102;g.paused=false;g.crouchStrain=95.5;__RUN188_TEST__.syncUI();g.paused=true;});
    assert.equal(await page.evaluate(()=>__frequencies.filter(f=>f===620).length),count);
    console.log('PASS: exact fatigue-color thresholds, warnings, real Web Audio alarm, reduced effects and saved preference');
    await page.evaluate(()=>{const g=__RUN188_TEST__.model;g.start();g.spawnTimer=100;g.events=[g.makeItem({...Run188.ITEMS.find(d=>d.id==='towel'),min:325,max:325},9)];document.getElementById('game').focus();});
    await page.keyboard.press('Space'); await page.keyboard.press('e');
    assert.equal(await page.evaluate(()=>__RUN188_TEST__.model.items),0);
    assert.ok(await page.evaluate(()=>__RUN188_TEST__.model.grabReservation.remaining>0));
    await page.waitForFunction(()=>__RUN188_TEST__.model.items===1,null,{timeout:2000});
    await page.evaluate(()=>{const g=__RUN188_TEST__.model;g.events=[g.makeItem({...Run188.ITEMS.find(d=>d.id==='towel'),min:325,max:325},0)];g.update(.05);});
    assert.equal(await page.evaluate(()=>__RUN188_TEST__.model.items),1);
    console.log('PASS: early actual E input queues a high-item pickup and cannot collect a second item');
    for (const [id,key,message] of [['mini-train','Space','そこまでの跳躍力はありません'],['double-cone','s','そこまでの柔軟性はありません'],['none','ArrowDown','ヘルニアになりました']]) {
      await page.evaluate(id=>{const g=__RUN188_TEST__.model;g.start();g.spawnTimer=100;if(id==='none')g.crouchStrain=99;else{const d=Run188.OBSTACLES.find(e=>e.id===id);g.events=[g.makeObstacle(d,d.min,3)];}document.getElementById('game').focus();},id);
      await page.keyboard.down(key); await page.waitForFunction(()=>__RUN188_TEST__.model.mode==='gameover',null,{timeout:2000}); await page.keyboard.up(key);
      assert.equal(await page.locator('#over-reason').innerText(),message);
      assert.ok(await page.locator('#over-reason').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=19));
      if(id==='none')await page.locator('#game').screenshot({path:'work/final-gameover.png'});
    }
    console.log('PASS: cause-specific prominent game-over messages');
    assert.deepEqual(errors,[]);
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
