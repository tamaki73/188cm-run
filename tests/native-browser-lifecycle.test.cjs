'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {stopNativeBrowser}=require('./native-browser-lifecycle.cjs');
fs.mkdirSync('work',{recursive:true});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate){for(let n=0;n<100;n++){if(predicate())return;await wait(20);}throw Error('Fixture did not start');}
test('requests a graceful browser close before removing the profile',async()=>{
 const profile=fs.mkdtempSync('work/native-close-'),ready=path.resolve(profile,'ready');
 const child=spawn(process.execPath,['-e',"require('fs').writeFileSync(process.argv[1],'ready');setInterval(()=>{},1000);",ready],{detached:true,stdio:'ignore'});
 await until(()=>fs.existsSync(ready));let requested=false;
 await stopNativeBrowser({child,profile,requestClose:()=>{requested=true;child.kill('SIGTERM');}});
 assert.equal(requested,true);assert.equal(fs.existsSync(profile),false);assert.ok(child.exitCode!==null||child.signalCode!==null);
});
test('stops a profile writer even when its launcher has already exited', {skip:process.platform==='win32'},async()=>{
 const profile=path.resolve(fs.mkdtempSync('work/native-orphan-')),counter=path.join(profile,'Default','counter');
 const writer="const fs=require('fs'),path=require('path'),dir=process.argv[1];process.on('SIGTERM',()=>{});function write(){try{fs.mkdirSync(path.join(dir,'Default'),{recursive:true});fs.writeFileSync(path.join(dir,'Default','counter'),String(Date.now()));}catch{}}write();setInterval(write,10);";
 const launcher="require('child_process').spawn(process.execPath,['-e',process.argv[1],process.argv[2]],{stdio:'ignore'});process.exit(0);";
 const child=spawn(process.execPath,['-e',launcher,writer,profile],{detached:true,stdio:'ignore'});
 try{
  await until(()=>child.exitCode!==null&&fs.existsSync(counter));const before=fs.readFileSync(counter,'utf8');await wait(60);assert.notEqual(fs.readFileSync(counter,'utf8'),before,'orphan still writes after launcher exit');
  await stopNativeBrowser({child,profile});assert.equal(fs.existsSync(profile),false);await wait(120);assert.equal(fs.existsSync(profile),false,'no surviving process recreates the directory');
 }finally{try{process.kill(-child.pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')throw error;}await fs.promises.rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:50});}
});
