'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CONFIG: C, OBSTACLES, ITEMS, LESSONS, AREAS, speedAt, areaAt, GameModel } = require('../game-engine');
const { drive, simulate, seeded } = require('./virtual-player.cjs');
const def = id => OBSTACLES.find(e => e.id === id);
const itemDef = id => ITEMS.find(e => e.id === id);
function fresh() { const g = new GameModel(); g.start(); g.spawnTimer = 1e9; return g; }
function door(g, clearance, z = 1) { const e = g.makeObstacle(def('new-class'), clearance, z); g.events.push(e); return e; }
function item(g, height, z = 0) { const e = g.makeItem({ ...itemDef('student-id'), min: height, max: height }, z); g.events.push(e); return e; }
test('body constants reflect shoe-inclusive 190cm, inseam 90 and exact 75cm jump', () => {
  assert.equal(C.PLAYER_HEIGHT, 188); assert.equal(C.PASSAGE_HEIGHT, 190); assert.equal(C.INSEAM, 90);
  assert.equal(C.STANDING_REACH, 252); assert.equal(C.MAX_REACH, 327);
  const g = fresh(); g.jump(); let peak = 0; for (let i = 0; i < 120; i++) { g.update(1 / 120); peak = Math.max(peak, g.jumpY); }
  assert.ok(Math.abs(peak - 75) < 1e-8); assert.equal(g.jumpY, 0);
});
test('passage threshold is exactly 190cm, not the bare 188cm height', () => {
  for (let h = 175; h <= 210; h++) { const g = fresh(); door(g, h); g.update(0.6); assert.equal(g.mode, h < 190 ? 'gameover' : 'playing', String(h)); }
});
test('crouch must last until the entire passage ends; a delayed frame cannot tunnel', () => {
  const g = fresh(); const e = door(g, 160); g.update(.2, true); assert.equal(g.mode, 'playing'); assert.ok(e.z < 0 && e.z > -e.length);
  g.update(.1); assert.equal(g.mode, 'gameover');
  const full = fresh(); door(full, 160); full.update(1, true); assert.equal(full.mode, 'playing'); full.update(.1); assert.equal(full.mode, 'playing');
  const swept = fresh(); door(swept, 185); swept.update(1); assert.equal(swept.mode, 'gameover');
});
test('jumping collides with a lintel; a ticket gate has no overhead obstacle', () => {
  const g = fresh(); door(g, 200); g.jump(); g.update(.2); assert.equal(g.mode, 'gameover');
  const gate = fresh(); gate.events.push(gate.makeObstacle(def('ticket-gate'), Infinity, 1)); gate.jump(); gate.update(.6); assert.equal(gate.mode, 'playing');
});
test('S straddles all narrow objects, and standing, crouching and jumping do not', () => {
  for (const d of OBSTACLES.filter(e => e.rule === 'straddle')) {
    const g = fresh(); g.events.push(g.makeObstacle(d, d.max, 1)); g.update(.6, false, true); assert.equal(g.mode, 'playing', d.id);
    for (const posture of ['stand', 'crouch', 'jump']) { const fail = fresh(); fail.events.push(fail.makeObstacle(d, d.min, 1)); if (posture === 'jump') fail.jump(); fail.update(.2, posture === 'crouch'); assert.equal(fail.mode, 'gameover', d.id + posture); }
  }
});
test('straddle considers both inseam and width; release mid-passage collides', () => {
  for (const [height, width] of [[80, 20], [70, 90]]) { const g = fresh(); g.events.push(g.makeObstacle({ ...def('lane-pole'), width }, height, 1)); g.update(.2, false, true); assert.equal(g.mode, 'gameover'); }
  const g = fresh(); g.events.push(g.makeObstacle(def('lane-pole'), 70, 1)); g.update(.1, false, true); g.update(.1); assert.equal(g.mode, 'gameover');
});
test('all animal toys and wide ground fixtures require airborne feet above their height', () => {
  for (const d of OBSTACLES.filter(e => e.rule === 'jump')) {
    const g = fresh(); g.events.push(g.makeObstacle(d, d.max, 7)); for (let i = 0; i < 120 && !g.completedEvents; i++) drive(g);
    assert.equal(g.mode, 'playing', d.id); assert.equal(g.completedEvents, 1);
    for (const posture of ['stand', 'crouch', 'straddle']) { const fail = fresh(); fail.events.push(fail.makeObstacle(d, d.min, 1)); fail.update(.2, posture === 'crouch', posture === 'straddle'); assert.equal(fail.mode, 'gameover', d.id + posture); }
  }
});
test('jump checks obstacle depth: landing before its rear edge collides', () => {
  const g = fresh(); const e = g.makeObstacle(def('horse'), 55, 0); e.length = 20; g.events.push(e); g.jumpY = 75; g.jumpVelocity = 0;
  g.update(.1); assert.equal(g.mode, 'playing'); g.update(.5); assert.equal(g.mode, 'gameover');
});
test('items at/below 252cm require standing and E; 253–327cm require airborne reach', () => {
  for (const h of [115, 240, 250, 252]) {
    const g = fresh(); item(g, h); g.crouching = true; assert.equal(g.grab(), false); g.crouching = false; g.straddling = true; assert.equal(g.grab(), false); g.straddling = false;
    g.jumpY = 40; assert.equal(g.grab(), false); g.jumpY = 0; assert.equal(g.grab(), true); assert.equal(g.grab(), false);
  }
  for (const h of [253, 305, 323, 327]) { const g = fresh(); item(g, h); assert.equal(g.grab(), false); g.jumpY = 75; assert.equal(g.grab(), true, String(h)); }
  const short = fresh(); item(short, 327); short.jumpY = 70; assert.equal(short.grab(), false); short.jumpY = 75; assert.equal(short.grab(), true);
  assert.throws(() => item(fresh(), 328), RangeError);
});
test('E and distance are mandatory; misses end normal play with the item name', () => {
  const g = fresh(); item(g, 140); g.update(.1); assert.equal(g.items, 0); assert.equal(g.grab(), true);
  const far = fresh(); item(far, 140, 20); assert.equal(far.grab(), false);
  const missed = fresh(); item(missed, 140); missed.update(1); assert.equal(missed.mode, 'gameover'); assert.equal(missed.reason, '学生証を取り逃がしました！');
});
test('crouch strain stages are 15/25/35% per second; short releases do not reset effort', () => {
  const g = fresh(); g.update(2, true); assert.ok(Math.abs(g.strain - 30) < .15); g.update(2, true); assert.ok(Math.abs(g.strain - 80) < .2);
  g.update(.2, true); assert.ok(Math.abs(g.strain - 87) < .3); g.update(.05); const load = g.strain; g.update(.1, true); assert.ok(g.strain - load > 3.4);
  g.update(1); assert.equal(g.crouchEffort, 0);

});
test('normal running recovers a single total of 8%/s; straddle and jumps add fatigue', () => {
  const g = fresh(); g.crouchStrain = 20; g.ankleStrain = 10; g.update(1); assert.ok(Math.abs(g.strain - 22) < .001);
  const s = fresh(); s.update(1, false, true); assert.ok(Math.abs(s.strain - 20) < .001);
  const j = fresh(); j.jump(); assert.equal(j.strain, 12); j.update(.5); assert.ok(Math.abs(j.strain - 11) < .001);
});
test('exhaustion causes keep their distinct messages', () => {
  const crouch = fresh(); crouch.update(10, true); assert.equal(crouch.reason, 'ヘルニアになりました');
  const ankle = fresh(); for (let i = 0; i < 30 && ankle.mode === 'playing'; i++) { ankle.jump(); ankle.update(1.01); }
  assert.equal(ankle.reason, 'ジャンプのしすぎで足首をねんざしました！');
});
test('speed meets all requested distance milestones smoothly and stays capped', () => {
  for (const [d, v] of [[0,1],[100,1.4],[200,1.9],[300,2.4],[500,3.1],[800,3.5]]) assert.equal(speedAt(d) / C.INITIAL_SPEED, v);
  let previous = C.INITIAL_SPEED; for (let d = 0; d <= 2000; d++) { const v = speedAt(d); assert.ok(v >= previous && v <= C.MAX_SPEED); assert.ok(v - previous < .15); previous = v; }
});
test('30/60/120fps yield the same distance and fatigue', () => {
  const values = [30,60,120].map(fps => { const g = fresh(); for(let i=0;i<fps*3;i++) g.update(1/fps,true); return g; });
  for (const g of values) { assert.ok(Math.abs(g.distance-values[0].distance)<.02); assert.ok(Math.abs(g.strain-values[0].strain)<.02); }
});
test('area-specific spawning has reaction time, bounded forecast, no unreachable or repeated event', () => {
  const g = new GameModel(seeded(2)); g.start(); let last = '', time = 0;
  for (let i=0;i<2000;i++) {
    g.distance=i*7; g.elapsed=i*1.6; const previousPlan=g.planTime,previousEnd=g.planEndTime,afterJump=g.lastAction==='jump'; g.spawn(); const e=g.events.pop(); if(!e) continue;
    assert.notEqual(e.id,last); last=e.id; assert.ok(e.areas.includes(e.areaId)); assert.ok(e.arrivalTime-g.elapsed>=C.MIN_REACTION_TIME-1e-8);
    assert.ok(e.arrivalTime-previousPlan >= (afterJump ? 1.3 : .95)-1e-8); assert.ok(e.arrivalTime-previousEnd >= .8-1e-8); time=e.arrivalTime; assert.ok(g.planLoad<95); if(!e.endurance&&e.plannedCost>0) assert.ok(g.planLoad<=C.PLANNER_STRAIN_LIMIT+1e-8);
    if(e.kind==='item') assert.ok(e.height<=327);
  }
  assert.equal(AREAS.length,7); assert.equal(areaAt(0).id,'street'); assert.equal(areaAt(180*5).id,'park');
});
test('all nine tutorial lessons require real actions, retry failures and finish the combination', () => {
  const g=new GameModel(); g.startTutorial(); g.nextLesson(); assert.equal(g.tutorial.step,0);
  g.update(.1,true); g.update(.1,false,true); g.update(.1); g.jump(); g.grab(); assert.equal(g.tutorial.done,true); g.nextLesson();
  while(g.mode==='tutorial') {
    const step=g.tutorial.step;
    if(step===2) { g.events[0].z=1; g.update(.2); assert.equal(g.mode,'tutorial'); assert.equal(g.tutorial.done,false); g.update(1.3); }
    if(step===7) { g.update(1.6,true); g.update(3); assert.equal(g.tutorial.recovered,true); g.jump(); }
    else for(let frame=0;frame<1500&&!g.tutorial.done;frame++) drive(g);
    assert.equal(g.tutorial.done,true, 'step '+step); g.nextLesson();
  }
  assert.equal(g.mode,'playing'); assert.equal(g.distance,0); assert.equal(LESSONS.length,9);
});
test('pause and restart clear scores, strain, posture, scheduling and all previous events', () => {
  const g=fresh(); g.jump(); g.update(.1); g.paused=true; const d=g.distance; g.update(3,true,true); assert.equal(g.distance,d);
  g.start(); for(const f of ['distance','itemScore','items','crouchStrain','ankleStrain','crouchEffort','jumpY','jumpVelocity','elapsed','planTime','planLoad','planEndTime','recoveryUntil','completedEvents']) assert.equal(g[f],0);
  assert.equal(g.grabReservation.remaining,0); assert.equal(g.grabReservation.uid,null);
  assert.equal(g.paused,false); assert.equal(g.straddling,false); assert.equal(g.crouching,false); assert.equal(g.events.length,0); assert.equal(g.speed,C.INITIAL_SPEED);
});
test('perfect virtual players survive mixed events over every area and maximum speed', () => {
  for(const seed of [1,7,31]) { const r=simulate(seed,1000); assert.equal(r.count,1000); assert.equal(r.areas.size,7); assert.ok(r.peak>=80&&r.peak<=95); }
});

