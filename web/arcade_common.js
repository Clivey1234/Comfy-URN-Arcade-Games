import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function makeButton(label) {
    const b = document.createElement("button");
    b.textContent = label;
    Object.assign(b.style, {
        border: "1px solid #3b465e", borderRadius: "5px", background: "#11172a",
        color: "#e6ebff", font: "700 11px system-ui, sans-serif", padding: "4px 8px",
        cursor: "pointer", lineHeight: "16px",
    });
    b.onmouseenter = () => b.style.background = "#1d2642";
    b.onmouseleave = () => b.style.background = "#11172a";
    return b;
}

export function createShell({ aria, columns = 3, accent = "#39dfff", minHeight = 360 } = {}) {
    const root = document.createElement("div");
    Object.assign(root.style, {
        width: "100%", height: "100%", minHeight: `${minHeight}px`, boxSizing: "border-box",
        display: "flex", flexDirection: "column", gap: "5px", padding: "6px", background: "#000",
        borderRadius: "7px", overflow: "hidden", color: "#fff", fontFamily: "system-ui, sans-serif",
        userSelect: "none",
    });
    const hud = document.createElement("div");
    Object.assign(hud.style, {
        display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: "5px",
        font: "800 11px system-ui, sans-serif", letterSpacing: ".45px", alignItems: "center",
    });
    const canvasWrap = document.createElement("div");
    Object.assign(canvasWrap.style, {
        position: "relative", flex: "1 1 auto", minHeight: "280px", minWidth: "0",
        overflow: "hidden", borderRadius: "5px", background: "#000", border: "1px solid #171717",
    });
    const canvas = document.createElement("canvas");
    canvas.tabIndex = 0;
    if (aria) canvas.setAttribute("aria-label", aria);
    Object.assign(canvas.style, {
        display: "block", width: "100%", height: "100%", outline: "none", background: "#000", cursor: "crosshair",
    });
    canvasWrap.appendChild(canvas);

    const footer = document.createElement("div");
    Object.assign(footer.style, { display: "flex", alignItems: "center", gap: "5px", minHeight: "26px" });
    const statusDot = document.createElement("span");
    Object.assign(statusDot.style, { width: "8px", height: "8px", borderRadius: "50%", background: "#6d7485", flex: "0 0 auto" });
    const statusEl = document.createElement("span");
    Object.assign(statusEl.style, {
        flex: "1 1 auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        color: "#aab3ca", font: "600 10px system-ui, sans-serif",
    });
    const soundBtn = makeButton("SND ON");
    const volumeSlider = document.createElement("input");
    volumeSlider.type = "range"; volumeSlider.min = "0"; volumeSlider.max = "100"; volumeSlider.step = "1";
    Object.assign(volumeSlider.style, { width: "62px", height: "20px", cursor: "pointer", accentColor: accent, flex: "0 0 62px" });
    const newBtn = makeButton("NEW");
    const pauseBtn = makeButton("PAUSE");
    footer.append(statusDot, statusEl, soundBtn, volumeSlider, newBtn, pauseBtn);
    root.append(hud, canvasWrap, footer);
    return { root, hud, canvasWrap, canvas, footer, statusDot, statusEl, soundBtn, volumeSlider, newBtn, pauseBtn };
}

