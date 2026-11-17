/* js/render-2d.js — фолбэк без WebGL: материя, выщербины, куски, распад */
(function(){
"use strict";
const M=window.MAT;
const{clamp,lerp,rand,hex2rgb,mixRGB,mulberry,smooth}=M;
const ss=(a,b,x)=>{const t=clamp((x-a)/(b-a||1),0,1);return t*t*(3-2*t);};

class Renderer2D{
  constructor(canvas,sim){
    this.canvas=canvas;this.sim=sim;
    const ctx=canvas.getContext('2d');
    if(!ctx)throw new Error('Canvas 2D недоступен');
    this.ctx=ctx;
    this.modeName='Canvas 2D';
    this.w=2;this.h=2;this.dpr=1;this.spin=0;this.zoomF=1;
    this.shakeAmp=0;this.flashA=0;
    this.parts=[];this.motes=[];
    this.ptsN=96;this.noiseSeed=rand(0,100);
    this.shapes=[];
    for(let s=0;s<6;s++){
      const rng=mulberry(1000+s*77),pts=[];
      const n=7;
      for(let i=0;i<n;i++){
        const a=i/n*Math.PI*2;
        const r=.55+rng()*.55;
        pts.push([Math.cos(a)*r,Math.sin(a)*r*(.6+rng()*.5)]);
      }
      this.shapes.push(pts);
    }
  }
  setQuality(q){this.ptsN=q==='eco'?64:q==='ultra'?128:96;this.resize(this.w,this.h);}
  resize(w,h){
    this.w=Math.max(2,w);this.h=Math.max(2,h);
    const cap=this.sim.settings.quality==='eco'?1.25:2;
    this.dpr=Math.min(window.devicePixelRatio||1,cap);
    this.canvas.width=Math.round(this.w*this.dpr);
    this.canvas.height=Math.round(this.h*this.dpr);
  }
  _R(){return Math.min(this.w,this.h)*.3*this.zoomF;}
  pick(x,y){
    const cx=this.w/2,cy=this.h/2,R=this._R()*Math.max(this.sim.renderScale(),.001);
    const dx=x-cx,dy=-(y-cy),d=Math.hypot(dx,dy)||1;
    const dir=M.norm([dx/d,dy/d,.35]);
    return{hit:d<R*1.05,dir,closestDir:dir,dist:d/Math.max(R,.001),R:1};
  }
  orbit(dx){this.spin+=dx*.005;}
  zoom(f){this.zoomF=clamp(this.zoomF/f,.6,1.8);}
  viewDir(){return[0,0,1];}
  shake(a){this.shakeAmp=Math.min(this.shakeAmp+a,1.2);}
  flash(a){this.flashA=Math.min(this.flashA+a,1);}
  _px(dir){
    const cx=this.w/2,cy=this.h/2,R=this._R()*this.sim.renderScale();
    const a=Math.atan2(dir[1],dir[0])+this.spin;
    return[cx+Math.cos(a)*R,cy-Math.sin(a)*R];
  }
  _world(p){
    const cx=this.w/2,cy=this.h/2,R=this._R();
    const k=1/(1+p[2]*.12);
    return[cx+p[0]*R*k,cy-p[1]*R*k,R*k];
  }
  droplets(dir,power,col){
    const p=this._px(dir);
    const n=Math.round((10+power*20)*this.sim.settings.particles);
    for(let i=0;i<n;i++)this.parts.push({x:p[0],y:p[1],vx:rand(-90,90),vy:rand(-160,20),life:rand(.4,.9),max:.9,size:rand(2,4.5),col,g:260});
  }
  shards(dir,n,col){
    const p=this._px(dir);
    const cnt=Math.round(n*this.sim.settings.particles);
    for(let i=0;i<cnt;i++)this.parts.push({x:p[0],y:p[1],vx:rand(-180,180),vy:rand(-220,60),life:rand(.5,1.2),max:1.2,size:rand(2,5),col,g:420});
  }
  dustAt(pos,n,col){
    const p=this._world(pos);
    const cnt=Math.round(n*this.sim.settings.particles);
    for(let i=0;i<cnt;i++)this.parts.push({x:p[0],y:p[1],vx:rand(-60,60),vy:rand(-70,-10),life:rand(.3,.7),max:.7,size:rand(1.5,3.4),col,g:120});
  }
  goldSparks(n){
    const cx=this.w/2,cy=this.h/2,R=this._R()*Math.max(this.sim.renderScale(),.5),gold=hex2rgb(M.GOLD);
    const cnt=Math.round(n*this.sim.settings.particles);
    for(let i=0;i<cnt;i++){
      const a=rand(0,Math.PI*2);
      this.parts.push({x:cx+Math.cos(a)*R,y:cy+Math.sin(a)*R,vx:rand(-30,30),vy:rand(-90,-20),life:rand(.7,1.6),max:1.6,size:rand(1.5,3.5),col:gold,g:-30});
    }
  }
  paintCrack(c){
    const rng=mulberry(c.seed);
    c.angles=[];
    const n=5+((rng()*4)|0);
    for(let i=0;i<n;i++){
      const a=rng()*Math.PI*2,segs=[];
      let ang=a,r0=.1;
      for(let s=0;s<7;s++){ang+=(rng()-.5)*.9;r0+=.11*(0.6+rng()*.8);segs.push([ang,Math.min(r0,.95)]);}
      c.angles.push(segs);
    }
  }
  paintGold(){}
  clearCracks(){}
  _colsFor(h){
    const s=this.sim.settings,th=M.THEMES[s.theme]||M.THEMES.ocean;
    const t=smooth(clamp((h-.25)/.6,0,1));
    return{
      deep:mixRGB(hex2rgb(th.liqDeep),hex2rgb(th.solDeep),t),
      bright:mixRGB(hex2rgb(th.liqBright),hex2rgb(th.solBright),t)
    };
  }
  _colors(){
    const s=this.sim.settings,th=M.THEMES[s.theme]||M.THEMES.ocean;
    const c=this._colsFor(s.hardness);
    return{deep:c.deep,bright:c.bright,rim:hex2rgb(s.accent||th.rim),glow:hex2rgb(th.glow),ember:hex2rgb(th.ember)};
  }
  render(t,dt){
    const ctx=this.ctx,sim=this.sim,s=sim.settings;
    this.shakeAmp*=Math.exp(-dt*5);
    this.flashA*=Math.exp(-dt*6);
    if(s.autorotate&&!sim.reduced&&sim.idleT>3&&!sim.grab)this.spin+=dt*.06;
    ctx.setTransform(this.dpr,0,0,this.dpr,0,0);
    const sh=this.shakeAmp*8;
    ctx.translate((Math.random()-.5)*sh,(Math.random()-.5)*sh);
    const C=this._colors();
    const css=c=>'rgb('+((c[0]*255)|0)+','+((c[1]*255)|0)+','+((c[2]*255)|0)+')';
    const rgba=(c,a)=>'rgba('+((c[0]*255)|0)+','+((c[1]*255)|0)+','+((c[2]*255)|0)+','+a+')';
    const bg=ctx.createLinearGradient(0,0,0,this.h);
    bg.addColorStop(0,'#05070f');bg.addColorStop(1,'#0a1122');
    ctx.fillStyle=bg;ctx.fillRect(-24,-24,this.w+48,this.h+48);
    const cx=this.w/2,cy=this.h/2,R=this._R()*sim.renderScale(),Rw=this._R();
    const floorY=cy-M.FLOOR*Rw;
    if(s.glow>0){
      const g=ctx.createRadialGradient(cx,cy,Rw*.2,cx,cy,Rw*2.4);
      g.addColorStop(0,rgba(C.glow,.18*s.glow));g.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=g;ctx.fillRect(-24,-24,this.w+48,this.h+48);
    }
    /* пол */
    const pool=ctx.createRadialGradient(cx,floorY,0,cx,floorY,Rw*2.6);
    pool.addColorStop(0,rgba(C.glow,.14));pool.addColorStop(1,'rgba(0,0,0,0)');
    ctx.save();ctx.translate(cx,floorY);ctx.scale(1,.24);ctx.translate(-cx,-floorY);
    ctx.fillStyle=pool;ctx.beginPath();ctx.arc(cx,floorY,Rw*2.6,0,Math.PI*2);ctx.fill();ctx.restore();
    const moteN=Math.round(50*s.particles);
    while(this.motes.length<moteN)this.motes.push({x:rand(0,this.w),y:rand(0,this.h),s:rand(.6,2),seed:rand(0,10)});
    if(this.motes.length>moteN)this.motes.length=moteN;
    ctx.fillStyle=rgba(C.bright,.25);
    for(const m of this.motes){
      m.x+=Math.sin(t*.3+m.seed)*.15;m.y+=Math.cos(t*.25+m.seed)*.12;
      ctx.beginPath();ctx.arc(m.x,m.y,m.s,0,Math.PI*2);ctx.fill();
    }
    if(R>2){
      ctx.fillStyle='rgba(0,0,0,.4)';
      ctx.beginPath();ctx.ellipse(cx,floorY,R*1.2,R*.28,0,0,Math.PI*2);ctx.fill();
    }
    /* тени кусков */
    for(const c of sim.chunks){
      const fade=c.mode==='return'?1:clamp(c.life/.5,0,1);
      const cs=c.size*fade;
      if(cs<.006)continue;
      const hgt=clamp((c.p[1]-M.FLOOR)/2.4,0,1);
      const op=(1-hgt)*.35*fade;
      if(op<=.01)continue;
      const px=cx+c.p[0]*Rw;
      ctx.fillStyle='rgba(0,0,0,'+op+')';
      ctx.beginPath();ctx.ellipse(px,floorY,cs*Rw*1.6,cs*Rw*.5,0,0,Math.PI*2);ctx.fill();
    }
    /* материя */
    if(R>2){
      const N=this.ptsN,pts=[];
      const sv=sim.squashVec(),sc=sim.renderScale()||1;
      for(let i=0;i<N;i++){
        const a=i/N*Math.PI*2;
        const d=M.norm([Math.cos(a),Math.sin(a),.35]);
        let r=1;
        for(const dn of sim.dents){
          if(Math.abs(dn.a)<5e-4)continue;
          const ad=Math.acos(clamp(M.dot(d,dn.dir),-1,1));
          const rad=Math.max(dn.radius,.05);
          if(dn.a<0){
            const w=Math.exp(-ad*ad/(rad*rad)),w2=Math.exp(-ad*ad/(rad*rad*3.2));
            r+=dn.a*(w-.32*w2);
          }else{
            const sr=rad*.55;
            r+=dn.a*Math.exp(-ad*ad/(sr*sr));
          }
        }
        for(const bt of sim.bites){
          const ad=Math.acos(clamp(M.dot(d,bt.dir),-1,1));
          const br=Math.max(bt.r,.06);
          r-=bt.depth*(1-ss(br*.5,br,ad));
          r+=bt.depth*.4*ss(br*.55,br*.95,ad)*(1-ss(br*.95,br*1.4,ad));
        }
        r+=sim.osc[0].a*.12*Math.sin(d.x*3.3+t*sim.mp.wf);
        r+=sim.osc[1].a*.12*Math.sin(d.y*3.7+t*sim.mp.wf*1.31+1.7);
        r+=(Math.sin(a*5+t*sim.mp.noiseSpeed*3+this.noiseSeed)*.5+Math.sin(a*9-t*sim.mp.noiseSpeed*2)*.3)*sim.mp.noiseAmp;
        const down=.5-.5*d[1];
        const px=cx+Math.cos(a+this.spin)*r*R*(sv[0]/sc)*(1+sim.mp.sag*down*.35);
        const py=cy-Math.sin(a+this.spin)*r*R*(sv[1]/sc)+sim.mp.sag*down*down*R*.6;
        pts.push([px,py]);
      }
      ctx.beginPath();
      for(let i=0;i<N;i++){
        const p0=pts[i],p1=pts[(i+1)%N],mx=(p0[0]+p1[0])/2,my=(p0[1]+p1[1])/2;
        if(i)ctx.quadraticCurveTo(p0[0],p0[1],mx,my);else ctx.moveTo(mx,my);
      }
      ctx.closePath();
      const fg=ctx.createRadialGradient(cx-R*.35,cy-R*.4,R*.1,cx,cy,R*1.15);
      fg.addColorStop(0,css(C.bright));
      fg.addColorStop(.55,css(mixRGB(C.bright,C.deep,.55)));
      fg.addColorStop(1,css(C.deep));
      ctx.fillStyle=fg;ctx.fill();
      ctx.strokeStyle=rgba(C.rim,.5);ctx.lineWidth=1.5;ctx.stroke();
      ctx.save();ctx.clip();
      ctx.fillStyle='rgba(255,255,255,.16)';
      ctx.beginPath();ctx.ellipse(cx-R*.35,cy-R*.45,R*.4,R*.22,-.6,0,Math.PI*2);ctx.fill();
      for(const bt of sim.bites){
        const bp=this._px(bt.dir);
        const bg2=ctx.createRadialGradient(bp[0],bp[1],0,bp[0],bp[1],R*bt.r*1.5);
        bg2.addColorStop(0,rgba(C.deep,.85));bg2.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle=bg2;ctx.beginPath();ctx.arc(bp[0],bp[1],R*bt.r*1.5,0,Math.PI*2);ctx.fill();
      }
      if(sim.grab){
        const gp=this._px(sim.grab.dir);
        const pg=ctx.createRadialGradient(gp[0],gp[1],0,gp[0],gp[1],R*.6);
        pg.addColorStop(0,rgba(C.bright,.55));pg.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle=pg;ctx.fillRect(cx-R*1.2,cy-R*1.2,R*2.4,R*2.4);
      }
      for(const c of sim.cracks){
        if(!c.angles)this.paintCrack(c);
        const base=Math.atan2(c.dir[1],c.dir[0])+this.spin;
        const ox=cx+Math.cos(base)*R*.15,oy=cy-Math.sin(base)*R*.15;
        for(const segs of c.angles){
          ctx.beginPath();ctx.moveTo(ox,oy);
          for(const sg of segs)ctx.lineTo(ox+Math.cos(sg[0]+this.spin)*sg[1]*R*.8,oy-Math.sin(sg[0]+this.spin)*sg[1]*R*.8);
          if(c.healed){ctx.strokeStyle=M.GOLD;ctx.lineWidth=3.2;ctx.shadowColor=M.GOLD;ctx.shadowBlur=8;}
          else{ctx.strokeStyle='rgba(5,7,15,.85)';ctx.lineWidth=2.4;ctx.shadowBlur=0;}
          ctx.stroke();ctx.shadowBlur=0;
        }
      }
      if(sim.stress>.05){
        const sa=Math.atan2(sim.stressDir[1],sim.stressDir[0])+this.spin;
        ctx.strokeStyle='rgba(255,159,69,'+(sim.stress*.8)+')';ctx.lineWidth=2;
        for(let k=0;k<4;k++){
          const a=sa+rand(-.4,.4);
          ctx.beginPath();
          ctx.moveTo(cx+Math.cos(a)*R*.5,cy-Math.sin(a)*R*.5);
          ctx.lineTo(cx+Math.cos(a+rand(-.2,.2))*R*.95,cy-Math.sin(a+rand(-.2,.2))*R*.95);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
    /* куски */
    for(const c of sim.chunks){
      const fade=c.mode==='return'?1:clamp(c.life/.5,0,1);
      const cs=c.size*fade;
      if(cs<.006)continue;
      if(!c._cols)c._cols=this._colsFor(c.hard);
      const w=this._world(c.p);
      const size=cs*w[2];
      if(size<.6)continue;
      const shape=this.shapes[c.variant%this.shapes.length];
      ctx.save();
      ctx.translate(w[0],w[1]);
      ctx.rotate(-c.rot[2]);
      ctx.beginPath();
      for(let i=0;i<shape.length;i++){
        const x=shape[i][0]*size,y=shape[i][1]*size;
        if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);
      }
      ctx.closePath();
      const sg=ctx.createLinearGradient(-size,-size,size,size);
      sg.addColorStop(0,css(c._cols.bright));sg.addColorStop(1,css(c._cols.deep));
      ctx.fillStyle=sg;
      if(c.fresh>.05){ctx.shadowColor=rgba(C.ember,clamp(c.fresh,0,1));ctx.shadowBlur=14*c.fresh;}
      ctx.fill();ctx.shadowBlur=0;
      ctx.strokeStyle=rgba(C.rim,.55);ctx.lineWidth=1;ctx.stroke();
      ctx.restore();
    }
    /* частицы */
    ctx.globalCompositeOperation='lighter';
    for(let i=this.parts.length-1;i>=0;i--){
      const p=this.parts[i];
      p.life-=dt;
      if(p.life<=0){this.parts.splice(i,1);continue;}
      p.vy+=p.g*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;
      const a=clamp(p.life/p.max,0,1);
      ctx.fillStyle=rgba(p.col,a*a);
      ctx.beginPath();ctx.arc(p.x,p.y,p.size*(0.4+0.6*a),0,Math.PI*2);ctx.fill();
    }
    ctx.globalCompositeOperation='source-over';
    if(this.flashA>.01){
      ctx.fillStyle='rgba(255,245,225,'+(this.flashA*.35)+')';
      ctx.fillRect(-24,-24,this.w+48,this.h+48);
    }
  }
  snapshot(cb){this.render(performance.now()/1000,0);this.canvas.toBlob(cb,'image/png');}
}
M.Renderer2D=Renderer2D;
})();