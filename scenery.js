/* Original Canvas scenery. Small, bounded atlases avoid building textures per frame. */
(function(root){
 'use strict';
 class Scenery {
  constructor(){this.cache=new Map();this.level='high';}
  clear(level=this.level){this.cache.clear();this.level=level;}
  fixture(context,area,index){
   const variant=((index%3)+3)%3,key=area+variant;
   if(!this.cache.has(key))this.cache.set(key,this.build(area,variant));
   const image=this.cache.get(key);context.drawImage(image,-150,-510,300,520);
  }
  build(area,v){
   const c=document.createElement('canvas'),ratio=this.level==='high'?1.5:1;c.width=300*ratio;c.height=520*ratio;
   const x=c.getContext('2d');x.scale(ratio,ratio);x.translate(150,510);
   const rect=(a,b,w,h,color)=>{x.fillStyle=color;x.fillRect(a,b,w,h);};
   const line=(a,b,c,d,color,width=1)=>{x.strokeStyle=color;x.lineWidth=width;x.beginPath();x.moveTo(a,b);x.lineTo(c,d);x.stroke();};
   const poly=(p,color)=>{x.fillStyle=color;x.beginPath();p.forEach(([a,b],i)=>i?x.lineTo(a,b):x.moveTo(a,b));x.closePath();x.fill();};
   const ellipse=(a,b,w,h,color)=>{x.fillStyle=color;x.beginPath();x.ellipse(a,b,w,h,0,0,Math.PI*2);x.fill();};
   const grad=(a,b,color,dark)=>{const g=x.createLinearGradient(a,0,b,0);g.addColorStop(0,color);g.addColorStop(.35,dark);g.addColorStop(1,color);return g;};
   const box=(a,b,w,h,front,side='#3f4649',top='#a6a59b',d=16)=>{poly([[a+w,b],[a+w+d,b-d],[a+w+d,b+h-d],[a+w,b+h]],side);poly([[a,b],[a+d,b-d],[a+w+d,b-d],[a+w,b]],top);rect(a,b,w,h,front);line(a,b,a+w,b,'#f8edcf66');};
   const glass=(a,b,w,h)=>{rect(a,b,w,h,'#263d4b');rect(a+3,b+3,w-6,h-6,grad(a,a+w,'#617e8c','#344f62'));poly([[a+4,b+4],[a+w*.63,b+4],[a+w*.25,b+h-4],[a+4,b+h-4]],'#c0d5d534');line(a,b+h,a+w,b+h,'#d1d5cb',3);line(a+w/2,b,a+w/2,b+h,'#aab3b2',2);};
   const wood=(a,b,w,h)=>{box(a,b,w,h,'#957458','#554b42','#b59a76',10);if(this.level!=='low')for(let i=8;i<h;i+=13)line(a+3,b+i,a+w-3,b+i+Math.sin(i)*2,'#dcc29a3b');};
   const tree=(a,b,r)=>{rect(a-6,b-96,12,100,grad(a-6,a+6,'#a58a63','#574d3f'));line(a,b-65,a-25,b-90,'#746448',6);for(let n=0;n<7;n++){const t=n*2.4;ellipse(a+Math.cos(t)*r*.46,b-125+Math.sin(t)*r*.46,r*.6,r*.64,['#344d40','#46664a','#5b7550'][n%3]);}ellipse(a+12,b-146,r*.37,r*.35,'#a0aa6738');};
   ellipse(6,2,130,9,'#1119233b');
   if(area==='street'){
    const height=310+v*54,wall=['#a19788','#b0a59a','#798b91'][v];
    box(-114,-height,170,height,wall,'#4a545b','#c8c2ae',40);
    for(let row=0;row<Math.floor(height/74)-1;row++)for(let col=0;col<2;col++){
     const a=-100+col*77,b=-height+24+row*73;glass(a,b,57,47);rect(a-3,b+47,63,5,'#d0c9b7');
     if(this.level==='high'){line(a-2,b+53,a+59,b+53,'#323e4650',3);rect(a+8,b+5,12,36,'#d5c8a122');}
    }
    box(-119,-69,184,12,['#683b41','#354b52','#726346'][v],'#39414a','#beafa0',7);
    glass(-99,-53,60,51);rect(-25,-53,64,53,'#34434b');glass(-20,-49,54,37);rect(22,-28,3,14,'#c8c9b7');
    x.font='11px sans-serif';x.fillStyle='#efe3ce';x.textAlign='center';x.fillText(['COFFEE','BOOKS','ATELIER'][v],-24,-77);
    if(this.level!=='low'){
     for(let row=0;row<12;row++)line(-110,-height+12+row*24,52,-height+12+row*24,'#ded4bf20');
     box(18,-height-19,30,19,'#879393','#424e54','#bfc3b5',9);line(40,-height-19,40,-height-49,'#737c7b',2);
    }
    rect(98,-275,6,275,grad(98,104,'#89969a','#35454f'));line(101,-273,74,-290,'#94a0a0',6);box(43,-294,33,6,'#d6cbb0','#4a5761','#c8c7b8',5);
    if(v!==1){box(79,-32,43,32,'#aaa497','#565e58','#c2bea8',8);tree(100,-29,27);}
    else{rect(95,-187,32,37,'#e7e1cf');rect(100,-182,22,27,'#3d5e78');rect(109,-177,4,16,'#d5e2dd');}
   } else if(area==='park'){
    tree(-51,0,74);tree(67,-38,58);wood(-81,-42,143,10);wood(-81,-74,143,23);for(const a of[-67,44]){rect(a,-33,6,33,'#3f4845');line(a,-67,a,-36,'#3f4845',5);}
    if(v===1){line(91,0,91,-148,'#6a8381',6);line(91,-148,133,-148,'#769894',7);line(133,-148,133,0,'#517470',6);line(103,-148,103,-43,'#8d9590',2);wood(99,-43,21,6);}
    for(let i=0;i<24;i++)line(-130+i*11,1,-127+i*11,-5-i%8,'#64815b',2);
   } else if(area==='school'){
    box(-126,-360,238,360,'#b8bcb6','#616f73','#d3d7c9',17);rect(-126,-90,238,87,'#8a9994');rect(-126,-8,238,8,'#53605d');
    glass(-109,-300,108,155);box(16,-286,76,286,'#8e795f','#555a56','#bcb59d',9);glass(24,-266,60,102);rect(77,-133,5,25,'#c0c6bb');
    if(v===1){rect(-103,-111,91,52,'#576c5d');for(let i=0;i<3;i++)rect(-95+i*26,-104,20,36,['#dad4b9','#b9ccc7','#c8b6a4'][i]);}
    rect(-117,-347,219,5,'#eeefd8');
   } else if(area==='station'||area==='bus'){
    box(-123,-354,237,354,'#aebbb8','#596971','#d0d4c7',17);glass(-112,-307,212,135);rect(-125,-146,241,14,area==='bus'?'#a69664':'#586e8a');
    box(-112,-86,206,69,area==='bus'?'#3d5e7a':'#635671','#253847','#667c90',12);
    for(let i=0;i<4;i++){rect(-108+i*50,-82,45,40,'#ffffff0b');line(-85+i*50,-79,-85+i*50,-20,'#112e442e',2);}
    box(-114,-37,211,14,'#718298','#31495b','#91a3aa',14);
    for(const a of[-117,109]){rect(a,-323,5,323,grad(a,a+5,'#d2d3c2','#7f9397'));ellipse(a+2,-324,6,4,'#dfe0cb');}
    rect(-112,-344,222,5,'#f0edd3');line(-106,-326,102,-326,'#8a9c9f',7);
    for(const a of[-67,30]){rect(a,-325,5,54,'#cfd2bb');x.strokeStyle='#e5e5d1';x.lineWidth=4;x.beginPath();x.ellipse(a+2,-261,10,12,0,0,Math.PI*2);x.stroke();}
    if(area==='station'){box(-113,-356,219,8,'#bbc5be','#667c84','#dfe4d7',17);for(let i=0;i<10;i++)line(-109+i*21,-363,-109+i*21,-347,'#a6b6b5',2);}
   } else if(area==='store'){
    box(-123,-323,231,323,'#c4cbc2','#697b7c','#e3e4d5',22);
    for(let row=0;row<5;row++){
     const b=-273+row*51;rect(-115,b,211,31,'#465e62');
     for(let col=0;col<9;col++){const a=-110+col*23;box(a,b+3,16,27,['#c49975','#769b8c','#cabd83','#b48488'][(row+col+v)%4],'#4d555346','#e3d6b177',3);rect(a+2,b+10,12,9,'#f2e7d277');}
     box(-119,b+32,223,7,'#d8dacc','#677c7e','#f2efda',12);rect(-110,b+34,20,3,'#bd685e');
    }
    rect(-126,-320,242,18,'#718d7c');rect(-117,-308,223,3,'#eee8c0');
    if(v===2){box(43,-69,78,69,'#7d9a93','#3f5c60','#bad0bb',15);box(60,-92,30,22,'#2d4c58','#24353f','#849998',6);rect(64,-89,22,14,'#93b5ac');}
   } else if(area==='home'){
    box(-124,-346,235,346,'#c6bda8','#807661','#ddd2b4',15);wood(-114,-331,224,11);wood(-113,-319,14,319);wood(93,-319,14,319);
    glass(-77,-278,146,153);rect(-86,-286,8,170,'#c0b49d');rect(70,-286,10,170,'#e1d4b6');
    if(v===1){wood(-96,-83,180,77);for(let i=0;i<3;i++){rect(-90,-76+i*24,164,21,'#8a7057');rect(-9,-68+i*24,18,3,'#d0b994');}}
    else{box(-91,-70,177,65,'#7d8376','#565b51','#a0a592',18);box(-89,-98,176,40,'#929789','#5b665d','#b7bba6',12);line(-3,-90,-3,-40,'#c4c5ab',1);}
    line(107,-209,107,-63,'#9d8b69',4);poly([[85,-235],[124,-235],[135,-204],[77,-204]],'#e3ceb0');ellipse(106,-204,29,5,'#fae0b575');
   }
   return c;
  }
 }
 root.Run188Scenery={Scenery};
})(window);
