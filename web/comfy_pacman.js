import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { createSamplePlayer } from "./arcade_common.js";

const EXTENSION_NAME = "spb1234t.ComfyPacman.V25";
const NODE_NAME = "ComfyPacmanSPB1234T";

const DIRS = {
    LEFT:  { x: -1, y:  0, name: "LEFT" },
    RIGHT: { x:  1, y:  0, name: "RIGHT" },
    UP:    { x:  0, y: -1, name: "UP" },
    DOWN:  { x:  0, y:  1, name: "DOWN" },
    STOP:  { x:  0, y:  0, name: "STOP" },
};

const KEY_TO_DIR = {
    ArrowLeft: DIRS.LEFT,
    ArrowRight: DIRS.RIGHT,
    ArrowUp: DIRS.UP,
    ArrowDown: DIRS.DOWN,
};

const OPPOSITE = {
    LEFT: "RIGHT",
    RIGHT: "LEFT",
    UP: "DOWN",
    DOWN: "UP",
    STOP: "STOP",
};

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function shuffle(arr, rnd) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function makeButton(label) {
    const b = document.createElement("button");
    b.textContent = label;
    Object.assign(b.style, {
        border: "1px solid #3b465e",
        borderRadius: "5px",
        background: "#11172a",
        color: "#d7def2",
        font: "600 11px system-ui, sans-serif",
        padding: "4px 8px",
        cursor: "pointer",
        lineHeight: "16px",
    });
    b.onmouseenter = () => b.style.background = "#1d2642";
    b.onmouseleave = () => b.style.background = "#11172a";
    return b;
}

