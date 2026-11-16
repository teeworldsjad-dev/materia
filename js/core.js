/* js/core.js — симуляция материи, процедурный звук, вибро */
(function(){
"use strict";
const M = window.MAT = {};

const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=t=>t*t*(3-2*t);
const rand=(a=1,b)=>b===undefined?Math.random()*a:a+Math.random()*(b-a);
const hex2rgb=h=>{const n=parseInt(String(h).slice(1),16);return[(n>>16&255)/255,(n>>8&255)/255,(n&255)/255];};
const mixRGB=(a,b,t)=>[lerp(a[0],b[0],t),lerp(a[1],b[1],t),lerp(a[2],b[2],t)];
const rgbCss=c=>`rgb(${(c[0]*255)|0},${(c[1]*255)|0},${(c[2]*255)|0})`;
const norm=v=>{const l=Math.hypot(v[0],v[1],v[2])||1;return[v[0]/l,v[1]/l,v[2]/l];};
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function mulberry(seed){let a=seed>>>0;return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
Object.assign(M,{clamp,lerp,smooth,rand,hex2rgb,mixRGB,rgbCss,norm,dot,sub,cross,mulberry});

M.THEMES={
  ocean:{name:'океан',liqDeep:'#0a3f4d',liqBright:'#35e0d0',solDeep:'#232a3a',solBright:'#bfe3ff',rim:'#46c8ff',ember:'#ffc76a',glow:'#35e0d0',vein:.25,dot:'linear-gradient(135deg,#35e0d0,#46c8ff)'},
  lava:{name:'лава',liqDeep:'#4d150a',liqBright:'#ff9f45',solDeep:'#1c1216',solBright:'#7a6a72',rim:'#ff6a3d',ember:'#ffb454',glow:'#ff6a3d',vein:1.0,dot:'linear-gradient(135deg,#ff9f45,#ff6a3d)'},
  neon:{name:'неон',liqDeep:'#2a0a3f',liqBright:'#ff4fa0',solDeep:'#141a3a',solBright:'#8f7bff',rim:'#ff4fa0',ember:'#8f7bff',glow:'#ff4fa0',vein:.5,dot:'linear-gradient(135deg,#ff4fa0,#8f7bff)'},
  acid:{name:'кислота',liqDeep:'#0f3a14',liqBright:'#8df05a',solDeep:'#16241c',solBright:'#9fd8b8',rim:'#59e0a0',ember:'#d9ff6a',glow:'#8df05a',vein:.35,dot:'linear-gradient(135deg,#8df05a,#59e0a0)'}
};
M.GOLD='#ffc76a';
const IC={
  water:'<svg viewBox="0 0 24 24"><path d="M12 3c3.5 4.5 6 7.8 6 11a6 6 0 1 1-12 0c0-3.2 2.5-6.5 6-11z" fill="currentColor"/></svg>',
  slime:'<svg viewBox="0 0 24 24"><path d="M12 4c5 0 8 3.4 8 7.4 0 4.6-3 8.6-8 8.6s-8-4-8-8.6C4 7.4 7 4 12 4z" fill="currentColor"/><circle cx="9" cy="10" r="2" fill="#05070f" opacity=".35"/></svg>',
  ice:'<svg viewBox="0 0 24 24"><path d="M12 2v20M4 6l16 12M20 6L4 18M12 2l-2 3h4zM12 22l-2-3h4z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/></svg>',
  stone:'<svg viewBox="0 0 24 24"><path d="M7 5h8l5 6-3 8H8l-5-7z" fill="currentColor"/><path d="M9 8l4 3-2 5" stroke="#05070f" stroke-width="1.4" opacity=".4" fill="none"/></svg>'
};
M.ZONES=[
  {name:'вода',icon:IC.water},
  {name:'слайм',icon:IC.slime},
  {name:'лёд',icon:IC.ice},
  {name:'камень',icon:IC.stone}
];
M.zoneOf=h=>h<.28?0:h<.55?1:h<.80?2:3;

class Sim{
  constructor(){
    this.settings={hardness:.32,size:1,elasticity:.65,glow:1,particles:1,theme:'ocean',accent:'#46c8ff',quality:'bal',haptics:true,autorotate:true,sound:true};
    this.dents=[];for(let i=0;i<14;i++)this.dents.push({dir:[0,1,0],a:0,v:0,target:0,radius:.8});
    this.osc=[{a:0,v:0},{a:0,v:0},{a:0,v:0}];
    this.squash={a:1,v:0};
    this.intro={a:0,v:0,target:1};
    this.grab=null;this.stress=0;this.stressDir=[0,0,1];
    this.cracks=[];this.goldPulse=0;this.energy=0;
    this.time=0;this.idleT=10;this.breath=1;this.phase='live';this.reformT=0;
    this.counters={squeezes:0,cracks:0,heals:0,bursts:0};
    this.reduced=false;this._listeners={};this._wakeT=0;this._wakeI=1;
    this.mp=this.matParams();
  }
  on(ev,fn){(this._listeners[ev]=this._listeners[ev]||[]).push(fn);}
  emit(ev,d){const l=this._listeners[ev];if(l)for(const f of l)f(d);}
  matParams(){
    const h=this.settings.hardness,e=this.settings.elasticity,t=smooth(h);
    const k=lerp(48,430,Math.pow(h,1.15));
    const zeta=lerp(.34,.92,h)*lerp(1.3,.5,e);
    const wf=lerp(6.5,26,h);
    const oz=lerp(.16,.5,h)*lerp(.75,1.5,1-e);
    return{
      maxDent:lerp(.55,.055,t),dentR:lerp(1.0,.34,h),
      k,c:2*Math.sqrt(k)*zeta,
      wf,ok:wf*wf,oc:2*wf*oz,
      noiseAmp:lerp(.05,.012,h),noiseFreq:lerp(2.4,7.5,h),noiseSpeed:lerp(.85,.04,h),
      sag:Math.max(0,.42-h)*.85,
      stretch:clamp((.55-h)/.55,0,1),
      crackable:h>.55,crackTime:lerp(1.7,.85,clamp((h-.55)/.45,0,1))
    };
  }
  setHardness(v){
    const old=M.zoneOf(this.settings.hardness);
    this.settings.hardness=clamp(v,0,1);
    const z=M.zoneOf(this.settings.hardness);
    if(z!==old)this.emit('zone',{zone:z});
  }
  excite(amt){for(let i=0;i<3;i++)this.osc[i].v+=amt*rand(.5,1.4)*(Math.random()<.5?-1:1);}
  pointerDown(pick,pressure){
    if(this.phase!=='live'||!pick.hit)return false;
    const mp=this.mp,d=this.dents[0];
    d.dir=pick.dir.slice();d.radius=mp.dentR;d.target=0;
    this.grab={dir:pick.dir.slice(),targetDir:pick.dir.slice(),mode:'dent',hold:0,speed:0,maxDepth:0,
      pressure:clamp(.7+(pressure||.5)*.8,.6,1.4),stretchPow:0};
    this.idleT=0;this.stressDir=pick.dir.slice();
    this.emit('grab',{dir:pick.dir});
    return true;
  }
  pointerMove(pick){
    const g=this.grab;if(!g)return;
    this.idleT=0;
    if(pick.hit){g.mode='dent';g.targetDir=pick.dir.slice();g.stretchPow=0;}
    else if(this.mp.stretch>0){g.mode='stretch';g.targetDir=pick.closestDir.slice();
      g.stretchPow=clamp((pick.dist-pick.R)/(pick.R*.9),0,1);}
    else{g.mode='dent';g.stretchPow=0;}
  }
  pointerUp(){
    const g=this.grab;if(!g)return;
    const d=this.dents[0],h=this.settings.hardness,depth=d.a;
    d.target=0;d.v+=(-depth)*lerp(8,2,h);
    this.excite(Math.abs(depth)*lerp(1.6,.25,h));
    this.squash.v-=Math.abs(depth)*lerp(3.5,.8,h);
    this.energy=clamp(this.energy+Math.abs(depth)*1.2,0,1.5);
    if(Math.max(g.maxDepth,g.stretchPow*.8)>.12){this.counters.squeezes++;this.emit('count');}
    this.emit('release',{depth,stretch:g.mode==='stretch'?g.stretchPow:0,dir:g.dir.slice()});
    this.grab=null;
  }
  tap(dir,strong){
    if(this.phase!=='live')return;
    const h=this.settings.hardness,mp=this.mp;
    this.idleT=0;this.stressDir=dir.slice();
    this._wakeI=(this._wakeI%13)+1;
    const d=this.dents[this._wakeI];
    d.dir=dir.slice();d.radius=mp.dentR*.85;d.a=-mp.maxDent*(strong?.8:.45);d.v=0;d.target=0;
    this.excite(strong?.35:.15);this.squash.v-=strong?.9:.4;
    if(mp.crackable){this.stress=clamp(this.stress+(strong?.4:.22)+h*.12,0,1.2);
      if(this.stress>=1)this.crack(dir);}
    this.emit('tap',{dir,strong});
  }
  crack(dir){
    if(this.cracks.length>=7){this.burst();return;}
    const c={dir:dir.slice(),seed:(Math.random()*1e9)|0,healed:false,paths:null,angles:null};
    this.cracks.push(c);
    this.stress=.32;this.goldPulse=Math.max(this.goldPulse,.15);
    if(this.grab)this.grab.hold=0;
    this.dents[0].v+=2.2;this.excite(.3);this.squash.v-=1.2;
    this.counters.cracks++;this.emit('count');
    this.emit('crack',{crack:c});
  }
  burst(){
    this.phase='burst';this.reformT=.95;
    this.intro.target=0;this.intro.v=-9;
    this.cracks.length=0;this.stress=0;this.grab=null;
    for(const d of this.dents){d.a=0;d.v=0;d.target=0;}
    this.counters.bursts++;this.emit('count');
    this.emit('burst',{});
  }
  heal(){
    if(!this.cracks.length){this.emit('healEmpty');return;}
    let did=false;
    for(const c of this.cracks)if(!c.healed){c.healed=true;did=true;}
    if(!did){this.emit('healEmpty');return;}
    this.goldPulse=1;this.counters.heals++;this.emit('count');
    this.emit('heal',{});
  }
  reset(){
    this.cracks.length=0;this.stress=0;this.grab=null;this.phase='live';
    for(const d of this.dents){d.a=0;d.v=0;d.target=0;}
    this.intro.target=1;this.intro.a=Math.min(this.intro.a,.55);this.intro.v=5;
    this.emit('reset',{});
  }
  update(dt){
    dt=Math.min(dt,1/30);
    const steps=dt>1/45?2:1,h=dt/steps;
    for(let s=0;s<steps;s++)this._step(h);
  }
  _step(dt){
    this.time+=dt;this.idleT+=dt;
    this.mp=this.matParams();
    const mp=this.mp,g=this.grab,hd=this.settings.hardness;
    if(this.phase==='burst'){
      this.reformT-=dt;
      this.intro.v+=(160*(0-this.intro.a)-22*this.intro.v)*dt;
      this.intro.a+=this.intro.v*dt;
      if(this.reformT<=0){this.phase='live';this.intro.target=1;this.intro.a=Math.max(this.intro.a,.02);this.intro.v=6;
        this.emit('reform',{});}
    }else{
      const ik=70,ic=2*Math.sqrt(70)*(this.reduced?1:.42);
      this.intro.v+=(ik*(this.intro.target-this.intro.a)-ic*this.intro.v)*dt;
      this.intro.a+=this.intro.v*dt;
    }
    if(g){
      g.hold+=dt;
      const follow=1-Math.exp(-dt*lerp(10,26,hd));
      const old=g.dir.slice();
      g.dir=norm([lerp(g.dir[0],g.targetDir[0],follow),lerp(g.dir[1],g.targetDir[1],follow),lerp(g.dir[2],g.targetDir[2],follow)]);
      const ang=Math.acos(clamp(dot(old,g.dir),-1,1));
      g.speed=lerp(g.speed,ang/Math.max(dt,1e-4),.35);
      this.stressDir=g.dir.slice();
      const d=this.dents[0],ramp=Math.min(1,g.hold/.85);
      if(g.mode==='dent'){
        d.dir=g.dir.slice();d.radius=mp.dentR;
        d.target=-mp.maxDent*(.35+.65*ramp)*g.pressure;
      }else{
        d.dir=g.dir.slice();d.radius=.55;
        d.target=mp.stretch*g.stretchPow*.9;
      }
      g.maxDepth=Math.max(g.maxDepth,Math.abs(d.a));
      this._wakeT-=dt;
      if(g.mode==='dent'&&hd<.6&&g.speed>1.2&&this._wakeT<=0){
        this._wakeT=.045;
        this._wakeI=(this._wakeI%13)+1;
        const w=this.dents[this._wakeI];
        w.dir=old;w.radius=mp.dentR*.8;w.a=-mp.maxDent*.3;w.v=0;w.target=0;
      }
      if(mp.crackable&&g.mode==='dent'){
        this.stress=clamp(this.stress+dt/mp.crackTime*(.35+.65*ramp),0,1.2);
        if(this.stress>=1)this.crack(g.dir);
      }
    }else{
      this.stress=Math.max(0,this.stress-dt*.45);
    }
    for(let i=0;i<14;i++){
      const d=this.dents[i];
      if(i>0)d.target=0;
      d.v+=(mp.k*(d.target-d.a)-mp.c*d.v)*dt;
      d.a+=d.v*dt;
      if(i>0&&Math.abs(d.a)<1e-4&&Math.abs(d.v)<1e-4){d.a=0;d.v=0;}
    }
    for(const o of this.osc){o.v+=(-mp.ok*o.a-mp.oc*o.v)*dt;o.a+=o.v*dt;}
    const sk=110,sc=2*Math.sqrt(110)*.5;
    this.squash.v+=(sk*(1-this.squash.a)-sc*this.squash.v)*dt;
    this.squash.a=clamp(this.squash.a+this.squash.v*dt,.5,1.6);
    this.energy*=Math.exp(-dt*1.8);
    this.goldPulse*=Math.exp(-dt*1.4);
    const idleF=clamp((this.idleT-2)/4,0,1);
    this.breath=1+(this.reduced?0:.015*Math.sin(this.time*1.35)*(.35+.65*idleF)*(1-hd*.55));
  }
  renderScale(){return this.settings.size*Math.max(this.intro.a,0)*this.breath;}
  squashVec(){const sy=this.squash.a,sx=1/Math.sqrt(sy),r=this.renderScale();return[sx*r,sy*r,sx*r];}
}
M.Sim=Sim;

class AudioEngine{
  constructor(){this.ctx=null;this.muted=false;this.voices=0;this._squish=null;}
  unlock(){
    if(!this.ctx){
      const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
      try{this.ctx=new AC();}catch(e){return;}
      this.master=this.ctx.createGain();this.master.gain.value=.9;
      this.comp=this.ctx.createDynamicsCompressor();
      this.comp.threshold.value=-18;this.comp.ratio.value=6;
      this.muteGain=this.ctx.createGain();this.muteGain.gain.value=this.muted?0:1;
      this.master.connect(this.comp);this.comp.connect(this.muteGain);this.muteGain.connect(this.ctx.destination);
      const len=this.ctx.sampleRate*2,buf=this.ctx.createBuffer(1,len,this.ctx.sampleRate),d=buf.getChannelData(0);
      for(let i=0;i<len;i++)d[i]=Math.random()*2-1;
      this.noiseBuf=buf;
      const src=this.ctx.createBufferSource();src.buffer=buf;src.loop=true;
      const bp=this.ctx.createBiquadFilter();bp.type='bandpass';bp.frequency.value=500;bp.Q.value=1.2;
      const g=this.ctx.createGain();g.gain.value=0;
      src.connect(bp);bp.connect(g);g.connect(this.master);src.start();
      this._squish={g,bp};
    }
    if(this.ctx.state==='suspended')this.ctx.resume();
  }
  setMuted(m){this.muted=m;if(this.muteGain)this.muteGain.gain.setTargetAtTime(m?0:1,this.ctx.currentTime,.03);}
  suspend(){if(this.ctx&&this.ctx.state==='running')this.ctx.suspend();}
  resume(){if(this.ctx&&this.ctx.state==='suspended')this.ctx.resume();}
  setSquish(i,h){
    if(!this._squish||this.muted)return;
    const t=this.ctx.currentTime;
    this._squish.g.gain.setTargetAtTime(Math.min(.3,i*.3*(1-h*.45)),t,.05);
    this._squish.bp.frequency.setTargetAtTime(280+(1-h)*650+i*500,t,.08);
  }
  _env(vol,dur,attack=.004){
    const g=this.ctx.createGain(),t=this.ctx.currentTime;
    g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(vol,t+attack);
    g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    g.connect(this.master);this.voices++;
    setTimeout(()=>{try{g.disconnect();}catch(e){}this.voices--;},dur*1000+90);
    return g;
  }
  _osc(type,f0,f1,vol,dur){
    if(!this.ctx||this.muted||this.voices>24)return;
    const o=this.ctx.createOscillator(),t=this.ctx.currentTime;
    o.type=type;o.frequency.setValueAtTime(f0,t);
    if(f1!==f0)o.frequency.exponentialRampToValueAtTime(Math.max(f1,1),t+dur*.9);
    o.connect(this._env(vol,dur));o.start(t);o.stop(t+dur+.03);
  }
  _noise(vol,dur,type,freq,q=1){
    if(!this.ctx||this.muted||this.voices>24)return;
    const s=this.ctx.createBufferSource();s.buffer=this.noiseBuf;s.loop=true;
    s.playbackRate.value=rand(.85,1.15);
    const f=this.ctx.createBiquadFilter();f.type=type;f.frequency.value=freq;f.Q.value=q;
    s.connect(f);f.connect(this._env(vol,dur));
    s.start(this.ctx.currentTime,rand(0,1.5));s.stop(this.ctx.currentTime+dur+.03);
  }
  blip(f=520,vol=.12){this._osc('sine',f,f*.35,vol,.12);}
  boing(h,pow){this._osc('sine',150*(1+h*.8),65,Math.min(.3,.1+pow*.25),.35);
    if(h<.4)this._noise(.06,.1,'bandpass',900,2);}
  blop(){this._osc('sine',rand(420,880),180,.09,.1);}
  creak(s){this._noise(.05+s*.09,.09,'highpass',1800,7);this._osc('sawtooth',52,48,.04+s*.05,.1);}
  crack(h){
    this._noise(.4,.18,'highpass',900,1);
    if(h<.8){[2400,3300,4100].forEach((f,i)=>this._osc('sine',f*rand(.96,1.04),f*.7,.12,.22+i*.04));}
    else{this._osc('sine',95,50,.3,.22);this._noise(.2,.16,'lowpass',420,1);}
    this._osc('sine',60,38,.25,.16);
  }
  burst(){this.crack(.9);this._noise(.3,.6,'lowpass',800,1);this._osc('sawtooth',220,40,.16,.5);}
  heal(){
    [523,659,784,988,1175].forEach((f,i)=>setTimeout(()=>{
      this._osc('sine',f,f,.16,.6);this._osc('triangle',f*2,f*2,.05,.4);},i*90));
    this._noise(.05,.4,'highpass',6000,1);
  }
  reform(){this._noise(.14,.55,'bandpass',600,1.5);[262,330,392].forEach(f=>this._osc('sine',f,f,.1,.8));}
  tick(){this._osc('square',900,900,.06,.03);}
  dice(){this.tick();setTimeout(()=>this.blop(),70);}
  shutter(){this.tick();this._noise(.12,.06,'highpass',2500,1);}
}
M.AudioEngine=AudioEngine;

class Haptics{
  constructor(){this.enabled=true;this._last=0;}
  _tg(){try{return window.Telegram&&window.Telegram.WebApp&&window.Telegram.WebApp.HapticFeedback;}catch(e){return null;}}
  impact(kind){
    if(!this.enabled)return;
    const tg=this._tg();
    if(tg){try{tg.impactOccurred(kind);return;}catch(e){}}
    if(navigator.vibrate)try{navigator.vibrate(kind==='light'?8:kind==='medium'?18:35);}catch(e){}
  }
  notify(kind){
    if(!this.enabled)return;
    const tg=this._tg();
    if(tg){try{tg.notificationOccurred(kind);return;}catch(e){}}
    if(navigator.vibrate)try{navigator.vibrate(kind==='success'?[10,40,20]:kind==='warning'?[30,50,30]:[50,60,50]);}catch(e){}
  }
  dragTick(){const n=performance.now();if(n-this._last>95){this._last=n;this.impact('light');}}
}
M.Haptics=Haptics;
})();