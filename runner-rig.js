/* Visual rig in centimetre-projected pixels; physics remains in GameModel. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.Run188Rig=api;})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 const TAU=Math.PI*2,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 function knee(hip,ankle,side){
   const dx=ankle[0]-hip[0],dy=ankle[1]-hip[1],distance=Math.max(.001,Math.hypot(dx,dy));
   const thigh=62.1,shin=62.1,d=Math.min(distance,thigh+shin-.01),along=d/2,bend=Math.sqrt(Math.max(0,thigh*thigh-along*along));
   // Bend into depth. The third coordinate retains the full fixed-length 3D joint.
   return[hip[0]+dx/distance*along,hip[1]+dy/distance*along,bend];
 }
 class Rig {
   constructor(){this.crouch=0;this.straddle=0;this.landing=0;this.lastAir=false;this.airTime=0;this.lastElapsed=-1;this.feet=[{cycle:-1,anchor:0},{cycle:-1,anchor:0}];this.pose=null;}
   update(model,dt,ambient,project){
     const active=['playing','tutorial'].includes(model.mode),air=model.jumpY>0||model.jumpVelocity>0;
     const phase=active?model.gaitPhase:ambient*5,distance=active?model.distance:ambient*4;
     if(model.elapsed<this.lastElapsed){this.crouch=this.straddle=this.landing=0;this.lastAir=false;for(const foot of this.feet)foot.cycle=-1;}
     this.lastElapsed=model.elapsed;
     const ease=1-Math.exp(-Math.min(.1,dt)*28);
     this.crouch+=((model.crouching&&!air?1:0)-this.crouch)*ease;
     this.straddle+=((model.straddling&&!air?1:0)-this.straddle)*ease;
     if(this.lastAir&&!air)this.landing=1;
     this.airTime=air?(this.lastAir?this.airTime+dt:0):0;
     this.landing=Math.max(0,this.landing-dt*6);this.lastAir=air;
     // Head follows the safe collision height immediately; limb settling never delays input.
     const height=(model.crouching&&!air?122:190)*1.38;
     const crouch=this.crouch,spread=this.straddle;
     const bounce=air?0:Math.sin(phase*2)**2*2.4;
     const takeoff=air?Math.max(0,1-this.airTime/.09)*7:0;
     const hips=-124.2+takeoff+crouch*46+spread*20+this.landing*9+bounce;
     const shoulder=-207+crouch*88+this.landing*6+bounce;
     const twist=Math.sin(phase)*3*(1-crouch*.5)*(air?.25:1),legs=[];
     for(let i=0;i<2;i++){
       const side=i?1:-1,offset=i?0:Math.PI,p=(phase+offset)%TAU,u=p/TAU,cycle=Math.floor((phase+offset)/TAU),f=this.feet[i];
       // At every audible contact (phase kπ), fix a world-space footprint for the stance.
       const strideZ=active?Math.min(3.7,model.speed/(10+model.speed*.17)*1.7):1.15;
       if(cycle!==f.cycle||f.anchor<distance-10){f.cycle=cycle;f.anchor=distance+strideZ;}
       const contact=u<.38&&!air,z=contact?f.anchor-distance: -strideZ+2*strideZ*clamp((u-.38)/.62,0,1);
       const lift=air?(8+Math.sin(clamp((300-model.jumpVelocity)/600,0,1)*Math.PI)*17):contact?0:Math.sin((u-.38)/.62*Math.PI)*(19+Math.min(12,model.speed*.2))*(1-spread*.8);
       const ground=project(z*(1-spread*.8));
       let ankle=[side*(19+spread*50)*ground.s,clamp(ground.y-636,-40,18)-9-lift];
       const hip=[side*14+twist*.35,hips];
       // The visible ankle cannot stretch either fixed-length segment.
       const dx=ankle[0]-hip[0],dy=ankle[1]-hip[1],len=Math.hypot(dx,dy),max=124.1;
       if(len>max)ankle=[hip[0]+dx/len*max,hip[1]+dy/len*max];
       const joint=knee(hip,ankle,side),projected=[joint[0]+joint[2]*side*.10,joint[1]-joint[2]*.38];
       legs.push({hip,knee:projected,joint,ankle,contact,worldAnchor:f.anchor,side,toe:air?side*.16:contact?side*.07:side*(.12+lift*.009),depth:z});
     }
     this.pose={phase,air,height,hips,shoulder,twist,crouch,spread,landing:this.landing,legs};return this.pose;
   }
 }
 return{Rig,knee};
});
