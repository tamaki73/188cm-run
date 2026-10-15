'use strict';
const { CONFIG: C, GameModel } = require('../game-engine');
function seeded(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; }; }
function drive(g, dt = 1 / 60, options = {}) {
  const e = g.events.find(e => !e.completed);
  let crouch = false, straddle = false;
  if (e) {
    const timeToEntry = e.z / g.speed;
    if (e.kind === 'obstacle') {
      if (e.rule === 'overhead' && e.clearance < C.PASSAGE_HEIGHT && timeToEntry <= (options.crouchLead ?? .13) && e.z >= -e.length) { crouch = true; if(options.crouchTail) g._botCrouchUntil = g.elapsed + Math.max(0,(e.z+e.length)/g.speed) + options.crouchTail; }
      if (e.rule === 'straddle' && timeToEntry <= (options.straddleLead ?? .13) && e.z >= -e.length) straddle = true;
      if (e.rule === 'jump' && timeToEntry <= (options.jumpLead ?? .44) && e.z >= 0 && g.jumpY === 0 && g.jumpVelocity === 0) g.jump();
    } else if (!e.collected) {
      if (e.high && timeToEntry <= (options.highLead ?? .5) && e.z >= 0 && g.jumpY === 0 && g.jumpVelocity === 0) g.jump();
      if (!e.reserved && Math.abs(e.z) <= e.reachDistance * .8 && (e.high ? g.jumpY > 0 && timeToEntry <= (options.grabLead ?? .30) : g.jumpY === 0 && g.jumpVelocity === 0)) { g.grab(); e.reserved = true; }
    }
  }
  if(g._botCrouchUntil > g.elapsed) crouch = true;
  g.update(dt, crouch, straddle);
}
function simulate(seed, events = 2000, fps = 60, options = {}) {
  const g = new GameModel(seeded(seed)); g.start();
  let frames = 0, peak = 0, highLoadFrames = 0, recoveries = 0, wasHigh = false, maxQueuedEvents = 0; const seen = new Set(), areas = new Set();
  while (g.mode === 'playing' && g.completedEvents < events && frames < events * fps * 5) {
    for (const e of g.events) { seen.add(e.id); if (e.areaId) areas.add(e.areaId); }
    drive(g, 1 / fps, options); peak = Math.max(peak, g.strain); maxQueuedEvents = Math.max(maxQueuedEvents, g.events.length); frames++;
    if(g.strain >= 80) { highLoadFrames++; wasHigh=true; }
    if(wasHigh && g.strain <= 20) { recoveries++; wasHigh=false; }
  }
  if (g.mode !== 'playing' || g.completedEvents < events) throw new Error(`seed=${seed} completed=${g.completedEvents} distance=${g.distance.toFixed(1)} load=${g.strain.toFixed(2)} reason=${g.reason} next=${JSON.stringify(g.events[0])}`);
  return { count: g.completedEvents, distance: g.distance, peak, seen, areas, highLoadFrames, recoveries, maxQueuedEvents };
}
module.exports = { seeded, drive, simulate };
if (require.main === module) {
  let count = 0, distance = 0, peak = 0, highLoadFrames = 0, recoveries = 0, maxQueuedEvents = 0; const seen = new Set(), areas = new Set();
  for (let seed = 1; seed <= 50; seed++) {
    const r = simulate(seed, 2000, [30, 60, 120][seed % 3], seed % 2 ? {} : { crouchLead: .23, crouchTail: .1 }); count += r.count; distance += r.distance; peak = Math.max(peak, r.peak);
    highLoadFrames += r.highLoadFrames; recoveries += r.recoveries; maxQueuedEvents=Math.max(maxQueuedEvents,r.maxQueuedEvents); r.seen.forEach(v => seen.add(v)); r.areas.forEach(v => areas.add(v));
  }
  console.log(JSON.stringify({ seeds: 50, eventsPassed: count, totalDistance: Math.floor(distance), maxStrain: Number(peak.toFixed(2)), highLoadFrames, recoveries, maxQueuedEvents, uniqueEvents: seen.size, areas: [...areas], fps: [30, 60, 120] }, null, 2));
}