test('the curated catalog replaces ambiguous fixtures and keeps all required obstacles', () => {
  for(const id of ['mini-train','suitcase','cone','double-cone','vault','lane-pole','panda','elephant','turtle','horse','strap','rack-bar','bus-roof','club-door','tatami','new-class','convenience','supermarket']) assert.ok(def(id),id);
  for(const id of ['warehouse','service','izakaya','marker','divider','old-class','play-base']) assert.equal(def(id),undefined,id);
  for(const id of ['mini-train','suitcase','cone','vault','lane-pole']) assert.equal(def(id).rule,'straddle');
  assert.equal(def('double-cone').rule,'jump'); assert.ok(def('double-cone').width>C.MAX_STRADDLE_WIDTH);
  assert.equal(fresh().actionCost(def('ticket-gate')),0);
});
test('E reserves 0.4s, captures a high item after reach becomes valid, and is consumed once', () => {
  const g=fresh(); const e=item(g,323,7); g.jump(); assert.equal(g.grab(),false); assert.equal(g.grabReservation.remaining,.4);
  g.update(.4); assert.equal(e.collected,true); assert.equal(g.items,1); assert.equal(g.grabReservation.remaining,0);
  item(g,323,0); g.update(.08); assert.equal(g.items,1);
  const expired=fresh(); item(expired,140,30); expired.grab(); expired.update(.41); assert.equal(expired.grabReservation.remaining,0); assert.equal(expired.items,0);
});
test('a reservation never makes high items reachable on the ground or without E', () => {
  const g=fresh(); item(g,323,2); g.grab(); g.update(.4); assert.equal(g.items,0);
  const noE=fresh(); item(noE,305,7); noE.jump(); noE.update(.7); assert.equal(noE.items,0);
});
test('wrong straddle/jump actions select the exact requested messages', () => {
  for(const id of ['double-cone','panda','elephant','turtle','horse']) {const g=fresh();g.events=[g.makeObstacle(def(id),def(id).min,1)];g.update(.2,false,true);assert.equal(g.reason,'そこまでの柔軟性はありません',id);}
  for(const id of ['mini-train','suitcase','cone','vault','lane-pole']) {const g=fresh();g.events=[g.makeObstacle(def(id),def(id).min,1)];g.jump();g.update(.2);assert.equal(g.reason,'そこまでの跳躍力はありません',id);}
  const s=fresh();s.crouchStrain=99;s.update(.1,false,true);assert.equal(s.reason,'股関節が限界を迎えました');
});
test('endurance sections cause genuine fatigue and provide time to recover without unavoidable failure', () => {
  for(const fps of [30,60,120]) { const r=simulate(77,1000,fps,{crouchLead:.23,crouchTail:.1});assert.ok(r.peak>=80&&r.peak<=95);assert.ok(r.highLoadFrames>0);assert.ok(r.recoveries>0);assert.ok(r.maxQueuedEvents<=5); }
});

