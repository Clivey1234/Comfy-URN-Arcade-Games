import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { createSamplePlayer } from "./arcade_common.js";

const EXTENSION_NAME = "spb1234t.ComfySpaceInvaders.V16";
const NODE_NAME = "ComfySpaceInvadersSPB1234T";

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function makeButton(label) {
    const b = document.createElement("button");
    b.textContent = label;
    Object.assign(b.style, {
        border: "1px solid #3b465e",
        borderRadius: "5px",
        background: "#11172a",
        color: "#e6ebff",
        font: "700 11px system-ui, sans-serif",
        padding: "4px 8px",
        cursor: "pointer",
        lineHeight: "16px",
    });
    b.onmouseenter = () => b.style.background = "#1d2642";
    b.onmouseleave = () => b.style.background = "#11172a";
    return b;
}

function createGame(node) {
    const root = document.createElement("div");
    root.className = "comfy-space-invaders-root";
    Object.assign(root.style, {
        width: "100%", height: "100%", minHeight: "360px", boxSizing: "border-box",
        display: "flex", flexDirection: "column", gap: "5px", padding: "6px",
        background: "#000", borderRadius: "7px", overflow: "hidden", color: "#fff",
        fontFamily: "system-ui, sans-serif", userSelect: "none",
    });

    const hud = document.createElement("div");
    Object.assign(hud.style, {
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "5px",
        font: "800 11px system-ui, sans-serif", letterSpacing: ".5px", alignItems: "center",
    });
    const scoreEl = document.createElement("div");
    const highEl = document.createElement("div");
    const levelEl = document.createElement("div");
    scoreEl.style.textAlign = "left"; scoreEl.style.color = "#39dfff";
    highEl.style.textAlign = "center"; highEl.style.color = "#6b58ff";
    levelEl.style.textAlign = "right"; levelEl.style.color = "#ffd38a";
    hud.append(scoreEl, highEl, levelEl);

    const canvasWrap = document.createElement("div");
    Object.assign(canvasWrap.style, {
        position: "relative", flex: "1 1 auto", minHeight: "280px", minWidth: "0",
        overflow: "hidden", borderRadius: "5px", background: "#000", border: "1px solid #171717",
    });
    const canvas = document.createElement("canvas");
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-label", "Comfy Space Invaders. Left/right arrows to move, Space to fire.");
    Object.assign(canvas.style, { display: "block", width: "100%", height: "100%", outline: "none", background: "#000", cursor: "crosshair" });
    canvasWrap.appendChild(canvas);

    const footer = document.createElement("div");
    Object.assign(footer.style, { display: "flex", alignItems: "center", gap: "5px", minHeight: "26px" });
    const statusDot = document.createElement("span");
    Object.assign(statusDot.style, { width: "8px", height: "8px", borderRadius: "50%", background: "#6d7485", flex: "0 0 auto" });
    const statusEl = document.createElement("span");
    Object.assign(statusEl.style, { flex: "1 1 auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#aab3ca", font: "600 10px system-ui, sans-serif" });
    const soundBtn = makeButton("SND ON");
    const volumeSlider = document.createElement("input");
    volumeSlider.type = "range"; volumeSlider.min = "0"; volumeSlider.max = "100"; volumeSlider.step = "1";
    Object.assign(volumeSlider.style, { width: "62px", height: "20px", cursor: "pointer", accentColor: "#39dfff", flex: "0 0 62px" });
    const newBtn = makeButton("NEW");
    const pauseBtn = makeButton("PAUSE");
    footer.append(statusDot, statusEl, soundBtn, volumeSlider, newBtn, pauseBtn);
    root.append(hud, canvasWrap, footer);

    const ctx = canvas.getContext("2d", { alpha: false });
    let canvasCssW = 1, canvasCssH = 1, dpr = 1;
    let rafId = 0, lastFrame = performance.now(), accumulator = 0;
    let visible = true, destroyed = false;
    let workflowRunning = false, hasStartedFromWorkflow = false;
    let state = "idle", stateBeforePause = "playing";
    let score = 0, level = 1, lives = 3, highScore = 0;
    let gameTime = 0, readyTimer = 0, waveClearTimer = 0;
    let player = null, invaders = [], playerShots = [], enemyShots = [], bunkers = [], ufo = null;
    let formationDir = 1, formationDrop = 0, invaderAnim = 0, invaderStepTimer = 0;
    let keys = { left: false, right: false, fire: false };
    let fireCooldown = 0, enemyFireCooldown = 0, ufoTimer = 0;

    try { highScore = Number(localStorage.getItem("comfySpaceInvadersHighScore") || 0) || 0; } catch (_) {}
    let soundEnabled = true;
    let soundVolume = 0.35;
    try {
        const storedEnabled = localStorage.getItem("comfySpaceInvadersSoundEnabled");
        if (storedEnabled !== null) soundEnabled = storedEnabled !== "0";

        const storedVolumeRaw = localStorage.getItem("comfySpaceInvadersSoundVolume");
        const audioFixApplied = localStorage.getItem("comfySpaceInvadersV10AudioFix") === "1";
        if (storedVolumeRaw !== null) {
            const storedVolume = Number(storedVolumeRaw);
            if (Number.isFinite(storedVolume)) soundVolume = clamp(storedVolume, 0, 1);
        }
        // V9 accidentally interpreted a missing localStorage value as numeric 0.
        // Migrate one accidental zero back to the intended default volume.
        if (!audioFixApplied && soundEnabled && soundVolume === 0) {
            soundVolume = 0.35;
            localStorage.setItem("comfySpaceInvadersSoundVolume", String(soundVolume));
        }
        localStorage.setItem("comfySpaceInvadersV10AudioFix", "1");
    } catch (_) {}
    volumeSlider.value = String(Math.round(soundVolume * 100));
    let audioCtx = null, masterGain = null, audioGestureSeen = false;
    const samples = createSamplePlayer("SpaceInvaders", {
        isEnabled: () => soundEnabled,
        getVolume: () => soundVolume,
        isUnlocked: () => audioGestureSeen,
    });
    samples.preload(["shoot.wav","alien_move_1.wav","alien_move_2.wav","alien_move_3.wav","alien_move_4.wav","alien_hit.wav","player_death.wav","ufo.wav","level_complete.wav"]);

    function saveSettings() {
        try {
            localStorage.setItem("comfySpaceInvadersSoundEnabled", soundEnabled ? "1" : "0");
            localStorage.setItem("comfySpaceInvadersSoundVolume", String(soundVolume));
        } catch (_) {}
    }
    function ensureAudioFromGesture() {
        audioGestureSeen = true;
        if (!soundEnabled) return;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        if (!audioCtx) {
            try {
                audioCtx = new AC();
                masterGain = audioCtx.createGain();
                masterGain.gain.value = soundVolume;
                masterGain.connect(audioCtx.destination);
            } catch (_) {
                audioCtx = null;
                masterGain = null;
                return;
            }
        }
        if (masterGain) masterGain.gain.value = soundEnabled ? soundVolume : 0;
        if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    }
    function audioReady() {
        return soundEnabled && audioGestureSeen && audioCtx && masterGain && audioCtx.state === "running";
    }
    function tone(freq, duration=.08, {type="square", gain=.08, endFreq=null, delay=0}={}) {
        if (!audioReady()) return;
        const now = audioCtx.currentTime + Math.max(0, delay);
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(Math.max(30, freq), now);
        if (Number.isFinite(endFreq)) o.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq), now + duration);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), now + Math.min(.008, duration*.25));
        g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        o.connect(g); g.connect(masterGain); o.start(now); o.stop(now + duration + .02);
    }
    const sndShoot = () => samples.play("shoot.wav", () => tone(720, .085, {type:"square", gain:.075, endFreq:260}));
    const sndInvader = () => {
        const idx = (invaderAnim & 3) + 1;
        const march = [92, 78, 66, 55][invaderAnim & 3];
        samples.play(`alien_move_${idx}.wav`, () => tone(march, .055, {type:"square", gain:.045, endFreq:Math.max(35, march-8)}));
    };
    const sndHit = () => samples.play("alien_hit.wav", () => { tone(180,.08,{type:"square",gain:.065,endFreq:330}); tone(95,.13,{type:"sawtooth",gain:.04,endFreq:55,delay:.015}); });
    const sndPlayerHit = () => samples.play("player_death.wav", () => { tone(260,.18,{type:"sawtooth",gain:.09,endFreq:70}); tone(115,.30,{type:"square",gain:.06,endFreq:45,delay:.05}); });
    const sndUfo = () => samples.play("ufo.wav", () => tone(430,.12,{type:"square",gain:.04,endFreq:360}), .75);
    const sndWave = () => samples.play("level_complete.wav", () => { tone(440,.09,{type:"square",gain:.055,endFreq:620}); tone(680,.12,{type:"square",gain:.06,endFreq:900,delay:.10}); });

    function updateSoundUi() {
        soundBtn.textContent = soundEnabled ? "SND ON" : "SND OFF";
        soundBtn.style.opacity = soundEnabled ? "1" : ".65";
        volumeSlider.disabled = !soundEnabled;
        volumeSlider.style.opacity = soundEnabled ? "1" : ".45";
        if (masterGain) masterGain.gain.value = soundEnabled ? soundVolume : 0;
    }

    function resizeCanvas() {
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        canvasCssW = Math.max(1, rect.width); canvasCssH = Math.max(1, rect.height);
        dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        const pw = Math.max(1, Math.round(canvasCssW * dpr)), ph = Math.max(1, Math.round(canvasCssH * dpr));
        if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
    }

    function makeBunkers() {
        const arr = [];
        const xs = [0.16, 0.37, 0.58, 0.79];
        const pattern = [
            "..######..",
            ".########.",
            "##########",
            "##########",
            "###....###",
            "##......##",
        ];
        for (const cx of xs) {
            const cells = [];
            for (let r=0;r<pattern.length;r++) for(let c=0;c<pattern[r].length;c++) if(pattern[r][c]==="#") cells.push({c,r,hp:2});
            arr.push({ cx, y:.79, cells, cols:10, rows:6 });
        }
        return arr;
    }

    function resetWave() {
        player = { x:.5, y:.90, w:.055, h:.028, speed:.52, invuln:1.0 };
        playerShots = []; enemyShots = []; ufo = null;
        formationDir = 1; formationDrop = 0; invaderAnim = 0; invaderStepTimer = 0;
        fireCooldown = 0; enemyFireCooldown = .65; ufoTimer = 7 + Math.random()*7;
        invaders = [];
        const rows = 5, cols = 11;
        for (let r=0;r<rows;r++) for(let c=0;c<cols;c++) invaders.push({
            row:r, col:c, x:.17 + c*.061, y:.18 + r*.062, alive:true,
            kind: r===0 ? 0 : (r<3 ? 1 : 2), flash:0
        });
        bunkers = makeBunkers();
        readyTimer = 1.0; state = "ready";
        updateHud();
    }

    function newGame() {
        score = 0; level = 1; lives = 3; gameTime = 0; waveClearTimer = 0;
        resetWave(); canvas.focus({preventScroll:true});
    }

    function updateHighScore() {
        if (score > highScore) { highScore = score; try { localStorage.setItem("comfySpaceInvadersHighScore", String(highScore)); } catch (_) {} }
        updateHud();
    }
    function updateHud() {
        scoreEl.textContent = `SCORE <1> ${String(score).padStart(6,"0")}`;
        highEl.textContent = `HI-SCORE ${String(highScore).padStart(6,"0")}`;
        levelEl.textContent = `LEVEL ${level}  ♥${lives}`;
        pauseBtn.textContent = state === "paused" ? "RESUME" : "PAUSE";
        if (workflowRunning) { statusDot.style.background = "#58d68d"; statusEl.textContent = state === "playing" ? "WORKFLOW RUNNING • INVASION ACTIVE" : "WORKFLOW RUNNING"; }
        else {
            statusDot.style.background = hasStartedFromWorkflow ? "#39dfff" : "#6d7485";
            if (state === "idle") statusEl.textContent = "QUEUE A WORKFLOW TO AUTO-START • CLICK GAME TO PLAY";
            else if (state === "gameover") statusEl.textContent = "GAME OVER • R OR NEW";
            else if (state === "paused") statusEl.textContent = "PAUSED • P TO RESUME";
            else statusEl.textContent = "A/D OR ←/→ • SPACE FIRE • P PAUSE";
        }
    }

    function togglePause() {
        if (state === "idle" || state === "gameover") { newGame(); return; }
        if (state === "paused") { state = stateBeforePause || "playing"; lastFrame = performance.now(); }
        else { stateBeforePause = state; state = "paused"; }
        updateHud();
    }

    function firePlayer() {
        if (state !== "playing" || fireCooldown > 0 || playerShots.length >= 1) return;
        playerShots.push({ x:player.x, y:player.y-.025, vy:-.95, alive:true });
        fireCooldown = .22; sndShoot();
    }

    function rectsHit(a,b) { return Math.abs(a.x-b.x)*2 < (a.w+b.w) && Math.abs(a.y-b.y)*2 < (a.h+b.h); }

    function bunkerHit(shot) {
        const cellW=.0092, cellH=.012;
        for (const b of bunkers) {
            const left=b.cx-(b.cols*cellW)/2, top=b.y-(b.rows*cellH)/2;
            for (const cell of b.cells) {
                if (cell.hp<=0) continue;
                const cx=left+(cell.c+.5)*cellW, cy=top+(cell.r+.5)*cellH;
                if (Math.abs(shot.x-cx)<cellW*.7 && Math.abs(shot.y-cy)<cellH*.8) { cell.hp--; shot.alive=false; return true; }
            }
        }
        return false;
    }

    function invaderBounds(inv) { return { x:inv.x, y:inv.y, w:.043, h:.029 }; }

    function killPlayer() {
        if (!player || player.invuln > 0) return;
        sndPlayerHit(); lives--; updateHud();
        playerShots=[]; enemyShots=[];
        if (lives <= 0) { state="gameover"; updateHighScore(); return; }
        player.x=.5; player.invuln=1.8; readyTimer=.85; state="ready";
    }

    function lowestInvaders() {
        const byCol=new Map();
        for(const i of invaders) if(i.alive) { const cur=byCol.get(i.col); if(!cur || i.row>cur.row) byCol.set(i.col,i); }
        return [...byCol.values()];
    }

    function update(dt) {
        if (state === "paused" || state === "idle" || state === "gameover") return;
        gameTime += dt;
        if (state === "ready") { readyTimer -= dt; if (readyTimer <= 0) state="playing"; updateHud(); return; }
        if (waveClearTimer > 0) { waveClearTimer -= dt; if(waveClearTimer<=0){ level++; resetWave(); } return; }
        if (!player) return;
        if (player.invuln > 0) player.invuln -= dt;
        fireCooldown -= dt; enemyFireCooldown -= dt; ufoTimer -= dt;

        const move=(keys.right?1:0)-(keys.left?1:0);
        player.x=clamp(player.x+move*player.speed*dt,.055,.945);
        if(keys.fire) firePlayer();

        const alive=invaders.filter(i=>i.alive), aliveCount=alive.length;
        if(aliveCount===0){ score+=500; updateHighScore(); sndWave(); waveClearTimer=1.2; return; }
        const baseSpeed=.020 + (55-aliveCount)*.00085 + Math.min(.028,(level-1)*.0035);
        // Make the classic end-of-wave acceleration unmistakable. The normal
        // thinning ramp still applies, but the final five invaders enter an
        // explicit panic-speed range and get faster with every kill.
        const lastFiveSpeedMul = aliveCount <= 5
            ? ({5:1.35,4:1.55,3:1.80,2:2.10,1:2.50}[aliveCount] || 1)
            : 1;
        const speed=baseSpeed*lastFiveSpeedMul;
        let hitEdge=false;
        for(const i of alive){ const nx=i.x+formationDir*speed*dt; if(nx<.055 || nx>.945){ hitEdge=true; break; } }
        if(hitEdge){ formationDir*=-1; formationDrop=.020; invaderAnim++; sndInvader(); }
        else {
            for(const i of alive) i.x += formationDir*speed*dt;
            invaderStepTimer += dt;
            // Original-style tension ramp: the fewer invaders remain, the faster
            // the formation's step animation and four-beat march cadence become.
            // 55 alive ~= 0.48 s per beat; last invader ~= 0.08 s per beat.
            const cleared=55-aliveCount;
            let cadence=Math.max(.08,.48-cleared*.0074);
            if(aliveCount<=5){
                cadence=({5:.110,4:.095,3:.080,2:.065,1:.050}[aliveCount] || cadence);
            }
            if(invaderStepTimer>cadence){ invaderStepTimer=0; invaderAnim++; sndInvader(); }
        }
        if(formationDrop){ for(const i of alive)i.y+=formationDrop; formationDrop=0; }

        for(const i of alive){ if(i.y>.84){ state="gameover"; lives=0; updateHud(); return; } if(i.flash>0)i.flash-=dt; }

        if(enemyFireCooldown<=0){
            const shooters=lowestInvaders(); if(shooters.length){ const i=shooters[(Math.random()*shooters.length)|0]; enemyShots.push({x:i.x,y:i.y+.022,vy:.36+level*.012,alive:true,w:.006,h:.024}); }
            enemyFireCooldown=Math.max(.28,1.15-level*.045)*(.7+Math.random()*.65);
        }

        if(ufoTimer<=0 && !ufo){ ufo={x:-.07,y:.105,vx:.12+.01*Math.min(level,6),alive:true}; ufoTimer=12+Math.random()*10; }
        if(ufo){ ufo.x+=ufo.vx*dt; if(Math.floor(gameTime*7)!==Math.floor((gameTime-dt)*7))sndUfo(); if(ufo.x>1.08)ufo=null; }

        for(const s of playerShots){ s.y+=s.vy*dt; if(s.y<.07)s.alive=false; if(s.alive && bunkerHit(s)) continue;
            if(s.alive && ufo && Math.abs(s.x-ufo.x)<.045 && Math.abs(s.y-ufo.y)<.025){ s.alive=false; score+=150; ufo=null; sndHit(); updateHighScore(); }
            if(!s.alive) continue;
            for(const i of alive){ if(!i.alive)continue; const b=invaderBounds(i); if(Math.abs(s.x-b.x)<b.w*.55 && Math.abs(s.y-b.y)<b.h*.65){ i.alive=false; i.flash=.1; s.alive=false; score += i.kind===0?30:(i.kind===1?20:10); sndHit(); updateHighScore(); break; } }
        }
        for(const s of enemyShots){ s.y+=s.vy*dt; if(s.y>.94)s.alive=false; if(s.alive && bunkerHit(s))continue; if(s.alive && rectsHit({x:s.x,y:s.y,w:.008,h:.025},player)){ s.alive=false; killPlayer(); } }
        playerShots=playerShots.filter(s=>s.alive); enemyShots=enemyShots.filter(s=>s.alive);
    }

    const ALIEN_FRAMES = [
        [
            ["...XX...","..XXXX..",".XXXXXX.","XX.XX.XX","XXXXXXXX","..X..X..",".X.XX.X.","X.X..X.X"],
            ["...XX...","..XXXX..",".XXXXXX.","XX.XX.XX","XXXXXXXX",".X.XX.X.","X......X",".XX..XX."]
        ],
        [
            ["..X....X..","...X..X...","..XXXXXX..",".XX.XX.XX.","XXXXXXXXXX","X.XXXXXX.X","X.X....X.X","...XX.XX.."],
            ["..X....X..","X..X..X..X","X.XXXXXX.X","XXX.XX.XXX","XXXXXXXXXX","..XXXXXX..","...X..X...","..X....X.."]
        ],
        [
            ["...XXXX...",".XXXXXXXX.","XXXXXXXXXX","XX.XXXX.XX","XXXXXXXXXX","..XX..XX..",".XX.XX.XX.","XX......XX"],
            ["...XXXX...",".XXXXXXXX.","XXXXXXXXXX","XX.XXXX.XX","XXXXXXXXXX",".XX.XX.XX.","XX......XX",".XX....XX."]
        ]
    ];

    function drawPixelSprite(pattern,x,y,scale,color){
        ctx.fillStyle=color; const rows=pattern.length, cols=pattern[0].length;
        const ox=x-cols*scale/2, oy=y-rows*scale/2;
        for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
            if(pattern[r][c]==="X") ctx.fillRect(Math.round(ox+c*scale),Math.round(oy+r*scale),Math.ceil(scale),Math.ceil(scale));
        }
    }

    function drawBunker(b,W,H){
        const cellW=W*.0092, cellH=H*.012; const left=b.cx*W-(b.cols*cellW)/2, top=b.y*H-(b.rows*cellH)/2;
        for(const cell of b.cells){ if(cell.hp<=0)continue; ctx.fillStyle=cell.hp===2?"#ef6972":"#a84a56"; ctx.fillRect(left+cell.c*cellW,top+cell.r*cellH,cellW+1,cellH+1); }
    }

    function draw() {
        resizeCanvas(); if(canvasCssW<16||canvasCssH<16)return;
        ctx.setTransform(dpr,0,0,dpr,0,0); const W=canvasCssW,H=canvasCssH;
        ctx.fillStyle="#000"; ctx.fillRect(0,0,W,H);

        // Retro colored bands inspired by the classic cabinet overlay.
        const topBand=H*.12, ground=H*.925;
        ctx.strokeStyle="#ff4055"; ctx.lineWidth=Math.max(1,H*.003); ctx.beginPath(); ctx.moveTo(W*.04,ground); ctx.lineTo(W*.96,ground); ctx.stroke();

        if(ufo){ drawPixelSprite(ALIEN_FRAMES[1][invaderAnim & 1],ufo.x*W,ufo.y*H,Math.max(1.2,W*.0042),"#ff5261"); }

        const alienColors=["#56e87d","#f4dc55","#ff5353"];
        for(const i of invaders){ if(!i.alive)continue; const sc=Math.max(1.2,Math.min(W,H)*.0040); const frame=invaderAnim & 1; drawPixelSprite(ALIEN_FRAMES[i.kind][frame],i.x*W,i.y*H,sc,alienColors[i.kind]); }

        for(const b of bunkers)drawBunker(b,W,H);

        // Player cannon.
        if(player && !(player.invuln>0 && Math.floor(gameTime*10)%2===0)){
            const x=player.x*W,y=player.y*H,sw=Math.max(2,W*.0065),sh=Math.max(2,H*.009);
            ctx.fillStyle="#35dff0";
            ctx.fillRect(x-sw*.45,y-sh*2.0,sw*.9,sh*.65);
            ctx.fillRect(x-sw*1.15,y-sh*1.35,sw*2.3,sh*1.1);
            ctx.fillRect(x-sw*1.8,y-sh*.55,sw*3.6,sh*1.0);
        }

        ctx.fillStyle="#ffffff";
        for(const s of playerShots)ctx.fillRect(s.x*W-1,s.y*H-H*.012,Math.max(2,W*.003),H*.024);
        for(const s of enemyShots){ const x=s.x*W,y=s.y*H; ctx.fillStyle="#ffffff"; ctx.fillRect(x-1,y-H*.013,Math.max(2,W*.003),H*.026); ctx.fillRect(x+2,y-H*.004,Math.max(1,W*.002),H*.009); }

        // Lives readout at the bottom-left, matching the reference composition.
        ctx.fillStyle="#fff"; ctx.font=`800 ${Math.max(10,H*.028)}px monospace`; ctx.textAlign="left"; ctx.textBaseline="bottom";
        ctx.fillText(String(lives),W*.04,H*.975);
        for(let n=0;n<Math.max(0,lives-1);n++){
            const x=W*.115+n*W*.055,y=H*.958,sw=Math.max(2,W*.0045),sh=Math.max(2,H*.0065); ctx.fillStyle="#35dff0";
            ctx.fillRect(x-sw*.45,y-sh*2,sw*.9,sh*.65); ctx.fillRect(x-sw*1.15,y-sh*1.35,sw*2.3,sh*1.1); ctx.fillRect(x-sw*1.8,y-sh*.55,sw*3.6,sh);
        }

        if(state==="idle"||state==="ready"||state==="paused"||state==="gameover"){
            ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillStyle="#fff"; ctx.font=`800 ${Math.max(15,H*.045)}px monospace`;
            let title="READY"; if(state==="idle")title="COMFY INVADERS"; else if(state==="paused")title="PAUSED"; else if(state==="gameover")title="GAME OVER";
            ctx.fillText(title,W/2,H*.55);
            ctx.fillStyle="#39dfff"; ctx.font=`700 ${Math.max(9,H*.022)}px monospace`;
            const sub=state==="idle"?"QUEUE A WORKFLOW OR CLICK TO START":state==="paused"?"PRESS P TO RESUME":state==="gameover"?"PRESS R OR NEW":"GET READY";
            ctx.fillText(sub,W/2,H*.61);
        }
    }

    function handleKey(e) {
        const k=e.key;
        if(["ArrowLeft","ArrowRight"," ","Spacebar","p","P","r","R"].includes(k))e.preventDefault();
        ensureAudioFromGesture();
        if(k==="ArrowLeft")keys.left=true;
        if(k==="ArrowRight")keys.right=true;
        if(k===" "||k==="Spacebar"){ keys.fire=true; if(state==="idle"||state==="gameover")newGame(); else firePlayer(); }
        if(k==="p"||k==="P")togglePause();
        if(k==="r"||k==="R")newGame();
    }
    function handleKeyUp(e){ const k=e.key; if(k==="ArrowLeft")keys.left=false; if(k==="ArrowRight")keys.right=false; if(k===" "||k==="Spacebar")keys.fire=false; }

    canvas.addEventListener("keydown",handleKey); canvas.addEventListener("keyup",handleKeyUp);
    canvas.addEventListener("pointerdown",(e)=>{ e.stopPropagation(); ensureAudioFromGesture(); canvas.focus({preventScroll:true}); if(state==="idle"||state==="gameover")newGame(); });
    newBtn.addEventListener("click",(e)=>{ e.preventDefault(); e.stopPropagation(); ensureAudioFromGesture(); newGame(); });
    pauseBtn.addEventListener("click",(e)=>{ e.preventDefault(); e.stopPropagation(); ensureAudioFromGesture(); togglePause(); });
    soundBtn.addEventListener("click",(e)=>{
        e.preventDefault(); e.stopPropagation();
        soundEnabled=!soundEnabled;
        saveSettings(); updateSoundUi();
        if(soundEnabled){
            ensureAudioFromGesture();
            setTimeout(()=>tone(520,.07,{type:"square",gain:.055,endFreq:680}),0);
        }
        canvas.focus({preventScroll:true});
    });
    volumeSlider.addEventListener("pointerdown",(e)=>{ e.stopPropagation(); ensureAudioFromGesture(); });
    volumeSlider.addEventListener("click",(e)=>e.stopPropagation());
    volumeSlider.addEventListener("input",(e)=>{ e.stopPropagation(); soundVolume=clamp(Number(volumeSlider.value)/100,0,1); saveSettings(); updateSoundUi(); });

    const execStartHandler=()=>{ workflowRunning=true; hasStartedFromWorkflow=true; if(state==="idle"||state==="gameover")newGame(); updateHud(); };
    const execEndHandler=()=>{ workflowRunning=false; updateHud(); };
    api.addEventListener("execution_start",execStartHandler); api.addEventListener("execution_success",execEndHandler); api.addEventListener("execution_error",execEndHandler); api.addEventListener("execution_interrupted",execEndHandler);

    const ro=new ResizeObserver(()=>resizeCanvas()); ro.observe(canvasWrap);
    const io=new IntersectionObserver(entries=>{ visible=entries.some(e=>e.isIntersecting); }); io.observe(root);

    function frame(now){
        if(destroyed)return; rafId=requestAnimationFrame(frame);
        if(!visible||document.hidden){lastFrame=now;return;}
        const dt=Math.min(.05,Math.max(0,(now-lastFrame)/1000)); lastFrame=now; accumulator+=dt;
        if(accumulator<1/30)return; const step=Math.min(.05,accumulator); accumulator=0; update(step); draw();
    }
    function destroy(){
        if(destroyed)return; destroyed=true; cancelAnimationFrame(rafId); ro.disconnect(); io.disconnect();
        canvas.removeEventListener("keydown",handleKey); canvas.removeEventListener("keyup",handleKeyUp);
        api.removeEventListener("execution_start",execStartHandler); api.removeEventListener("execution_success",execEndHandler); api.removeEventListener("execution_error",execEndHandler); api.removeEventListener("execution_interrupted",execEndHandler);
        try{audioCtx?.close?.();}catch(_){}
    }

    updateSoundUi(); updateHud(); resizeCanvas(); draw(); rafId=requestAnimationFrame(frame);
    return { root, destroy, resizeCanvas };
}

