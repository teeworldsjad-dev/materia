/* js/render-gl.js — WebGL: материя, выщербины, откалывающиеся куски, распад и сборка */
(function(){
"use strict";
const M=window.MAT;
const{clamp,lerp,smooth,rand,hex2rgb,mixRGB,norm,dot,sub,cross,mulberry}=M;

const NOISE_GLSL=`
vec3 hash3(vec3 p){p=vec3(dot(p,vec3(127.1,311.7,74.7)),dot(p,vec3(269.5,183.3,246.1)),dot(p,vec3(113.5,271.9,124.6)));return fract(sin(p)*43758.5453);}
float vnoise(vec3 p){vec3 ip=floor(p);vec3 fp=fract(p);fp=fp*fp*(3.0-2.0*fp);
float n000=hash3(ip).x;
float n100=hash3(ip+vec3(1.0,0.0,0.0)).x;
float n010=hash3(ip+vec3(0.0,1.0,0.0)).x;
float n110=hash3(ip+vec3(1.0,1.0,0.0)).x;
float n001=hash3(ip+vec3(0.0,0.0,1.0)).x;
float n101=hash3(ip+vec3(1.0,0.0,1.0)).x;
float n011=hash3(ip+vec3(0.0,1.0,1.0)).x;
float n111=hash3(ip+vec3(1.0,1.0,1.0)).x;
float nx00=mix(n000,n100,fp.x);float nx10=mix(n010,n110,fp.x);
float nx01=mix(n001,n101,fp.x);float nx11=mix(n011,n111,fp.x);
return mix(mix(nx00,nx10,fp.y),mix(nx01,nx11,fp.y),fp.z);}
vec2 dirUV(vec3 d){return vec2(0.5+atan(d.z,d.x)/6.2831853,0.5-asin(clamp(d.y,-1.0,1.0))/3.14159265);}
`;

const BLOB_VS=`
attribute vec3 aPos;
uniform mat4 uProj,uView;
uniform float uTime,uSag,uVTF,uCrackAmt,uBiteAmt;
uniform vec3 uSquash,uOsc,uOscF,uNoise;
uniform vec4 uDent[14];
uniform float uDentR[14];
uniform vec4 uBite[12];
uniform float uBiteR[12];
uniform sampler2D uCrack;
varying vec3 vN;
varying vec3 vP;
varying vec3 vD;
varying float vPress;
varying float vBite;
${NOISE_GLSL}
float gPress;
float gBite;
vec3 displace(vec3 d){
  float r=1.0;
  gPress=0.0;
  gBite=0.0;
  for(int i=0;i<14;i++){
    vec4 dn=uDent[i];
    float dep=dn.w;
    if(abs(dep)>0.0005){
      float ad=acos(clamp(dot(d,dn.xyz),-1.0,1.0));
      float rad=max(uDentR[i],0.05);
      if(dep<0.0){
        float w=exp(-ad*ad/(rad*rad));
        float w2=exp(-ad*ad/(rad*rad*3.2));
        r+=dep*(w-0.32*w2);
        gPress+=(-dep)*w;
      }else{
        float sr=rad*0.55;
        float w=exp(-ad*ad/(sr*sr));
        r+=dep*w;
        gPress+=dep*w;
      }
    }
  }
  if(uBiteAmt>0.5){
    for(int i=0;i<12;i++){
      vec4 bt=uBite[i];
      if(bt.w>0.0005){
        float ad2=acos(clamp(dot(d,bt.xyz),-1.0,1.0));
        float br=max(uBiteR[i],0.06);
        float w=1.0-smoothstep(br*0.5,br,ad2);
        r-=bt.w*w;
        gBite+=w;
        float ring=smoothstep(br*0.55,br*0.95,ad2)*(1.0-smoothstep(br*0.95,br*1.4,ad2));
        r+=bt.w*0.4*ring;
      }
    }
  }
  r+=uOsc.x*sin(d.x*3.3+uTime*uOscF.x);
  r+=uOsc.y*sin(d.y*3.7+uTime*uOscF.y+1.7);
  r+=uOsc.z*sin(d.z*2.9+uTime*uOscF.z+4.1);
  float n=vnoise(d*uNoise.y+vec3(0.0,uTime*uNoise.z,0.0))-0.5;
  n+=0.5*(vnoise(d*uNoise.y*2.3-vec3(uTime*uNoise.z*0.7,0.0,0.0))-0.5);
  r+=n*uNoise.x;
  vec3 p=d*r;
  float down=0.5-0.5*d.y;
  p.y-=uSag*down*down*0.9;
  p.x=p.x*(1.0+uSag*down*0.35);
  p.z=p.z*(1.0+uSag*down*0.35);
  if(uVTF>0.5&&uCrackAmt>0.001){
    float cm=texture2D(uCrack,dirUV(d)).r;
    p-=d*cm*uCrackAmt;
  }
  return p*uSquash;
}
void main(){
  vec3 d=normalize(aPos);
  vec3 p=displace(d);
  vPress=gPress;
  vBite=gBite;
  vec3 upv=vec3(0.0,1.0,0.0);
  if(abs(d.y)>0.99)upv=vec3(1.0,0.0,0.0);
  vec3 T=normalize(cross(d,upv));
  vec3 B=normalize(cross(d,T));
  float e=0.035;
  vec3 pT=displace(normalize(d+T*e));
  vec3 pB=displace(normalize(d+B*e));
  vec3 n=normalize(cross(pT-p,pB-p));
  if(dot(n,d)<0.0)n=-n;
  vN=n;vP=p;vD=d;
  gl_Position=uProj*uView*vec4(p,1.0);
}`;

const BLOB_FS=`
varying vec3 vN;
varying vec3 vP;
varying vec3 vD;
varying float vPress;
varying float vBite;
uniform vec3 uEye,uColDeep,uColBright,uRim,uEmber,uGold,uFog,uStressDir;
uniform float uTime,uHard,uGlow,uEnergy,uStress,uGoldPulse,uVein,uCrackAmt;
uniform sampler2D uCrack;
${NOISE_GLSL}
void main(){
  vec3 N=normalize(vN);
  vec3 V=normalize(uEye-vP);
  float bumpAmt=smoothstep(0.55,0.9,uHard)*0.35;
  if(bumpAmt>0.01){
    vec3 q=vD*9.0;
    float ee=0.12;
    vec3 gr=vec3(
      vnoise(q+vec3(ee,0.0,0.0))-vnoise(q-vec3(ee,0.0,0.0)),
      vnoise(q+vec3(0.0,ee,0.0))-vnoise(q-vec3(0.0,ee,0.0)),
      vnoise(q+vec3(0.0,0.0,ee))-vnoise(q-vec3(0.0,0.0,ee)));
    N=normalize(N+gr*bumpAmt*2.0);
  }
  float ndv=max(dot(N,V),0.0);
  float fres=pow(1.0-ndv,mix(2.2,3.5,uHard));
  float wLiq=1.0-smoothstep(0.15,0.55,uHard);
  float wIce=smoothstep(0.35,0.62,uHard)*(1.0-smoothstep(0.72,0.95,uHard));
  float wStone=smoothstep(0.68,0.92,uHard);
  vec3 base=mix(uColDeep,uColBright,0.22+0.78*fres);
  float caus=vnoise(vD*5.0+vec3(uTime*0.4,0.0,uTime*0.2));
  base+=uColBright*smoothstep(0.55,0.85,caus)*0.18*wLiq;
  float spark=step(0.994,hash3(floor(vD*60.0)).x)*wIce;
  base=mix(base,uColBright*0.85,wStone*0.35);
  vec3 L1=normalize(vec3(0.6,0.9,0.5));
  vec3 L2=normalize(vec3(-0.7,0.25,-0.6));
  vec3 L3=normalize(vec3(0.1,-0.8,0.3));
  float dif=max(dot(N,L1),0.0);
  vec3 col=base*(0.28+0.85*dif)*vec3(1.0,0.97,0.92);
  col+=base*max(dot(N,L3),0.0)*vec3(0.25,0.1,0.22)*0.5;
  vec3 H=normalize(L1+V);
  float sp=pow(max(dot(N,H),0.0),mix(140.0,10.0,uHard))*mix(1.2,0.25,uHard);
  sp+=pow(max(dot(N,H),0.0),24.0)*0.25*(1.0-uHard);
  col+=vec3(1.0,0.98,0.9)*sp;
  float rimL=pow(max(dot(N,L2)*0.5+0.5,0.0),2.0)*fres;
  col+=uRim*rimL*0.9;
  float ridge=1.0-abs(vnoise(vD*4.5)*2.0-1.0);
  float vein=pow(ridge,6.0)*uVein*(0.35+0.65*wStone);
  float press=clamp(vPress,0.0,1.0);
  col+=uEmber*vein*(0.5+0.8*uEnergy+0.4*press);
  col=mix(col,uColBright*1.35,press*0.5);
  col+=uRim*press*0.25*uGlow;
  col+=uColBright*(0.05+0.10*uGlow)*(1.0-fres)*wLiq;
  col+=uColBright*uEnergy*0.12;
  col+=vec3(1.0)*spark*0.8;
  float bite=clamp(vBite,0.0,1.0);
  col=mix(col,uColDeep*0.55,bite*0.6);
  col+=uEmber*bite*0.22*(0.4+uGoldPulse);
  vec2 ck=texture2D(uCrack,dirUV(vD)).rg;
  float cm=ck.r*step(0.001,uCrackAmt);
  col=mix(col,col*0.15,cm*0.85);
  col+=uRim*cm*0.15;
  float gm=ck.g*step(0.001,uCrackAmt);
  vec3 gold=uGold*(1.1+0.4*sin(uTime*2.0+vD.x*8.0));
  col=mix(col,gold,clamp(gm*1.2,0.0,1.0));
  col+=uGold*gm*(0.35+uGoldPulse*1.4);
  col+=vec3(1.0)*step(0.992,hash3(floor(vD*80.0)+vec3(uTime*0.5)).x)*gm;
  float ad=acos(clamp(dot(vD,uStressDir),-1.0,1.0));
  float hair=1.0-smoothstep(0.0,0.05,abs(vnoise(vD*16.0+vec3(7.3))-0.5));
  float sm=hair*(1.0-smoothstep(0.05,0.6,ad))*uStress;
  col+=uEmber*sm*1.6;
  col=mix(col,col*0.6,sm*0.4);
  float fd=length(uEye-vP);
  col=mix(col,uFog,smoothstep(6.0,11.0,fd)*0.5);
  col=col/(1.0+col*0.35);
  col=pow(max(col,vec3(0.0)),vec3(0.85));
  gl_FragColor=vec4(col,1.0);
}`;

const SHARD_VS=`
attribute vec3 aPos;
attribute vec3 aNormal;
uniform mat4 uProj,uView,uModel;
varying vec3 vN;
varying vec3 vP;
void main(){
  vec4 wp=uModel*vec4(aPos,1.0);
  vP=wp.xyz;
  vN=normalize((uModel*vec4(aNormal,0.0)).xyz);
  gl_Position=uProj*uView*wp;
}`;
const SHARD_FS=`
varying vec3 vN;
varying vec3 vP;
uniform vec3 uEye,uDeep,uBright,uRim,uEmber;
uniform float uHard,uFresh,uGlow;
void main(){
  vec3 N=normalize(vN);
  vec3 V=normalize(uEye-vP);
  float fres=pow(1.0-max(dot(N,V),0.0),2.4);
  vec3 L1=normalize(vec3(0.6,0.9,0.5));
  vec3 L2=normalize(vec3(-0.7,0.25,-0.6));
  float dif=max(dot(N,L1),0.0);
  vec3 base=mix(uDeep,uBright,0.22+0.6*fres);
  vec3 col=base*(0.22+0.95*dif);
  col+=base*max(dot(N,normalize(vec3(0.1,-0.8,0.3))),0.0)*vec3(0.2,0.09,0.2)*0.5;
  vec3 H=normalize(L1+V);
  col+=vec3(1.0,0.97,0.9)*pow(max(dot(N,H),0.0),mix(90.0,14.0,uHard))*mix(0.95,0.3,uHard);
  col+=uRim*fres*(0.55+0.35*uGlow);
  col+=uEmber*uFresh*(0.3+fres*1.3);
  col=col/(1.0+col*0.35);
  col=pow(max(col,vec3(0.0)),vec3(0.85));
  gl_FragColor=vec4(col,1.0);
}`;

const QUADISH_VS=`attribute vec2 aPos;varying vec2 vUv;void main(){vUv=aPos*0.5+0.5;gl_Position=vec4(aPos,0.0,1.0);}`;
const BG_FS=`
varying vec2 vUv;
uniform vec2 uRes;
uniform vec2 uBlobNDC;
uniform float uTime,uGlow;
uniform vec3 uColA,uColB,uRim,uGlowCol;
${NOISE_GLSL}
void main(){
  vec2 uv=vUv;
  vec3 col=mix(uColA,uColB,uv.y*0.9);
  float a1=vnoise(vec3(uv*vec2(2.2,1.4)+uTime*0.03,uTime*0.05));
  float a2=vnoise(vec3(uv*vec2(1.6,2.0)-uTime*0.02,uTime*0.04+7.0));
  col+=uRim*smoothstep(0.55,0.9,a1)*(1.0-smoothstep(0.0,0.25,abs(uv.y-0.68)))*0.10;
  col+=uGlowCol*smoothstep(0.55,0.9,a2)*(1.0-smoothstep(0.0,0.3,abs(uv.y-0.3)))*0.08;
  vec2 asp=vec2(uRes.x/max(uRes.y,1.0),1.0);
  float d=length((uv-(uBlobNDC*0.5+0.5))*asp);
  col+=uGlowCol*exp(-d*d*7.0)*0.22*uGlow;
  col*=1.0-0.45*pow(length(uv-0.5)*1.35,2.2);
  col+=hash3(vec3(uv*uRes,uTime)).x*0.035-0.0175;
  gl_FragColor=vec4(col,1.0);
}`;

const PTS_VS=`
attribute vec3 aPos;
attribute float aSize;
attribute vec3 aCol;
attribute float aAlpha;
uniform mat4 uProj,uView;
uniform float uPx;
varying vec3 vCol;
varying float vA;
void main(){
  vec4 mv=uView*vec4(aPos,1.0);
  gl_Position=uProj*mv;
  gl_PointSize=clamp(aSize*uPx*(3.4/max(-mv.z,0.5)),1.0,48.0);
  vCol=aCol;vA=aAlpha;
}`;
const PTS_FS=`
varying vec3 vCol;
varying float vA;
void main(){
  float d=length(gl_PointCoord-vec2(0.5));
  float a=(1.0-smoothstep(0.12,0.5,d))*vA;
  gl_FragColor=vec4(vCol,a);
}`;

const QUAD_VS=`
attribute vec2 aPos;
uniform mat4 uProj,uView;
uniform float uMode;
uniform vec3 uCenter,uRight,uUp;
uniform vec2 uSize;
varying vec2 vUv;
void main(){
  vUv=aPos*0.5+0.5;
  if(uMode<0.5){
    vec3 w=uCenter+uRight*aPos.x*uSize.x+uUp*aPos.y*uSize.y;
    gl_Position=uProj*uView*vec4(w,1.0);
  }else if(uMode<1.5){
    gl_Position=vec4(aPos,0.0,1.0);
  }else{
    vec3 w=uCenter+vec3(aPos.x*uSize.x,0.0,aPos.y*uSize.y);
    gl_Position=uProj*uView*vec4(w,1.0);
  }
}`;
const QUAD_FS=`
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec3 uColor;
uniform float uOpacity;
void main(){
  float t=texture2D(uTex,vUv).a;
  gl_FragColor=vec4(uColor,t*uOpacity);
}`;

const ICO_V=[[-1,1.618,0],[1,1.618,0],[-1,-1.618,0],[1,-1.618,0],[0,-1,1.618],[0,1,1.618],[0,-1,-1.618],[0,1,-1.618],[1.618,0,-1],[1.618,0,1],[-1.618,0,-1],[-1.618,0,1]];
const ICO_F=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];

function icosphere(sub){
  let verts=ICO_V.map(norm);
  let faces=ICO_F.map(f=>f.slice());
  for(let s=0;s<sub;s++){
    const cache=new Map(),nf=[];
    const mid=(a,b)=>{
      const k=a<b?a*65536+b:b*65536+a;
      if(cache.has(k))return cache.get(k);
      const v=norm([(verts[a][0]+verts[b][0])/2,(verts[a][1]+verts[b][1])/2,(verts[a][2]+verts[b][2])/2]);
      verts.push(v);const i=verts.length-1;cache.set(k,i);return i;
    };
    for(const f of faces){
      const a=f[0],b=f[1],c=f[2],ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);
      nf.push([a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]);
    }
    faces=nf;
  }
  const pos=new Float32Array(verts.length*3);
  verts.forEach((v,i)=>{pos[i*3]=v[0];pos[i*3+1]=v[1];pos[i*3+2]=v[2];});
  const idx=new Uint16Array(faces.length*3);
  faces.forEach((f,i)=>{idx[i*3]=f[0];idx[i*3+1]=f[1];idx[i*3+2]=f[2];});
  return{pos,idx,count:idx.length};
}
function shardData(seed){
  const rng=mulberry(seed);
  const sx=.72+rng()*.6,sy=.42+rng()*.5,sz=.72+rng()*.6;
  const verts=ICO_V.map(norm).map(v=>{
    const k=.6+rng()*.6;
    return[v[0]*sx*k,v[1]*sy*k,v[2]*sz*k];
  });
  const data=new Float32Array(ICO_F.length*18);
  let o=0;
  for(const f of ICO_F){
    const a=verts[f[0]],b=verts[f[1]],c=verts[f[2]];
    const n=norm(cross(sub(b,a),sub(c,a)));
    const tri=[a,b,c];
    for(let i=0;i<3;i++){
      data[o++]=tri[i][0];data[o++]=tri[i][1];data[o++]=tri[i][2];
      data[o++]=n[0];data[o++]=n[1];data[o++]=n[2];
    }
  }
  return data;
}
function perspective(fov,aspect,near,far){
  const f=1/Math.tan(fov/2),nf=1/(near-far);
  return new Float32Array([f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0]);
}
function lookAt(eye,ct,up){
  const f=norm(sub(ct,eye)),r=norm(cross(f,up)),u=cross(r,f);
  return{m:new Float32Array([r[0],u[0],-f[0],0, r[1],u[1],-f[1],0, r[2],u[2],-f[2],0, -dot(r,eye),-dot(u,eye),dot(f,eye),1]),r,u,f};
}
function modelMat(out,p,rot,s){
  const ca=Math.cos(rot[0]),sa=Math.sin(rot[0]);
  const cb=Math.cos(rot[1]),sb=Math.sin(rot[1]);
  const cc=Math.cos(rot[2]),sc=Math.sin(rot[2]);
  out[0]=(cc*cb)*s;            out[1]=(sc*cb)*s;            out[2]=(-sb)*s;     out[3]=0;
  out[4]=(cc*sb*sa-sc*ca)*s;   out[5]=(sc*sb*sa+cc*ca)*s;   out[6]=(cb*sa)*s;   out[7]=0;
  out[8]=(cc*sb*ca+sc*sa)*s;   out[9]=(sc*sb*ca-cc*sa)*s;   out[10]=(cb*ca)*s;  out[11]=0;
  out[12]=p[0];out[13]=p[1];out[14]=p[2];out[15]=1;
  return out;
}