function createGame(node) {
    const COLS = 28;
    const ROWS = 31;
    const TUNNEL_Y = 14;
    const root = document.createElement("div");
    root.className = "comfy-pacman-root";
    Object.assign(root.style, {
        width: "100%",
        height: "100%",
        minHeight: "360px",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: "5px",
        padding: "6px",
        background: "#00040f",
        borderRadius: "7px",
        overflow: "hidden",
        color: "#dce3f7",
        fontFamily: "system-ui, sans-serif",
        userSelect: "none",
    });

    const hud = document.createElement("div");
    Object.assign(hud.style, {
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr 1fr",
        gap: "4px",
        alignItems: "center",
        font: "800 11px system-ui, sans-serif",
        letterSpacing: ".4px",
    });

    const scoreEl = document.createElement("div");
    const highEl = document.createElement("div");
    const livesEl = document.createElement("div");
    const levelEl = document.createElement("div");
    scoreEl.style.textAlign = "left";
    highEl.style.textAlign = "center";
    livesEl.style.textAlign = "center";
    levelEl.style.textAlign = "right";
    scoreEl.style.color = "#ffffff";
    highEl.style.color = "#ffffff";
    livesEl.style.color = "#ffd928";
    levelEl.style.color = "#ffffff";
    hud.append(scoreEl, highEl, livesEl, levelEl);

    const canvasWrap = document.createElement("div");
    Object.assign(canvasWrap.style, {
        position: "relative",
        flex: "1 1 auto",
        minHeight: "260px",
        minWidth: "0",
        overflow: "hidden",
        borderRadius: "6px",
        background: "#000",
        border: "1px solid #252c3d",
    });

    const canvas = document.createElement("canvas");
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-label", "Comfy Pac-Man game. Use arrow keys.");
    Object.assign(canvas.style, {
        display: "block",
        width: "100%",
        height: "100%",
        outline: "none",
        cursor: "crosshair",
        background: "#000",
    });
    canvasWrap.appendChild(canvas);

    const footer = document.createElement("div");
    Object.assign(footer.style, {
        display: "flex",
        alignItems: "center",
        gap: "5px",
        minHeight: "26px",
    });

    const statusDot = document.createElement("span");
    Object.assign(statusDot.style, {
        display: "inline-block",
        width: "8px",
        height: "8px",
        borderRadius: "999px",
        background: "#6d7485",
        flex: "0 0 auto",
    });
    const statusEl = document.createElement("span");
    Object.assign(statusEl.style, {
        font: "600 10px system-ui, sans-serif",
        color: "#aab3ca",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        flex: "1 1 auto",
    });

    const newBtn = makeButton("NEW");
    const pauseBtn = makeButton("PAUSE");
    const soundBtn = makeButton("SND ON");
    soundBtn.title = "Toggle arcade sound";
    soundBtn.style.minWidth = "56px";

    const volumeSlider = document.createElement("input");
    volumeSlider.type = "range";
    volumeSlider.min = "0";
    volumeSlider.max = "100";
    volumeSlider.step = "1";
    volumeSlider.title = "Game volume";
    volumeSlider.setAttribute("aria-label", "Comfy Pac-Man volume");
    Object.assign(volumeSlider.style, {
        width: "62px",
        height: "20px",
        cursor: "pointer",
        accentColor: "#ffd928",
        flex: "0 0 62px",
    });

    footer.append(statusDot, statusEl, soundBtn, volumeSlider, newBtn, pauseBtn);
    root.append(hud, canvasWrap, footer);

    const ctx = canvas.getContext("2d", { alpha: false });

    let canvasCssW = 1;
    let canvasCssH = 1;
    let dpr = 1;
    let grid = [];
    let pellets = new Set();
    let powerPellets = new Set();
    let pelletTotal = 0;
    let score = 0;
    let highScore = 0;
    try {
        highScore = Number(localStorage.getItem("comfyPacmanHighScore") || 0);
        if (!Number.isFinite(highScore)) highScore = 0;
    } catch (_) {
        highScore = 0;
    }

    // V5 audio settings are browser-local, like the high score. The game uses
    // Web Audio synthesis only: no bundled WAV/MP3 files or Python packages.
    let soundEnabled = true;
    let soundVolume = 0.35;
    try {
        const storedEnabled = localStorage.getItem("comfyPacmanSoundEnabled");
        if (storedEnabled !== null) soundEnabled = storedEnabled !== "0";
        const storedVolumeRaw = localStorage.getItem("comfyPacmanSoundVolume");
        if (storedVolumeRaw !== null) {
            const storedVolume = Number(storedVolumeRaw);
            if (Number.isFinite(storedVolume)) soundVolume = clamp(storedVolume, 0, 1);
        }
    } catch (_) {}
    volumeSlider.value = String(Math.round(soundVolume * 100));

    let audioCtx = null;
    let masterGain = null;
    let audioGestureSeen = false;
    let pelletSoundFlip = false;
    let frightenedSoundCooldown = 0;
    let frightenedLoopActive = false;
    let frightenedFallbackActive = false;
    const samples = createSamplePlayer("Pacman", {
        isEnabled: () => soundEnabled,
        getVolume: () => soundVolume,
        isUnlocked: () => audioGestureSeen,
    });
    samples.preload(["start.wav","pellet_1.wav","pellet_2.wav","power_pellet.wav","frightened.wav","ghost_eaten.wav","death.wav","level_complete.wav"]);

    function saveAudioSettings() {
        try {
            localStorage.setItem("comfyPacmanSoundEnabled", soundEnabled ? "1" : "0");
            localStorage.setItem("comfyPacmanSoundVolume", String(soundVolume));
        } catch (_) {}
    }

    function ensureAudioFromGesture() {
        audioGestureSeen = true;
        if (!soundEnabled) return;
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        if (!audioCtx) {
            try {
                audioCtx = new AudioContextClass();
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
        if (audioCtx.state === "suspended") {
            audioCtx.resume().catch(() => {});
        }
        if (frightenedTimer > 0 && state !== "paused") startFrightenedSound();
    }

    function audioReady() {
        return soundEnabled && audioGestureSeen && audioCtx && masterGain && audioCtx.state === "running";
    }

    function tone(freq, duration = 0.08, { type = "square", gain = 0.10, endFreq = null, delay = 0 } = {}) {
        if (!audioReady()) return;
        const now = audioCtx.currentTime + Math.max(0, delay);
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(Math.max(20, freq), now);
        if (Number.isFinite(endFreq)) {
            osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
        }
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), now + Math.min(0.008, duration * 0.25));
        g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        osc.connect(g);
        g.connect(masterGain);
        osc.start(now);
        osc.stop(now + duration + 0.015);
    }

    function soundPellet() {
        pelletSoundFlip = !pelletSoundFlip;
        const file = pelletSoundFlip ? "pellet_1.wav" : "pellet_2.wav";
        samples.play(file, () => tone(pelletSoundFlip ? 285 : 365, 0.038, { type: "square", gain: 0.055, endFreq: pelletSoundFlip ? 350 : 270 }));
    }

    function soundPower() {
        samples.play("power_pellet.wav", () => {
            tone(175, 0.14, { type: "sawtooth", gain: 0.085, endFreq: 95 });
            tone(230, 0.10, { type: "square", gain: 0.055, endFreq: 320, delay: 0.08 });
        });
    }

    function soundGhostEaten() {
        samples.play("ghost_eaten.wav", () => {
            tone(520, 0.13, { type: "square", gain: 0.085, endFreq: 1050 });
            tone(780, 0.10, { type: "sine", gain: 0.065, endFreq: 1320, delay: 0.05 });
        });
    }

    function soundDeath() {
        samples.play("death.wav", () => {
            tone(680, 0.48, { type: "sawtooth", gain: 0.095, endFreq: 75 });
            tone(420, 0.42, { type: "square", gain: 0.045, endFreq: 55, delay: 0.12 });
        });
    }

    function soundStart() {
        samples.play("start.wav", () => {
            tone(330, 0.09, { type: "square", gain: 0.055 });
            tone(440, 0.09, { type: "square", gain: 0.055, delay: 0.09 });
            tone(660, 0.12, { type: "square", gain: 0.065, delay: 0.18 });
        });
    }

    function soundLevelComplete() {
        samples.play("level_complete.wav", () => [392, 523, 659, 784, 1047].forEach((f, i) =>
            tone(f, 0.085, { type: i < 3 ? "square" : "sine", gain: 0.06, delay: i * 0.07 })
        ));
    }

    function soundFrightenedFallbackPulse() {
        tone(118, 0.055, { type: "square", gain: 0.035, endFreq: 155 });
    }

    function startFrightenedSound() {
        if (frightenedTimer <= 0 || !soundEnabled || !audioGestureSeen || state === "paused") return;
        if (frightenedLoopActive || frightenedFallbackActive) return;

        const started = samples.loop("frightened.wav", () => {
            frightenedLoopActive = false;
            frightenedFallbackActive = true;
            frightenedSoundCooldown = 0;
        }, 0.8);

        if (started) {
            frightenedLoopActive = true;
            frightenedFallbackActive = false;
        } else if (soundEnabled && audioGestureSeen) {
            frightenedFallbackActive = true;
            frightenedSoundCooldown = 0;
        }
    }

    function stopFrightenedSound() {
        samples.stopLoop("frightened.wav");
        frightenedLoopActive = false;
        frightenedFallbackActive = false;
        frightenedSoundCooldown = 0;
    }

    function updateSoundControls() {
        soundBtn.textContent = soundEnabled ? "SND ON" : "SND OFF";
        soundBtn.style.opacity = soundEnabled ? "1" : "0.65";
        volumeSlider.disabled = !soundEnabled;
        volumeSlider.style.opacity = soundEnabled ? "1" : "0.45";
        if (masterGain) masterGain.gain.value = soundEnabled ? soundVolume : 0;
    }

    let lives = 3;
    let level = 1;
    let state = "idle"; // idle | ready | playing | paused | gameover
    let stateBeforePause = "playing";
    let readyTimer = 0;
    let frightenedTimer = 0;
    let ghostEatValue = 200;
    let workflowRunning = false;
    let hasStartedFromWorkflow = false;
    let gameTime = 0;
    let mouthPhase = 0;
    let lastFrame = performance.now();
    let rafId = 0;
    let destroyed = false;
    let visible = true;
    let frameAccumulator = 0;

    let pac = null;
    let ghosts = [];

    function tileKey(x, y) {
        return `${x},${y}`;
    }

    function isOpen(x, y) {
        // Classic side tunnel: allow one virtual tile beyond either edge so
        // actors can travel off-screen and wrap to the opposite side.
        if (y === TUNNEL_Y && (x === -1 || x === COLS)) return true;
        if (y < 0 || y >= ROWS || x < 0 || x >= COLS) return false;
        const cell = grid[y]?.[x];
        return cell !== "#" && cell !== "X";
    }

    function nearestOpen(tx, ty) {
        tx = clamp(Math.round(tx), 1, COLS - 2);
        ty = clamp(Math.round(ty), 1, ROWS - 2);
        if (isOpen(tx, ty)) return { x: tx, y: ty };
        for (let r = 1; r < Math.max(COLS, ROWS); r++) {
            for (let y = ty - r; y <= ty + r; y++) {
                for (let x = tx - r; x <= tx + r; x++) {
                    if (x < 1 || y < 1 || x >= COLS - 1 || y >= ROWS - 1) continue;
                    if (Math.abs(x - tx) !== r && Math.abs(y - ty) !== r) continue;
                    if (isOpen(x, y)) return { x, y };
                }
            }
        }
        return { x: 1, y: 1 };
    }

    function loadClassicMaze() {
        // Fixed classic arcade-style maze.  The map uses:
        //   # = visible wall
        //   X = outside/void (not walkable, not drawn)
        //   . = pellet
        //   o = power pellet
        //   space / - = open corridor without pellet (ghost-house/tunnel)
        //
        // The familiar 28 x 31 proportions, central ghost house, four corner
        // energizers and horizontal side tunnel replace the old procedural maze.
        const raw = [
            "############################",
            "#............##............#",
            "#.####.#####.##.#####.####.#",
            "#o####.#####.##.#####.####o#",
            "#.####.#####.##.#####.####.#",
            "#..........................#",
            "#.####.##.########.##.####.#",
            "#.####.##.########.##.####.#",
            "#......##....##....##......#",
            "######.##### ## #####.######",
            "     #.##### ## #####.#     ",
            "     #.##          ##.#     ",
            "     #.## ###--### ##.#     ",
            "######.## #      # ##.######",
            "      .   #      #   .      ",
            "######.## #      # ##.######",
            "     #.## ######## ##.#     ",
            "     #.##          ##.#     ",
            "     #.## ######## ##.#     ",
            "######.## ######## ##.######",
            "#............##............#",
            "#.####.#####.##.#####.####.#",
            "#.####.#####.##.#####.####.#",
            "#o..##................##..o#",
            "###.##.##.########.##.##.###",
            "###.##.##.########.##.##.###",
            "#......##....##....##......#",
            "#.##########.##.##########.#",
            "#.##########.##.##########.#",
            "#..........................#",
            "############################",
        ];

        grid = raw.map((row, y) => {
            const chars = row.split("");
            if (y !== TUNNEL_Y) {
                // In the classic board the indented side areas around the ghost
                // house are black void, not corridors. Mark just those leading
                // and trailing blanks as X while preserving internal blank paths.
                let first = chars.findIndex(c => c !== " ");
                let last = chars.length - 1;
                while (last >= 0 && chars[last] === " ") last--;
                if (first < 0) first = chars.length;
                for (let x = 0; x < first; x++) chars[x] = "X";
                for (let x = last + 1; x < chars.length; x++) chars[x] = "X";
            }
            return chars;
        });

        pellets = new Set();
        powerPellets = new Set();
        for (let y = 0; y < ROWS; y++) {
            for (let x = 0; x < COLS; x++) {
                const cell = grid[y]?.[x];
                if (cell === "." || cell === "o") {
                    const k = tileKey(x, y);
                    pellets.add(k);
                    if (cell === "o") powerPellets.add(k);
                }
            }
        }
        pelletTotal = pellets.size;
    }

    function actorAt(x, y, dir = DIRS.STOP) {
        return {
            x, y,
            nextX: x,
            nextY: y,
            progress: 0,
            dir,
            desired: dir,
        };
    }

    function actorPos(a) {
        return {
            x: a.x + (a.nextX - a.x) * a.progress,
            y: a.y + (a.nextY - a.y) * a.progress,
        };
    }

    // Fixed ghost-house geometry for the classic V6/V7 board.  The two '-'
    // cells are the door.  Pac-Man uses the normal maze rules; roaming ghosts
    // are explicitly prevented from choosing a move back through this door.
    const GHOST_HOUSE = {
        left: 11, right: 16, top: 13, bottom: 15,
        doorLeft: 13, doorRight: 14, doorY: 12,
        exitX: 13, exitY: 11,
    };

    function isGhostHouseInterior(x, y) {
        return x >= GHOST_HOUSE.left && x <= GHOST_HOUSE.right
            && y >= GHOST_HOUSE.top && y <= GHOST_HOUSE.bottom;
    }

    function isGhostDoor(x, y) {
        return y === GHOST_HOUSE.doorY
            && x >= GHOST_HOUSE.doorLeft && x <= GHOST_HOUSE.doorRight;
    }

    function availableDirs(a, allowReverse = true) {
        const dirs = [DIRS.LEFT, DIRS.RIGHT, DIRS.UP, DIRS.DOWN].filter(d => isOpen(a.x + d.x, a.y + d.y));
        if (allowReverse || dirs.length <= 1 || a.dir.name === "STOP") return dirs;
        const noReverse = dirs.filter(d => d.name !== OPPOSITE[a.dir.name]);
        return noReverse.length ? noReverse : dirs;
    }

    function availableGhostDirs(g, allowReverse = true) {
        let dirs = [DIRS.LEFT, DIRS.RIGHT, DIRS.UP, DIRS.DOWN].filter(d => {
            const nx = g.x + d.x, ny = g.y + d.y;
            if (!isOpen(nx, ny)) return false;

            // Once a ghost has left the house, it must stay in the maze.
            // This stops Blinky (and later the other ghosts) greedily wandering
            // back into the pen through the open door cells.
            if (g.houseState === "roaming" && (isGhostDoor(nx, ny) || isGhostHouseInterior(nx, ny))) {
                return false;
            }
            return true;
        });

        if (allowReverse || dirs.length <= 1 || g.dir.name === "STOP") return dirs;
        const noReverse = dirs.filter(d => d.name !== OPPOSITE[g.dir.name]);
        return noReverse.length ? noReverse : dirs;
    }

    function chooseGhostHouseExitDir(g) {
        // The normal ghost AI is deliberately greedy rather than a full path
        // finder. Inside the pen that can make a ghost oscillate forever.
        // During the release phase use a tiny BFS to the tile immediately above
        // the door, then hand the ghost back to the normal chase/scatter AI.
        const tx = GHOST_HOUSE.exitX, ty = GHOST_HOUSE.exitY;
        if (g.x === tx && g.y === ty) return DIRS.STOP;

        const dirs = [DIRS.UP, DIRS.LEFT, DIRS.RIGHT, DIRS.DOWN];
        const queue = [{ x: g.x, y: g.y, first: null }];
        const seen = new Set([tileKey(g.x, g.y)]);

        for (let qi = 0; qi < queue.length; qi++) {
            const cur = queue[qi];
            for (const d of dirs) {
                const nx = cur.x + d.x, ny = cur.y + d.y;
                if (!isOpen(nx, ny)) continue;
                const key = tileKey(nx, ny);
                if (seen.has(key)) continue;
                seen.add(key);
                const first = cur.first || d;
                if (nx === tx && ny === ty) return first;
                queue.push({ x: nx, y: ny, first });
            }
        }
        return DIRS.STOP;
    }

    function beginStep(a, dir) {
        if (!dir || dir.name === "STOP" || !isOpen(a.x + dir.x, a.y + dir.y)) {
            a.nextX = a.x;
            a.nextY = a.y;
            a.progress = 0;
            a.dir = DIRS.STOP;
            return;
        }
        a.dir = dir;
        a.nextX = a.x + dir.x;
        a.nextY = a.y + dir.y;
        a.progress = 0;
    }

    function isPacOpen(x, y) {
        return isOpen(x, y) && !isGhostDoor(x, y) && !isGhostHouseInterior(x, y);
    }

    function choosePacDir() {
        if (pac.desired && isPacOpen(pac.x + pac.desired.x, pac.y + pac.desired.y)) return pac.desired;
        if (pac.dir && isPacOpen(pac.x + pac.dir.x, pac.y + pac.dir.y)) return pac.dir;
        return DIRS.STOP;
    }

    function ghostTarget(g) {
        const px = pac.x, py = pac.y;
        if (g.kind === 0) return { x: px, y: py }; // Blinky
        if (g.kind === 1) return { x: px + pac.dir.x * 4, y: py + pac.dir.y * 4 }; // Pinky
        if (g.kind === 2) { // Inky-ish: overshoot away from Blinky
            const b = ghosts[0] || g;
            return { x: px * 2 - b.x, y: py * 2 - b.y };
        }
        const dist = Math.abs(g.x - px) + Math.abs(g.y - py); // Clyde
        return dist > 7 ? { x: px, y: py } : { x: 1, y: ROWS - 2 };
    }

    function chooseGhostDir(g, rnd) {
        if (g.houseState === "exiting") {
            // The exit target is one tile above the door. As soon as the ghost
            // reaches the upper corridor it becomes a normal roaming ghost.
            if (g.y < GHOST_HOUSE.doorY && !isGhostDoor(g.x, g.y) && !isGhostHouseInterior(g.x, g.y)) {
                g.houseState = "roaming";
            } else {
                const exitDir = chooseGhostHouseExitDir(g);
                if (exitDir.name !== "STOP") return exitDir;
            }
        }

        const dirs = availableGhostDirs(g, false);
        if (!dirs.length) return DIRS.STOP;
        if (frightenedTimer > 0) return dirs[Math.floor(rnd() * dirs.length)];

        const scatterPhase = (Math.floor(gameTime / 11) % 2) === 1;
        let target;
        if (scatterPhase) {
            const corners = [
                { x: COLS - 2, y: 1 },
                { x: 1, y: 1 },
                { x: COLS - 2, y: ROWS - 2 },
                { x: 1, y: ROWS - 2 },
            ];
            target = corners[g.kind % corners.length];
        } else {
            target = ghostTarget(g);
        }

        let best = dirs[0];
        let bestScore = Infinity;
        for (const d of dirs) {
            const nx = g.x + d.x, ny = g.y + d.y;
            const dx = nx - target.x, dy = ny - target.y;
            const s = dx * dx + dy * dy + rnd() * 0.18;
            if (s < bestScore) {
                bestScore = s;
                best = d;
            }
        }
        return best;
    }

    function advanceActor(a, speed, dt, chooser) {
        let remain = speed * dt;
        let guard = 0;
        while (remain > 0 && guard++ < 8) {
            if (a.nextX === a.x && a.nextY === a.y) {
                beginStep(a, chooser());
                if (a.nextX === a.x && a.nextY === a.y) break;
            }
            const toEnd = 1 - a.progress;
            if (remain < toEnd) {
                a.progress += remain;
                remain = 0;
            } else {
                remain -= toEnd;
                a.x = a.nextX;
                a.y = a.nextY;

                // Complete classic left/right tunnel wrap after an actor has
                // travelled one tile beyond the visible board edge.
                if (a.y === TUNNEL_Y && a.x < 0) a.x = COLS - 1;
                else if (a.y === TUNNEL_Y && a.x >= COLS) a.x = 0;

                a.progress = 0;
                a.nextX = a.x;
                a.nextY = a.y;
                beginStep(a, chooser());
            }
        }
    }

    function resetActors() {
        // Familiar classic starting positions: Pac-Man below the ghost house,
        // Blinky above it, with the other three ghosts inside the house.
        const p0 = nearestOpen(13, 23);
        pac = actorAt(p0.x, p0.y, DIRS.LEFT);
        pac.desired = DIRS.LEFT;
        beginStep(pac, isOpen(pac.x - 1, pac.y) ? DIRS.LEFT : DIRS.UP);

        const starts = [
            nearestOpen(13, 11),
            nearestOpen(13, 14),
            nearestOpen(12, 14),
            nearestOpen(15, 14),
        ];
        ghosts = starts.map((p, i) => ({
            ...actorAt(p.x, p.y, [DIRS.LEFT, DIRS.UP, DIRS.RIGHT, DIRS.LEFT][i]),
            kind: i,
            respawn: i * 0.45,
            homeX: p.x,
            homeY: p.y,
            // Blinky begins above the pen. Pinky/Inky/Clyde use the explicit
            // release state so they always route out through the house door.
            houseState: i === 0 ? "roaming" : "exiting",
        }));
    }

    function startLevel() {
        stopFrightenedSound();
        loadClassicMaze();
        resetActors();
        frightenedTimer = 0;
        ghostEatValue = 200;
        readyTimer = 1.15;
        state = "ready";
        updateHud();
    }

    function newGame() {
        score = 0;
        lives = 3;
        level = 1;
        gameTime = 0;
        startLevel();
        soundStart();
        canvas.focus({ preventScroll: true });
    }

    function loseLife() {
        stopFrightenedSound();
        soundDeath();
        lives -= 1;
        updateHighScore();
        if (lives <= 0) {
            state = "gameover";
            updateHud();
            return;
        }
        resetActors();
        frightenedTimer = 0;
        readyTimer = 1.2;
        state = "ready";
        updateHud();
    }

    function eatAtPacTile() {
        const k = tileKey(pac.x, pac.y);
        if (!pellets.has(k)) return;
        pellets.delete(k);
        if (powerPellets.has(k)) {
            powerPellets.delete(k);
            frightenedTimer = 7.0;
            frightenedSoundCooldown = 0;
            ghostEatValue = 200;
            score += 50;
            soundPower();
            startFrightenedSound();
            // Reverse ghosts when power mode starts.
            for (const g of ghosts) {
                if (g.dir.name !== "STOP") {
                    const rev = DIRS[OPPOSITE[g.dir.name]];
                    g.dir = rev;
                }
            }
        } else {
            score += 10;
            soundPellet();
        }
        updateHighScore();

        if (pellets.size === 0) {
            stopFrightenedSound();
            soundLevelComplete();
            level += 1;
            score += 500;
            updateHighScore();
            startLevel();
        }
    }

    function updateHighScore() {
        if (score > highScore) {
            highScore = score;
            try { localStorage.setItem("comfyPacmanHighScore", String(highScore)); } catch (_) {}
        }
        updateHud();
    }

    
function updateHud() {
    scoreEl.textContent = `1UP ${String(score).padStart(5, "0")}`;
    highEl.textContent = `HI-SCORE ${String(highScore).padStart(5, "0")}`;
    livesEl.textContent = `LIVES ${"●".repeat(Math.max(0, lives))}`;
    levelEl.textContent = `LEVEL ${level}`;
    pauseBtn.textContent = state === "paused" ? "RESUME" : "PAUSE";

    if (workflowRunning) {
        statusDot.style.background = "#58d68d";
        statusEl.textContent = state === "playing" ? "WORKFLOW RUNNING • GAME ACTIVE" : "WORKFLOW RUNNING";
    } else {
        statusDot.style.background = hasStartedFromWorkflow ? "#6386ff" : "#6d7485";
        if (state === "idle") statusEl.textContent = "QUEUE A WORKFLOW TO AUTO-START • CLICK GAME TO PLAY";
        else if (state === "gameover") statusEl.textContent = "GAME OVER • R OR NEW TO RESTART";
        else if (state === "paused") statusEl.textContent = "GAME PAUSED • P TO RESUME";
        else statusEl.textContent = "ARROWS • P PAUSE • R RESTART";
    }
}


    function togglePause() {
        if (state === "idle" || state === "gameover") {
            newGame();
            return;
        }
        if (state === "paused") {
            state = stateBeforePause || "playing";
            lastFrame = performance.now();
            if (frightenedTimer > 0) {
                if (frightenedLoopActive) samples.resumeLoop("frightened.wav");
                else startFrightenedSound();
            }
        } else {
            stateBeforePause = state;
            state = "paused";
            if (frightenedLoopActive) samples.pauseLoop("frightened.wav");
        }
        updateHud();
        canvas.focus({ preventScroll: true });
    }

    function onExecutionStart() {
        workflowRunning = true;
        hasStartedFromWorkflow = true;
        // First workflow execution starts the game. Subsequent queued jobs do
        // NOT reset a game that is already in progress.
        if (state === "idle" || state === "gameover") newGame();
        updateHud();
    }

    function onExecutionEnd() {
        workflowRunning = false;
        updateHud();
    }

    const execStartHandler = () => onExecutionStart();
    const execSuccessHandler = () => onExecutionEnd();
    const execErrorHandler = () => onExecutionEnd();
    const execInterruptedHandler = () => onExecutionEnd();
    api.addEventListener("execution_start", execStartHandler);
    api.addEventListener("execution_success", execSuccessHandler);
    api.addEventListener("execution_error", execErrorHandler);
    api.addEventListener("execution_interrupted", execInterruptedHandler);

    function handleKey(e) {
        const d = KEY_TO_DIR[e.key];
        if (d || e.key === "p" || e.key === "P" || e.key === "r" || e.key === "R") {
            ensureAudioFromGesture();
        }
        if (d) {
            e.preventDefault();
            e.stopPropagation();
            if (state === "idle" || state === "gameover") newGame();
            pac.desired = d;
            return;
        }
        if (e.key === "p" || e.key === "P") {
            e.preventDefault();
            e.stopPropagation();
            togglePause();
        } else if (e.key === "r" || e.key === "R") {
            e.preventDefault();
            e.stopPropagation();
            newGame();
        }
    }

    canvas.addEventListener("keydown", handleKey);
    canvas.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        ensureAudioFromGesture();
        canvas.focus({ preventScroll: true });
        if (state === "idle") newGame();
    });
    newBtn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        ensureAudioFromGesture();
        newGame();
    });
    pauseBtn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        ensureAudioFromGesture();
        togglePause();
    });
    soundBtn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        soundEnabled = !soundEnabled;
        if (!soundEnabled) stopFrightenedSound();
        saveAudioSettings();
        updateSoundControls();
        if (soundEnabled) {
            ensureAudioFromGesture();
            if (frightenedTimer > 0 && state !== "paused") startFrightenedSound();
            setTimeout(() => tone(520, 0.07, { type: "square", gain: 0.055, endFreq: 680 }), 0);
        }
        canvas.focus({ preventScroll: true });
    });
    volumeSlider.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        ensureAudioFromGesture();
    });
    volumeSlider.addEventListener("click", (e) => e.stopPropagation());
    volumeSlider.addEventListener("input", (e) => {
        e.stopPropagation();
        soundVolume = clamp(Number(volumeSlider.value) / 100, 0, 1);
        saveAudioSettings();
        updateSoundControls();
        samples.syncVolume();
    });

    function resizeCanvas() {
        const rect = canvas.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) return;
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvasCssW = rect.width;
        canvasCssH = rect.height;
        const w = Math.max(1, Math.round(rect.width * dpr));
        const h = Math.max(1, Math.round(rect.height * dpr));
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
        }
    }

    const ro = (typeof ResizeObserver !== "undefined")
        ? new ResizeObserver(() => resizeCanvas())
        : { observe() {}, disconnect() {} };
    ro.observe(canvasWrap);

    const io = (typeof IntersectionObserver !== "undefined")
        ? new IntersectionObserver((entries) => {
            visible = entries.some(e => e.isIntersecting);
            if (visible) lastFrame = performance.now();
        }, { root: null, threshold: 0 })
        : { observe() {}, disconnect() {} };
    io.observe(root);

    function update(dt) {
        if (state === "ready") {
            readyTimer -= dt;
            if (readyTimer <= 0) state = "playing";
            updateHud();
            return;
        }
        if (state !== "playing") return;

        gameTime += dt;
        mouthPhase += dt * 11;
        const wasFrightened = frightenedTimer > 0;
        frightenedTimer = Math.max(0, frightenedTimer - dt);
        if (frightenedTimer > 0) {
            if (!frightenedLoopActive && !frightenedFallbackActive) startFrightenedSound();
            if (frightenedFallbackActive) {
                frightenedSoundCooldown -= dt;
                if (frightenedSoundCooldown <= 0) {
                    soundFrightenedFallbackPulse();
                    frightenedSoundCooldown = frightenedTimer < 2 ? 0.16 : 0.27;
                }
            }
        } else {
            if (wasFrightened || frightenedLoopActive || frightenedFallbackActive) stopFrightenedSound();
            ghostEatValue = 200;
        }

        const pacSpeed = 5.15 + Math.min(1.2, (level - 1) * 0.13);
        const ghostSpeedBase = 4.55 + Math.min(1.6, (level - 1) * 0.16);

        const oldTile = tileKey(pac.x, pac.y);
        advanceActor(pac, pacSpeed, dt, choosePacDir);
        if (tileKey(pac.x, pac.y) !== oldTile || pac.progress < 0.06) eatAtPacTile();

        const rng = mulberry32(((gameTime * 1000) | 0) ^ (level * 9973));
        for (const g of ghosts) {
            if (g.respawn > 0) {
                g.respawn -= dt;
                continue;
            }
            const speed = frightenedTimer > 0 ? ghostSpeedBase * 0.74 : ghostSpeedBase + g.kind * 0.05;
            advanceActor(g, speed, dt, () => chooseGhostDir(g, rng));
        }

        const pp = actorPos(pac);
        for (const g of ghosts) {
            if (g.respawn > 0) continue;
            const gp = actorPos(g);
            const dx = pp.x - gp.x, dy = pp.y - gp.y;
            if (dx * dx + dy * dy < 0.34) {
                if (frightenedTimer > 0) {
                    soundGhostEaten();
                    score += ghostEatValue;
                    ghostEatValue = Math.min(1600, ghostEatValue * 2);
                    updateHighScore();
                    g.x = g.homeX;
                    g.y = g.homeY;
                    g.nextX = g.x;
                    g.nextY = g.y;
                    g.progress = 0;
                    g.dir = DIRS.STOP;
                    g.respawn = 1.2;
                    g.houseState = (isGhostHouseInterior(g.x, g.y) || isGhostDoor(g.x, g.y))
                        ? "exiting"
                        : "roaming";
                } else {
                    loseLife();
                    break;
                }
            }
        }
    }

    function boardTransform() {
        const margin = 7;
        const s = Math.max(1, Math.min((canvasCssW - margin * 2) / COLS, (canvasCssH - margin * 2) / ROWS));
        const bw = COLS * s, bh = ROWS * s;
        return {
            s,
            ox: (canvasCssW - bw) / 2,
            oy: (canvasCssH - bh) / 2,
        };
    }

    function drawRoundedRect(x, y, w, h, r) {
        // ComfyUI can call us before the DOM widget has completed layout, and
        // can briefly report tiny sizes while a node is being resized/collapsed.
        // CanvasRenderingContext2D.arcTo throws if radius is negative, so make
        // this helper safe for every transient geometry state.
        w = Math.max(0, Number.isFinite(w) ? w : 0);
        h = Math.max(0, Number.isFinite(h) ? h : 0);
        r = Math.max(0, Number.isFinite(r) ? r : 0);
        r = Math.min(r, w / 2, h / 2);

        ctx.beginPath();
        if (w <= 0 || h <= 0) {
            ctx.rect(x, y, 0, 0);
            ctx.closePath();
            return;
        }
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    

function drawPixelPacman(x, y, s, dir, phase) {
    // Small generated bitmap rather than a smooth vector circle. The mouth uses
    // three discrete arcade-style frames and the bitmap is rotated by direction.
    const N = 13;
    const px = Math.max(1, s / N);
    const frame = Math.floor((Math.sin(phase) * 0.5 + 0.5) * 2.99); // 0..2
    const mouthHalf = [0.08, 0.30, 0.52][frame];
    let facing = 0;
    if (dir?.name === "LEFT") facing = Math.PI;
    else if (dir?.name === "UP") facing = -Math.PI / 2;
    else if (dir?.name === "DOWN") facing = Math.PI / 2;

    ctx.fillStyle = "#ffd91a";
    for (let gy = 0; gy < N; gy++) {
        for (let gx = 0; gx < N; gx++) {
            const nx = (gx + 0.5 - N / 2) / (N / 2);
            const ny = (gy + 0.5 - N / 2) / (N / 2);
            const rr = Math.sqrt(nx * nx + ny * ny);
            if (rr > 0.91) continue;
            let a = Math.atan2(ny, nx) - facing;
            while (a > Math.PI) a -= Math.PI * 2;
            while (a < -Math.PI) a += Math.PI * 2;
            if (Math.abs(a) < mouthHalf && nx * Math.cos(facing) + ny * Math.sin(facing) > -0.08) continue;
            ctx.fillRect(
                Math.round(x + (gx - N / 2) * px),
                Math.round(y + (gy - N / 2) * px),
                Math.ceil(px), Math.ceil(px)
            );
        }
    }
}

function drawGhost(g, x, y, s) {
    // Arcade-style block sprite built on a 14 x 14 logical pixel grid.
    const N = 14;
    const p = Math.max(1, s / N);
    const frightened = frightenedTimer > 0;
    const blink = frightened && frightenedTimer < 2 && Math.floor(frightenedTimer * 8) % 2 === 0;
    const bodyColor = g.respawn > 0 ? "#555b69" : frightened
        ? (blink ? "#f4f4ff" : "#234cff")
        : ["#ff242f", "#ff8ad8", "#3ee8ff", "#ffb347"][g.kind % 4];

    // 1 = body. Two leg frames alternate with game time.
    const legFrame = Math.floor(gameTime * 8 + g.kind) & 1;
    const body = [
        "00001111110000",
        "00111111111100",
        "01111111111110",
        "01111111111110",
        "11111111111111",
        "11111111111111",
        "11111111111111",
        "11111111111111",
        "11111111111111",
        "11111111111111",
        legFrame ? "11101101110111" : "11011110111011",
        legFrame ? "11001100110011" : "10011001100110",
        "00000000000000",
        "00000000000000",
    ];

    const ox = x - (N * p) / 2;
    const oy = y - (N * p) / 2;
    ctx.fillStyle = bodyColor;
    for (let gy = 0; gy < N; gy++) {
        const row = body[gy];
        for (let gx = 0; gx < N; gx++) {
            if (row[gx] === "1") ctx.fillRect(Math.round(ox + gx * p), Math.round(oy + gy * p), Math.ceil(p), Math.ceil(p));
        }
    }

    if (frightened) {
        const feature = blink ? "#ff242f" : "#ffffff";
        ctx.fillStyle = feature;
        const block = (gx, gy, w=1, h=1) => ctx.fillRect(Math.round(ox + gx*p), Math.round(oy + gy*p), Math.ceil(w*p), Math.ceil(h*p));
        block(3,5,2,2); block(9,5,2,2);
        block(3,9); block(4,8); block(5,9); block(6,8); block(7,9); block(8,8); block(9,9); block(10,8);
        return;
    }
    if (g.respawn > 0) return;

    // Eyes are blocky and the pupils track current travel direction.
    const eyeWhite = "#ffffff";
    const pupil = "#1740bf";
    const eyeY = 4;
    const leftEyeX = 3, rightEyeX = 8;
    ctx.fillStyle = eyeWhite;
    for (const ex of [leftEyeX, rightEyeX]) {
        ctx.fillRect(Math.round(ox + ex*p), Math.round(oy + eyeY*p), Math.ceil(3*p), Math.ceil(4*p));
    }
    let pdx = 1, pdy = 1;
    if (g.dir?.name === "LEFT") { pdx = 0; pdy = 1; }
    else if (g.dir?.name === "RIGHT") { pdx = 2; pdy = 1; }
    else if (g.dir?.name === "UP") { pdx = 1; pdy = 0; }
    else if (g.dir?.name === "DOWN") { pdx = 1; pdy = 2; }
    ctx.fillStyle = pupil;
    for (const ex of [leftEyeX, rightEyeX]) {
        ctx.fillRect(Math.round(ox + (ex+pdx)*p), Math.round(oy + (eyeY+pdy)*p), Math.ceil(p), Math.ceil(2*p));
    }
}



function draw() {
    resizeCanvas();

    if (canvasCssW < 16 || canvasCssH < 16) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvasCssW, canvasCssH);

    const { s, ox, oy } = boardTransform();
    const pelletFlash = 0.82 + (Math.sin(gameTime * 8) * 0.5 + 0.5) * 0.34;

    // Stage 2.5 visual pass: keep the thin outlined maze but add rounded
    // arcade-style curves at exposed wall corners so the board reads much
    // closer to the original Pac-Man geometry.
    function traceRoundedWallEdges() {
        const r = Math.max(1.2, s * 0.34);
        ctx.beginPath();
        for (let y = 0; y < ROWS; y++) {
            for (let x = 0; x < COLS; x++) {
                if (grid[y]?.[x] !== "#") continue;
                const top = grid[y - 1]?.[x] === "#";
                const bottom = grid[y + 1]?.[x] === "#";
                const left = grid[y]?.[x - 1] === "#";
                const right = grid[y]?.[x + 1] === "#";
                const x0 = ox + x * s;
                const y0 = oy + y * s;
                const x1 = x0 + s;
                const y1 = y0 + s;

                if (!top) {
                    ctx.moveTo(x0 + (!left ? r : 0), y0);
                    ctx.lineTo(x1 - (!right ? r : 0), y0);
                }
                if (!bottom) {
                    ctx.moveTo(x0 + (!left ? r : 0), y1);
                    ctx.lineTo(x1 - (!right ? r : 0), y1);
                }
                if (!left) {
                    ctx.moveTo(x0, y0 + (!top ? r : 0));
                    ctx.lineTo(x0, y1 - (!bottom ? r : 0));
                }
                if (!right) {
                    ctx.moveTo(x1, y0 + (!top ? r : 0));
                    ctx.lineTo(x1, y1 - (!bottom ? r : 0));
                }

                if (!top && !left) {
                    ctx.moveTo(x0 + r, y0);
                    ctx.arcTo(x0, y0, x0, y0 + r, r);
                }
                if (!top && !right) {
                    ctx.moveTo(x1 - r, y0);
                    ctx.arcTo(x1, y0, x1, y0 + r, r);
                }
                if (!bottom && !right) {
                    ctx.moveTo(x1, y1 - r);
                    ctx.arcTo(x1, y1, x1 - r, y1, r);
                }
                if (!bottom && !left) {
                    ctx.moveTo(x0, y1 - r);
                    ctx.arcTo(x0, y1, x0 + r, y1, r);
                }
            }
        }
    }

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    traceRoundedWallEdges();
    ctx.strokeStyle = "#091685";
    ctx.lineWidth = Math.max(2.4, s * 0.20);
    ctx.stroke();
    traceRoundedWallEdges();
    ctx.strokeStyle = "#173fff";
    ctx.lineWidth = Math.max(1.25, s * 0.11);
    ctx.stroke();

    // Classic pink ghost-house gate across the two door cells.

    const doorX = ox + GHOST_HOUSE.doorLeft * s;
    const doorY = oy + GHOST_HOUSE.doorY * s + s * 0.5;
    const doorW = (GHOST_HOUSE.doorRight - GHOST_HOUSE.doorLeft + 1) * s;
    ctx.strokeStyle = "#ff9bd5";
    ctx.lineWidth = Math.max(1.2, s * 0.10);
    ctx.beginPath();
    ctx.moveTo(doorX + s * 0.08, doorY);
    ctx.lineTo(doorX + doorW - s * 0.08, doorY);
    ctx.stroke();

    // Classic small square dots; energizers stay larger and blink subtly.
    for (const k of pellets) {
        const [x, y] = k.split(",").map(Number);
        const cx = ox + (x + 0.5) * s;
        const cy = oy + (y + 0.5) * s;
        const isPower = powerPellets.has(k);
        ctx.fillStyle = "#ffb8ae";
        if (isPower) {
            ctx.beginPath();
            ctx.arc(cx, cy, Math.max(1.8, s * 0.16 * pelletFlash), 0, Math.PI * 2);
            ctx.fill();
        } else {
            const d = Math.max(1.15, s * 0.10);
            ctx.fillRect(Math.round(cx - d / 2), Math.round(cy - d / 2), d, d);
        }
    }


// Pac-Man: discrete pixel-art mouth frames for a more authentic arcade feel.
if (pac) {
    const p = actorPos(pac);
    const x = ox + (p.x + 0.5) * s;
    const y = oy + (p.y + 0.5) * s;
    drawPixelPacman(x, y, s * 0.90, pac.dir, mouthPhase);
}

// Ghosts.
    for (const g of ghosts) {
        const p = actorPos(g);
        drawGhost(g, ox + (p.x + 0.5) * s, oy + (p.y + 0.5) * s, s);
    }

    // Overlay states.
    if (state === "idle" || state === "ready" || state === "paused" || state === "gameover") {
        const boxW = Math.min(canvasCssW * 0.72, 360);
        const boxH = state === "idle" ? 86 : 62;
        const x = (canvasCssW - boxW) / 2;
        const y = (canvasCssH - boxH) / 2;
        ctx.fillStyle = "rgba(0,0,0,.78)";
        drawRoundedRect(x, y, boxW, boxH, 10);
        ctx.fill();
        ctx.strokeStyle = "rgba(95,126,255,.75)";
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#ffd928";
        ctx.font = "800 18px system-ui, sans-serif";
        let title = "READY!";
        if (state === "idle") title = "COMFY PAC-MAN";
        else if (state === "paused") title = "PAUSED";
        else if (state === "gameover") title = "GAME OVER";
        ctx.fillText(title, canvasCssW / 2, y + 25);

        ctx.fillStyle = "#c5cce0";
        ctx.font = "600 11px system-ui, sans-serif";
        let sub = "GET READY";
        if (state === "idle") sub = "QUEUE A WORKFLOW TO AUTO-START  •  OR CLICK HERE";
        else if (state === "paused") sub = "PRESS P OR RESUME";
        else if (state === "gameover") sub = "PRESS R OR NEW";
        ctx.fillText(sub, canvasCssW / 2, y + (state === "idle" ? 54 : 43));
        if (state === "idle") {
            ctx.fillStyle = "#7f8aa5";
            ctx.font = "500 10px system-ui, sans-serif";
            ctx.fillText("ARROWS TO MOVE", canvasCssW / 2, y + 72);
        }
    }
}


    function frame(now) {
        if (destroyed) return;
        rafId = requestAnimationFrame(frame);
        if (!visible || document.hidden) {
            lastFrame = now;
            return;
        }
        const rawDt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
        lastFrame = now;
        frameAccumulator += rawDt;

        // Cap game/render loop to ~30 FPS to stay lightweight while ComfyUI is generating.
        if (frameAccumulator < 1 / 30) return;
        const dt = Math.min(0.05, frameAccumulator);
        frameAccumulator = 0;
        update(dt);
        draw();
    }

    function destroy() {
        if (destroyed) return;
        destroyed = true;
        cancelAnimationFrame(rafId);
        ro.disconnect();
        io.disconnect();
        canvas.removeEventListener("keydown", handleKey);
        api.removeEventListener("execution_start", execStartHandler);
        api.removeEventListener("execution_success", execSuccessHandler);
        api.removeEventListener("execution_error", execErrorHandler);
        api.removeEventListener("execution_interrupted", execInterruptedHandler);
        stopFrightenedSound();
        samples.stopAllLoops();
        try { audioCtx?.close?.(); } catch (_) {}
    }

    loadClassicMaze();
    resetActors();
    updateSoundControls();
    updateHud();
    resizeCanvas();
    draw();
    rafId = requestAnimationFrame(frame);

    return { root, destroy, resizeCanvas };
}


