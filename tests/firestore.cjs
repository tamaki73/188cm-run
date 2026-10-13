'use strict';
/* Run against a local demo emulator, never a production Firebase project. */
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,getDocs,collection,query,orderBy,limit,serverTimestamp,Timestamp,deleteDoc}=require('firebase/firestore');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const env=await initializeTestEnvironment({projectId:'demo-188cm-run',firestore:{rules:fs.readFileSync('firestore.rules','utf8')}});
 try{
  const a=env.authenticatedContext('alice').firestore(),b=env.authenticatedContext('bob').firestore(),guest=env.unauthenticatedContext().firestore();
  const ref=(db,id,season='season-1')=>doc(db,'seasons',season,'players',id);
  const data=(name='友達',distance=500)=>({nickname:name,distance,updatedAt:serverTimestamp()});
  await assertFails(setDoc(ref(guest,'alice'),data()));await assertFails(setDoc(ref(a,'bob'),data()));
  await assertSucceeds(setDoc(ref(a,'alice'),data()));await assertSucceeds(setDoc(ref(b,'bob'),data('友達',1500)));
  await assertFails(setDoc(ref(b,'alice'),data('改ざん',9000)));
  await assertFails(setDoc(ref(a,'alice'),data('友達',600))); // too soon, server-enforced
  await env.withSecurityRulesDisabled(async context=>{await setDoc(ref(context.firestore(),'alice'),{nickname:'友達',distance:500,updatedAt:Timestamp.fromMillis(Date.now()-61000)});});
  await assertFails(setDoc(ref(a,'alice'),data('友達',499)));await assertSucceeds(setDoc(ref(a,'alice'),data('新しい名前',700)));
  await assertFails(deleteDoc(ref(a,'alice')));await assertFails(setDoc(ref(a,'alice','season-2'),data()));
  for(const invalid of [data('<script>',10),data('a@b.com',10),data('死ね',10),data('x'.repeat(17),10),data('友達',-1),data('友達',1.5),data('友達',10000001),{...data(),email:'private@example.com'},{...data(),updatedAt:Timestamp.fromMillis(0)}]){
    const uid='invalid-'+Math.random();await assertFails(setDoc(ref(env.authenticatedContext(uid).firestore(),uid),invalid));
  }
  const greek=env.authenticatedContext('greek').firestore();await assertSucceeds(setDoc(ref(greek,'greek'),data('Νίκος',100)));
  const q=db=>query(collection(db,'seasons','season-1','players'),orderBy('distance','desc'),limit(10));
  await assertFails(getDocs(q(guest)));await assertFails(getDoc(ref(guest,'alice')));
  await assertFails(getDocs(collection(a,'seasons','season-1','players')));
  await assertFails(getDocs(query(collection(a,'seasons','season-1','players'),limit(11))));
  const rows=await assertSucceeds(getDocs(q(a)));assert.deepEqual(rows.docs.slice(0,2).map(d=>d.data().distance),[1500,700]);
  assert.equal((await getDoc(ref(a,'alice'))).data().nickname,'新しい名前');
  console.log('PASS: real Firestore rules; shared ranking, owner-only writes, 60s throttle, non-decreasing best, input validation, top10 and season restrictions');
 }finally{await env.cleanup();}
})().catch(e=>{console.error(e);process.exitCode=1});