export function createCanvasTools(canvas) {
    const ctx = canvas.getContext("2d", { alpha: false });
    let cssW = 1, cssH = 1, dpr = 1;
    function resize() {
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return false;
        cssW = Math.max(1, rect.width); cssH = Math.max(1, rect.height);
        dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        const pw = Math.max(1, Math.round(cssW * dpr)), ph = Math.max(1, Math.round(cssH * dpr));
        if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
        return true;
    }
    function begin() { resize(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    return { ctx, resize, begin, get W(){return cssW;}, get H(){return cssH;}, get dpr(){return dpr;} };
}


export function createSamplePlayer(gameName, { isEnabled, getVolume, isUnlocked } = {}) {
    const cache = new Map();
    const activeLoops = new Map();
    const pageToken = Date.now().toString(36);
    const urlFor = (file) => `/urn_arcade/sounds/${encodeURIComponent(gameName)}/${encodeURIComponent(file)}?v=${pageToken}`;
    const volumeFor = (gain = 1) => {
        if (isEnabled && !isEnabled()) return 0;
        return clamp((getVolume ? getVolume() : 1) * gain, 0, 1);
    };

    function preload(files = []) {
        for (const file of files) {
            if (cache.has(file)) continue;
            const a = new Audio(urlFor(file));
            a.preload = "auto";
            a.addEventListener("error", () => cache.set(file, { missing: true }), { once: true });
            cache.set(file, { base: a, missing: false });
            try { a.load(); } catch (_) {}
        }
    }

    function play(file, fallback = null, gain = 1) {
        if (isEnabled && !isEnabled()) return false;
        if (isUnlocked && !isUnlocked()) return false;
        if (!cache.has(file)) preload([file]);
        const entry = cache.get(file);
        if (!entry || entry.missing || !entry.base) {
            fallback?.();
            return false;
        }
        try {
            const a = entry.base.cloneNode(true);
            a.volume = volumeFor(gain);
            const p = a.play();
            if (p?.catch) p.catch(() => fallback?.());
            return true;
        } catch (_) {
            fallback?.();
            return false;
        }
    }

    // Persistent/looping sample support. This is primarily used for sounds
    // whose duration is user-customisable (for example Pac-Man frightened.wav).
    // Re-requesting an already-active loop does NOT create another copy.
    function loop(file, fallback = null, gain = 1) {
        if (isEnabled && !isEnabled()) return false;
        if (isUnlocked && !isUnlocked()) return false;

        const existing = activeLoops.get(file);
        if (existing?.audio) {
            existing.gain = gain;
            existing.audio.volume = volumeFor(gain);
            if (existing.audio.paused) {
                try {
                    const p = existing.audio.play();
                    if (p?.catch) p.catch(() => {});
                } catch (_) {}
            }
            return true;
        }

        if (!cache.has(file)) preload([file]);
        const entry = cache.get(file);
        if (!entry || entry.missing || !entry.base) {
            fallback?.();
            return false;
        }

        try {
            const a = entry.base.cloneNode(true);
            a.loop = true;
            a.volume = volumeFor(gain);
            const item = { audio: a, gain, fallbackCalled: false };
            activeLoops.set(file, item);

            const fail = () => {
                if (activeLoops.get(file)?.audio === a) activeLoops.delete(file);
                try { a.pause(); a.currentTime = 0; } catch (_) {}
                if (!item.fallbackCalled) {
                    item.fallbackCalled = true;
                    fallback?.();
                }
            };
            a.addEventListener("error", fail, { once: true });
            const promise = a.play();
            if (promise?.catch) promise.catch(fail);
            return true;
        } catch (_) {
            activeLoops.delete(file);
            fallback?.();
            return false;
        }
    }

    function stopLoop(file) {
        const item = activeLoops.get(file);
        if (!item?.audio) return;
        activeLoops.delete(file);
        try { item.audio.pause(); item.audio.currentTime = 0; } catch (_) {}
    }

    function pauseLoop(file) {
        const item = activeLoops.get(file);
        if (!item?.audio) return;
        try { item.audio.pause(); } catch (_) {}
    }

    function resumeLoop(file) {
        const item = activeLoops.get(file);
        if (!item?.audio) return false;
        if (isEnabled && !isEnabled()) return false;
        if (isUnlocked && !isUnlocked()) return false;
        item.audio.volume = volumeFor(item.gain);
        try {
            const p = item.audio.play();
            if (p?.catch) p.catch(() => {});
            return true;
        } catch (_) { return false; }
    }

    function syncVolume() {
        for (const item of activeLoops.values()) {
            if (item?.audio) item.audio.volume = volumeFor(item.gain);
        }
    }

    function stopAllLoops() {
        for (const file of [...activeLoops.keys()]) stopLoop(file);
    }

    function isLooping(file) {
        return activeLoops.has(file);
    }

    return { preload, play, loop, stopLoop, pauseLoop, resumeLoop, syncVolume, stopAllLoops, isLooping };
}

export function createAudio(prefix, soundBtn, volumeSlider, defaultVolume = 0.35, sampleGame = null, sampleFiles = []) {
    let enabled = true, volume = defaultVolume;
    try {
        const se = localStorage.getItem(`${prefix}SoundEnabled`);
        if (se !== null) enabled = se !== "0";
        const sv = localStorage.getItem(`${prefix}SoundVolume`);
        if (sv !== null) {
            const n = Number(sv); if (Number.isFinite(n)) volume = clamp(n, 0, 1);
        }
    } catch (_) {}
    volumeSlider.value = String(Math.round(volume * 100));
    let audioCtx = null, masterGain = null, gesture = false;
    const samples = sampleGame ? createSamplePlayer(sampleGame, {
        isEnabled: () => enabled,
        getVolume: () => volume,
        isUnlocked: () => gesture,
    }) : null;
    if (samples && sampleFiles?.length) samples.preload(sampleFiles);
    function save() {
        try { localStorage.setItem(`${prefix}SoundEnabled`, enabled ? "1" : "0"); localStorage.setItem(`${prefix}SoundVolume`, String(volume)); } catch (_) {}
    }
    function ensure() {
        gesture = true;
        if (!enabled) return;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        if (!audioCtx) {
            try { audioCtx = new AC(); masterGain = audioCtx.createGain(); masterGain.connect(audioCtx.destination); }
            catch (_) { audioCtx = null; masterGain = null; return; }
        }
        if (masterGain) masterGain.gain.value = enabled ? volume : 0;
        if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    }
    function ready() { return enabled && gesture && audioCtx && masterGain && audioCtx.state === "running"; }
    function tone(freq, duration=.08, { type="square", gain=.07, endFreq=null, delay=0 }={}) {
        if (!ready()) return;
        const now = audioCtx.currentTime + Math.max(0, delay);
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = type; o.frequency.setValueAtTime(Math.max(30, freq), now);
        if (Number.isFinite(endFreq)) o.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq), now + duration);
        g.gain.setValueAtTime(.0001, now); g.gain.exponentialRampToValueAtTime(Math.max(.0002, gain), now + Math.min(.008, duration*.25));
        g.gain.exponentialRampToValueAtTime(.0001, now + duration);
        o.connect(g); g.connect(masterGain); o.start(now); o.stop(now + duration + .02);
    }
    function noise(duration=.12, gain=.05) {
        if (!ready()) return;
        const len = Math.max(1, Math.floor(audioCtx.sampleRate * duration));
        const b = audioCtx.createBuffer(1, len, audioCtx.sampleRate), d = b.getChannelData(0);
        for (let i=0;i<len;i++) d[i] = (Math.random()*2-1) * (1-i/len);
        const s = audioCtx.createBufferSource(), g = audioCtx.createGain(); s.buffer=b; g.gain.value=gain; s.connect(g); g.connect(masterGain); s.start();
    }
    function updateUi() {
        soundBtn.textContent = enabled ? "SND ON" : "SND OFF"; soundBtn.style.opacity = enabled ? "1" : ".65";
        volumeSlider.disabled = !enabled; volumeSlider.style.opacity = enabled ? "1" : ".45";
        if (masterGain) masterGain.gain.value = enabled ? volume : 0;
        samples?.syncVolume?.();
    }
    soundBtn.addEventListener("click", e => {
        e.preventDefault(); e.stopPropagation(); enabled = !enabled; save(); updateUi();
        if (enabled) { ensure(); setTimeout(()=>tone(520,.06,{endFreq:680,gain:.045}),0); }
    });
    volumeSlider.addEventListener("pointerdown", e => { e.stopPropagation(); ensure(); });
    volumeSlider.addEventListener("click", e => e.stopPropagation());
    volumeSlider.addEventListener("input", e => { e.stopPropagation(); volume = clamp(Number(volumeSlider.value)/100,0,1); save(); updateUi(); });
    updateUi();
    function sample(file, fallback=null, gain=1) { return samples?.play(file, fallback, gain) ?? (fallback?.(), false); }
    function loopSample(file, fallback=null, gain=1) { return samples?.loop(file, fallback, gain) ?? (fallback?.(), false); }
    function stopSampleLoop(file) { samples?.stopLoop?.(file); }
    function pauseSampleLoop(file) { samples?.pauseLoop?.(file); }
    function resumeSampleLoop(file) { return samples?.resumeLoop?.(file) ?? false; }
    function syncSampleVolume() { samples?.syncVolume?.(); }
    return { ensure, tone, noise, sample, loopSample, stopSampleLoop, pauseSampleLoop, resumeSampleLoop, syncSampleVolume, updateUi,
        close(){ samples?.stopAllLoops?.(); try{audioCtx?.close?.();}catch(_){} }, get enabled(){return enabled;}, get volume(){return volume;} };
}

