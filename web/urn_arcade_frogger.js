import { clamp, createShell, createCanvasTools, createAudio, loadHighScore, saveHighScore, bindWorkflow, registerArcadeNode } from "./arcade_common.js";

const EXTENSION_NAME="urn.arcade.frogger", NODE_NAME="URNArcadeFrogger";

function createGame(node){
    const ui=createShell({aria:"URN Arcade Frogger. Arrow keys to hop.",columns:4,accent:"#55ff45"});
    const {root,hud,canvas,canvasWrap,statusDot,statusEl,soundBtn,volumeSlider,newBtn,pauseBtn}=ui;
    const scoreEl=document.createElement("div"),highEl=document.createElement("div"),livesEl=document.createElement("div"),levelEl=document.createElement("div");
    scoreEl.style.color="#ff3b3b"; highEl.style.color="#ffffff"; livesEl.style.color="#62ff53"; levelEl.style.color="#fff24a";
    highEl.style.textAlign=livesEl.style.textAlign="center"; levelEl.style.textAlign="right"; hud.append(scoreEl,highEl,livesEl,levelEl);
    const cv=createCanvasTools(canvas),ctx=cv.ctx;
    const audio=createAudio("comfyFrogger",soundBtn,volumeSlider,.35,"Frogger",["hop.wav","home.wav","death.wav","level_complete.wav","timer_warning.wav"]);
    const FIXED_SPEED_MULT=1.20; // Tuned after V14 wraparound fix.
    let highScore=loadHighScore("comfyFroggerHighScore"),score=0,lives=3,level=1,state="idle",beforePause="playing";
    let workflowRunning=false,hasStarted=false,gameTime=0,timeLeft=60,ready=.8,deadTimer=0,timerWarnTick=-1;
    let frog={x:.5,row:0,carry:0},homes=[false,false,false,false,false],vehicles=[],platforms=[];
    let raf=0,last=performance.now(),acc=0,visible=true,destroyed=false;
    const ys=[.90,.835,.775,.715,.655,.595,.525,.455,.395,.335,.275,.215,.115];
    const homeXs=[.09,.295,.50,.705,.91];
    const roadRows=[1,2,3,4,5], riverRows=[7,8,9,10,11];

    function rndSeeded(i){return ((i*9301+49297)%233280)/233280;}
    function makeWorld(){
        vehicles=[]; platforms=[];
        const roadCfg=[
            {row:1,dir:1,speed:.050,color:"#ff2ed1",kind:"car",count:4,w:.075},
            {row:2,dir:-1,speed:.038,color:"#e8f3ee",kind:"truck",count:3,w:.12},
            {row:3,dir:1,speed:.070,color:"#49f5e3",kind:"car",count:4,w:.07},
            {row:4,dir:-1,speed:.048,color:"#e8f3ee",kind:"truck",count:3,w:.125},
            {row:5,dir:1,speed:.080,color:"#fffb22",kind:"race",count:4,w:.07},
        ];
        for(const c of roadCfg) for(let i=0;i<c.count;i++) vehicles.push({...c,x:(i/c.count+rndSeeded(i+c.row)*.12)%1});
        const riverCfg=[
            {row:7,dir:1,speed:.038,kind:"turtle",count:4,w:.11},
            {row:8,dir:-1,speed:.028,kind:"log",count:3,w:.22},
            {row:9,dir:1,speed:.043,kind:"turtle",count:4,w:.105},
            {row:10,dir:-1,speed:.025,kind:"log",count:3,w:.27},
            {row:11,dir:1,speed:.035,kind:"croc",count:3,w:.22},
        ];
        for(const c of riverCfg) for(let i=0;i<c.count;i++) platforms.push({...c,x:(i/c.count+rndSeeded(i+c.row)*.14)%1});
    }
    function resetFrog(){frog={x:.5,row:0,carry:0}; ready=.45;}
    function newGame(){score=0;lives=3;level=1;homes.fill(false);timeLeft=60;gameTime=0;makeWorld();resetFrog();state="ready";canvas.focus({preventScroll:true});updateHud();}
    function updateHigh(){if(score>highScore){highScore=score;saveHighScore("comfyFroggerHighScore",highScore);}updateHud();}
    function updateHud(){scoreEl.textContent=`SCORE ${String(score).padStart(5,"0")}`;highEl.textContent=`HI ${String(highScore).padStart(5,"0")}`;livesEl.textContent=`FROGS ${"●".repeat(Math.max(0,lives))}`;levelEl.textContent=`LEVEL ${level}`;pauseBtn.textContent=state==="paused"?"RESUME":"PAUSE";
        statusDot.style.background=workflowRunning?"#58d68d":(hasStarted?"#65ff55":"#6d7485");
        statusEl.textContent=state==="idle"?"QUEUE A WORKFLOW OR CLICK TO START":state==="gameover"?"GAME OVER • R OR NEW":state==="paused"?"PAUSED • P TO RESUME":"ARROWS • GET ALL 5 FROGS HOME";
    }
    const sndHop=()=>audio.sample("hop.wav",()=>audio.tone(370,.045,{endFreq:520,gain:.055}));
    const sndHome=()=>audio.sample("home.wav",()=>{audio.tone(520,.07,{endFreq:760,gain:.06});audio.tone(780,.09,{delay:.08,endFreq:1050,gain:.055});});
    const sndDeath=()=>audio.sample("death.wav",()=>{audio.tone(250,.18,{type:"sawtooth",endFreq:55,gain:.075});audio.noise(.12,.035);});
    const sndLevel=()=>audio.sample("level_complete.wav",()=>{[440,620,820].forEach((f,i)=>audio.tone(f,.08,{delay:i*.09,gain:.05}));});
    const sndTimer=()=>audio.sample("timer_warning.wav",()=>audio.tone(820,.055,{type:"square",gain:.045,endFreq:620}));

    function loseLife(){if(state==="gameover")return;sndDeath();lives--;updateHud();if(lives<=0){state="gameover";updateHigh();return;}state="ready";deadTimer=.45;resetFrog();}
    function homeCheck(){
        let best=-1,bd=99;homeXs.forEach((x,i)=>{const d=Math.abs(frog.x-x);if(d<bd){bd=d;best=i;}});
        if(best<0||bd>.07||homes[best]){loseLife();return;}
        homes[best]=true;score+=500+Math.floor(timeLeft*10);sndHome();updateHigh();
        if(homes.every(Boolean)){score+=1000;level++;homes.fill(false);timeLeft=Math.max(38,60-level*2);sndLevel();makeWorld();}
        else timeLeft=Math.max(40,60-level*1.5);
        resetFrog();state="ready";
    }
    function hop(dx,dr){if(state==="idle"||state==="gameover"){newGame();return;}if(state!=="playing")return;frog.x=clamp(frog.x+dx,0.025,.975);frog.row=clamp(frog.row+dr,0,12);sndHop();if(dr>0){score+=10;updateHigh();}if(frog.row===12)homeCheck();}
    function overlapX(x,a,w){let d=Math.abs(x-a);d=Math.min(d,1-d);return d<w*.52;}
    function wrap01(x){ return ((x % 1) + 1) % 1; }
    function update(dt){
        if(["idle","paused","gameover"].includes(state))return;gameTime+=dt;
        if(state==="ready"){ready-=dt;if(ready<=0)state="playing";updateHud();return;}
        timeLeft-=dt;if(timeLeft<=0){timeLeft=0;loseLife();return;}
        if(timeLeft<=10){const tick=Math.floor(timeLeft);if(tick!==timerWarnTick){timerWarnTick=tick;sndTimer();}}else timerWarnTick=-1;
        const levelSpeedMul=1+Math.min(.45,(level-1)*.05);
        const speedMul=levelSpeedMul*FIXED_SPEED_MULT;
        for(const v of vehicles){v.x=wrap01(v.x+v.dir*v.speed*speedMul*dt);}
        for(const p of platforms){p.x=wrap01(p.x+p.dir*p.speed*speedMul*dt);}
        if(roadRows.includes(frog.row)){
            for(const v of vehicles) if(v.row===frog.row&&overlapX(frog.x,v.x,v.w)){loseLife();return;}
        }
        if(riverRows.includes(frog.row)){
            let ride=null;for(const p of platforms)if(p.row===frog.row&&overlapX(frog.x,p.x,p.w)){ride=p;break;}
            if(!ride){loseLife();return;}
            frog.x+=ride.dir*ride.speed*speedMul*dt;if(frog.x<0||frog.x>1){loseLife();return;}
        }
    }

    function pxRect(x,y,w,h){ ctx.fillRect(Math.round(x),Math.round(y),Math.ceil(w),Math.ceil(h)); }
    function frogSprite(x,y,s,color="#57ff42"){
        const p = Math.max(2, Math.round(s*0.11));
        const ox = Math.round(x - p*4);
        const oy = Math.round(y - p*4);
        const rows = [
            "00100100",
            "01111110",
            "11111111",
            "11111111",
            "01111110",
            "11011011",
            "10000001",
            "01000010",
        ];
        ctx.fillStyle = color;
        for(let r=0;r<rows.length;r++) for(let c=0;c<rows[r].length;c++) if(rows[r][c]==='1') pxRect(ox+c*p, oy+r*p, p, p);
        ctx.fillStyle = "#001500";
        pxRect(ox+p*2, oy+p*1, p, p);
        pxRect(ox+p*5, oy+p*1, p, p);
    }
    function drawLog(x,y,w,H,croc=false){
        const h = H*.036;
        const left = x-w/2, right = x+w/2;
        const bodyRight = right-h*0.48;

        // Main rounded trunk.
        ctx.fillStyle = "#de7b54";
        ctx.beginPath();
        ctx.moveTo(left+h*0.48, y-h/2);
        ctx.lineTo(bodyRight, y-h/2);
        ctx.arc(bodyRight, y, h/2, -Math.PI/2, Math.PI/2);
        ctx.lineTo(left+h*0.48, y+h/2);
        ctx.arc(left+h*0.48, y, h/2, Math.PI/2, Math.PI*1.5);
        ctx.closePath();
        ctx.fill();

        // Dark underside for a little depth.
        ctx.fillStyle = "#9d4d39";
        ctx.fillRect(left+h*0.42, y+h*0.28, Math.max(1,w-h*0.82), h*0.12);

        // Bark dashes.
        ctx.fillStyle = "#f4d3c0";
        const dashW = Math.max(2,h*0.18), dashH = Math.max(1,h*0.08);
        for(let q=-0.36;q<0.30;q+=0.13){
            pxRect(x+w*q, y-h*0.16, dashW, dashH);
            if(q<0.2) pxRect(x+w*(q+0.055), y+h*0.10, dashW*0.75, dashH);
        }

        // Cut end / growth rings, intentionally only slightly larger than trunk.
        ctx.fillStyle = "#f2d9c8";
        ctx.beginPath(); ctx.arc(right-h*0.34, y, h*0.56, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = "#b86c53";
        ctx.lineWidth = Math.max(1,h*0.08);
        ctx.stroke();
        ctx.beginPath(); ctx.arc(right-h*0.34, y, h*0.33, 0, Math.PI*2); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(right-h*0.34, y-h*0.26);
        ctx.lineTo(right-h*0.25, y);
        ctx.lineTo(right-h*0.38, y+h*0.26);
        ctx.stroke();

        if(croc){
            // Keep the croc readable but visually tied to the same river palette.
            ctx.fillStyle = "#d66e4d";
            ctx.beginPath();
            ctx.moveTo(left+h*0.18, y);
            ctx.lineTo(left-h*0.70, y-h*0.24);
            ctx.lineTo(left-h*0.70, y+h*0.24);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = "#ffffff";
            for(let i=0;i<4;i++) pxRect(left-h*0.62+i*h*0.14, y+h*0.04, h*0.06, h*0.08);
        }
    }
    function drawTurtles(x,y,w,H){
        const shellW = w*.16, shellH = H*.020;
        for(let i=-1;i<=1;i++){
            const cx=x+i*w*.27;
            ctx.fillStyle="#ff2d2d";
            ctx.beginPath();ctx.ellipse(cx,y,shellW,shellH,0,0,Math.PI*2);ctx.fill();
            ctx.strokeStyle="#43ff45";ctx.lineWidth=Math.max(1,H*.0032);ctx.stroke();
            ctx.fillStyle="#43ff45";
            pxRect(cx-shellW*0.25,y-shellH*1.15,shellW*0.18,shellH*0.35);
            pxRect(cx+shellW*0.07,y-shellH*1.15,shellW*0.18,shellH*0.35);
            pxRect(cx-shellW*1.18,y-shellH*0.10,shellW*0.18,shellH*0.18);
            pxRect(cx+shellW*1.00,y-shellH*0.10,shellW*0.18,shellH*0.18);
            pxRect(cx-shellW*0.72,y+shellH*0.66,shellW*0.16,shellH*0.18);
            pxRect(cx+shellW*0.56,y+shellH*0.66,shellW*0.16,shellH*0.18);
        }
    }
    function drawVehicle(v,W,H){
        const x=v.x*W,y=ys[v.row]*H,w=v.w*W,h=H*.040;
        if(v.kind==="truck"){
            ctx.fillStyle="#d9d9d9"; pxRect(x-w/2,y-h/2,w*.76,h);
            ctx.fillStyle="#ff3036"; pxRect(x+w*.18,y-h*.48,w*.18,h*.96);
            ctx.fillStyle="#46ff43"; pxRect(x+w*.30,y-h*.16,w*.11,h*.32);
            ctx.fillStyle="#111"; pxRect(x-w*.28,y+h*.36,h*.18,h*.18); pxRect(x+w*.18,y+h*.36,h*.18,h*.18);
        } else if(v.kind==="race"){
            ctx.fillStyle="#ffe51d"; pxRect(x-w/2,y-h*.26,w,h*.52);
            ctx.fillStyle="#ff3040"; pxRect(x-w*.10,y-h*.48,w*.20,h*.18); pxRect(x+w*.15,y-h*.48,w*.16,h*.18);
            ctx.fillStyle="#ff3040"; pxRect(x-w*.10,y+h*.28,w*.20,h*.18); pxRect(x+w*.15,y+h*.28,w*.16,h*.18);
            ctx.fillStyle="#7f00d2"; pxRect(x-w*.05,y-h*.12,w*.18,h*.24);
            ctx.fillStyle="#111"; pxRect(x-w*.30,y+h*.28,h*.15,h*.15); pxRect(x+w*.20,y+h*.28,h*.15,h*.15);
        } else {
            ctx.fillStyle=v.color; pxRect(x-w/2,y-h*.30,w,h*.60);
            ctx.fillStyle="#ff7ce6"; pxRect(x-w*.15,y-h*.50,w*.30,h*.22);
            ctx.fillStyle="#111"; pxRect(x-w*.30,y+h*.26,h*.16,h*.16); pxRect(x+w*.18,y+h*.26,h*.16,h*.16);
        }
    }
    function draw(){cv.begin();const W=cv.W,H=cv.H;if(W<16||H<16)return;ctx.fillStyle="#000";ctx.fillRect(0,0,W,H);
        // Top hedge with five true open home notches into the river, like the arcade.
        ctx.fillStyle="#34ea18";ctx.fillRect(0,H*.02,W,H*.125);
        ctx.fillStyle="#ff3131";
        for(let i=0;i<150;i++) pxRect((i%50)*(W/50)+((i*7)%3), H*.028+Math.floor(i/50)*H*.032+((i*5)%2), 3, 3);

        // River starts under the hedge and also fills the five open home gaps.
        ctx.fillStyle="#0a0e66";ctx.fillRect(0,H*.145,W,H*.345);
        for(let i=0;i<5;i++){
            const cx=homeXs[i]*W;
            const bayW=W*.105;
            const bayTop=H*.052;
            const bayBottom=H*.145;
            ctx.fillStyle="#0a0e66";
            pxRect(cx-bayW/2,bayTop,bayW,bayBottom-bayTop+2);
            // Slightly narrow the upper part so the hedge visibly wraps around the bay.
            pxRect(cx-bayW*.38,H*.038,bayW*.76,H*.030);
            if(homes[i]) frogSprite(cx,H*.092,H*.050);
        }
        for(const p of platforms){const x=p.x*W,y=ys[p.row]*H;if(p.kind==="turtle")drawTurtles(x,y,p.w*W,H);else drawLog(x,y,p.w*W,H,p.kind==="croc");}
        // Median and road with the vivid purple strip / black road.
        ctx.fillStyle="#120016";ctx.fillRect(0,H*.49,W,H*.40);
        ctx.fillStyle="#8b1df1";ctx.fillRect(0,H*.49,W,H*.028);ctx.fillRect(0,H*.87,W,H*.028);
        ctx.fillStyle="#1830ff";
        for(let x=4;x<W;x+=14){for(let y0 of [H*.495,H*.875]){pxRect(x,y0+2,3,3);pxRect(x+7,y0+8,3,3);}}
        for(const v of vehicles)drawVehicle(v,W,H);
        // Start curb.
        ctx.fillStyle="#8b1df1";ctx.fillRect(0,H*.94,W,H*.025);ctx.fillStyle="#1830ff";for(let x=5;x<W;x+=14){pxRect(x,H*.947,4,4);}
        // Frog.
        frogSprite(frog.x*W,ys[frog.row]*H,H*.052);
        // Time bar and score area, like the cabinet reference.
        ctx.fillStyle="#d9d9d9";ctx.font=`800 ${Math.max(10,H*.025)}px monospace`;ctx.textAlign="left";ctx.fillText("SCORE",W*.02,H*.992);ctx.fillStyle="#ff2020";ctx.fillText(String(score),W*.18,H*.992);ctx.fillStyle="#fff500";ctx.textAlign="right";ctx.fillText("TIME",W*.98,H*.992);ctx.fillStyle="#1fe91f";ctx.fillRect(W*.53,H*.966,W*.30*(timeLeft/Math.max(1,60-level*1.5)),H*.018);
        if(["idle","ready","paused","gameover"].includes(state)){ctx.textAlign="center";ctx.fillStyle="#fff500";ctx.font=`900 ${Math.max(15,H*.042)}px monospace`;let t=state==="idle"?"URN ARCADE FROGGER":state==="paused"?"PAUSED":state==="gameover"?"GAME OVER":"READY";ctx.fillText(t,W/2,H*.55);ctx.fillStyle="#fff";ctx.font=`700 ${Math.max(9,H*.021)}px monospace`;ctx.fillText(state==="idle"?"QUEUE A WORKFLOW OR CLICK TO START":state==="gameover"?"PRESS R OR NEW":"ARROWS",W/2,H*.60);}
    }
    function togglePause(){if(state==="idle"||state==="gameover"){newGame();return;}state=state==="paused"?beforePause:(beforePause=state,"paused");updateHud();}
    function key(e){const k=e.key;if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","p","P","r","R"].includes(k))e.preventDefault();audio.ensure();if(k==="ArrowLeft")hop(-.075,0);else if(k==="ArrowRight")hop(.075,0);else if(k==="ArrowUp")hop(0,1);else if(k==="ArrowDown")hop(0,-1);else if(/^[pP]$/.test(k))togglePause();else if(/^[rR]$/.test(k))newGame();}
    canvas.addEventListener("keydown",key);canvas.addEventListener("pointerdown",e=>{e.stopPropagation();audio.ensure();canvas.focus({preventScroll:true});if(state==="idle"||state==="gameover")newGame();});newBtn.addEventListener("click",e=>{e.stopPropagation();audio.ensure();newGame();});pauseBtn.addEventListener("click",e=>{e.stopPropagation();audio.ensure();togglePause();});
    const unbind=bindWorkflow({onStart(){workflowRunning=true;hasStarted=true;if(state==="idle"||state==="gameover")newGame();updateHud();},onEnd(){workflowRunning=false;updateHud();}});
    const ro=new ResizeObserver(()=>cv.resize());ro.observe(canvasWrap);const io=new IntersectionObserver(es=>visible=es.some(e=>e.isIntersecting));io.observe(root);
    function frame(now){if(destroyed)return;raf=requestAnimationFrame(frame);if(!visible||document.hidden){last=now;return;}const dt=Math.min(.05,Math.max(0,(now-last)/1000));last=now;acc+=dt;if(acc<1/30)return;const step=Math.min(.05,acc);acc=0;update(step);draw();}
    function destroy(){destroyed=true;cancelAnimationFrame(raf);ro.disconnect();io.disconnect();unbind();audio.close();}
    makeWorld();updateHud();cv.resize();draw();raf=requestAnimationFrame(frame);return{root,destroy,resizeCanvas:cv.resize};
}
registerArcadeNode({extensionName:EXTENSION_NAME,nodeName:NODE_NAME,gameProp:"__urnArcadeFroggerGame",failProp:"__urnArcadeFroggerFail",patchProp:"__urnArcadeFroggerPatch",widgetName:"frogger_game",createGame,minW:480,minH:560});
