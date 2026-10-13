'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict');
const {understanding,nickname,Ranking}=require('../ranking');
const config={season:'season-1',firebase:{apiKey:'test',projectId:'demo-188cm-run',appId:'test'}};
function store(){const values=new Map();return{get:(k,f)=>values.get(k)??f,set:(k,v)=>values.set(k,String(v))};}
test('understanding caps at 100 but leaves distance unconstrained',()=>{for(const [m,p]of [[0,0],[100,10],[250,25],[750,75],[1000,100],[1250,100]]) assert.equal(understanding(m),p);});
test('nickname allows Japanese and Unicode, normalizes input, rejects markup, email, long and abusive input',()=>{
 assert.equal(nickname('  たまき  ７３ '),'たまき 73'); assert.equal(nickname('Νίκος'),'Νίκος');
 for(const name of ['','x'.repeat(17),'<img src=x>','a@b.com','死ね','shit','line\n<img>'])assert.throws(()=>nickname(name));
});
test('unconfigured ranking preserves local best and fails without loading network',async()=>{
 const storage=store(),r=new Ranking({},storage,()=>{throw Error('must not connect')});r.setName('友達');assert.ok(r.record(250,20));assert.equal(r.best,250);await assert.rejects(r.top(),/未設定/);assert.equal(new Ranking({},storage).name,'友達');assert.equal(new Ranking({},storage).best,250);
});
test('only best distances are submitted, failures retain retry and sends throttle; names retain identity',async()=>{
 let now=100000,serverBest=0,serverName='',fail=false,sends=0;const storage=store();
 const r=new Ranking(config,storage,async()=>({best:async()=>serverBest,top:async()=>[],save:async(name,distance)=>{sends++;if(fail)throw Error('offline');serverBest=Math.max(serverBest,distance);serverName=name;return{distance:serverBest,changed:true};}}),()=>now);
 r.setName('友達');r.record(500,40);await r.send();assert.equal(serverBest,500);assert.equal(r.pending,null);
 r.record(250,20);await assert.rejects(r.send(),/60秒/);now+=60000;await r.send();assert.equal(serverBest,500);
 r.setName('新しい名前');r.record(600,40);now+=60000;fail=true;await assert.rejects(r.send(),/offline/);assert.equal(r.pending,600);assert.equal(r.best,600);await assert.rejects(r.send(),/60秒/);
 now+=60000;fail=false;await r.send();assert.equal(serverName,'新しい名前');assert.equal(serverBest,600);assert.equal(sends,4);
 assert.equal(r.record(10000001,1000000),false);assert.equal(r.record(500,1),false);assert.equal(r.record(NaN,20),false);
});
test('reading cloud best reconciles another tab and season isolates local distances',async()=>{
 const storage=store(),r=new Ranking(config,storage,async()=>({best:async()=>1500,top:async()=>[{nickname:'友達',distance:1500}]}));r.record(100,10);const rows=await r.top();assert.equal(r.best,1500);assert.equal(rows[0].distance,1500);
 const next=new Ranking({...config,season:'season-2'},storage);assert.equal(next.best,0);
});