test('five real restarts shuffle background routes and event sequences; tutorials remain fixed', () => {
 const g=new GameModel(seeded(8)),routes=new Set(),runs=new Set();
 for(let run=0;run<6;run++) {g.start();routes.add(g.route.map(a=>a.id).join(','));const ids=[];for(let n=0;n<12;n++){g.spawn();ids.push(...g.events.map(e=>e.id));g.events=[];g.elapsed=g.planTime;g.distance+=100;}runs.add(ids.join(','));}
 assert.equal(routes.size,6);assert.equal(runs.size,6);
 g.startTutorial();assert.equal(g.events.length,0);g.tutorial.step=2;g.setupLesson();assert.equal(g.events[0].id,'strap');assert.equal(g.events[0].endurance,undefined);
 assert.equal(LESSONS[2][1],'↓キーまたはShiftキーを押してしゃがみます。完全に障害物が消えるまでしゃがみ続けてください。');
});
test('unnecessary crouch at a safe door has a later cost; a short tap is recoverable', () => {
 function passage(waste){const g=fresh();g.distance=1000;g.speed=56;const safe=g.makeObstacle(def('new-class'),200,0),low=g.makeObstacle({...def('club-door'),duration:3.9},175,56*1.3);g.events=[safe,low];
 let peak=0;for(let frame=0;frame<1000&&g.mode==='playing'&&!low.completed;frame++){const time=g.elapsed;g.update(1/120,time<waste || time>=1.18 && !low.completed);peak=Math.max(peak,g.strain);}return{g,peak};}
 const correct=passage(0),tap=passage(.1),waste=passage(1.2);
 assert.equal(correct.g.mode,'playing');assert.equal(tap.g.mode,'playing');assert.equal(waste.g.reason,'ヘルニアになりました');assert.ok(correct.peak>=80&&correct.peak<95);
 const safe=fresh();door(safe,210,0);safe.update(.6,true);assert.equal(safe.mode,'playing');assert.ok(safe.strain>0);
});