function attachGameSafely(node, attempt = 0) {
    if (!node || node.__comfyPacmanGame || node.__comfyPacmanAttachFailed) return;

    // addDOMWidget is supplied by ComfyUI's DOM widget support. It can become
    // available just after onNodeCreated on some frontend builds, so retry
    // briefly rather than ever breaking node creation.
    if (typeof node.addDOMWidget !== "function") {
        if (attempt < 40) {
            setTimeout(() => attachGameSafely(node, attempt + 1), 50);
        } else {
            node.__comfyPacmanAttachFailed = true;
            console.error("[Comfy Pac-Man] addDOMWidget was not available after 2 seconds.");
        }
        return;
    }

    try {
        const game = createGame(node);

        const widget = node.addDOMWidget("pacman_game", "custom", game.root, {
            hideOnZoom: false,
            getMinHeight() { return 340; },
            getHeight() {
                const h = Number(node.size?.[1] ?? 500);
                return Math.max(340, h - 78);
            },
            afterResize() {
                try { game.resizeCanvas(); } catch (_) {}
            },
        });

        // Current ComfyUI serialization checks widget.serialize itself rather
        // than options.serialize, so explicitly disable it here.
        if (widget) widget.serialize = false;

        node.__comfyPacmanGame = game;

        const currentW = Number(node.size?.[0] ?? 0);
        const currentH = Number(node.size?.[1] ?? 0);
        if (currentW < 400 || currentH < 460) {
            node.setSize?.([Math.max(430, currentW || 0), Math.max(500, currentH || 0)]);
        }

        requestAnimationFrame(() => {
            try { game.resizeCanvas(); } catch (_) {}
            node.graph?.setDirtyCanvas?.(true, true);
        });

        console.info("[Comfy Pac-Man] game attached", node.id);
    } catch (err) {
        node.__comfyPacmanAttachFailed = true;
        console.error("[Comfy Pac-Man] game UI attach failed; node kept alive:", err);
    }
}

app.registerExtension({
    name: EXTENSION_NAME,

    // Match the backend node definition here, where ComfyUI gives us the
    // canonical nodeData.name. This avoids relying on runtime fields such as
    // node.type/comfyClass, whose values differ between frontend renderers.
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData?.name !== NODE_NAME) return;
        if (nodeType.prototype.__comfyPacmanV8Patched) return;
        nodeType.prototype.__comfyPacmanV8Patched = true;

        const originalCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = originalCreated?.apply(this, arguments);
            const node = this;

            // Crucially, do not build the DOM widget inside the constructor
            // path. Let ComfyUI finish creating/adding the node first.
            setTimeout(() => attachGameSafely(node, 0), 0);
            return result;
        };

        const originalRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            try { this.__comfyPacmanGame?.destroy?.(); } catch (err) {
                console.warn("[Comfy Pac-Man] cleanup error", err);
            }
            this.__comfyPacmanGame = null;
            return originalRemoved?.apply(this, arguments);
        };
    },
});
