'use strict';
const assert = require('node:assert/strict');
const {GameModel, ITEMS, OBSTACLES, LESSONS} = require('../game-engine.js');
const {Sound, MAX_VOICES} = require('../audio.js');
const g = new GameModel(()=>0.5);
const drain = () => g.soundEvents.splice(0);
const run = (seconds, crouch=false, straddle=false) => {
  const events=[];
  for(let t=0;t<seconds-1e-8;t+=1/120) { g.update(Math.min(1/120,seconds-t),crouch,straddle);events.push(...drain()); }
  return events;
};
const start = (distance=0) => { g.start();g.distance=distance;g.spawnTimer=100;drain(); };
start(); const slow=run(3).filter(e=>e.name==='foot');
start(1000); const fast=run(3).filter(e=>e.name==='foot');
assert.ok(fast.length>slow.length*1.4); assert.ok(slow.every((e,i)=>!i||e.foot!==slow[i-1].foot));
const gap=events=>events[2].time-events[1].time;
assert.ok(gap(fast)<gap(slow)); console.log('PASS: speed-dependent alternating foot contacts, integrated gait');
start();g.jump();assert.equal(drain().filter(e=>e.name==='jump').length,1);
assert.equal(g.jump(),false);assert.deepEqual(drain(),[]);
const airborne=run(.95);assert.equal(airborne.filter(e=>e.name==='foot').length,0);assert.equal(airborne.filter(e=>e.name==='land').length,0);
const landed=run(.06);assert.equal(landed.filter(e=>e.name==='land').length,1);assert.equal(g.jumpY,0);
assert.ok(run(.5).some(e=>e.name==='foot'));console.log('PASS: accepted takeoff once, airborne silence, exact landing and resumed footsteps');
for(const [crouch,straddle,name] of [[true,false,'crouch'],[false,true,'straddle']]) {
  start();const held=run(2,crouch,straddle);assert.equal(held.filter(e=>e.name===name).length,1);
  assert.ok(held.filter(e=>e.name==='foot').length<slow.length*2/3);
  assert.equal(run(.5).filter(e=>e.name==='stand').length,1);
}
console.log('PASS: one posture start/end per hold; quieter-cadence poses');
start();g.grab();assert.equal(drain().filter(e=>e.name==='collect').length,0);
g.events=[g.makeItem(ITEMS.find(d=>d.id==='student-id'),0)];g.grab();assert.equal(drain().filter(e=>e.name==='collect'&&!e.high).length,1);
g.grab();assert.equal(drain().filter(e=>e.name==='collect').length,0);
start();g.events=[g.makeItem({...ITEMS.find(d=>d.id==='towel'),min:325,max:325},9)];g.jump();g.grab();drain();
assert.equal(g.items,0);const buffered=run(.5);assert.equal(g.items,1);assert.equal(buffered.filter(e=>e.name==='collect'&&e.high).length,1);
console.log('PASS: low/high successful pickups only, including buffered E');
start();g.events=[g.makeObstacle(OBSTACLES.find(d=>d.id==='strap'),160,0)];g.update(.01);
assert.equal(drain().find(e=>e.name==='over').cause,'collision');assert.deepEqual(run(1),[]);
start();g.crouchStrain=99.9;g.update(.02,true);assert.equal(drain().find(e=>e.name==='over').cause,'fatigue');
start();g.paused=true;assert.deepEqual(run(1),[]);
start();g.update(20);assert.ok(g.soundEvents.length<=16);
console.log('PASS: distinct collision/fatigue finish; paused/game-over silence; bounded event queue');
assert.equal(LESSONS.length,9);assert.equal(LESSONS[2][1],'↓キーまたはShiftキーを押してしゃがみます。完全に障害物が消えるまでしゃがみ続けてください。');
const values=new Map(),storage={get:(k,d)=>values.has(k)?values.get(k):d,set:(k,v)=>values.set(k,String(v))};
const sound=new Sound(storage);assert.equal(sound.context,null);assert.equal(sound.volume,.7);assert.equal(sound.enabled,true);
sound.setEnabled(true);sound.setVolume(.42);const restored=new Sound(storage);assert.equal(restored.enabled,true);assert.equal(restored.volume,.42);assert.equal(restored.play('ui'),false);assert.equal(restored.context,null);assert.equal(MAX_VOICES,6);
sound.setEnabled(false);assert.equal(new Sound(storage).enabled,false);
values.set('soundVolume','');assert.equal(new Sound(storage).volume,.7);values.set('soundVolume','broken');assert.equal(new Sound(storage).volume,.7);
console.log('PASS: exact lesson text, default ON/70%, explicit OFF saved, invalid volume fallback and no audio before a gesture');
