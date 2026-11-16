/* js/app.js — интерфейс, ввод, единый цикл, авто-фолбэк, Telegram только внутри Telegram */
(function(){
"use strict";
const M=window.MAT;
const{clamp,lerp,rand,rgbCss,hex2rgb,mixRGB,smooth}=M;
const $=id=>document.getElementById(id);

function boot(){
  if(!M||!M.Sim){
    const f=$('fatal');if(f){f.hidden=false;$('fatalLog').textContent='не загрузился js/core.js — проверь папку js рядом с index.html';}
    return;
  }
  const sim=new M.Sim();
  const audio=new M.AudioEngine();
  const haptics=new M.Haptics();
  sim.reduced=!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  if(sim.reduced)sim.intro.a=1;

  /* сохранённое состояние */
  const KEY='materia.v1';
  let saved=null;
  try{saved=JSON.parse(localStorage.getItem(KEY)||'null');}catch(e){}
  if(saved){
    if(saved.settings)for(const k in sim.settings)if(k in saved.settings)sim.settings[k]=saved.settings[k];
    if(saved.counters)Object.assign(sim.counters,saved.counters);
    if(!M.THEMES[sim.settings.theme])sim.settings.theme='ocean';
    if(!M.QUAL[sim.settings.quality])sim.settings.quality='bal';
  }
  let saveT=null;
  const save=()=>{clearTimeout(saveT);saveT=setTimeout(()=>{
    try{localStorage.setItem(KEY,JSON.stringify({settings:sim.settings,counters:sim.counters}));}catch(e){}},700);};

  /* рендерер: WebGL, при неудаче — свежий canvas и 2D */
  const stage=$('stage');
  let canvas=$('view');
  let renderer=null,glMode=false,fatalShown=false;

  function showFatal(msg){
    fatalShown=true;
    const f=$('fatal');
    f.hidden=false;
    $('fatalLog').textContent=String(msg||'').slice(0,300);
    $('hint').classList.add('hidden');
  }
  function freshCanvas(){
    const old=$('view');
    const nw=old.cloneNode(false);
    nw.classList.remove('grabbing');
    old.parentNode.replaceChild(nw,old);
    return nw;
  }
  function buildRenderer(){
    try{
      renderer=new M.RendererGL(canvas,sim,()=>toast('графика перезапущена','warn'));
      glMode=true;
    }catch(err){
      console.warn('[материя] WebGL не запустился, включаю 2D:',err&&err.message);
      canvas=freshCanvas();
      try{
        renderer=new M.Renderer2D(canvas,sim);
        glMode=false;
      }catch(err2){
        console.error('[материя] 2D тоже недоступен:',err2);
        showFatal(err&&err.message);
        renderer=null;
      }
    }
  }
  buildRenderer();

  function updateModeBadge(){
    if(!renderer)return;
    const txt=renderer.modeName+' · '+sim.settings.quality;
    $('helpMode').textContent='рендер: '+txt;
    $('renderBadge').textContent='· '+renderer.modeName.toLowerCase();
  }

  /* Telegram подключается только внутри Telegram — в обычном браузере скрипта нет */
  let tg=null;
  const setVH=()=>{
    const h=(tg&&tg.viewportStableHeight)||window.innerHeight;
    document.documentElement.style.setProperty('--app-h',h+'px');
  };
  const inTG=/tgWebAppData|tgWebAppVersion|tgWebAppPlatform/.test(location.hash+' '+location.search);
  if(inTG){
    const sc=document.createElement('script');
    sc.src='https://telegram.org/js/telegram-web-app.js';
    sc.onload=()=>{
      try{
        tg=window.Telegram&&window.Telegram.WebApp;
        if(!tg)return;
        tg.ready();tg.expand();
        if(tg.disableVerticalSwipes)tg.disableVerticalSwipes();
        if(tg.setHeaderColor)tg.setHeaderColor('#05070f');
        if(tg.setBackgroundColor)tg.setBackgroundColor('#05070f');
        if(tg.onEvent)tg.onEvent('viewportChanged',setVH);
        setVH();
      }catch(e){}
    };
    sc.onerror=()=>{};
    document.head.appendChild(sc);
  }
  setVH();

  const doResize=()=>{
    const r=stage.getBoundingClientRect();
    if(renderer)renderer.resize(r.width,r.height);
    setVH();
  };
  if(window.ResizeObserver)new ResizeObserver(doResize).observe(stage);
  window.addEventListener('resize',doResize);
  if(window.visualViewport)window.visualViewport.addEventListener('resize',doResize);
  doResize();
  updateModeBadge();

  /* тосты */
  const toastsEl=$('toasts');
  function toast(msg,kind){
    const el=document.createElement('div');
    el.className='toast'+(kind?' '+kind:'');
    el.textContent=msg;
    toastsEl.appendChild(el);
    while(toastsEl.children.length>3)toastsEl.firstChild.remove();
    setTimeout(()=>{el.classList.add('out');setTimeout(()=>el.remove(),350);},2400);
  }

  /* элементы управления */
  const hSlider=$('hSlider'),hVal=$('hVal');
  const sizeS=$('sizeSlider'),sizeV=$('sizeVal');
  const elasS=$('elasSlider'),elasV=$('elasVal');
  const glowS=$('glowSlider'),glowV=$('glowVal');
  const partS=$('partSlider'),partV=$('partVal');
  const zoneTicks=Array.prototype.slice.call($('zoneTicks').children);
  const chipName=$('chipName'),chipPct=$('chipPct'),chipIcon=$('chipIcon');
  const healBtn=$('healBtn'),statsEl=$('stats');
  const fillVar=el=>{const p=(el.value-el.min)/(el.max-el.min)*100;el.style.setProperty('--val',p+'%');};

  function updateStats(){statsEl.textContent='замесы '+sim.counters.squeezes+' · трещины '+sim.counters.cracks+' · кинцуги '+sim.counters.heals;}
  function updateHealPulse(){healBtn.classList.toggle('pulse',sim.cracks.some(c=>!c.healed));}
  function syncUI(){
    hSlider.value=Math.round(sim.settings.hardness*100);hVal.textContent=hSlider.value+'%';fillVar(hSlider);
    sizeS.value=Math.round(sim.settings.size*100);sizeV.textContent=sim.settings.size.toFixed(2);fillVar(sizeS);
    elasS.value=Math.round(sim.settings.elasticity*100);elasV.textContent=elasS.value;fillVar(elasS);
    glowS.value=Math.round(sim.settings.glow*100);glowV.textContent=glowS.value;fillVar(glowS);
    partS.value=Math.round(sim.settings.particles*100);partV.textContent=partS.value;fillVar(partS);
    const z=M.zoneOf(sim.settings.hardness);
    zoneTicks.forEach((t,i)=>t.classList.toggle('on',i===z));
    chipName.textContent=M.ZONES[z].name;
    chipIcon.innerHTML=M.ZONES[z].icon;
    hSlider.setAttribute('aria-valuetext',M.ZONES[z].name+' '+hSlider.value+'%');
    document.querySelectorAll('#themeDots .theme-dot').forEach(d=>d.classList.toggle('on',d.dataset.t===sim.settings.theme));
    const ai=$('accentInput');if(ai)ai.value=sim.settings.accent;
    document.querySelectorAll('#qualSeg button').forEach(b=>b.classList.toggle('on',b.dataset.q===sim.settings.quality));
    $('vibChip').classList.toggle('on',sim.settings.haptics);
    $('vibChip').setAttribute('aria-pressed',String(sim.settings.haptics));
    $('rotChip').classList.toggle('on',sim.settings.autorotate);
    $('rotChip').setAttribute('aria-pressed',String(sim.settings.autorotate));
    updateSoundBtn();updateStats();updateHealPulse();
  }

  hSlider.addEventListener('input',()=>{
    sim.setHardness(hSlider.value/100);
    hVal.textContent=hSlider.value+'%';fillVar(hSlider);
    const z=M.zoneOf(sim.settings.hardness);
    zoneTicks.forEach((t,i)=>t.classList.toggle('on',i===z));
    chipName.textContent=M.ZONES[z].name;chipIcon.innerHTML=M.ZONES[z].icon;
    hSlider.setAttribute('aria-valuetext',M.ZONES[z].name+' '+hSlider.value+'%');
    save();
  });
  sizeS.addEventListener('input',()=>{sim.settings.size=sizeS.value/100;sizeV.textContent=sim.settings.size.toFixed(2);fillVar(sizeS);save();});
  elasS.addEventListener('input',()=>{sim.settings.elasticity=elasS.value/100;elasV.textContent=elasS.value;fillVar(elasS);save();});
  glowS.addEventListener('input',()=>{sim.settings.glow=glowS.value/100;glowV.textContent=glowS.value;fillVar(glowS);save();});
  partS.addEventListener('input',()=>{sim.settings.particles=partS.value/100;partV.textContent=partS.value;fillVar(partS);save();});

  const dotsWrap=$('themeDots');
  Object.keys(M.THEMES).forEach(key=>{
    const th=M.THEMES[key];
    const b=document.createElement('button');
    b.className='theme-dot';b.dataset.t=key;b.title=th.name;
    b.setAttribute('aria-label','тема: '+th.name);
    b.style.background=th.dot;
    b.addEventListener('click',()=>{
      audio.unlock();sim.settings.theme=key;sim.settings.accent=th.rim;
      audio.tick();haptics.impact('light');syncUI();save();
    });
    dotsWrap.appendChild(b);
  });
  const accWrap=document.createElement('label');
  accWrap.className='accent-wrap';accWrap.title='свой оттенок свечения';
  const acc=document.createElement('input');
  acc.type='color';acc.id='accentInput';acc.value=sim.settings.accent;
  acc.setAttribute('aria-label','свой оттенок свечения');
  acc.addEventListener('input',()=>{sim.settings.accent=acc.value;save();});
  accWrap.appendChild(acc);dotsWrap.appendChild(accWrap);

  document.querySelectorAll('#qualSeg button').forEach(b=>{
    b.addEventListener('click',()=>{
      audio.unlock();
      sim.settings.quality=b.dataset.q;
      if(renderer)renderer.setQuality(b.dataset.q);
      doResize();updateModeBadge();
      audio.tick();haptics.impact('light');syncUI();save();
    });
  });

  $('vibChip').addEventListener('click',()=>{
    sim.settings.haptics=!sim.settings.haptics;
    haptics.enabled=sim.settings.haptics;
    if(sim.settings.haptics)haptics.impact('medium');
    syncUI();save();
  });
  $('rotChip').addEventListener('click',()=>{sim.settings.autorotate=!sim.settings.autorotate;audio.tick();syncUI();save();});
  haptics.enabled=sim.settings.haptics;

  const soundBtn=$('soundBtn');
  const SND_ON='<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>';
  const SND_OFF='<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 9l6 6M22 9l-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  function updateSoundBtn(){
    const on=sim.settings.sound;
    soundBtn.setAttribute('aria-pressed',String(on));
    $('soundIcon').innerHTML=on?SND_ON:SND_OFF;
    $('soundLabel').textContent=on?'звук':'тихо';
  }
  soundBtn.addEventListener('click',()=>{
    audio.unlock();
    sim.settings.sound=!sim.settings.sound;
    audio.setMuted(!sim.settings.sound);
    updateSoundBtn();
    if(sim.settings.sound)audio.tick();
    save();
  });
  audio.muted=!sim.settings.sound;

  healBtn.addEventListener('click',()=>{audio.unlock();sim.heal();});
  $('resetBtn').addEventListener('click',()=>{audio.unlock();sim.reset();});
  $('shotBtn').addEventListener('click',()=>{
    audio.unlock();audio.shutter();haptics.impact('light');
    if(!renderer){toast('снимок недоступен без графики','warn');return;}
    try{
      renderer.snapshot(blob=>{
        if(!blob){toast('снимок не получился','warn');return;}
        const name='materia-'+M.ZONES[M.zoneOf(sim.settings.hardness)].name+'-'+Date.now()+'.png';
        let file=null;
        try{file=new File([blob],name,{type:'image/png'});}catch(e){}
        if(file&&navigator.canShare&&navigator.canShare({files:[file]})){
          navigator.share({files:[file]}).then(()=>toast('снимок отправлен','ok')).catch(()=>download(blob,name));
        }else download(blob,name);
      });
    }catch(e){toast('снимок не получился','warn');}
  });
  function download(blob,name){
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download=name;
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),4000);
    toast('снимок сохранён','ok');
  }

  let tweenId=null;
  $('randBtn').addEventListener('click',()=>{
    audio.unlock();audio.dice();haptics.impact('medium');
    const from={h:sim.settings.hardness,size:sim.settings.size,e:sim.settings.elasticity,g:sim.settings.glow};
    const soft=Math.random()<.6;
    const to={h:soft?rand(.05,.5):rand(.5,.95),size:rand(.8,1.35),e:rand(.3,.95),g:rand(.6,1.6)};
    const keys=Object.keys(M.THEMES).filter(k=>k!==sim.settings.theme);
    sim.settings.theme=keys[(Math.random()*keys.length)|0];
    sim.settings.accent=M.THEMES[sim.settings.theme].rim;
    const t0=performance.now(),dur=500;
    if(tweenId)cancelAnimationFrame(tweenId);
    const step=()=>{
      const k=clamp((performance.now()-t0)/dur,0,1),e=1-Math.pow(1-k,3);
      sim.setHardness(lerp(from.h,to.h,e));
      sim.settings.size=lerp(from.size,to.size,e);
      sim.settings.elasticity=lerp(from.e,to.e,e);
      sim.settings.glow=lerp(from.g,to.g,e);
      syncUI();
      if(k<1)tweenId=requestAnimationFrame(step);else{tweenId=null;save();}
    };
    tweenId=requestAnimationFrame(step);
    toast('новая материя: '+M.ZONES[M.zoneOf(to.h)].name+' · '+M.THEMES[sim.settings.theme].name,'ok');
  });

  const help=$('help');
  $('helpBtn').addEventListener('click',()=>{audio.unlock();audio.tick();help.hidden=false;});
  $('helpClose').addEventListener('click',()=>{help.hidden=true;});
  help.addEventListener('click',e=>{if(e.target===help)help.hidden=true;});
  window.addEventListener('keydown',e=>{if(e.key==='Escape')help.hidden=true;});

  const hint=$('hint');
  if(saved)hint.classList.add('hidden');
  const hideHint=()=>hint.classList.add('hidden');

  /* события материи */
  const themeCols=()=>{
    const th=M.THEMES[sim.settings.theme]||M.THEMES.ocean;
    return{
      bright:mixRGB(hex2rgb(th.liqBright),hex2rgb(th.solBright),smooth(clamp((sim.settings.hardness-.25)/.6,0,1))),
      ice:hex2rgb('#bfe3ff'),stone:hex2rgb('#9aa3b8')
    };
  };
  sim.on('zone',()=>{audio.tick();haptics.impact('medium');});
  sim.on('grab',()=>{hideHint();haptics.impact('light');});
  sim.on('count',()=>{updateStats();save();});
  sim.on('tap',d=>{
    if(sim.settings.hardness>.55){audio.creak(sim.stress);haptics.impact('medium');}
    else{
      audio.blop();haptics.impact('light');
      if(renderer&&Math.random()<.5)renderer.droplets(d.dir,.2,themeCols().bright);
    }
  });
  sim.on('release',d=>{
    const h=sim.settings.hardness,pow=Math.max(Math.abs(d.depth),d.stretch);
    if(pow>.06)audio.boing(h,pow);
    if(renderer&&(d.stretch>.25||(h<.4&&Math.abs(d.depth)>.3)))
      renderer.droplets(d.dir,d.stretch||Math.abs(d.depth),themeCols().bright);
    if(pow>.25)haptics.impact('light');
    updateStats();
  });
  sim.on('crack',d=>{
    const c=themeCols();
    if(renderer){
      renderer.paintCrack(d.crack);
      renderer.shards(d.crack.dir,26,sim.settings.hardness<.8?c.ice:c.stone);
      renderer.shake(.5);renderer.flash(.45);
    }
    audio.crack(sim.settings.hardness);
    haptics.impact('heavy');haptics.notify('warning');
    toast('трещина. выдохни — или залей золотом','warn');
    updateHealPulse();
  });
  sim.on('burst',()=>{
    const c=themeCols();
    if(renderer){
      renderer.clearCracks();
      renderer.shards([0,0,1],120,c.bright);
      renderer.shards([0,1,0],80,c.ice);
      renderer.shake(1);renderer.flash(.9);
    }
    audio.burst();haptics.notify('error');
    toast('разбилось. сейчас соберётся заново','danger');
    updateHealPulse();
  });
  sim.on('reform',()=>{
    if(renderer)renderer.goldSparks(40);
    audio.reform();haptics.notify('success');
    toast('собрано. чище, чем было','ok');
    updateHealPulse();
  });
  sim.on('heal',()=>{
    if(renderer){renderer.paintGold();renderer.goldSparks(70);}
    audio.heal();haptics.notify('success');
    toast('кинцуги: шрамы стали золотом','gold');
    updateHealPulse();
  });
  sim.on('healEmpty',()=>{audio.tick();toast('пока целое. надави подольше, когда твёрже','warn');});
  sim.on('reset',()=>{
    if(renderer)renderer.clearCracks();
    audio.reform();toast('материя обновлена','ok');updateHealPulse();
  });

  /* ввод — перепривязываемый, чтобы фолбэк мог подменить canvas */
  const pointers=new Map();
  let mode=null,pinchD=0,lastTapT=0,inputAC=null;
  function attachInput(cv){
    if(inputAC)inputAC.abort();
    pointers.clear();mode=null;
    const hasAC=typeof AbortController!=='undefined';
    inputAC=hasAC?new AbortController():null;
    const opt=hasAC?{signal:inputAC.signal}:undefined;
    const optNP=hasAC?{passive:false,signal:inputAC.signal}:{passive:false};
    const localXY=e=>{const r=cv.getBoundingClientRect();return[e.clientX-r.left,e.clientY-r.top];};
    cv.addEventListener('contextmenu',e=>e.preventDefault(),opt);
    cv.addEventListener('pointerdown',e=>{
      audio.unlock();hideHint();
      if(!renderer)return;
      try{cv.setPointerCapture(e.pointerId);}catch(err){}
      const xy=localXY(e),x=xy[0],y=xy[1];
      pointers.set(e.pointerId,{x,y});
      if(pointers.size===2){
        if(sim.grab)sim.pointerUp();
        mode='pinch';
        const pts=Array.from(pointers.values());
        pinchD=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);
        return;
      }
      const pick=renderer.pick(x,y);
      const now=performance.now();
      if(pick.hit&&now-lastTapT<280){sim.tap(pick.dir,true);lastTapT=0;}
      else lastTapT=now;
      if(sim.pointerDown(pick,e.pressure))mode='knead';
      else mode='orbit';
      cv.classList.add('grabbing');
    },opt);
    cv.addEventListener('pointermove',e=>{
      const p=pointers.get(e.pointerId);
      if(!p||!renderer)return;
      const xy=localXY(e),x=xy[0],y=xy[1];
      const dx=x-p.x,dy=y-p.y;
      p.x=x;p.y=y;
      if(mode==='pinch'&&pointers.size===2){
        const pts=Array.from(pointers.values());
        const d=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);
        if(pinchD>0)renderer.zoom(pinchD/Math.max(d,1));
        pinchD=d;
        renderer.orbit(dx*.5,dy*.5);
        return;
      }
      if(mode==='knead')sim.pointerMove(renderer.pick(x,y));
      else if(mode==='orbit')renderer.orbit(dx,dy);
    },opt);
    const endPointer=e=>{
      pointers.delete(e.pointerId);
      if(pointers.size===0){
        if(mode==='knead')sim.pointerUp();
        mode=null;cv.classList.remove('grabbing');
      }else if(pointers.size===1&&mode==='pinch')mode='orbit';
    };
    cv.addEventListener('pointerup',endPointer,opt);
    cv.addEventListener('pointercancel',endPointer,opt);
    cv.addEventListener('lostpointercapture',endPointer,opt);
    cv.addEventListener('wheel',e=>{
      e.preventDefault();
      if(renderer)renderer.zoom(Math.exp(e.deltaY*.0012));
    },optNP);
    cv.addEventListener('keydown',e=>{
      if(!renderer)return;
      const k=e.key;let used=true;
      if(k==='ArrowLeft')renderer.orbit(-24,0);
      else if(k==='ArrowRight')renderer.orbit(24,0);
      else if(k==='ArrowUp')renderer.orbit(0,-24);
      else if(k==='ArrowDown')renderer.orbit(0,24);
      else if(k==='+'||k==='=')renderer.zoom(.88);
      else if(k==='-')renderer.zoom(1.14);
      else if(k===' '){audio.unlock();sim.tap(renderer.viewDir(),true);}
      else if(k==='h'||k==='H'||k==='р'||k==='Р'){audio.unlock();sim.heal();}
      else if(k==='r'||k==='R'||k==='к'||k==='К'){audio.unlock();sim.reset();}
      else used=false;
      if(used)e.preventDefault();
    },opt);
  }
  document.addEventListener('gesturestart',e=>e.preventDefault());
  if(renderer)attachInput(canvas);

  function switchTo2D(reason){
    if(!glMode||fatalShown)return;
    console.warn('[материя] переключаюсь на 2D:',reason);
    canvas=freshCanvas();
    try{
      renderer=new M.Renderer2D(canvas,sim);
      glMode=false;
      attachInput(canvas);
      doResize();updateModeBadge();
      toast('включён упрощённый рендер','warn');
    }catch(e){showFatal(e&&e.message);}
  }

  /* единый цикл */
  const stressWrap=$('stressWrap'),stressFill=$('stressFill');
  let raf=null,lastT=performance.now(),running=false,renderFails=0;
  let creakT=0,blipT=0,lastStress=0,lastPct=-1,lastMatCss='';
  function frame(now){
    raf=requestAnimationFrame(frame);
    let dt=(now-lastT)/1000;lastT=now;
    dt=clamp(dt,0,.05);
    sim.update(dt);
    const t=sim.time;
    if(renderer){
      try{renderer.render(t,dt);renderFails=0;}
      catch(err){
        renderFails++;
        if(renderFails===1)console.warn('[материя] ошибка рендера:',err);
        if(renderFails>3)switchTo2D(err&&err.message);
      }
    }
    const g=sim.grab,h=sim.settings.hardness;
    if(g){
      const inten=clamp(g.speed*.25+Math.abs(sim.dents[0].a)*1.2,0,1);
      audio.setSquish(inten,h);
      if(g.speed>1.5)haptics.dragTick();
      if(h<.45&&g.speed>2&&now-blipT>220&&Math.random()<.4){blipT=now;audio.blop();}
      if(sim.mp.crackable&&sim.stress>lastStress+.001&&now-creakT>130){creakT=now;audio.creak(sim.stress);}
    }else audio.setSquish(0,h);
    lastStress=sim.stress;
    const show=sim.stress>.04;
    stressWrap.classList.toggle('show',show);
    stressWrap.classList.toggle('hot',sim.stress>.75);
    if(show)stressFill.style.width=Math.min(sim.stress*100,100)+'%';
    const pct=Math.round(h*100);
    if(pct!==lastPct){lastPct=pct;chipPct.textContent=pct+'%';}
    const css=rgbCss(themeCols().bright);
    if(css!==lastMatCss){lastMatCss=css;document.documentElement.style.setProperty('--mat',css);}
  }
  function start(){if(running)return;running=true;lastT=performance.now();raf=requestAnimationFrame(frame);}
  function stop(){running=false;if(raf)cancelAnimationFrame(raf);raf=null;}
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){stop();audio.suspend();}
    else{start();audio.resume();}
  });

  syncUI();
  if(!fatalShown){
    start();
    if(!saved)setTimeout(()=>toast('води мышью по материи — она живая','ok'),1100);
    if(!glMode)setTimeout(()=>toast('WebGL недоступен — работаю в 2D','warn'),1600);
  }
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);
else boot();
})();