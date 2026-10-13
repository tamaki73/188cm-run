/* Adaptive rendering only: never changes simulation, collision or audio tempo. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.Run188Quality=api;})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  const PRESETS=Object.freeze({
    low:Object.freeze({dpr:1,resolution:.8,detail:0,fixtures:7,shadows:false,blur:0}),
    medium:Object.freeze({dpr:1.5,resolution:1,detail:1,fixtures:9,shadows:true,blur:6}),
    high:Object.freeze({dpr:2,resolution:1,detail:2,fixtures:11,shadows:true,blur:12})
  });
  class Quality {
    constructor(storage,mobile=false){this.storage=storage;const saved=storage.get('quality','auto');this.mode=['auto','low','medium','high'].includes(saved)?saved:'auto';this.level=this.mode==='auto'?(mobile?'medium':'high'):this.mode;this.onChange=null;this.changes=0;this.reset();}
    get preset(){return PRESETS[this.level];}
    reset(){this.seconds=0;this.frames=0;this.frameSum=0;this.costSum=0;this.slow=0;this.fast=0;}
    set(mode){if(!['auto','low','medium','high'].includes(mode))return;this.mode=mode;this.storage.set('quality',mode);this.reset();if(mode!=='auto')this.level=mode;this.onChange?.();}
    sample(dt,cost,active=true){
      if(this.mode!=='auto'||!active||dt<=0||dt>.25)return;
      this.seconds+=dt;this.frames++;this.frameSum+=dt*1000;this.costSum+=cost;
      if(this.seconds<1)return;
      const ms=this.frameSum/this.frames,draw=this.costSum/this.frames;
      this.slow=ms>25||draw>11?this.slow+this.seconds:0;
      this.fast=ms<18.8&&draw<5.5?this.fast+this.seconds:0;
      this.seconds=this.frames=this.frameSum=this.costSum=0;
      const levels=['low','medium','high'],index=levels.indexOf(this.level);
      if(this.slow>=3&&index>0){this.level=levels[index-1];this.changed();}
      else if(this.fast>=15&&index<2){this.level=levels[index+1];this.changed();}
    }
    changed(){this.changes++;this.reset();this.onChange?.();}
  }
  return{Quality,PRESETS};
});
