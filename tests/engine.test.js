'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CONFIG: C, OBSTACLES, ITEMS, LESSONS, AREAS, speedAt, areaAt, GameModel } = require('../game-engine');
const { drive, simulate, seeded } = require('./virtual-player.cjs');
const def = id => OBSTACLES.find(e => e.id === id);
const itemDef = id => ITEMS.find(e => e.id === id);
function fresh() { const g = new GameModel(); g.start(); g.spawnTimer = 1e9; return g; }
function door(g, clearance, z = 1) { const e = g.makeObstacle(def('train'), clearance, z); g.events.push(e); return e; }
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
test('crouch strain stages are 8/14/22% per second; short releases do not reset effort', () => {
  const g = fresh(); g.update(2, true); assert.ok(Math.abs(g.strain - 16) < .1); g.update(2, true); assert.ok(Math.abs(g.strain - 44) < .1);
  g.update(1, true); assert.ok(Math.abs(g.strain - 66) < .2); g.update(.05); const load = g.strain; g.update(.2, true); assert.ok(g.strain - load > 4.3);
  g.update(1); assert.equal(g.crouchEffort, 0);
});
test('normal running recovers a single total of 6%/s; straddle and jumps add fatigue', () => {
  const g = fresh(); g.crouchStrain = 20; g.ankleStrain = 10; g.update(1); assert.ok(Math.abs(g.strain - 24) < .001);
  const s = fresh(); s.update(1, false, true); assert.ok(Math.abs(s.strain - 10) < .001);
  const j = fresh(); j.jump(); assert.equal(j.strain, 8); j.update(.5); assert.ok(Math.abs(j.strain - 7) < .001);
});
test('exhaustion causes keep their distinct messages', () => {
  const crouch = fresh(); crouch.update(10, true); assert.equal(crouch.reason, '体への負担が限界に達しました！');
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
    g.distance=i*7; g.elapsed=i*1.6; g.spawn(); const e=g.events.pop(); if(!e) continue;
    assert.notEqual(e.id,last); last=e.id; assert.ok(e.areas.includes(e.areaId)); assert.ok(e.arrivalTime-g.elapsed>=C.MIN_REACTION_TIME-1e-8);
    assert.ok(e.arrivalTime-time>=1.3-1e-8); time=e.arrivalTime; assert.ok(g.planLoad<=C.PLANNER_STRAIN_LIMIT+1e-8);
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
    if(step===7) { g.update(1.6,true); g.update(1.5); assert.equal(g.tutorial.recovered,true); g.jump(); }
    else for(let frame=0;frame<1500&&!g.tutorial.done;frame++) drive(g);
    assert.equal(g.tutorial.done,true, 'step '+step); g.nextLesson();
  }
  assert.equal(g.mode,'playing'); assert.equal(g.distance,0); assert.equal(LESSONS.length,9);
});
test('pause and restart clear scores, strain, posture, scheduling and all previous events', () => {
  const g=fresh(); g.jump(); g.update(.1); g.paused=true; const d=g.distance; g.update(3,true,true); assert.equal(g.distance,d);
  g.start(); for(const f of ['distance','itemScore','items','crouchStrain','ankleStrain','crouchEffort','jumpY','jumpVelocity','elapsed','planTime','planLoad','completedEvents']) assert.equal(g[f],0);
  assert.equal(g.paused,false); assert.equal(g.straddling,false); assert.equal(g.crouching,false); assert.equal(g.events.length,0); assert.equal(g.speed,C.INITIAL_SPEED);
});
test('perfect virtual players survive mixed events over every area and maximum speed', () => {
  for(const seed of [1,7,31]) { const r=simulate(seed,1000); assert.equal(r.count,1000); assert.equal(r.areas.size,7); assert.ok(r.peak<100); }
});
