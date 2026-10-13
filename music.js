/* “Burgundy Motion” — original 134 BPM instrumental score, synthesized locally.
   No sampled music, API, downloads or quotations from existing songs.
   32-bar form: introduction 8 / build 4 / drop 12 / break 4 / return 4. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.Run188Music=api;})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 const BPM=134,STEP=60/BPM/4,MAX_NOTES=48;
 const CHORDS=[[62,66,69,73],[59,62,66,69],[55,59,62,66],[57,61,64,69]];
 const BASS=[38,35,43,45];
 const MELODY=[[78,0,81,0,78,76,0,74,0,73,74,0,76,0,0,0],[78,0,74,0,73,0,71,0,0,74,78,0,76,0,0,0],[74,0,78,0,81,0,83,0,81,0,78,0,76,74,0,0],[73,0,76,0,81,0,78,76,0,73,0,71,73,0,0,0]];
 const hz=midi=>440*2**((midi-69)/12),clamp=v=>Math.max(0,Math.min(1,v));
 const levelAt=d=>d<100?0:d<300?1:d<500?2:d<800?3:4;
 class Music {
  constructor(sound,storage){
   this.sound=sound;this.storage=storage;this.enabled=storage.get('bgmEnabled','true')!=='false';
   const raw=storage.get('bgmVolume','0.35'),v=Number(raw);this.volume=raw.trim()!==''&&Number.isFinite(v)?clamp(v):.35;
   this.scene='title';this.wantedScene='title';this.stage=0;this.wantedStage=0;this.step=0;this.nextTime=0;
   this.timer=null;this.notes=new Set();this.running=false;this.active=false;this.ended=false;this.onNote=null;this.bars=0;this.maxNotes=0;this.context=null;this.finishTimer=null;this.lastMode='';this.error='';
  }
  ensureGraph(){
   const c=this.sound.context;if(!c||this.context===c)return;
   this.pause();this.context=c;this.bus=c.createGain();this.duckBus=c.createGain();this.fade=c.createGain();
   this.bus.gain.value=this.volume;this.duckBus.gain.value=1;this.fade.gain.value=0;
   this.bus.connect(this.duckBus);this.duckBus.connect(this.fade);this.fade.connect(this.sound.output||c.destination);
  }
  setEnabled(v){this.error='';this.enabled=Boolean(v);this.storage.set('bgmEnabled',this.enabled);if(!v)this.pause();}
  setVolume(v){this.volume=clamp(Number(v)||0);this.storage.set('bgmVolume',this.volume);if(this.bus)this.bus.gain.setTargetAtTime(this.volume,this.context.currentTime,.03);if(!this.volume)this.pause();}
  update(model,hidden=false){
   if(this.error)return;
   try {
   this.wantedScene=model.mode==='title'?'title':'play';this.wantedStage=levelAt(model.distance);
   this.active=!hidden&&!model.paused&&['title','playing','tutorial'].includes(model.mode);
   if(model.mode==='gameover') {if(!this.ended)this.finish();this.ended=true;this.lastMode=model.mode;return;}
   if(this.lastMode==='gameover'&&this.active){this.step=0;this.scene=this.wantedScene;this.stage=this.wantedStage;}
   this.lastMode=model.mode;this.ended=false;
   if(!this.active||!this.enabled||!this.volume||!this.sound.masterVolume){this.pause();return;}
   if(this.sound.context?.state!=='running'||this.sound.error){this.pause();return;}
   this.ensureGraph();
   if(!this.running)this.start();
   } catch {this.pause();this.error='BGMを開始できませんでした。音声を再開できます。';this.sound.onStateChange?.();}
  }
  start(){
   if(this.running||!this.context||this.context.state!=='running')return;
   clearTimeout(this.finishTimer);this.finishTimer=null;
   const now=this.context.currentTime;this.nextTime=now+.035;
   this.fade.gain.cancelScheduledValues(now);this.fade.gain.setValueAtTime(0,now);this.fade.gain.linearRampToValueAtTime(1,now+.22);
   this.running=true;this.schedule();this.timer=setInterval(()=>{try{this.schedule();}catch{this.pause();this.error='BGMが停止しました。音声を再開できます。';this.sound.onStateChange?.();}},40);
  }
  pause(){
   clearInterval(this.timer);this.timer=null;clearTimeout(this.finishTimer);this.finishTimer=null;
   this.running=false;for(const note of [...this.notes])note.stop();
   if(this.fade){const now=this.context.currentTime;this.fade.gain.cancelScheduledValues(now);this.fade.gain.setValueAtTime(0,now);}
  }
  finish(){
   if(!this.running)return;
   clearInterval(this.timer);this.timer=null;this.running=false;
   const now=this.context.currentTime;this.fade.gain.cancelScheduledValues(now);this.fade.gain.setValueAtTime(1,now);this.fade.gain.linearRampToValueAtTime(0,now+.38);
   this.finishTimer=setTimeout(()=>{this.finishTimer=null;for(const note of [...this.notes])note.stop();},440);
  }
  duck(){if(!this.duckBus)return;const now=this.context.currentTime;this.duckBus.gain.cancelScheduledValues(now);this.duckBus.gain.setValueAtTime(.52,now);this.duckBus.gain.linearRampToValueAtTime(1,now+.28);}
  schedule(){
   const c=this.context;if(!this.running||c.state!=='running'){this.pause();return;}
   // On timer throttling skip stale beats instead of releasing a burst of sound.
   if(this.nextTime<c.currentTime-.12){const skip=Math.ceil((c.currentTime-this.nextTime)/STEP);this.step+=skip;this.nextTime+=skip*STEP;}
   while(this.nextTime<c.currentTime+.12){this.renderStep(this.step,this.nextTime);this.step++;this.nextTime+=STEP;}
  }
  renderStep(index,time){
   const beat=index%16,bar=Math.floor(index/16)%32;
   if(beat===0){this.scene=this.wantedScene;this.stage=this.wantedStage;this.bars++;}
   const chordIndex=Math.floor(bar/2)%4,chord=CHORDS[chordIndex],title=this.scene==='title',stage=this.stage;
   const breakBar=bar>=24&&bar<28,build=bar>=8&&bar<12,drop=bar>=12&&bar<24;
   const energy=title?.48:breakBar?.58:drop?1:.8;
   if(beat%4===0&&(!title||beat%8===0)&&(!breakBar||beat===0))this.note('kick',0,time,.22,.31*energy);
   if((beat===4||beat===12)&&!title&&!breakBar)this.note('clap',0,time,.15,.13*energy);
   if(beat%2===1&&(!title||beat%4===3))this.note('hat',0,time,beat%4===3?.10:.045,(beat%4===3?.065:.041)*energy);
   if(build&&!title&&stage>=2&&beat>=8&&bar%2===1)this.note('clap',0,time,.06,.05+beat*.003);
   if(beat===0)for(const pitch of chord)this.note('pad',pitch,time,STEP*17.5,.024*energy);
   if([0,6,8,14].includes(beat)&&!title)this.note('bass',BASS[chordIndex],time,STEP*(stage>0?1.55:.85),.16*energy);
   if(stage>=1&&!title&&[3,11].includes(beat))this.note('bass',BASS[chordIndex]+12,time,STEP*.7,.09*energy);
   if((title&&beat%4===2)||(!title&&stage>=2&&beat%2===0)){
    const pitch=chord[(Math.floor(beat/2)+bar)%4]+12;
    this.note('arp',pitch,time,STEP*1.65,.046*energy);
   }
   if(!title&&stage>=2&&!breakBar){const pitch=MELODY[Math.floor(bar/2)%4][beat];if(pitch)this.note('lead',pitch,time,STEP*(beat%4===0?2.7:1.5),(.08+stage*.008)*energy);}
   if(!title&&stage>=3&&beat===14&&bar%4===3)this.note('sweep',0,time,STEP*2,.06);
   if(!title&&stage>=4&&drop&&beat%4===2)this.note('arp',chord[(beat+bar)%4]+24,time,STEP,.035);
  }
  note(kind,midi,at,duration,level){
   const c=this.context;if(!c||this.notes.size>=MAX_NOTES)return false;
   const sources=[],nodes=[],gain=c.createGain();nodes.push(gain);gain.connect(this.bus);
   const peak=level,attack=kind==='pad'?.10:.004;
   gain.gain.setValueAtTime(.0001,at);gain.gain.linearRampToValueAtTime(peak,at+attack);
   if(kind==='pad'){gain.gain.setValueAtTime(peak*.65,at+duration*.65);gain.gain.linearRampToValueAtTime(.0001,at+duration);}
   else gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
   const filter=c.createBiquadFilter();nodes.push(filter);filter.connect(gain);
   if(['hat','clap','sweep'].includes(kind)){
    const src=c.createBufferSource();src.buffer=this.sound.noise;src.loop=true;src.connect(filter);sources.push(src);
    filter.type=kind==='hat'?'highpass':'bandpass';filter.frequency.setValueAtTime(kind==='hat'?6500:kind==='clap'?1500:500,at);filter.Q.value=kind==='sweep'?.4:.65;
    if(kind==='sweep')filter.frequency.exponentialRampToValueAtTime(6500,at+duration);
   }else{
    filter.type='lowpass';filter.frequency.value={kick:1800,bass:560,pad:1400,arp:4200,lead:2900}[kind]||2500;
    for(let i=0;i<(kind==='pad'||kind==='lead'?2:1);i++){
     const osc=c.createOscillator();osc.type=kind==='kick'?'sine':kind==='arp'?'triangle':'sawtooth';
     osc.frequency.setValueAtTime(kind==='kick'?145:hz(midi),at);osc.detune.value=i?7:-3;
     if(kind==='kick')osc.frequency.exponentialRampToValueAtTime(43,at+.14);
     osc.connect(filter);sources.push(osc);
    }
   }
   const note={kind,at,stop:()=>{for(const s of sources){s.onended=null;try{s.stop();}catch{}s.disconnect();}for(const n of nodes)n.disconnect();this.notes.delete(note);}};
   this.notes.add(note);this.maxNotes=Math.max(this.maxNotes,this.notes.size);sources[0].onended=note.stop;
   for(const s of sources){s.start(at);s.stop(at+duration+.015);}
   this.onNote?.({kind,midi,at,duration,bar:Math.floor(this.step/16),scene:this.scene,stage:this.stage});return true;
  }
 }
 return{Music,BPM,STEP,MAX_NOTES,CHORDS,MELODY,levelAt};
});
