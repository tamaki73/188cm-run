const {GameModel}=require('../game-engine'),{seeded,drive}=require('./virtual-player.cjs');
let events=0,challenges=0,windups=0;const actions={};
for(let seed=1;seed<=10;seed++){
 const g=new GameModel(seeded(seed));g.start();let last=0;
 while(g.mode==='playing'&&g.completedEvents<2000){
  for(const e of g.events){if(e.uid<=last)continue;last=e.uid;events++;challenges+=Boolean(e.endurance);windups+=Boolean(e.fatigueWindup);const kind=e.kind==='item'?(e.high?'high-item':'low-item'):e.rule==='overhead'?(e.low?'crouch':'standing'):e.rule;actions[kind]=(actions[kind]||0)+1;}
  drive(g);
 }
 if(g.mode!=='playing')throw Error(g.reason);
}
console.log(JSON.stringify({events,challenges,windups,fatigueEventShare:Number(((challenges+windups)/events*100).toFixed(2)),actions},null,2));
