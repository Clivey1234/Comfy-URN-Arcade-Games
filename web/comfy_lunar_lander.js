import { clamp, createShell, createCanvasTools, createAudio, loadHighScore, saveHighScore, bindWorkflow, registerArcadeNode } from "./arcade_common.js";

const EXTENSION_NAME = "spb1234t.ComfyLunarLander.V28";
const NODE_NAME = "ComfyLunarLanderSPB1234T";

function createGame(node) {
    const ui = createShell({
        aria: "Comfy Lunar Lander. Left and right arrows rotate. Up arrow fires the landing thruster.",
        columns: 4, accent: "#f2f2f2", minHeight: 420,
    });
    const { root, hud, canvas, canvasWrap, statusDot, statusEl, soundBtn, volumeSlider, newBtn, pauseBtn } = ui;
    const scoreEl=document.createElement("div"), hiEl=document.createElement("div"), fuelEl=document.createElement("div"), levelEl=document.createElement("div");
    scoreEl.style.color="#fff"; hiEl.style.color="#fff"; fuelEl.style.color="#fff"; levelEl.style.color="#fff";
    hiEl.style.textAlign=fuelEl.style.textAlign="center"; levelEl.style.textAlign="right"; hud.append(scoreEl,hiEl,fuelEl,levelEl);

    const cv=createCanvasTools(canvas), ctx=cv.ctx;
    const audio=createAudio("comfyLunarLander",soundBtn,volumeSlider,.35,"LunarLander",["thrust.wav","touchdown.wav","crash.wav","fuel_warning.wav","level_complete.wav"]);
    let highScore=loadHighScore("comfyLunarLanderHighScore"), score=0, level=1, lives=3, state="idle", beforePause="playing";
    let workflowRunning=false, hasStarted=false, ready=.7, gameTime=0, fuel=1000, warningTick=-1;
    let ship=null, terrain=[], pads=[], keys={left:false,right:false,thrust:false};
    let raf=0,last=performance.now(),acc=0,visible=true,destroyed=false, thrustLoop=false;

    function seeded(n){let a=(n*1664525+1013904223)>>>0;return()=>((a=(a*1664525+1013904223)>>>0)/4294967296);}
    function buildTerrain(){
        terrain=[]; pads=[]; const rnd=seeded(level*9173+41); const N=72;
        let y=.78+rnd()*.08;
        for(let i=0;i<N;i++){y=clamp(y+(rnd()-.5)*.055,.68,.92);terrain.push({x:i/(N-1),y});}
        const specs=[{x:.12,w:.11,m:2},{x:.48,w:.075,m:3},{x:.80,w:.05,m:5}];
        for(const sp of specs){
            const i0=Math.max(1,Math.floor(sp.x*(N-1))), i1=Math.min(N-2,Math.ceil((sp.x+sp.w)*(N-1)));
            let py=.86; for(let i=i0;i<=i1;i++) py=Math.min(py,terrain[i].y); py=clamp(py,.72,.88);
            for(let i=i0;i<=i1;i++) terrain[i].y=py;
            pads.push({x0:i0/(N-1),x1:i1/(N-1),y:py,m:sp.m});
        }
    }
    function groundAt(x){
        x=clamp(x,0,1); const f=x*(terrain.length-1), i=Math.min(terrain.length-2,Math.floor(f)), t=f-i;
        return terrain[i].y*(1-t)+terrain[i+1].y*t;
    }
    function currentPad(){return pads.find(p=>ship.x>=p.x0&&ship.x<=p.x1&&Math.abs(groundAt(ship.x)-p.y)<.005)||null;}
    function resetShip(){ship={x:.50,y:.12,vx:(Math.random()-.5)*.025,vy:.012,angle:(Math.random()-.5)*.08};fuel=1000;warningTick=-1;ready=.55;stopThrust();}
    function newGame(){score=0;level=1;lives=3;gameTime=0;buildTerrain();resetShip();state="ready";canvas.focus({preventScroll:true});updateHud();}
    function high(){if(score>highScore){highScore=score;saveHighScore("comfyLunarLanderHighScore",highScore);}updateHud();}
    function updateHud(){
        scoreEl.textContent=`SCORE ${String(score).padStart(5,"0")}`; hiEl.textContent=`HI ${String(highScore).padStart(5,"0")}`;
        fuelEl.textContent=`FUEL ${Math.max(0,Math.round(fuel))}`; levelEl.textContent=`L-${String(level).padStart(2,"0")}`;
        pauseBtn.textContent=state==="paused"?"RESUME":"PAUSE";
        statusDot.style.background=workflowRunning?"#58d68d":(hasStarted?"#fff":"#6d7485");
        statusEl.textContent=state==="idle"?"QUEUE A WORKFLOW OR CLICK TO START":state==="gameover"?"GAME OVER • R OR NEW":state==="paused"?"PAUSED • P TO RESUME":"← → ROTATE • ↑ THRUST";
    }
    function startThrust(){
        if(thrustLoop||!audio.enabled)return; audio.ensure(); thrustLoop=audio.loopSample("thrust.wav",()=>{},.55);
    }
    function stopThrust(){if(thrustLoop){audio.stopSampleLoop("thrust.wav");thrustLoop=false;}}
    const sndCrash=()=>audio.sample("crash.wav",()=>{audio.noise(.28,.07);audio.tone(130,.28,{type:"sawtooth",endFreq:45,gain:.07});});
    const sndTouch=()=>audio.sample("touchdown.wav",()=>audio.tone(540,.12,{endFreq:820,gain:.05}));
    const sndWarn=()=>audio.sample("fuel_warning.wav",()=>audio.tone(760,.08,{type:"square",endFreq:520,gain:.04}));
    const sndLevel=()=>audio.sample("level_complete.wav",()=>[520,680,880].forEach((f,i)=>audio.tone(f,.08,{delay:i*.08,gain:.045})));

    function landOrCrash(){
        stopThrust(); const pad=currentPad(); const safe=pad && Math.abs(ship.vx)<.045 && ship.vy<.075 && Math.abs(ship.angle)<.22;
        if(safe){score+=Math.round((200+fuel*.08)*pad.m);high();sndTouch();setTimeout(sndLevel,120);level++;buildTerrain();resetShip();state="ready";}
        else {sndCrash();lives--;if(lives<=0){state="gameover";high();}else{resetShip();state="ready";}updateHud();}
    }
    function update(dt){
        if(["idle","paused","gameover"].includes(state)){stopThrust();return;} gameTime+=dt;
        if(state==="ready"){ready-=dt;if(ready<=0)state="playing";updateHud();return;}
        const ROT=2.15, GRAV=.055+Math.min(.025,(level-1)*.0025), THRUST=.115;
        if(keys.left)ship.angle-=ROT*dt; if(keys.right)ship.angle+=ROT*dt; ship.angle=clamp(ship.angle,-Math.PI*.82,Math.PI*.82);
        if(keys.thrust && fuel>0){
            fuel=Math.max(0,fuel-85*dt); ship.vx+=Math.sin(ship.angle)*THRUST*dt; ship.vy-=Math.cos(ship.angle)*THRUST*dt; startThrust();
        } else stopThrust();
        ship.vy+=GRAV*dt; ship.x+=ship.vx*dt; ship.y+=ship.vy*dt;
        if(ship.x<0){ship.x=1; } else if(ship.x>1){ship.x=0;}
        const alt=Math.max(0,groundAt(ship.x)-ship.y);
        if(fuel<180){const tick=Math.floor(gameTime*2);if(tick!==warningTick){warningTick=tick;sndWarn();}} else warningTick=-1;
        if(ship.y+0.018>=groundAt(ship.x))landOrCrash();
        if(ship.y<-.08||ship.y>1.03)landOrCrash();
        updateHud();
    }

    function drawShip(x,y,size,angle,thrusting){
        ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.strokeStyle="#fff";ctx.lineWidth=Math.max(1,size*.055);ctx.lineJoin="round";ctx.lineCap="round";
        ctx.beginPath();ctx.moveTo(0,-size*.42);ctx.lineTo(size*.24,-size*.05);ctx.lineTo(size*.20,size*.25);ctx.lineTo(-size*.20,size*.25);ctx.lineTo(-size*.24,-size*.05);ctx.closePath();ctx.stroke();
        ctx.beginPath();ctx.moveTo(-size*.18,size*.12);ctx.lineTo(-size*.38,size*.38);ctx.lineTo(-size*.48,size*.38);ctx.moveTo(size*.18,size*.12);ctx.lineTo(size*.38,size*.38);ctx.lineTo(size*.48,size*.38);ctx.stroke();
        ctx.beginPath();ctx.arc(0,-size*.08,size*.10,0,Math.PI*2);ctx.stroke();
        if(thrusting&&fuel>0){ctx.strokeStyle="#ff9f1a";ctx.beginPath();ctx.moveTo(-size*.08,size*.27);ctx.lineTo(0,size*(.55+Math.random()*.18));ctx.lineTo(size*.08,size*.27);ctx.stroke();}
        ctx.restore();
    }
    function draw(){
        cv.begin();const W=cv.W,H=cv.H;if(W<16||H<16)return;ctx.fillStyle="#000";ctx.fillRect(0,0,W,H);ctx.imageSmoothingEnabled=false;
        // sparse star field
        ctx.fillStyle="#777";for(let i=0;i<34;i++){const x=((i*73+level*19)%997)/997*W,y=((i*157+23)%881)/881*H*.63;ctx.fillRect(x,y,1,1);}
        // telemetry, like the old vector cabinet.
        ctx.font=`700 ${Math.max(9,H*.020)}px monospace`;ctx.textBaseline="top";ctx.fillStyle="#fff";ctx.textAlign="left";
        const alt=Math.max(0,groundAt(ship?.x??.5)-(ship?.y??0));
        ctx.fillText(`ALT ${Math.round(alt*1000).toString().padStart(4,"0")}`,W*.03,H*.03);
        ctx.fillText(`HSPD ${Math.round(Math.abs(ship?.vx??0)*1000).toString().padStart(3,"0")}`,W*.03,H*.06);
        ctx.textAlign="right";ctx.fillText(`VSPD ${Math.round((ship?.vy??0)*1000).toString().padStart(3,"0")}`,W*.97,H*.03);ctx.fillText(`ANGLE ${Math.round((ship?.angle??0)*180/Math.PI)}°`,W*.97,H*.06);
        // terrain vector
        ctx.strokeStyle="#fff";ctx.lineWidth=Math.max(1,H*.0025);ctx.beginPath();terrain.forEach((pt,i)=>{const x=pt.x*W,y=pt.y*H;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();
        for(const pad of pads){ctx.strokeStyle="#fff";ctx.lineWidth=Math.max(2,H*.004);ctx.beginPath();ctx.moveTo(pad.x0*W,pad.y*H);ctx.lineTo(pad.x1*W,pad.y*H);ctx.stroke();ctx.fillStyle="#fff";ctx.font=`800 ${Math.max(9,H*.018)}px monospace`;ctx.textAlign="center";ctx.fillText(`${pad.m}X`,(pad.x0+pad.x1)*.5*W,pad.y*H+4);}
        if(ship)drawShip(ship.x*W,ship.y*H,Math.max(20,H*.055),ship.angle,keys.thrust&&state==="playing");
        // fuel gauge
        ctx.strokeStyle="#fff";ctx.lineWidth=1;ctx.strokeRect(W*.35,H*.945,W*.30,H*.018);ctx.fillStyle=fuel<180?"#ff4040":"#fff";ctx.fillRect(W*.35,H*.945,W*.30*(fuel/1000),H*.018);
        ctx.fillStyle="#fff";ctx.font=`700 ${Math.max(9,H*.018)}px monospace`;ctx.textAlign="center";ctx.fillText("FUEL",W*.50,H*.920);
        if(["idle","ready","paused","gameover"].includes(state)){ctx.textAlign="center";ctx.fillStyle="#fff";ctx.font=`900 ${Math.max(16,H*.042)}px monospace`;const t=state==="idle"?"LUNAR LANDER":state==="paused"?"PAUSED":state==="gameover"?"GAME OVER":"READY";ctx.fillText(t,W*.5,H*.42);ctx.font=`700 ${Math.max(9,H*.020)}px monospace`;ctx.fillText(state==="idle"?"CLICK OR QUEUE A WORKFLOW":state==="gameover"?"PRESS R OR NEW":"← → ROTATE   ↑ THRUST",W*.5,H*.47);}
    }
    function togglePause(){if(state==="idle"||state==="gameover"){newGame();return;}if(state==="paused"){state=beforePause;last=performance.now();}else{beforePause=state;state="paused";stopThrust();}updateHud();}
    function keyDown(e){const k=e.key;if(["ArrowLeft","ArrowRight","ArrowUp","p","P","r","R"].includes(k)){e.preventDefault();e.stopPropagation();audio.ensure();}if(k==="ArrowLeft")keys.left=true;else if(k==="ArrowRight")keys.right=true;else if(k==="ArrowUp"){keys.thrust=true;if(state==="idle"||state==="gameover")newGame();}else if(/^[pP]$/.test(k))togglePause();else if(/^[rR]$/.test(k))newGame();}
    function keyUp(e){const k=e.key;if(k==="ArrowLeft")keys.left=false;else if(k==="ArrowRight")keys.right=false;else if(k==="ArrowUp"){keys.thrust=false;stopThrust();}}
    canvas.addEventListener("keydown",keyDown);canvas.addEventListener("keyup",keyUp);
    canvas.addEventListener("pointerdown",e=>{e.stopPropagation();audio.ensure();canvas.focus({preventScroll:true});if(state==="idle"||state==="gameover")newGame();});
    newBtn.addEventListener("click",e=>{e.stopPropagation();audio.ensure();newGame();});pauseBtn.addEventListener("click",e=>{e.stopPropagation();audio.ensure();togglePause();});
    const unbind=bindWorkflow({onStart(){workflowRunning=true;hasStarted=true;if(state==="idle"||state==="gameover")newGame();updateHud();},onEnd(){workflowRunning=false;updateHud();}});
    const ro=new ResizeObserver(()=>cv.resize());ro.observe(canvasWrap);const io=new IntersectionObserver(es=>visible=es.some(e=>e.isIntersecting));io.observe(root);
    function frame(now){if(destroyed)return;raf=requestAnimationFrame(frame);if(!visible||document.hidden){last=now;return;}const dt=Math.min(.05,Math.max(0,(now-last)/1000));last=now;acc+=dt;if(acc<1/30)return;const step=Math.min(.05,acc);acc=0;update(step);draw();}
    function destroy(){destroyed=true;stopThrust();cancelAnimationFrame(raf);ro.disconnect();io.disconnect();unbind();audio.close();}
    buildTerrain();resetShip();updateHud();cv.resize();draw();raf=requestAnimationFrame(frame);return{root,destroy,resizeCanvas:cv.resize};
}
registerArcadeNode({extensionName:EXTENSION_NAME,nodeName:NODE_NAME,gameProp:"__comfyLunarLanderGame",failProp:"__comfyLunarLanderFail",patchProp:"__comfyLunarLanderPatch",widgetName:"lunar_lander_game",createGame,minW:500,minH:570});
