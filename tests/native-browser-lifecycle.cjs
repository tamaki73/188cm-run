'use strict';
const {rm}=require('node:fs/promises');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const running=child=>child.exitCode===null&&child.signalCode===null;
async function settleWithin(promise,ms){
 let timer;
 try{return await Promise.race([Promise.resolve(promise).then(()=>true,()=>false),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),ms);})]);}
 finally{clearTimeout(timer);}
}
// Only use with a child launched detached:true: its process group belongs to this test.
async function stopNativeBrowser({child,socket,requestClose,profile,graceMs=3000}){
 const exited=running(child)?new Promise(resolve=>child.once('exit',resolve)):Promise.resolve();
 // Browser.close lets Chrome finish profile writes; closing CDP first cannot do that.
 if(requestClose)await settleWithin(Promise.resolve().then(requestClose),1000);
 await settleWithin(exited,graceMs);
 socket?.close();
 function signalOwnedGroup(signal){
  if(!child.pid)return false;
  try{if(process.platform==='win32')return running(child)&&child.kill(signal);process.kill(-child.pid,signal);return true;}
  catch(error){if(error.code!=='ESRCH')throw error;return false;}
 }
 // A launcher may already have exited while a renderer/utility still writes files.
 if(signalOwnedGroup('SIGTERM')){await wait(200);signalOwnedGroup('SIGKILL');}
 if(!await settleWithin(exited,1000))throw Error('Test Chromium did not exit');
 await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100});
}
module.exports={stopNativeBrowser};
