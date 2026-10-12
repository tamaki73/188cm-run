'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CONFIG: C, OBSTACLES, ITEMS, GameModel } = require('../game-engine');
function fresh() { const g = new GameModel(); g.start(); g.spawnTimer = 1000; return g; }
function door(g, clearance, z = 1) { const e = g.makeObstacle(OBSTACLES[0], clearance, z); g.events.push(e); return e; }
function item(g, high, z = 0) { const e = g.makeItem(ITEMS[high ? 6 : 0], z); g.events.push(e); return e; }
test('all 189–194cm doors pass standing; all 182–187cm doors collide', () => {
  for (let h = 182; h <= 194; h++) {
    if (h === 188) continue;
    const g = fresh(); door(g, h); g.update(0.2);
    assert.equal(g.mode, h < 188 ? 'gameover' : 'playing', String(h));
  }
});
test('crouch must be held until the whole passage ends, including a stalled frame', () => {
  const g = fresh(); const e = door(g, 182); g.update(0.2, true); assert.equal(g.mode, 'playing');
  assert.ok(e.z < 0 && e.z > -e.length); g.update(0.1, false); assert.equal(g.mode, 'gameover');
  const full = fresh(); door(full, 182); full.update(1, true); assert.equal(full.mode, 'playing'); full.update(0.1, false); assert.equal(full.mode, 'playing');
  const swept = fresh(); door(swept, 184); swept.update(1); assert.equal(swept.mode, 'gameover');
});
test('jumping into an otherwise passable door also hits the lintel', () => {
  const g = fresh(); door(g, 194); g.jump(); g.update(0.2); assert.equal(g.mode, 'gameover');
});
test('low items require a fresh E action, standing, grounded and nearby', () => {
  const g = fresh(); item(g, false); g.update(0.1); assert.equal(g.items, 0);
  g.crouching = true; assert.equal(g.grab(), false);
  g.crouching = false; g.jumpY = 30; assert.equal(g.grab(), false);
  g.jumpY = 0; g.jumpVelocity = 1; assert.equal(g.grab(), false);
  g.jumpVelocity = 0; assert.equal(g.grab(), true); assert.equal(g.grab(), false); assert.equal(g.items, 1); assert.equal(g.itemScore, 300);
  const far = fresh(); item(far, false, 10); assert.equal(far.grab(), false);
});
test('high items need an airborne reach and E; misses do not end the game', () => {
  const g = fresh(); item(g, true); assert.equal(g.grab(), false);
  g.jump(); g.update(0.15); assert.equal(g.items, 0); assert.equal(g.grab(), true); assert.equal(g.itemScore, 500);
  const missed = fresh(); item(missed, true); missed.update(1); assert.equal(missed.mode, 'playing'); assert.equal(missed.items, 0);
});
test('crouch builds and recovers strain; ankle strain recovers slowly', () => {
  const g = fresh(); g.update(2, true); assert.ok(Math.abs(g.strain - 30) < 0.001);
  g.update(1); assert.ok(Math.abs(g.strain - 23) < 0.001);
  g.jump(); g.update(1); assert.ok(g.ankleStrain > 14 && g.ankleStrain < 15);
});
test('both exhaustion causes show the requested message', () => {
  const crouch = fresh(); crouch.update(7, true); assert.equal(crouch.reason, '体への負担が限界に達しました！');
  const ankle = fresh(); for (let i = 0; i < 8; i++) { ankle.jump(); ankle.update(0.9); }
  assert.equal(ankle.reason, 'ジャンプのしすぎで足首をねんざしました！');
});
test('physics is time based at 30/60/120fps and speed rises with distance', () => {
  const values = [30, 60, 120].map(fps => { const g = fresh(); for (let i = 0; i < fps * 6; i++) g.update(1 / fps, true); return g; });
  for (const g of values) { assert.ok(Math.abs(g.distance - values[0].distance) < 0.01); assert.ok(Math.abs(g.strain - 90) < 0.001); assert.ok(g.speed > C.INITIAL_SPEED); }
  const max = fresh(); max.distance = 1e6; max.update(0.01); assert.equal(max.speed, C.MAX_SPEED);
});
test('randomized events cover all designs and never repeat exact IDs consecutively', () => {
  let seed = 7; const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  const g = new GameModel(rng); g.start(); const seen = new Set(); let prev = '', lastKind = '', streak = 0;
  for (let i = 0; i < 1000; i++) {
    g.spawn(); const e = g.events.pop(); assert.notEqual(e.id, prev); prev = e.id; seen.add(e.id);
    if (e.kind === 'obstacle') assert.ok(e.clearance >= (e.low ? 182 : 189) && e.clearance <= (e.low ? 187 : 194));
    streak = lastKind === e.kind ? streak + 1 : 1; lastKind = e.kind; assert.ok(streak <= 3);
    assert.ok(e.z / C.MAX_SPEED > 3);
    if (e.kind === 'obstacle') assert.ok(C.MIN_SPAWN_INTERVAL > e.length / C.INITIAL_SPEED + 0.85);
  }
  assert.equal(seen.size, OBSTACLES.length + ITEMS.length);
  assert.notDeepEqual(Array.from({ length: 20 }, () => { g.spawn(); return g.events.pop().id; }), Array.from({ length: 20 }, () => { g.spawn(); return g.events.pop().id; }));
});
test('seven lessons require the real actions; failed lesson repeats without game over', () => {
  const g = new GameModel(); g.startTutorial(); g.nextLesson(); assert.equal(g.tutorial.step, 0);
  g.update(0.1, true); g.update(0.1); g.jump(); g.grab(); assert.equal(g.tutorial.done, true); g.nextLesson();
  assert.equal(g.tutorial.step, 1); g.update(6); assert.equal(g.tutorial.done, true); g.nextLesson();
  assert.equal(g.tutorial.step, 2); g.update(6); assert.equal(g.mode, 'tutorial'); assert.equal(g.tutorial.done, false); g.update(1.2);
  g.events[0].z = 1; g.update(1, true); assert.equal(g.tutorial.done, true); g.nextLesson();
  assert.equal(g.tutorial.step, 3); g.update(1, true); g.update(2); assert.equal(g.tutorial.done, true); g.nextLesson();
  assert.equal(g.tutorial.step, 4); g.events[0].z = 0; assert.equal(g.grab(), true); g.nextLesson();
  assert.equal(g.tutorial.step, 5); g.events[0].z = 0; g.jump(); g.update(0.15); assert.equal(g.grab(), true); g.nextLesson();
  assert.equal(g.tutorial.step, 6); for (let i = 0; i < 3; i++) { g.jump(); g.update(0.9); }
  assert.equal(g.tutorial.done, true); g.nextLesson(); assert.equal(g.mode, 'playing'); assert.equal(g.distance, 0);
});
test('pause and restart remove old events, input posture, speed and every score/load', () => {
  const g = fresh(); g.jump(); g.update(0.1); g.paused = true; const d = g.distance; g.update(3, true); assert.equal(g.distance, d);
  g.start(); assert.equal(g.mode, 'playing'); assert.equal(g.paused, false);
  for (const field of ['distance', 'itemScore', 'items', 'crouchStrain', 'ankleStrain', 'jumpY', 'jumpVelocity', 'elapsed']) assert.equal(g[field], 0);
  assert.equal(g.events.length, 0); assert.equal(g.effects.length, 0); assert.equal(g.crouching, false); assert.equal(g.speed, C.INITIAL_SPEED);
});