export function loadHighScore(key) {
    try { return Number(localStorage.getItem(key) || 0) || 0; } catch (_) { return 0; }
}
export function saveHighScore(key, value) { try { localStorage.setItem(key, String(value)); } catch (_) {} }

export function bindWorkflow({ onStart, onEnd }) {
    const start = () => onStart?.();
    const end = () => onEnd?.();
    api.addEventListener("execution_start", start);
    api.addEventListener("execution_success", end);
    api.addEventListener("execution_error", end);
    api.addEventListener("execution_interrupted", end);
    return () => {
        api.removeEventListener("execution_start", start); api.removeEventListener("execution_success", end);
        api.removeEventListener("execution_error", end); api.removeEventListener("execution_interrupted", end);
    };
}

export function registerArcadeNode({ extensionName, nodeName, gameProp, failProp, patchProp, widgetName, createGame, minW=460, minH=520 }) {
    function attach(node, attempt=0) {
        if (!node || node[gameProp] || node[failProp]) return;
        if (typeof node.addDOMWidget !== "function") {
            if (attempt < 40) setTimeout(()=>attach(node, attempt+1), 50);
            else { node[failProp] = true; console.error(`[${extensionName}] addDOMWidget unavailable after 2 seconds.`); }
            return;
        }
        try {
            const game = createGame(node);
            const widget = node.addDOMWidget(widgetName, "custom", game.root, {
                hideOnZoom:false,
                getMinHeight(){ return 340; },
                getHeight(){ const h=Number(node.size?.[1]??500); return Math.max(340,h-78); },
                afterResize(){ try{game.resizeCanvas?.();}catch(_){} },
            });
            if (widget) widget.serialize = false;
            node[gameProp] = game;
            const w=Number(node.size?.[0]??0), h=Number(node.size?.[1]??0);
            if (w<minW || h<minH) node.setSize?.([Math.max(minW,w||0),Math.max(minH,h||0)]);
            requestAnimationFrame(()=>{ try{game.resizeCanvas?.();}catch(_){} node.graph?.setDirtyCanvas?.(true,true); });
        } catch (err) { node[failProp] = true; console.error(`[${extensionName}] game UI attach failed; node kept alive:`,err); }
    }
    app.registerExtension({
        name: extensionName,
        async beforeRegisterNodeDef(nodeType,nodeData) {
            if (nodeData?.name !== nodeName) return;
            if (nodeType.prototype[patchProp]) return;
            nodeType.prototype[patchProp] = true;
            const originalCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function(){ const result=originalCreated?.apply(this,arguments); const node=this; setTimeout(()=>attach(node,0),0); return result; };
            const originalRemoved = nodeType.prototype.onRemoved;
            nodeType.prototype.onRemoved = function(){ try{this[gameProp]?.destroy?.();}catch(err){console.warn(`[${extensionName}] cleanup error`,err);} this[gameProp]=null; return originalRemoved?.apply(this,arguments); };
        }
    });
}
