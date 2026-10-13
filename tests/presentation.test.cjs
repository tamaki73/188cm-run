'use strict';
const assert=require('node:assert/strict');
const {Quality}=require('../quality.js'),{Rig,knee}=require('../runner-rig.js'),{Music,levelAt,STEP}=require('../music.js'),{Sound}=require('../audio.js'),{GameModel}=require('../game-engine.js');
const data=new Map(),storage={get:(k,d)=>data.get(k)??d,set:(k,v)=>data.set(k,String(v))};
const q=new Quality(storage);assert.equal(q.mode,'auto');assert.equal(q.level,'high');
for(let i=0;i<95;i++)q.sample(1/30,13);assert.equal(q.level,'medium');for(let i=0;i<95;i++)q.sample(1/30,13);assert.equal(q.level,'low');
for(let i=0;i<840;i++)q.sample(1/60,3);assert.equal(q.level,'low');for(let i=0;i<120;i++)q.sample(1/60,3);assert.equal(q.level,'medium');
q.set('high');for(let i=0;i<500;i++)q.sample(.1,40);assert.equal(q.level,'high');assert.equal(new Quality(storage).mode,'high');
q.set('auto');for(let i=0;i<500;i++)q.sample(.1,40,false);assert.equal(q.level,'high');
console.log('PASS: quality slow/fast hysteresis, explicit quality persistence, idle/throttled frames excluded');
const project=z=>{const s=1/(1+Math.max(-5,z)/23);return{s,y:246+390*s}};
for(const distance of[0,200,900]){
 const g=new GameModel(()=>.5),r=new Rig();g.start();g.distance=distance;g.spawnTimer=100;let contacts=0,anchor=null;
 for(let i=0;i<240;i++){
  g.update(1/120);const p=r.update(g,1/120,0,project),events=g.soundEvents.splice(0);
  for(const e of events)if(e.name==='foot'){contacts++;const leg=p.legs[e.foot==='left'?0:1];assert.equal(leg.contact,true);}
  for(const leg of p.legs){
   for(const end of[leg.hip,leg.ankle])assert.ok(Math.abs(Math.hypot(leg.joint[0]-end[0],leg.joint[1]-end[1],leg.joint[2])-62.1)<.01);
   if(leg.side===1&&leg.contact){if(anchor?.cycle===r.feet[1].cycle)assert.equal(leg.worldAnchor,anchor.value);anchor={cycle:r.feet[1].cycle,value:leg.worldAnchor};}
  }
 }
 assert.ok(contacts>5);g.jump();assert.equal(g.jumpVelocity,300);let max=0;
 for(let i=0;i<120;i++){g.update(1/120);r.update(g,1/120,0,project);max=Math.max(max,g.jumpY);}assert.ok(Math.abs(max-75)<1e-6);assert.ok(r.pose.landing>0);
 g.update(1/120,true);assert.equal(r.update(g,1/120,0,project).height,122*1.38);
}
console.log('PASS: exact alternating foot/audio phase, stance world anchors, fixed 3D limb length, instant input, 75cm apex and landing response');
assert.deepEqual([0,99,100,299,300,499,500,799,800].map(levelAt),[0,0,1,1,2,2,3,3,4]);
const s=new Sound(storage),m=new Music(s,storage);assert.equal(m.enabled,true);assert.equal(m.volume,.35);assert.equal(s.volume,.7);assert.equal(s.context,null);
m.setEnabled(false);m.setVolume(.21);s.setMasterVolume(.62);const m2=new Music(new Sound(storage),storage);assert.equal(m2.enabled,false);assert.equal(m2.volume,.21);assert.equal(new Sound(storage).masterVolume,.62);
const arrangements=[];m.note=(kind,midi,at,duration,level)=>arrangements.push({kind,midi,at,duration,level});
for(let stage=0;stage<5;stage++){
 arrangements.length=0;m.wantedScene='play';m.wantedStage=stage;
 for(let i=0;i<32*16;i++)m.renderStep(i,i*STEP);
 const kinds=new Set(arrangements.map(e=>e.kind));assert.ok(kinds.has('kick')&&kinds.has('clap')&&kinds.has('bass')&&kinds.has('pad'));
 if(stage>=2)assert.ok(kinds.has('lead')&&kinds.has('arp'));
 assert.ok(arrangements.every(e=>e.duration>0&&e.level>0));
}
m.stage=0;m.wantedStage=4;m.renderStep(1,0);assert.equal(m.stage,0);m.renderStep(16,0);assert.equal(m.stage,4);
console.log('PASS: original 32-bar multi-instrument score, five distance arrangements, bar-aligned changes, independent saved mixer preferences');