const QUAL={eco:{sub:4,dpr:1.25,motes:40},bal:{sub:5,dpr:1.75,motes:90},ultra:{sub:6,dpr:2,motes:150}};
const MAXP=900;

class RendererGL{
  constructor(canvas,sim,onLost){
    this.canvas=canvas;this.sim=sim;this.onLost=onLost||function(){};
    const opts={antialias:true,alpha:false,depth:true,powerPreference:'high-performance',preserveDrawingBuffer:false};
    const gl=canvas.getContext('webgl2',opts)||canvas.getContext('webgl',opts)||canvas.getContext('experimental-webgl',opts);
    if(!gl)throw new Error('WebGL-контекст не создан');
    this.gl=gl;
    this.isGL2=(typeof WebGL2RenderingContext!=='undefined')&&(gl instanceof WebGL2RenderingContext);
    this.modeName=this.isGL2?'WebGL2':'WebGL';
    this.yaw=.5;this.pitch=.18;this.dist=4.2;
    this.yawT=.5;this.pitchT=.18;this.distT=4.2;
    this.shakeAmp=0;this.flashA=0;this.flashCol=[1,.95,.85];
    this.w=2;this.h=2;this.dpr=1;this.lost=false;this.pendingQ=null;this.crackDirty=false;
    this.eye=[0,0,4.2];this.basis=null;this.fov=42*Math.PI/180;
    this._mm=new Float32Array(16);
    this.crackCanvas=document.createElement('canvas');
    this.crackCanvas.width=1024;this.crackCanvas.height=512;
    this.cctx=this.crackCanvas.getContext('2d');
    this._bright=[.2,.9,.8];
    this._initParticles();
    this._initGL();
    this._onLost=e=>{e.preventDefault();this.lost=true;this.onLost();};
    this._onRestored=()=>{
      try{this._initGL();this._repaintAllCracks();this.resize(this.w,this.h);this.lost=false;}
      catch(err){console.warn('[материя] не удалось восстановить WebGL:',err);}
    };
    canvas.addEventListener('webglcontextlost',this._onLost);
    canvas.addEventListener('webglcontextrestored',this._onRestored);
  }
  _initGL(){
    const gl=this.gl;
    this.vtf=gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS)>0;
    const hf=gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER,gl.HIGH_FLOAT);
    const prec=(hf&&hf.precision>0)?'highp':'mediump';
    const PRE='precision '+prec+' float;\nprecision '+prec+' int;\n';
    const compile=(type,src)=>{
      const s=gl.createShader(type);
      gl.shaderSource(s,PRE+src);gl.compileShader(s);
      if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){
        const log=gl.getShaderInfoLog(s)||'неизвестная ошибка шейдера';
        gl.deleteShader(s);throw new Error(log);
      }
      return s;
    };
    const link=(vs,fs)=>{
      const p=gl.createProgram(),v=compile(gl.VERTEX_SHADER,vs),f=compile(gl.FRAGMENT_SHADER,fs);
      gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);
      gl.deleteShader(v);gl.deleteShader(f);
      if(!gl.getProgramParameter(p,gl.LINK_STATUS)){
        const log=gl.getProgramInfoLog(p)||'ошибка линковки';
        gl.deleteProgram(p);throw new Error(log);
      }
      p._u={};p._a={};return p;
    };
    this.progBlob=link(BLOB_VS,BLOB_FS);
    this.progShard=link(SHARD_VS,SHARD_FS);
    this.progBg=link(QUADISH_VS,BG_FS);
    this.progPts=link(PTS_VS,PTS_FS);
    this.progQuad=link(QUAD_VS,QUAD_FS);
    this.U=(p,n)=>{if(!(n in p._u))p._u[n]=gl.getUniformLocation(p,n);return p._u[n];};
    this.A=(p,n)=>{if(!(n in p._a))p._a[n]=gl.getAttribLocation(p,n);return p._a[n];};
    this._useAttribs=(p,defs)=>{
      for(let i=0;i<8;i++)gl.disableVertexAttribArray(i);
      for(const d of defs){
        const l=this.A(p,d.n);
        if(l<0)continue;
        gl.enableVertexAttribArray(l);
        gl.vertexAttribPointer(l,d.s,gl.FLOAT,false,d.st||0,d.o||0);
      }
    };
    const q=QUAL[this.sim.settings.quality]||QUAL.bal;
    this._buildGeo(q.sub);
    this.shardVBO=[];
    for(let i=0;i<6;i++){
      const b=gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER,b);
      gl.bufferData(gl.ARRAY_BUFFER,shardData(1000+i*77),gl.STATIC_DRAW);
      this.shardVBO.push(b);
    }
    this.quadVBO=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,this.quadVBO);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    this.ptsVBO=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,this.ptsVBO);
    gl.bufferData(gl.ARRAY_BUFFER,this.pData.byteLength,gl.DYNAMIC_DRAW);
    this.texCrack=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,this.texCrack);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    this._uploadCrack();
    const rc=document.createElement('canvas');rc.width=rc.height=256;
    const rx=rc.getContext('2d'),gr=rx.createRadialGradient(128,128,0,128,128,128);
    gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.4,'rgba(255,255,255,.45)');gr.addColorStop(1,'rgba(255,255,255,0)');
    rx.fillStyle=gr;rx.fillRect(0,0,256,256);
    this.texRadial=this._texFromCanvas(rc);
    const wc=document.createElement('canvas');wc.width=wc.height=2;
    const wx=wc.getContext('2d');wx.fillStyle='#fff';wx.fillRect(0,0,2,2);
    this.texWhite=this._texFromCanvas(wc);
    gl.disable(gl.CULL_FACE);
    gl.clearColor(5/255,7/255,15/255,1);
  }
  _texFromCanvas(cv){
    const gl=this.gl,t=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,cv);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    return t;
  }
  _buildGeo(sub){
    const gl=this.gl,geo=icosphere(sub);
    if(this.blobVBO)gl.deleteBuffer(this.blobVBO);
    if(this.blobIBO)gl.deleteBuffer(this.blobIBO);
    this.blobVBO=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,this.blobVBO);
    gl.bufferData(gl.ARRAY_BUFFER,geo.pos,gl.STATIC_DRAW);
    this.blobIBO=gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.blobIBO);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,geo.idx,gl.STATIC_DRAW);
    this.idxCount=geo.count;
    this._dentArr=new Float32Array(56);
    this._dentR=new Float32Array(14);
    this._biteArr=new Float32Array(48);
    this._biteR=new Float32Array(12);
  }
  setQuality(q){this.pendingQ=q;}
  resize(w,h){
    this.w=Math.max(2,w);this.h=Math.max(2,h);
    const q=QUAL[this.sim.settings.quality]||QUAL.bal;
    this.dpr=Math.min(window.devicePixelRatio||1,q.dpr);
    this.canvas.width=Math.round(this.w*this.dpr);
    this.canvas.height=Math.round(this.h*this.dpr);
  }
  _initParticles(){
    this.pPool=[];
    for(let i=0;i<MAXP;i++)this.pPool.push({life:0,max:1,x:0,y:0,z:0,vx:0,vy:0,vz:0,size:2,r:1,g:1,b:1,grav:0,drag:0,amb:false,seed:0});
    this.pActive=0;
    this.pData=new Float32Array(MAXP*8);
  }
  _spawn(n,fn){
    n=Math.round(n*this.sim.settings.particles);
    for(let i=0;i<n&&this.pActive<MAXP;i++){const p=this.pPool[this.pActive++];p.amb=false;p.seed=Math.random()*10;fn(p);}
  }
  _syncAmbient(){
    const q=QUAL[this.sim.settings.quality]||QUAL.bal;
    const target=Math.round(q.motes*this.sim.settings.particles);
    let count=0;
    for(let i=0;i<this.pActive;i++)if(this.pPool[i].amb)count++;
    while(count<target&&this.pActive<MAXP){
      const p=this.pPool[this.pActive++];
      p.amb=true;p.life=-1;p.seed=Math.random()*10;
      const th=rand(0,Math.PI*2),r=rand(1.6,3.6);
      p.x=Math.cos(th)*r;p.y=rand(-2,2);p.z=Math.sin(th)*r;
      p.vx=rand(-.05,.05);p.vy=rand(-.03,.05);p.vz=rand(-.05,.05);
      p.size=rand(1,2.4);p.grav=0;p.drag=0;count++;
    }
    while(count>target){
      let idx=-1;
      for(let i=this.pActive-1;i>=0;i--)if(this.pPool[i].amb){idx=i;break;}
      if(idx<0)break;
      const last=this.pPool[this.pActive-1];
      this.pPool[this.pActive-1]=this.pPool[idx];
      this.pPool[idx]=last;
      this.pActive--;count--;
    }
  }
  droplets(dir,power,col){
    const R=this.sim.renderScale();
    this._spawn(10+power*22,p=>{
      p.x=dir[0]*R;p.y=dir[1]*R;p.z=dir[2]*R;
      p.vx=dir[0]*rand(1,2.5)+rand(-.8,.8);p.vy=dir[1]*rand(1,2.5)+rand(0,1.2);p.vz=dir[2]*rand(1,2.5)+rand(-.8,.8);
      p.life=p.max=rand(.4,.9);p.size=rand(2,4.5);p.grav=4;p.drag=.6;
      p.r=col[0];p.g=col[1];p.b=col[2];});
  }
  shards(dir,n,col){
    const R=this.sim.renderScale();
    this._spawn(n,p=>{
      p.x=dir[0]*R*rand(.7,1);p.y=dir[1]*R*rand(.7,1);p.z=dir[2]*R*rand(.7,1);
      const s=rand(1.5,4);
      p.vx=dir[0]*s+rand(-1.6,1.6);p.vy=dir[1]*s+rand(-.5,2);p.vz=dir[2]*s+rand(-1.6,1.6);
      p.life=p.max=rand(.5,1.2);p.size=rand(2,5);p.grav=6;p.drag=.4;
      p.r=col[0];p.g=col[1];p.b=col[2];});
  }
  dustAt(pos,n,col){
    this._spawn(n,p=>{
      p.x=pos[0]+rand(-.06,.06);p.y=pos[1]+rand(-.02,.06);p.z=pos[2]+rand(-.06,.06);
      p.vx=rand(-.7,.7);p.vy=rand(.1,.9);p.vz=rand(-.7,.7);
      p.life=p.max=rand(.3,.7);p.size=rand(1.5,3.4);p.grav=1.2;p.drag=1.2;
      p.r=col[0];p.g=col[1];p.b=col[2];});
  }
  goldSparks(n){
    const R=Math.max(this.sim.renderScale(),.5),gold=hex2rgb(M.GOLD);
    this._spawn(n,p=>{
      const th=rand(0,Math.PI*2),ph=rand(-1,1);
      p.x=Math.cos(th)*R;p.y=ph*R;p.z=Math.sin(th)*R;
      p.vx=rand(-.4,.4);p.vy=rand(.4,1.4);p.vz=rand(-.4,.4);
      p.life=p.max=rand(.7,1.6);p.size=rand(1.5,3.5);p.grav=-.4;p.drag=.5;
      p.r=gold[0];p.g=gold[1];p.b=gold[2];});
  }
  _updateParticles(dt,t){
    this._syncAmbient();
    const bright=this._bright;
    for(let i=0;i<this.pActive;i++){
      const p=this.pPool[i];
      if(p.amb){
        p.x+=p.vx*dt+Math.sin(t*.4+p.seed)*.0015;
        p.y+=p.vy*dt+Math.cos(t*.3+p.seed)*.0015;
        p.z+=p.vz*dt;
        if(Math.hypot(p.x,p.y,p.z)>4.2){const th=rand(0,Math.PI*2),r=rand(1.6,3);p.x=Math.cos(th)*r;p.y=rand(-2,2);p.z=Math.sin(th)*r;}
        const tw=.22+.18*Math.sin(t*1.2+p.seed*3),o=i*8;
        this.pData[o]=p.x;this.pData[o+1]=p.y;this.pData[o+2]=p.z;this.pData[o+3]=p.size;
        this.pData[o+4]=bright[0]*.7;this.pData[o+5]=bright[1]*.7;this.pData[o+6]=bright[2]*.7;this.pData[o+7]=tw;
      }else{
        p.life-=dt;
        if(p.life<=0){
          const last=this.pPool[this.pActive-1];
          this.pPool[this.pActive-1]=p;this.pPool[i]=last;
          this.pActive--;i--;continue;
        }
        p.vy-=p.grav*dt;
        const dr=Math.exp(-p.drag*dt);p.vx*=dr;p.vy*=dr;p.vz*=dr;
        p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;
        const lf=p.life/p.max,o=i*8;
        this.pData[o]=p.x;this.pData[o+1]=p.y;this.pData[o+2]=p.z;this.pData[o+3]=p.size*(0.4+0.6*lf);
        this.pData[o+4]=p.r;this.pData[o+5]=p.g;this.pData[o+6]=p.b;this.pData[o+7]=lf*lf;
      }
    }
  }
  _dirToPx(d){
    const u=.5+Math.atan2(d[2],d[0])/(Math.PI*2),v=.5-Math.asin(clamp(d[1],-1,1))/Math.PI;
    return[u*1024,v*512];
  }
  paintCrack(c){
    const rng=mulberry(c.seed),H=512;
    const cp=this._dirToPx(c.dir),cx=cp[0],cy=cp[1];
    const paths=[],nB=5+((rng()*4)|0);
    for(let b=0;b<nB;b++){
      let ang=rng()*Math.PI*2,x=cx,y=cy;
      const len=(40+rng()*80)*(0.7+0.6*this.sim.settings.hardness),steps=6+((rng()*7)|0);
      const pts=[[x,y]];
      for(let s=0;s<steps;s++){
        ang+=(rng()-.5)*1.0;
        const step=len/steps*(0.6+rng()*.8);
        x+=Math.cos(ang)*step;y+=Math.sin(ang)*step*.6;
        y=clamp(y,4,H-4);pts.push([x,y]);
        if(rng()<.3){
          let ba=ang+(rng()<.5?1:-1)*(0.6+rng()*.8),bx=x,by=y;
          const bp=[[bx,by]],bl=len*.35*(0.5+rng());
          for(let k=0;k<4;k++){ba+=(rng()-.5)*.9;bx+=Math.cos(ba)*bl/4;by+=Math.sin(ba)*bl/4*.6;by=clamp(by,4,H-4);bp.push([bx,by]);}
          paths.push({pts:bp,w:1.1});
        }
      }
      paths.push({pts,w:2.6});
    }
    c.paths=paths;
    this._drawPaths(paths,'rgb(255,0,0)',0);
    this.crackDirty=true;
  }
  paintGold(){
    for(const c of this.sim.cracks)if(c.healed&&c.paths)this._drawPaths(c.paths,'rgb(0,255,0)',1.6);
    this.crackDirty=true;
  }
  _drawPaths(paths,color,extraW){
    const ctx=this.cctx,W=1024;
    ctx.save();
    ctx.globalCompositeOperation='lighter';
    ctx.strokeStyle=color;ctx.lineCap='round';ctx.lineJoin='round';
    const offs=[-W,0,W];
    for(const off of offs){
      for(const p of paths){
        ctx.lineWidth=p.w+extraW;
        ctx.beginPath();
        for(let i=0;i<p.pts.length;i++){
          const x=p.pts[i][0]+off,y=p.pts[i][1];
          if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  clearCracks(){this.cctx.clearRect(0,0,1024,512);this.crackDirty=true;}
  _repaintAllCracks(){
    this.cctx.clearRect(0,0,1024,512);
    for(const c of this.sim.cracks){
      if(!c.paths)this.paintCrack(c);
      else this._drawPaths(c.paths,'rgb(255,0,0)',0);
      if(c.healed&&c.paths)this._drawPaths(c.paths,'rgb(0,255,0)',1.6);
    }
    this.crackDirty=true;
  }
  _uploadCrack(){
    const gl=this.gl;
    gl.bindTexture(gl.TEXTURE_2D,this.texCrack);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,this.crackCanvas);
  }
  shake(a){this.shakeAmp=Math.min(this.shakeAmp+a,1.2);}
  flash(a,col){this.flashA=Math.min(this.flashA+a,1);if(col)this.flashCol=col;}
  orbit(dx,dy){this.yawT-=dx*.005;this.pitchT=clamp(this.pitchT+dy*.005,-1.2,1.2);}
  zoom(f){this.distT=clamp(this.distT*f,2.2,7.5);}
  viewDir(){return norm(this.eye);}
  pick(x,y){
    const R=Math.max(this.sim.renderScale(),.001);
    if(!this.basis)return{hit:false,dir:[0,0,1],closestDir:[0,0,1],dist:2,R};
    const eye=this.eye,b=this.basis;
    const nx=(x/this.w)*2-1,ny=1-(y/this.h)*2;
    const tanF=Math.tan(this.fov/2),asp=this.w/this.h;
    const rd=norm([
      b.f[0]+b.r[0]*nx*tanF*asp+b.u[0]*ny*tanF,
      b.f[1]+b.r[1]*nx*tanF*asp+b.u[1]*ny*tanF,
      b.f[2]+b.r[2]*nx*tanF*asp+b.u[2]*ny*tanF]);
    const bb=dot(eye,rd),cc=dot(eye,eye)-R*R,disc=bb*bb-cc;
    if(disc>0){
      const t=-bb-Math.sqrt(disc);
      if(t>0){
        const hp=[eye[0]+rd[0]*t,eye[1]+rd[1]*t,eye[2]+rd[2]*t];
        return{hit:true,dir:norm(hp),closestDir:norm(hp),dist:R,R};
      }
    }
    const t=Math.max(-bb,0),cp=[eye[0]+rd[0]*t,eye[1]+rd[1]*t,eye[2]+rd[2]*t];
    const d=Math.hypot(cp[0],cp[1],cp[2])||1;
    return{hit:false,dir:norm(cp),closestDir:norm(cp),dist:d,R};
  }
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
    const rim=hex2rgb(s.accent||th.rim);
    const ember=hex2rgb(th.ember);
    const glow=mixRGB(hex2rgb(th.glow),rim,.5);
    this._bright=c.bright;
    return{deep:c.deep,bright:c.bright,rim,ember,glow,vein:th.vein,gold:hex2rgb(M.GOLD)};
  }
  render(t,dt){
    if(this.lost)return;
    const gl=this.gl,sim=this.sim,s=sim.settings;
    if(this.pendingQ){
      const q=QUAL[this.pendingQ]||QUAL.bal;
      this._buildGeo(q.sub);this.pendingQ=null;
    }
    if(s.autorotate&&!sim.reduced&&sim.idleT>3&&!sim.grab)this.yawT+=dt*.06;
    const damp=1-Math.exp(-dt*7);
    this.yaw+=(this.yawT-this.yaw)*damp;
    this.pitch+=(this.pitchT-this.pitch)*damp;
    this.dist+=(this.distT-this.dist)*damp;
    this.shakeAmp*=Math.exp(-dt*5);
    this.flashA*=Math.exp(-dt*6);
    const sh=this.shakeAmp*.12;
    const ct=[0,-.05,0];
    const eye=[
      ct[0]+this.dist*Math.cos(this.pitch)*Math.sin(this.yaw)+(Math.random()-.5)*sh,
      ct[1]+this.dist*Math.sin(this.pitch)+(Math.random()-.5)*sh,
      ct[2]+this.dist*Math.cos(this.pitch)*Math.cos(this.yaw)+(Math.random()-.5)*sh];
    this.eye=eye;
    const la=lookAt(eye,[ct[0]+(Math.random()-.5)*sh*.3,ct[1],ct[2]],[0,1,0]);
    this.basis=la;
    const proj=perspective(this.fov,this.w/this.h,.1,50),view=la.m;
    const C=this._colors();
    this._updateParticles(dt,t);
    if(this.crackDirty){this._uploadCrack();this.crackDirty=false;}
    gl.viewport(0,0,this.canvas.width,this.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    const scale=sim.renderScale(),introK=Math.min(sim.intro.a,1);
    const clipX=proj[0]*view[12]+proj[4]*view[13]+proj[8]*view[14]+proj[12];
    const clipY=proj[1]*view[12]+proj[5]*view[13]+proj[9]*view[14]+proj[13];
    const clipW=proj[3]*view[12]+proj[7]*view[13]+proj[11]*view[14]+proj[15];
    const ndc=[clipX/(clipW||1),clipY/(clipW||1)];
    /* фон */
    gl.disable(gl.DEPTH_TEST);gl.depthMask(false);gl.disable(gl.BLEND);
    let p=this.progBg;gl.useProgram(p);
    gl.bindBuffer(gl.ARRAY_BUFFER,this.quadVBO);
    this._useAttribs(p,[{n:'aPos',s:2}]);
    gl.uniform2f(this.U(p,'uRes'),this.canvas.width,this.canvas.height);
    gl.uniform1f(this.U(p,'uTime'),t);
    gl.uniform2f(this.U(p,'uBlobNDC'),ndc[0],ndc[1]);
    gl.uniform1f(this.U(p,'uGlow'),s.glow*(0.4+0.6*introK));
    gl.uniform3fv(this.U(p,'uColA'),[5/255,7/255,15/255]);
    gl.uniform3fv(this.U(p,'uColB'),[10/255,17/255,34/255]);
    gl.uniform3fv(this.U(p,'uRim'),C.rim);
    gl.uniform3fv(this.U(p,'uGlowCol'),C.glow);
    gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    const drawQuad=(mode,center,sx,sy,tex,color,opacity,additive)=>{
      const q=this.progQuad;gl.useProgram(q);
      gl.bindBuffer(gl.ARRAY_BUFFER,this.quadVBO);
      this._useAttribs(q,[{n:'aPos',s:2}]);
      gl.uniformMatrix4fv(this.U(q,'uProj'),false,proj);
      gl.uniformMatrix4fv(this.U(q,'uView'),false,view);
      gl.uniform1f(this.U(q,'uMode'),mode);
      gl.uniform3fv(this.U(q,'uCenter'),center);
      gl.uniform2f(this.U(q,'uSize'),sx,sy);
      gl.uniform3fv(this.U(q,'uRight'),la.r);
      gl.uniform3fv(this.U(q,'uUp'),la.u);
      gl.uniform3fv(this.U(q,'uColor'),color);
      gl.uniform1f(this.U(q,'uOpacity'),opacity);
      gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,tex);
      gl.uniform1i(this.U(q,'uTex'),1);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA,additive?gl.ONE:gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    };
    /* пол-свет и тени */
    const poolCol=[C.glow[0]*.16+.03,C.glow[1]*.16+.04,C.glow[2]*.16+.07];
    drawQuad(2,[0,M.FLOOR-.02,0],5.2,5.2,this.texRadial,poolCol,.55,false);
    if(scale>.05)drawQuad(2,[0,M.FLOOR+.01,0],1.5*scale,.62*scale,this.texRadial,[0,0,0],.45*introK,false);
    const chunks=sim.chunks;
    for(let i=0;i<chunks.length;i++){
      const c=chunks[i];
      const fade=c.mode==='return'?1:clamp(c.life/.5,0,1);
      const cs=c.size*fade;
      if(cs<.006)continue;
      const hgt=clamp((c.p[1]-M.FLOOR)/2.4,0,1);
      const op=(1-hgt)*.4*fade;
      if(op>.01)drawQuad(2,[c.p[0],M.FLOOR+.015,c.p[2]],cs*1.7,cs*1.1,this.texRadial,[0,0,0],op,false);
    }
    if(scale>.05&&s.glow>0){
      const gs=2.6*scale*(1+sim.energy*.15);
      drawQuad(0,[0,0,0],gs,gs,this.texRadial,C.glow,.3*s.glow*introK,true);
    }
    /* материя */
    if(scale>.03){
      gl.disable(gl.BLEND);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);
      p=this.progBlob;gl.useProgram(p);
      gl.bindBuffer(gl.ARRAY_BUFFER,this.blobVBO);
      this._useAttribs(p,[{n:'aPos',s:3}]);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.blobIBO);
      gl.uniformMatrix4fv(this.U(p,'uProj'),false,proj);
      gl.uniformMatrix4fv(this.U(p,'uView'),false,view);
      gl.uniform3fv(this.U(p,'uEye'),eye);
      gl.uniform1f(this.U(p,'uTime'),t);
      gl.uniform1f(this.U(p,'uHard'),s.hardness);
      gl.uniform3fv(this.U(p,'uSquash'),sim.squashVec());
      gl.uniform3fv(this.U(p,'uOsc'),[sim.osc[0].a*.12,sim.osc[1].a*.12,sim.osc[2].a*.12]);
      const wf=sim.mp.wf;
      gl.uniform3fv(this.U(p,'uOscF'),[wf,wf*1.31,wf*.83]);
      gl.uniform1f(this.U(p,'uSag'),sim.mp.sag);
      gl.uniform3fv(this.U(p,'uNoise'),[sim.mp.noiseAmp,sim.mp.noiseFreq,sim.mp.noiseSpeed]);
      const dArr=this._dentArr,rArr=this._dentR;
      for(let i=0;i<14;i++){
        const d=sim.dents[i];
        dArr[i*4]=d.dir[0];dArr[i*4+1]=d.dir[1];dArr[i*4+2]=d.dir[2];dArr[i*4+3]=d.a;
        rArr[i]=d.radius;
      }
      gl.uniform4fv(this.U(p,'uDent'),dArr);
      gl.uniform1fv(this.U(p,'uDentR'),rArr);
      const bArr=this._biteArr,bR=this._biteR;
      for(let i=0;i<12;i++){
        const b=sim.bites[i];
        if(b){bArr[i*4]=b.dir[0];bArr[i*4+1]=b.dir[1];bArr[i*4+2]=b.dir[2];bArr[i*4+3]=b.depth;bR[i]=b.r;}
        else{bArr[i*4]=0;bArr[i*4+1]=1;bArr[i*4+2]=0;bArr[i*4+3]=0;bR[i]=.1;}
      }
      gl.uniform4fv(this.U(p,'uBite'),bArr);
      gl.uniform1fv(this.U(p,'uBiteR'),bR);
      gl.uniform1f(this.U(p,'uBiteAmt'),sim.bites.length?1:0);
      gl.uniform1f(this.U(p,'uVTF'),this.vtf?1:0);
      gl.uniform1f(this.U(p,'uCrackAmt'),sim.cracks.length?.02:0);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texCrack);
      gl.uniform1i(this.U(p,'uCrack'),0);
      gl.uniform3fv(this.U(p,'uColDeep'),C.deep);
      gl.uniform3fv(this.U(p,'uColBright'),C.bright);
      gl.uniform3fv(this.U(p,'uRim'),C.rim);
      gl.uniform3fv(this.U(p,'uEmber'),C.ember);
      gl.uniform3fv(this.U(p,'uGold'),C.gold);
      gl.uniform3fv(this.U(p,'uFog'),[10/255,17/255,34/255]);
      gl.uniform1f(this.U(p,'uGlow'),s.glow);
      gl.uniform1f(this.U(p,'uEnergy'),sim.energy);
      gl.uniform1f(this.U(p,'uStress'),sim.stress);
      gl.uniform3fv(this.U(p,'uStressDir'),sim.stressDir);
      gl.uniform1f(this.U(p,'uGoldPulse'),sim.goldPulse);
      gl.uniform1f(this.U(p,'uVein'),C.vein);
      gl.drawElements(gl.TRIANGLES,this.idxCount,gl.UNSIGNED_SHORT,0);
      if(s.glow>0){
        gl.disable(gl.DEPTH_TEST);gl.depthMask(false);
        drawQuad(0,[0,0,0],2.2*scale,2.2*scale,this.texRadial,C.glow,.1*s.glow*(0.5+sim.energy*.5),true);
      }
    }
    /* осколки */
    if(chunks.length){
      gl.disable(gl.BLEND);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);
      const sp=this.progShard;gl.useProgram(sp);
      gl.uniformMatrix4fv(this.U(sp,'uProj'),false,proj);
      gl.uniformMatrix4fv(this.U(sp,'uView'),false,view);
      gl.uniform3fv(this.U(sp,'uEye'),eye);
      gl.uniform3fv(this.U(sp,'uRim'),C.rim);
      gl.uniform3fv(this.U(sp,'uEmber'),C.ember);
      gl.uniform1f(this.U(sp,'uGlow'),s.glow);
      let lastVar=-1;
      for(let i=0;i<chunks.length;i++){
        const c=chunks[i];
        const fade=c.mode==='return'?1:clamp(c.life/.5,0,1);
        const cs=c.size*fade;
        if(cs<.006)continue;
        if(!c._cols)c._cols=this._colsFor(c.hard);
        const vi=c.variant%this.shardVBO.length;
        if(vi!==lastVar){
          gl.bindBuffer(gl.ARRAY_BUFFER,this.shardVBO[vi]);
          this._useAttribs(sp,[{n:'aPos',s:3,st:24,o:0},{n:'aNormal',s:3,st:24,o:12}]);
          lastVar=vi;
        }
        modelMat(this._mm,c.p,c.rot,cs);
        gl.uniformMatrix4fv(this.U(sp,'uModel'),false,this._mm);
        gl.uniform3fv(this.U(sp,'uDeep'),c._cols.deep);
        gl.uniform3fv(this.U(sp,'uBright'),c._cols.bright);
        gl.uniform1f(this.U(sp,'uHard'),c.hard);
        gl.uniform1f(this.U(sp,'uFresh'),clamp(c.fresh,0,1));
        gl.drawArrays(gl.TRIANGLES,0,60);
      }
    }
    /* частицы */
    if(this.pActive>0){
      gl.enable(gl.DEPTH_TEST);gl.depthMask(false);
      gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);
      p=this.progPts;gl.useProgram(p);
      gl.bindBuffer(gl.ARRAY_BUFFER,this.ptsVBO);
      gl.bufferSubData(gl.ARRAY_BUFFER,0,this.pData.subarray(0,this.pActive*8));
      this._useAttribs(p,[{n:'aPos',s:3,st:32,o:0},{n:'aSize',s:1,st:32,o:12},{n:'aCol',s:3,st:32,o:16},{n:'aAlpha',s:1,st:32,o:28}]);
      gl.uniformMatrix4fv(this.U(p,'uProj'),false,proj);
      gl.uniformMatrix4fv(this.U(p,'uView'),false,view);
      gl.uniform1f(this.U(p,'uPx'),this.dpr);
      gl.drawArrays(gl.POINTS,0,this.pActive);
    }
    if(this.flashA>.01){
      gl.disable(gl.DEPTH_TEST);gl.depthMask(false);
      drawQuad(1,[0,0,0],1,1,this.texWhite,this.flashCol,this.flashA*.4,true);
    }
    gl.depthMask(true);
  }
  snapshot(cb){
    this.render(performance.now()/1000,0);
    this.canvas.toBlob(cb,'image/png');
  }
}
M.RendererGL=RendererGL;
M.QUAL=QUAL;
})();