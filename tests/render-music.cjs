'use strict';
// Runs inside Chromium: render the actual score and mixer in half-second chunks,
// so the production note cap and onended cleanup remain active during offline rendering.
module.exports=async function renderMusic({bars=34,preview=false}={}){
 const sr=24000,seconds=bars*16*Run188Music.STEP+.5,c=new OfflineAudioContext(1,Math.ceil(seconds*sr),sr);
 const s=new Run188Audio.Sound({get:(k,d)=>d,set:()=>{}});s.context=c;s.initGraph(c);
 const m=new Run188Music.Music(s,{get:(k,d)=>d,set:()=>{}});s.music=m;m.ensureGraph();m.fade.gain.setValueAtTime(1,0);
 m.wantedScene='play';m.wantedStage=4;let step=0,scheduled=0;const kinds={},stages=new Set();
 m.onNote=e=>{kinds[e.kind]=(kinds[e.kind]||0)+1;stages.add(e.stage);};
 function fill(until){while(step*Run188Music.STEP+.025<until&&step<bars*16){m.step=step;m.renderStep(step,.025+step*Run188Music.STEP);step++;scheduled++;}}
 fill(.5);let wait=c.suspend(.5),render=c.startRendering();
 for(let t=.5;t<seconds;t+=.5){await wait;fill(t+.5);const next=t+.5;if(next<seconds)wait=c.suspend(next);await c.resume();}
 const b=await render,a=b.getChannelData(0);let peak=0,sum=0,delta=0;const windows=[];
 for(let i=0;i<a.length;i++){peak=Math.max(peak,Math.abs(a[i]));sum+=a[i]*a[i];if(i)delta=Math.max(delta,Math.abs(a[i]-a[i-1]));}
 for(const point of[16,32,64,128,192,256,384,448,512]){if(point>=bars*16)continue;const at=Math.round((.025+point*Run188Music.STEP)*sr);let energy=0;for(let i=at-240;i<at+240;i++)energy+=a[i]*a[i];windows.push({step:point,rms:Math.sqrt(energy/480)});}
 const result={peak,rms:Math.sqrt(sum/a.length),maxDelta:delta,windows,kinds,stages:[...stages],scheduled,maxNotes:m.maxNotes,remaining:m.notes.size,seconds};
 if(preview){const data=new ArrayBuffer(44+a.length*2),view=new DataView(data),put=(i,t)=>{for(let n=0;n<t.length;n++)view.setUint8(i+n,t.charCodeAt(n));};put(0,'RIFF');view.setUint32(4,36+a.length*2,true);put(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,sr,true);view.setUint32(28,sr*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);put(36,'data');view.setUint32(40,a.length*2,true);for(let i=0;i<a.length;i++)view.setInt16(44+i*2,Math.max(-32768,Math.min(32767,a[i]*32767)),true);const bytes=new Uint8Array(data);let str='';for(let i=0;i<bytes.length;i+=16384)str+=String.fromCharCode(...bytes.subarray(i,i+16384));result.wav=btoa(str);}
 return result;
};