function attachGameSafely(node,attempt=0){
    if(!node||node.__comfySpaceInvadersGame||node.__comfySpaceInvadersAttachFailed)return;
    if(typeof node.addDOMWidget!=="function"){
        if(attempt<40)setTimeout(()=>attachGameSafely(node,attempt+1),50);
        else{node.__comfySpaceInvadersAttachFailed=true;console.error("[Comfy Space Invaders] addDOMWidget unavailable after 2 seconds.");}
        return;
    }
    try{
        const game=createGame(node);
        const widget=node.addDOMWidget("space_invaders_game","custom",game.root,{
            hideOnZoom:false,
            getMinHeight(){return 340;},
            getHeight(){const h=Number(node.size?.[1]??500);return Math.max(340,h-78);},
            afterResize(){try{game.resizeCanvas();}catch(_){}}
        });
        if(widget)widget.serialize=false;
        node.__comfySpaceInvadersGame=game;
        const w=Number(node.size?.[0]??0),h=Number(node.size?.[1]??0);
        if(w<430||h<470)node.setSize?.([Math.max(460,w||0),Math.max(520,h||0)]);
        requestAnimationFrame(()=>{try{game.resizeCanvas();}catch(_){} node.graph?.setDirtyCanvas?.(true,true);});
        console.info("[Comfy Space Invaders] game attached",node.id);
    }catch(err){node.__comfySpaceInvadersAttachFailed=true;console.error("[Comfy Space Invaders] game UI attach failed; node kept alive:",err);}
}

app.registerExtension({
    name:EXTENSION_NAME,
    async beforeRegisterNodeDef(nodeType,nodeData){
        if(nodeData?.name!==NODE_NAME)return;
        if(nodeType.prototype.__comfySpaceInvadersPatched)return;
        nodeType.prototype.__comfySpaceInvadersPatched=true;
        const originalCreated=nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated=function(){ const result=originalCreated?.apply(this,arguments); const node=this; setTimeout(()=>attachGameSafely(node,0),0); return result; };
        const originalRemoved=nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved=function(){ try{this.__comfySpaceInvadersGame?.destroy?.();}catch(err){console.warn("[Comfy Space Invaders] cleanup error",err);} this.__comfySpaceInvadersGame=null; return originalRemoved?.apply(this,arguments); };
    }
});
