'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const R=require('../game-engine'),{CONFIG:C,GameModel,speedAt,difficultyAt,PATTERNS,MESSAGES,minimumEntryGap,validateSequence}=R;
const {seeded,drive}=require('./virtual-player.cjs');
const opening=require('./fixtures/opening-before-difficulty.json');
function model(seed=1,distance=0){const g=new GameModel(seeded(seed));g.start();g.distance=distance;g.speed=speedAt(distance);return g;}
function recordedOpening(g){const spawned=[],passed=[];let serial=0;while(g.distance<99.9&&g.mode==='playing'){drive(g,1/120);for(const e of g.events){if(e.uid>serial){spawned.push({id:e.id,kind:e.kind,height:e.height,length:e.length??null,z:e.z,arrival:e.arrivalTime});serial=e.uid;}if(e.completed&&!passed.includes(e.uid))passed.push(e.uid);}}return JSON.parse(JSON.stringify({spawned,passed,distance:g.distance,elapsed:g.elapsed}));}
test('opening is exactly equal to pre-change spawns, positions, lengths, inputs and speed over twelve seeds',()=>{
 for(const {seed,...expected} of opening) assert.deepEqual(recordedOpening(model(seed)),expected,`seed ${seed}`);
});
test('six tiers increase smoothly, cap at 78m/s and retain the complete old 0–100m curve',()=>{
 assert.deepEqual([0,99.99,100,199.99,200,349.99,350,499.99,500,799.99,800,1e7].map(difficultyAt),[0,0,1,1,2,2,3,3,4,4,5,5]);
 for(let d=0;d<=100;d+=.1){const t=d/100;assert.ok(Math.abs(speedAt(d)-16*(1+.4*t*t*(3-2*t)))<1e-10);}
 for(const d of[100,200,350,500,800,1100]){assert.ok(Math.abs(speedAt(d+.001)-speedAt(d-.001))<.001);assert.ok(Math.abs((speedAt(d+.001)-speedAt(d))/.001-(speedAt(d)-speedAt(d-.001))/.001)<.001);}
 assert.equal(speedAt(1e9),78);assert.ok(speedAt(500)>49.6);assert.ok(speedAt(800)>56);
});
test('every A–E and switching pattern has a complete real-physics witness, not merely individually passable events',()=>{
 for(const pattern of PATTERNS){
  const g=model(30+pattern.id.length,900);g.route=Array(7).fill(R.AREAS.find(a=>a.id==='school'));
  const arrival=4,events=g.planPattern(pattern.actions,arrival,.85,pattern.id);assert.ok(events,pattern.id);
  for(let i=1;i<events.length;i++){assert.ok(events[i].arrivalTime-events[i-1].arrivalTime>=minimumEntryGap(events[i-1],events[i])-1e-8);assert.ok(events[i].worldDistance-events[i-1].worldDistance>=events[i].minimumDistance-1e-8);}
  for(const fps of[30,60,120])for(const load of[0,25,45]){
   const result=validateSequence(events,{startTime:arrival-.65,startDistance:g.futureDistance(arrival-.65),route:g.route,strain:load,fps,timings:[-.04,0,.04]});assert.equal(result.ok,true,pattern.id+' '+fps+' '+load+' '+result.reason);assert.ok(result.peak<94);
  }
 }
});
test('rejects impossible overlaps, an impossible whole fatigue block and unreachable high items',()=>{
 const g=model(4,900),jump=g.makeObstacle(R.OBSTACLES.find(d=>d.id==='double-cone'),50,70),low=g.makeObstacle(R.OBSTACLES.find(d=>d.id==='club-door'),175,70);
 for(const e of[jump,low])Object.assign(e,{worldDistance:g.distance+e.z,arrivalTime:1});
 const result=validateSequence([jump,low],{startDistance:g.distance,startTime:0});assert.equal(result.ok,false);
 const long=g.makeObstacle({...R.OBSTACLES.find(d=>d.id==='club-door'),duration:4.5},175,70);Object.assign(long,{worldDistance:g.distance+long.z,arrivalTime:1});assert.equal(validateSequence([long],{startDistance:g.distance,startTime:0,strain:60}).ok,false);
 assert.throws(()=>g.makeItem({id:'unreachable',min:328,max:328},70),RangeError);
 g.nextChallengeDistance=1e9;g.planPattern=()=>[jump,low];g.spawnAdvanced();assert.equal(g.events.length,0);assert.equal(g.spawnTimer,.4);
});
test('mixed speeds, fatigue components, late/early controls and FPS can consecutively complete generated blocks',()=>{
 let passed=0,peak=0,maxQueued=0;const patterns=new Set();
 for(const distance of[100,260,430,850,2000])for(const strain of[0,45,90])for(const fps of[30,60,120])for(const timing of[-.03,0,.03]){
  const seed=distance+strain+fps+Math.round(timing*1000),g=model(seed,distance);g.crouchStrain=strain*(fps===30?1:fps===60?.5:0);g.ankleStrain=strain-g.crouchStrain;g.crouchEffort=4;g.nextChallengeDistance=1e9;
  const options={jumpLead:.44+timing,highLead:.5+timing,crouchLead:.18+timing,crouchTail:.08,straddleLead:.18+timing,grabLead:.27+timing};
  for(let f=0;f<fps*180&&g.mode==='playing'&&g.completedEvents<30;f++){for(const e of g.events)if(e.patternId)patterns.add(e.patternId);drive(g,1/fps,options);peak=Math.max(peak,g.strain);maxQueued=Math.max(maxQueued,g.events.length);}
  assert.equal(g.mode,'playing',JSON.stringify({distance,strain,fps,timing,reason:g.reason,next:g.events[0]}));assert.ok(g.completedEvents>=30);passed+=g.completedEvents;
 }
 assert.ok(patterns.has('A')&&patterns.has('D')&&patterns.has('E'));assert.ok(maxQueued<=12);
 fs.mkdirSync('work',{recursive:true});fs.writeFileSync('work/difficulty-variants.json',JSON.stringify({cases:135,events:passed,peak,maxQueued,patterns:[...patterns]},null,2));
});
test('every committed block after the opening, including long-passage pairs, passed whole-sequence validation',()=>{
 const g=model(11);let serial=0,checked=0,endurance=0;
 for(let f=0;g.completedEvents<150&&f<50000&&g.mode==='playing';f++){
  drive(g);for(const e of g.events)if(e.uid>serial){if(g.distance>=100){assert.equal(e.validated,true,e.id);checked++;if(e.endurance)endurance++;}serial=e.uid;}
 }
 assert.equal(g.mode,'playing');assert.ok(checked>100);assert.ok(endurance>0);
});
test('high-item request, failure and success messages are cause-correct and never affect obstacle RNG',()=>{
 const base=R.ITEMS.find(d=>d.id==='towel');
 const missed=model(9);missed.spawnTimer=Infinity;missed.events=[missed.makeItem(base,0)];assert.equal(missed.events[0].requested,true);missed.update(1);assert.ok(MESSAGES.highMiss.includes(missed.reason));assert.equal(missed.mode,'gameover');
 const success=model(9);success.spawnTimer=Infinity;success.events=[success.makeItem(base,0)];success.jumpY=75;assert.equal(success.grab(),true);assert.equal(success.mode,'playing');assert.ok(MESSAGES.highSuccess.includes(success.pickupNotice.text));assert.equal(success.items,1);
 const low=model();low.spawnTimer=Infinity;low.events=[low.makeItem(R.ITEMS.find(d=>d.id==='student-id'),0)];low.update(1);assert.equal(low.reason,'学生証を取り逃がしました！');
 const messages=new Set();for(let n=1;n<30;n++){const g=model(n);g.spawnTimer=Infinity;g.serial=n;g.events=[g.makeObstacle(R.OBSTACLES.find(d=>d.id==='tatami'),175,1)];g.update(.2);assert.ok(MESSAGES.head.includes(g.reason));messages.add(g.reason);}assert.ok(messages.size>3);
 const airborne=model();airborne.spawnTimer=Infinity;airborne.events=[airborne.makeObstacle(R.OBSTACLES.find(d=>d.id==='tatami'),175,1)];airborne.jump();airborne.update(.2);assert.ok(!MESSAGES.head.includes(airborne.reason));assert.match(airborne.reason,/頭をぶつけ/);
 const crouched=model();crouched.spawnTimer=Infinity;crouched.events=[crouched.makeObstacle(R.OBSTACLES.find(d=>d.id==='tatami'),100,1)];crouched.update(.2,true);assert.ok(!MESSAGES.head.includes(crouched.reason));
});
