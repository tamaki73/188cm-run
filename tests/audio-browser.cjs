'use strict';
const {chromium}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');
const url=(process.env.GAME_TEST_URL||'http://127.0.0.1:8000/')+'?test';
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  const errors=[];
  try {
    fs.mkdirSync('work',{recursive:true});
    for(const mobile of [false,true]) {
      const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1080},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:2});
      await require('./offline-config.cjs')(context);const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
      await page.addInitScript(()=>{localStorage.setItem('188cm-run:nicknameAsked','true');});
      await page.goto(url);await page.bringToFront();
      if(mobile) await page.addInitScript(()=>{window.webkitAudioContext=window.AudioContext;window.AudioContext=undefined;});
      await page.addStyleTag({content:'#pause-panel{display:none!important}'});
      const initialBox=await page.locator('#canvas').boundingBox();
      for(let step=0;step<9;step++) {
        await page.evaluate(step=>{const t=__RUN188_TEST__;t.model.paused=true;t.model.tutorial.step=step;t.model.setupLesson();t.syncUI();t.draw();},step);
        const panel=await page.locator('#tutorial-panel').boundingBox(),canvas=await page.locator('#canvas').boundingBox(),text=await page.locator('#lesson-text').boundingBox();
        assert.ok(panel.y+panel.height<=canvas.y);assert.ok(text.y+text.height<=panel.y+panel.height);
        assert.equal(canvas.y,initialBox.y);assert.equal(canvas.height,initialBox.height);
        assert.ok(await page.locator('#lesson-text').evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=12));
        if(step===2){assert.equal(await page.locator('#lesson-text').innerText(),'↓キーまたはShiftキーを押してしゃがみます。完全に障害物が消えるまでしゃがみ続けてください。');await page.screenshot({path:`work/tutorial-${mobile?'mobile':'desktop'}.png`,fullPage:true,scale:'css'});}
      }
      await page.evaluate(()=>{const t=__RUN188_TEST__;t.model.title();t.syncUI();});
      assert.equal((await page.locator('#canvas').boundingBox()).y,initialBox.y);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      assert.equal(await page.evaluate(()=>__RUN188_TEST__.sound.context),null);
      await page.locator('#settings-button').click();assert.equal(await page.locator('#settings-dialog').isVisible(),true);
      await page.locator('#sound-toggle').check();
      await page.locator('#sound-volume').fill('42');await page.locator('#sound-volume').dispatchEvent('change');
      assert.equal(await page.locator('#sound-volume-value').innerText(),'42％');
      await page.waitForFunction(()=>__RUN188_TEST__.sound.context.state==='running');
      await page.locator('#settings-close').click();
      await page.evaluate(()=>localStorage.setItem('188cm-run:skipTutorial','true'));
      await page.reload();assert.equal(await page.evaluate(()=>__RUN188_TEST__.sound.context),null);
      assert.equal(await page.locator('#sound-button').getAttribute('aria-pressed'),'true');assert.equal(await page.evaluate(()=>__RUN188_TEST__.sound.volume),.42);
      await page.evaluate(()=>{const t=__RUN188_TEST__;window.__sounds=[];t.sound.onPlay=e=>__sounds.push(e);});
      await page.locator('#start-button').click();
      assert.ok(await page.evaluate(()=>__sounds.some(e=>e.name==='ui')));
      await page.evaluate(()=>{const t=__RUN188_TEST__;t.model.spawnTimer=100;t.model.events=[];});
      await page.waitForFunction(()=>__sounds.some(e=>e.name==='foot'));
      if(mobile) await page.locator('#touch-jump').tap();else await page.keyboard.down('Space');
      await page.waitForFunction(()=>__RUN188_TEST__.model.jumpY>0);
      const jumping=await page.evaluate(()=>({time:__RUN188_TEST__.model.elapsed,count:__sounds.filter(e=>e.name==='foot').length}));
      await page.waitForTimeout(550);assert.equal(await page.evaluate(()=>__sounds.filter(e=>e.name==='foot').length),jumping.count);
      if(!mobile)await page.keyboard.up('Space');
      await page.waitForFunction(()=>__sounds.some(e=>e.name==='land'));
      assert.equal(await page.evaluate(()=>__sounds.filter(e=>e.name==='jump').length),1);
      assert.ok(Math.abs((await page.evaluate(()=>__sounds.find(e=>e.name==='land').time-__sounds.find(e=>e.name==='jump').time))-1)<.02);
      await page.waitForFunction(count=>__sounds.filter(e=>e.name==='foot').length>count,jumping.count);
      await page.keyboard.down('Shift');await page.waitForTimeout(400);await page.keyboard.up('Shift');await page.waitForTimeout(80);
      await page.keyboard.down('s');await page.waitForTimeout(400);await page.keyboard.up('s');await page.waitForTimeout(80);
      assert.equal(await page.evaluate(()=>__sounds.filter(e=>e.name==='crouch').length),1);assert.equal(await page.evaluate(()=>__sounds.filter(e=>e.name==='straddle').length),1);
      await page.evaluate(()=>{const t=__RUN188_TEST__;t.model.events=[];});
      const before=await page.evaluate(()=>__sounds.filter(e=>e.name==='collect').length);await page.keyboard.press('e');
      assert.equal(await page.evaluate(()=>__sounds.filter(e=>e.name==='collect').length),before);
      await page.evaluate(()=>{const t=__RUN188_TEST__;t.model.events=[t.model.makeItem(Run188.ITEMS.find(e=>e.id==='student-id'),0)];});
      if(mobile)await page.locator('#touch-grab').tap();else await page.keyboard.press('e');
      assert.equal(await page.evaluate(()=>__sounds.filter(e=>e.name==='collect').length),before+1);
      const frameStats={};
      for(const enabled of [false,true]) {
        await page.evaluate(enabled=>__RUN188_TEST__.sound.setEnabled(enabled),enabled);
        frameStats[enabled?'on':'off']=await page.evaluate(()=>new Promise(resolve=>{
          const intervals=[];let previous=null,voices=0;
          function sample(now){if(previous!==null)intervals.push(now-previous);previous=now;voices=Math.max(voices,__RUN188_TEST__.sound.voices.size);
            if(intervals.length<60)requestAnimationFrame(sample);else{intervals.sort((a,b)=>a-b);resolve({mean:intervals.reduce((a,b)=>a+b,0)/60,p95:intervals[56],voices,caches:__RUN188_TEST__.skyCache.size});}}
          requestAnimationFrame(sample);
        }));
        assert.ok(frameStats[enabled?'on':'off'].voices<=6);assert.ok(frameStats[enabled?'on':'off'].caches<=7);
      }
      console.log('MEASURE: scrolling frame intervals in ms',mobile?'mobile':'desktop',frameStats);
      fs.writeFileSync(`work/audio-performance-${mobile?'mobile':'desktop'}.json`,JSON.stringify(frameStats,null,2)+'\n');
      await page.locator('#settings-button').click();await page.waitForTimeout(180);
      assert.equal(await page.evaluate(()=>__RUN188_TEST__.sound.voices.size),0);
      const pausedSteps=await page.evaluate(()=>__sounds.filter(e=>e.name==='foot').length);await page.waitForTimeout(300);
      assert.equal(await page.evaluate(()=>__sounds.filter(e=>e.name==='foot').length),pausedSteps);
      await page.locator('#sound-toggle').uncheck();assert.equal(await page.evaluate(()=>__RUN188_TEST__.sound.play('jump')),false);
      await page.locator('#sound-toggle').check();await page.locator('#sound-volume').fill('0');assert.equal(await page.evaluate(()=>__RUN188_TEST__.sound.play('jump')),false);
      await page.locator('#sound-volume').fill('42');await page.locator('#settings-close').click();
      await page.evaluate(()=>{const t=__RUN188_TEST__;t.model.paused=false;t.model.gameOver('テスト衝突','collision');t.syncUI();});
      const overSteps=await page.evaluate(()=>__sounds.filter(e=>e.name==='foot').length);await page.waitForTimeout(650);
      assert.equal(await page.evaluate(()=>__sounds.filter(e=>e.name==='foot').length),overSteps);assert.equal(await page.evaluate(()=>__RUN188_TEST__.sound.voices.size),0);
      let clicks=await page.evaluate(()=>__sounds.filter(e=>e.name==='ui').length);
      await page.locator('#over-panel .ranking-open').click();assert.equal(await page.evaluate(()=>__sounds.filter(e=>e.name==='ui').length),clicks+1);
      await page.locator('#ranking-close').click();await page.waitForTimeout(80);
      clicks=await page.evaluate(()=>__sounds.filter(e=>e.name==='ui').length);await page.locator('#restart-button').click();
      assert.equal(await page.evaluate(()=>__sounds.filter(e=>e.name==='ui').length),clicks+1);
      await page.locator('#sound-button').click();await page.reload();
      assert.equal(await page.locator('#sound-button').getAttribute('aria-pressed'),'false');assert.equal(await page.evaluate(()=>__RUN188_TEST__.sound.context),null);
      console.log(`PASS: ${mobile?'mobile touch':'desktop keyboard'} tutorial bounds, stable canvas, gesture audio, events, saved mute/volume, pause/end silence`);
      await context.close();
    }
    const page=await browser.newPage();await require('./offline-config.cjs')(page);await page.goto(url);
    const rendered=await page.evaluate(async()=>{
      const c=new OfflineAudioContext(1,48000,48000),s=new Run188Audio.Sound({get:(k,d)=>k==='soundEnabled'?'true':d,set:()=>{}});
      s.context=c;s.master=c.createGain();s.master.gain.value=.75;s.master.connect(c.destination);s.noise=c.createBuffer(1,11520,48000);s.noise.getChannelData(0).fill(.5);
      for(let i=0;i<20;i++)s.play('collision');const bounded=s.voices.size;const b=await c.startRendering();let peak=0,energy=0;
      for(const value of b.getChannelData(0)){peak=Math.max(peak,Math.abs(value));energy+=value*value;}
      return{bounded,peak,energy,remaining:s.voices.size};
    });
    assert.equal(rendered.bounded,6);assert.ok(rendered.peak>0&&rendered.peak<1);assert.ok(rendered.energy>0);assert.equal(rendered.remaining,0);
    console.log('PASS: real OfflineAudioContext rendered nonzero waveform; six-voice cap, no clipping, complete cleanup',rendered);
    await page.addStyleTag({content:'#pause-panel{display:none!important}'});
    for(const viewport of [{width:320,height:568},{width:1280,height:720},{width:844,height:390}]) {
      await page.setViewportSize(viewport);
      for(let step=0;step<9;step++) {
        await page.evaluate(step=>{const t=__RUN188_TEST__;t.model.startTutorial();t.model.paused=true;t.model.tutorial.step=step;t.model.setupLesson();t.syncUI();},step);
        const panel=await page.locator('#tutorial-panel').boundingBox(),text=await page.locator('#lesson-text').boundingBox(),canvas=await page.locator('#canvas').boundingBox();
        assert.ok(text.y+text.height<=panel.y+panel.height);assert.ok(panel.y+panel.height<=canvas.y);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      }
    }
    console.log('PASS: all lesson text fits at 320px, 1280×720 and landscape 844×390');
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