test('long mini-train preserves height/width, uses .75s crossing and requires S through the rear edge', () => {
 for(const distance of [0,250,850]) {
  const g=fresh();g.distance=distance;const e=g.makeObstacle(def('mini-train'),70,2);g.events=[e];
  assert.equal(e.duration,.75);assert.equal(e.width,66);assert.equal(e.height,70);
  let occupied=0;for(let i=0;i<300&&!e.completed;i++){if(e.z<=0)occupied+=1/120;g.update(1/120,false,true);}
  assert.equal(g.mode,'playing');assert.ok(e.completed);assert.ok(Math.abs(occupied-.75)<.025);assert.ok(g.strain<25);
  const fail=fresh();fail.distance=distance;fail.events=[fail.makeObstacle(def('mini-train'),70,2)];fail.update(.4,false,true);assert.equal(fail.mode,'playing');fail.update(.04);assert.equal(fail.mode,'gameover');
 }
 const tutorial=new GameModel();tutorial.startTutorial();tutorial.tutorial.step=3;tutorial.setupLesson();assert.equal(tutorial.events[0].duration,.16);assert.ok(Math.abs(tutorial.events[0].length-1.44)<1e-8);
});
test('shorter slots keep a full landing margin and extra time after a long train', () => {
 const g=new GameModel(seeded(22));g.start();let checked=0;
 for(let frame=0;frame<180000&&g.mode==='playing'&&g.completedEvents<1000;frame++) {
  const previous=g.events.at(-1),end=g.planEndTime,action=g.lastAction,serial=g.serial;
  drive(g);
  if(g.serial>serial&&previous){const next=g.events.find(e=>e.uid>serial);if(next){assert.ok(next.arrivalTime-end>=.8-1e-8);if(action==='jump')assert.ok(next.arrivalTime-previous.arrivalTime>=1.3-1e-8);checked++;}}
 }
 assert.equal(g.mode,'playing');assert.equal(g.completedEvents,1000);assert.ok(checked>500);
});
