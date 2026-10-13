// Reproduce the before/after measurement from the retained baseline tag (not run in CI).
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const baselineRef=process.argv[2]||'before-glass-update-20261013';
const baselinePath=path.resolve('work/tempo-baseline.cjs');
fs.mkdirSync('work',{recursive:true});
fs.writeFileSync(baselinePath,execFileSync('git',['show',baselineRef+':game-engine.js'],{encoding:'utf8'}));
const {seeded,drive}=require('./virtual-player.cjs');
function measure(GameModel){let slots=0,blank=0;const byStage={early:{n:0,total:0},middle:{n:0,total:0},late:{n:0,total:0}};
 for(let seed=1;seed<=10;seed++){const g=new GameModel(seeded(seed));g.start();let serial=0,previous=null;
  while(g.mode==='playing'&&g.completedEvents<2000){
   for(const e of g.events){if(e.uid<=serial)continue;serial=e.uid;e.worldDistance=g.distance+e.z;e.arrivalSpeed=require('../game-engine').speedAt(e.worldDistance);
    if(previous&&!e.endurance&&!e.fatigueWindup&&!previous.endurance&&!previous.fatigueWindup&&e.arrivalTime>=g.recoveryUntil){
      const busy=previous.kind==='item'?(previous.high?.55:.42):previous.length/(previous.arrivalSpeed||require('../game-engine').speedAt(previous.worldDistance));
      const gap=e.arrivalTime-previous.arrivalTime-busy;if(gap>0&&gap<5){blank+=gap;slots++;const stage=e.worldDistance<200?'early':e.worldDistance<500?'middle':'late';byStage[stage].n++;byStage[stage].total+=gap;}
    }
    e.worldDistance=g.distance+e.z;e.arrivalSpeed=require('../game-engine').speedAt(e.worldDistance);previous=e;
   }
   drive(g);
  }
  if(g.mode!=='playing')throw Error(g.reason);
 }
 return{samples:slots,meanBlank:blank/slots,byStage:Object.fromEntries(Object.entries(byStage).map(([k,v])=>[k,{samples:v.n,mean:v.total/v.n}]))};
}
const before=measure(require(baselinePath).GameModel),after=measure(require('../game-engine').GameModel);
console.log(JSON.stringify({before,after,blankReductionPercent:100*(1-after.meanBlank/before.meanBlank)},null,2));
