import { clamp, createShell, createCanvasTools, createAudio, loadHighScore, saveHighScore, bindWorkflow, registerArcadeNode } from "./arcade_common.js";

const EXTENSION_NAME="spb1234t.ComfyMissileCommand.V16", NODE_NAME="ComfyMissileCommandSPB1234T";
function createGame(node){
    const ui=createShell({aria:"Comfy Missile Command. Move mouse to aim, click to fire. Arrow keys also move crosshair; Space fires.",columns:4,accent:"#ff2c2c"});
    const {root,hud,canvas,canvasWrap,statusDot,statusEl,soundBtn,volumeSlider,newBtn,pauseBtn}=ui;
    const scoreEl=document.createElement("div"),highEl=document.createElement("div"),ammoEl=document.createElement("div"),levelEl=document.createElement("div");
    scoreEl.style.color="#ff2d2d";highEl.style.color="#ff2d2d";ammoEl.style.color="#2a36ff";levelEl.style.color="#fff500";highEl.style.textAlign=ammoEl.style.textAlign="center";levelEl.style.textAlign="right";hud.append(scoreEl,highEl,ammoEl,levelEl);
    const cv=createCanvasTools(canvas),ctx=cv.ctx,audio=createAudio("comfyMissileCommand",soundBtn,volumeSlider,.35,"MissileCommand",["launch.wav","explosion.wav","enemy_explosion.wav","city_destroyed.wav","level_complete.wav"]);
    let score=0,highScore=loadHighScore("comfyMissileCommandHighScore"),level=1,state="idle",beforePause="playing",workflowRunning=false,hasStarted=false;
    let cities=[],bases=[],incoming=[],interceptors=[],explosions=[],cross={x:.5,y:.48},spawnTimer=0,waveLeft=0,ready=.7,gameTime=0;
    let raf=0,last=performance.now(),acc=0,visible=true,destroyed=false;
    function makeGround(){cities=[.16,.28,.40,.60,.72,.84].map((x,i)=>({x,alive:true,i}));bases=[.07,.5,.93].map((x,i)=>({x,ammo:10,i,alive:true}));}
    function newWave(){incoming=[];interceptors=[];explosions=[];for(const b of bases)b.ammo=10;waveLeft=8+level*3;spawnTimer=.6;ready=.65;state="ready";updateHud();}
    function newGame(){score=0;level=1;makeGround();newWave();canvas.focus({preventScroll:true});}
    function high(){if(score>highScore){highScore=score;saveHighScore("comfyMissileCommandHighScore",highScore);}updateHud();}
    function ammoCount(){return bases.reduce((a,b)=>a+b.ammo,0);}
    function updateHud(){scoreEl.textContent=`SCORE ${String(score).padStart(5,"0")}`;highEl.textContent=`HI ${String(highScore).padStart(5,"0")}`;ammoEl.textContent=`MISSILES ${ammoCount()}`;levelEl.textContent=`WAVE ${level}`;pauseBtn.textContent=state==="paused"?"RESUME":"PAUSE";statusDot.style.background=workflowRunning?"#58d68d":(hasStarted?"#ff3333":"#6d7485");statusEl.textContent=state==="idle"?"QUEUE A WORKFLOW OR CLICK TO START":state==="gameover"?"GAME OVER • R OR NEW":state==="paused"?"PAUSED • P TO RESUME":"MOUSE AIM + CLICK • ARROWS + SPACE";}
    const sndLaunch=()=>audio.sample("launch.wav",()=>audio.tone(440,.10,{type:"sawtooth",endFreq:170,gain:.045}));
    const sndBoom=()=>audio.sample("explosion.wav",()=>{audio.tone(115,.16,{type:"square",endFreq:50,gain:.07});audio.noise(.13,.05);});
    const sndEnemyBoom=()=>audio.sample("enemy_explosion.wav",()=>{audio.tone(150,.10,{type:"square",endFreq:72,gain:.05});audio.noise(.08,.035);});
    const sndCity=()=>audio.sample("city_destroyed.wav",()=>{audio.tone(190,.32,{type:"sawtooth",endFreq:45,gain:.085});audio.noise(.25,.06);});
    const sndWave=()=>audio.sample("level_complete.wav",()=>[520,680,880].forEach((f,i)=>audio.tone(f,.08,{delay:i*.09,gain:.055})));
    function targetPoints(){const a=[];for(const c of cities)if(c.alive)a.push({type:"city",ref:c,x:c.x,y:.91});for(const b of bases)if(b.alive)a.push({type:"base",ref:b,x:b.x,y:.91});return a;}
    function spawnIncoming(){const t=targetPoints();if(!t.length)return;const target=t[(Math.random()*t.length)|0];const startX=.08+Math.random()*.84;incoming.push({sx:startX,sy:.03,x:startX,y:.03,tx:target.x,ty:target.y,target,alive:true,speed:.055+level*.006,split:Math.random()<Math.min(.28,level*.035)&&level>2});waveLeft--;}
    function nearestBase(x){let choices=bases.filter(b=>b.alive&&b.ammo>0);if(!choices.length)return null;choices.sort((a,b)=>Math.abs(a.x-x)-Math.abs(b.x-x));return choices[0];}
    function fire(x=cross.x,y=cross.y){if(state==="idle"||state==="gameover"){newGame();return;}if(state!=="playing")return;const b=nearestBase(x);if(!b)return;b.ammo--;updateHud();sndLaunch();interceptors.push({sx:b.x,sy:.90,x:b.x,y:.90,tx:clamp(x,.04,.96),ty:clamp(y,.08,.82),p:0,alive:true});}
    function makeExplosion(x,y,max=.095){explosions.push({x,y,r:.006,max,life:0,phase:"grow",alive:true});sndBoom();}
    function destroyTarget(t){if(!t?.ref?.alive)return;t.ref.alive=false;if(t.type==="city")sndCity();else t.ref.ammo=0;}
    function update(dt){if(["idle","paused","gameover"].includes(state))return;gameTime+=dt;if(state==="ready"){ready-=dt;if(ready<=0)state="playing";updateHud();return;}
        spawnTimer-=dt;if(waveLeft>0&&spawnTimer<=0){spawnIncoming();spawnTimer=Math.max(.32,1.15-level*.045)*(0.72+Math.random()*.65);}
        for(const m of incoming){if(!m.alive)continue;const dx=m.tx-m.x,dy=m.ty-m.y,d=Math.hypot(dx,dy);if(d<.006){m.alive=false;destroyTarget(m.target);makeExplosion(m.tx,m.ty,.055);continue;}m.x+=dx/d*m.speed*dt;m.y+=dy/d*m.speed*dt;
            if(m.split&&m.y>.34&&m.y<.36){m.split=false;const ts=targetPoints();for(let j=0;j<2&&ts.length;j++){const t=ts[(Math.random()*ts.length)|0];incoming.push({sx:m.x,sy:m.y,x:m.x,y:m.y,tx:t.x,ty:t.y,target:t,alive:true,speed:m.speed*1.05,split:false});}}
        }
        for(const s of interceptors){if(!s.alive)continue;s.p+=dt*1.45;s.x=s.sx+(s.tx-s.sx)*Math.min(1,s.p);s.y=s.sy+(s.ty-s.sy)*Math.min(1,s.p);if(s.p>=1){s.alive=false;makeExplosion(s.tx,s.ty,.095);}}
        for(const e of explosions){if(!e.alive)continue;e.life+=dt;if(e.phase==="grow"){e.r+=dt*.14;if(e.r>=e.max)e.phase="hold";}else if(e.phase==="hold"){if(e.life>.55)e.phase="shrink";}else{e.r-=dt*.12;if(e.r<=0)e.alive=false;}
            for(const m of incoming){if(!m.alive)continue;if(Math.hypot(m.x-e.x,m.y-e.y)<e.r){m.alive=false;score+=25;high();sndEnemyBoom();if(Math.random()<.35)makeExplosion(m.x,m.y,.045);}}
        }
        incoming=incoming.filter(m=>m.alive);interceptors=interceptors.filter(s=>s.alive);explosions=explosions.filter(e=>e.alive);
        if(waveLeft<=0&&incoming.length===0&&interceptors.length===0&&explosions.length===0){const aliveCities=cities.filter(c=>c.alive).length;if(aliveCities<=0){state="gameover";high();updateHud();return;}score+=aliveCities*100+ammoCount()*5;high();sndWave();level++;newWave();}
        if(cities.every(c=>!c.alive)){state="gameover";high();updateHud();}
    }
    function citySprite(x,y,s){ctx.fillStyle="#193cff";for(let i=-2;i<=2;i++){const h=s*(.22+.12*((i*i+3)%3));ctx.fillRect(x+i*s*.16-s*.06,y-h,s*.12,h);}ctx.fillStyle="#ffff12";ctx.fillRect(x-s*.48,y-s*.08,s*.96,s*.12);}
    function baseSprite(x,y,s,b){ctx.fillStyle=b.alive?"#ffff13":"#513e00";ctx.beginPath();ctx.moveTo(x-s*.55,y);ctx.lineTo(x-s*.38,y-s*.26);ctx.lineTo(x+s*.38,y-s*.26);ctx.lineTo(x+s*.55,y);ctx.closePath();ctx.fill();if(b.alive){ctx.fillStyle="#193cff";for(let i=0;i<Math.min(10,b.ammo);i++)ctx.fillRect(x-s*.34+(i%5)*s*.14,y-s*.18-Math.floor(i/5)*s*.08,s*.05,s*.06);}}
    function draw(){cv.begin();const W=cv.W,H=cv.H;if(W<16||H<16)return;ctx.fillStyle="#000";ctx.fillRect(0,0,W,H);
        // red score-like digits at the top inside the cabinet playfield
        ctx.font=`900 ${Math.max(12,H*.034)}px monospace`;ctx.textAlign="left";ctx.fillStyle="#ff1616";ctx.fillText(String(score),W*.17,H*.055);ctx.textAlign="right";ctx.fillText(String(highScore),W*.64,H*.055);
        // Incoming red missile trails.
        ctx.strokeStyle="#ff1919";ctx.lineWidth=Math.max(1,H*.003);for(const m of incoming){ctx.beginPath();ctx.moveTo(m.sx*W,m.sy*H);ctx.lineTo(m.x*W,m.y*H);ctx.stroke();ctx.fillStyle="#ff22d5";ctx.fillRect(m.x*W-2,m.y*H-2,4,4);}
        // Interceptor trails in red, matching the sparse original look.
        ctx.strokeStyle="#ff3030";for(const s of interceptors){ctx.beginPath();ctx.moveTo(s.sx*W,s.sy*H);ctx.lineTo(s.x*W,s.y*H);ctx.stroke();}
        // Explosions: blocky magenta circles.
        for(const e of explosions){ctx.fillStyle=e.phase==="shrink"?"#ff3cff":"#ff00ff";ctx.beginPath();ctx.arc(e.x*W,e.y*H,e.r*Math.min(W,H),0,Math.PI*2);ctx.fill();}
        // Crosshair.
        const cx=cross.x*W,cy=cross.y*H;ctx.strokeStyle="#1739ff";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(cx-10,cy);ctx.lineTo(cx+10,cy);ctx.moveTo(cx,cy-10);ctx.lineTo(cx,cy+10);ctx.stroke();
        // Ground silhouette and cities/bases.
        ctx.fillStyle="#fff913";ctx.beginPath();ctx.moveTo(0,H*.94);ctx.lineTo(0,H*.90);ctx.lineTo(W*.05,H*.86);ctx.lineTo(W*.11,H*.90);ctx.lineTo(W*.16,H*.89);ctx.lineTo(W*.22,H*.92);ctx.lineTo(W*.31,H*.91);ctx.lineTo(W*.38,H*.87);ctx.lineTo(W*.47,H*.91);ctx.lineTo(W*.56,H*.88);ctx.lineTo(W*.65,H*.91);ctx.lineTo(W*.75,H*.89);ctx.lineTo(W*.84,H*.91);ctx.lineTo(W*.93,H*.86);ctx.lineTo(W,H*.90);ctx.lineTo(W,H*.94);ctx.closePath();ctx.fill();
        for(const c of cities)if(c.alive)citySprite(c.x*W,H*.91,H*.075);for(const b of bases)baseSprite(b.x*W,H*.91,H*.08,b);
        if(["idle","ready","paused","gameover"].includes(state)){ctx.textAlign="center";ctx.fillStyle="#ff1b1b";ctx.font=`900 ${Math.max(15,H*.042)}px monospace`;const t=state==="idle"?"MISSILE COMMAND":state==="paused"?"PAUSED":state==="gameover"?"GAME OVER":"DEFEND CITIES";ctx.fillText(t,W/2,H*.49);ctx.fillStyle="#1b35ff";ctx.font=`700 ${Math.max(9,H*.021)}px monospace`;ctx.fillText(state==="idle"?"CLICK TO START • MOUSE AIM":state==="gameover"?"PRESS R OR NEW":"CLICK / SPACE TO FIRE",W/2,H*.54);}
    }
    function togglePause(){if(state==="idle"||state==="gameover"){newGame();return;}state=state==="paused"?beforePause:(beforePause=state,"paused");updateHud();}
    function pointerPos(e){const r=canvas.getBoundingClientRect();cross.x=clamp((e.clientX-r.left)/r.width,.03,.97);cross.y=clamp((e.clientY-r.top)/r.height,.05,.88);}
    canvas.addEventListener("pointermove",e=>pointerPos(e));canvas.addEventListener("pointerdown",e=>{e.stopPropagation();audio.ensure();pointerPos(e);canvas.focus({preventScroll:true});if(state==="idle"||state==="gameover")newGame();else fire();});
    function key(e){const k=e.key;if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"," ","Spacebar","p","P","r","R"].includes(k))e.preventDefault();audio.ensure();const step=.025;if(k==="ArrowLeft")cross.x=clamp(cross.x-step,.03,.97);else if(k==="ArrowRight")cross.x=clamp(cross.x+step,.03,.97);else if(k==="ArrowUp")cross.y=clamp(cross.y-step,.05,.88);else if(k==="ArrowDown")cross.y=clamp(cross.y+step,.05,.88);else if(k===" "||k==="Spacebar")fire();else if(/^[pP]$/.test(k))togglePause();else if(/^[rR]$/.test(k))newGame();}
    canvas.addEventListener("keydown",key);newBtn.addEventListener("click",e=>{e.stopPropagation();audio.ensure();newGame();});pauseBtn.addEventListener("click",e=>{e.stopPropagation();audio.ensure();togglePause();});
    const unbind=bindWorkflow({onStart(){workflowRunning=true;hasStarted=true;if(state==="idle"||state==="gameover")newGame();updateHud();},onEnd(){workflowRunning=false;updateHud();}});
    const ro=new ResizeObserver(()=>cv.resize());ro.observe(canvasWrap);const io=new IntersectionObserver(es=>visible=es.some(e=>e.isIntersecting));io.observe(root);
    function frame(now){if(destroyed)return;raf=requestAnimationFrame(frame);if(!visible||document.hidden){last=now;return;}const dt=Math.min(.05,Math.max(0,(now-last)/1000));last=now;acc+=dt;if(acc<1/30)return;const step=Math.min(.05,acc);acc=0;update(step);draw();}
    function destroy(){destroyed=true;cancelAnimationFrame(raf);ro.disconnect();io.disconnect();unbind();audio.close();}
    makeGround();updateHud();cv.resize();draw();raf=requestAnimationFrame(frame);return{root,destroy,resizeCanvas:cv.resize};
}
registerArcadeNode({extensionName:EXTENSION_NAME,nodeName:NODE_NAME,gameProp:"__comfyMissileGame",failProp:"__comfyMissileFail",patchProp:"__comfyMissilePatch",widgetName:"missile_command_game",createGame,minW:480,minH:560});
