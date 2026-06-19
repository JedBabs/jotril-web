/**
 * Highly robust client-side hardware fingerprinting script
 * Combines Canvas Drawing, WebGL GPU Renderers, AudioContext, Font Probing, and Device Parameters.
 * Returns a vector of independent hashes to allow fuzzy matching (allowance) on the backend.
 */

async function getCanvasFingerprint() {
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = "top";
        ctx.font = "14px 'Arial'";
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = "#f60";
        ctx.fillRect(125, 1, 62, 20);
        ctx.fillStyle = "#069";
        ctx.fillText("Jotril Super Hash! ~ ?<*>", 2, 15);
        ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
        ctx.fillText("Jotril Super Hash! ~ ?<*>", 4, 17);
        return canvas.toDataURL();
    } catch (e) {
        return 'canvas-err';
    }
}

async function getWebGLFingerprint() {
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) return "no-webgl";
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        return debugInfo ?
            `${gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)}~${gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)}` :
            "no-debug-info";
    } catch (e) {
        return 'webgl-err';
    }
}

async function getAudioFingerprint() {
    try {
        const audioCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 44100, 44100);
        const oscillator = audioCtx.createOscillator();
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(10000, audioCtx.currentTime);
        const compressor = audioCtx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-50, audioCtx.currentTime);
        compressor.knee.setValueAtTime(40, audioCtx.currentTime);
        compressor.ratio.setValueAtTime(12, audioCtx.currentTime);
        compressor.attack.setValueAtTime(0, audioCtx.currentTime);
        compressor.release.setValueAtTime(0.25, audioCtx.currentTime);

        oscillator.connect(compressor);
        compressor.connect(audioCtx.destination);
        oscillator.start(0);
        const renderedBuffer = await audioCtx.startRendering();
        const data = renderedBuffer.getChannelData(0);
        let hash = 0;
        for (let i = 4500; i < 5000; i++) {
            hash += Math.abs(data[i]);
        }
        return hash.toString();
    } catch (e) {
        return 'audio-error';
    }
}

async function getFontsFingerprint() {
    const testFonts = ['Arial', 'Calibri', 'Comic Sans MS', 'Consolas', 'Courier New', 'Georgia', 'Impact', 'Times New Roman', 'Trebuchet MS', 'Verdana'];
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const text = "mmmmmmmmmmlli";
    ctx.font = "72px monospace";
    const baseline = ctx.measureText(text).width;

    let detected = [];
    testFonts.forEach(font => {
        ctx.font = `72px '${font}', monospace`;
        if (ctx.measureText(text).width !== baseline) {
            detected.push(font);
        }
    });
    return detected.join('-');
}

function getScrollbarWidth() {
    try {
        const outer = document.createElement('div');
        outer.style.visibility = 'hidden';
        outer.style.overflow = 'scroll';
        document.body.appendChild(outer);
        const inner = document.createElement('div');
        outer.appendChild(inner);
        const scrollbarWidth = (outer.offsetWidth - inner.offsetWidth);
        outer.parentNode.removeChild(outer);
        return scrollbarWidth;
    } catch (e) { return -1; }
}

async function getVoicesFingerprint() {
    return new Promise(resolve => {
        let voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
        if (voices.length > 0) return resolve(voices.map(v => v.name).join('|'));

        if (window.speechSynthesis) {
            window.speechSynthesis.onvoiceschanged = () => {
                voices = window.speechSynthesis.getVoices();
                resolve(voices.map(v => v.name).join('|'));
            };
            setTimeout(() => resolve('timeout-voices'), 300);
        } else {
            resolve('no-speech-synth');
        }
    });
}

function getDOMRectFingerprint() {
    try {
        const el = document.createElement('div');
        el.style.cssText = "width: 100.124px; height: 100.124px; padding: 2.3px; border: 1.1px solid red; font-size: 15.3px; line-height: 1.23;";
        document.body.appendChild(el);
        const rect = el.getBoundingClientRect();
        document.body.removeChild(el);
        return `${rect.width}~${rect.height}~${rect.x}`;
    } catch (e) { return 'rect-err'; }
}

function getDisplayGamut() {
    if (window.matchMedia && window.matchMedia("(color-gamut: rec2020)").matches) return "rec2020";
    if (window.matchMedia && window.matchMedia("(color-gamut: p3)").matches) return "p3";
    if (window.matchMedia && window.matchMedia("(color-gamut: srgb)").matches) return "srgb";
    return "unknown";
}

async function hashString(str) {
    const msgBuffer = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function generateHardwareVector() {
    const [canvas, webgl, audio, fonts, voices] = await Promise.all([
        getCanvasFingerprint(),
        getWebGLFingerprint(),
        getAudioFingerprint(),
        getFontsFingerprint(),
        getVoicesFingerprint()
    ]);

    return {
        hardwareConcurrency: navigator.hardwareConcurrency || "unknown",
        deviceMemory: navigator.deviceMemory || "unknown",
        screenRatio: `${screen.width}x${screen.height}-${screen.colorDepth}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        platform: navigator.platform || "unknown",
        language: navigator.language || "unknown",

        // NEW HARDWARE/OS PARAMETERS
        maxTouchPoints: navigator.maxTouchPoints || 0,
        scrollbarWidth: getScrollbarWidth(), // e.g. Mac=0/15px, Win=17px
        domRectHash: await hashString(getDOMRectFingerprint()), // OS-level font / subpixel rendering
        displayGamut: getDisplayGamut(), // Hardware monitor color spectrum
        voicesHash: await hashString(voices), // OS installed TTS voices
        pluginsHash: await hashString([...navigator.plugins].map(p => p.name).join('-')), // Installed browser plugins
        devicePixelRatio: window.devicePixelRatio || 1, // Retina/4k monitor scale
        multiMonitorOffset: `${screen.availLeft || 0}x${screen.availTop || 0}`, // Detects physical multi-monitor mapping
        webAssemblySupport: typeof WebAssembly === 'object' ? "true" : "false", // Engine Flag
        networkType: (navigator.connection && navigator.connection.effectiveType) || "unknown",

        canvasHash: await hashString(canvas),
        webglHash: await hashString(webgl),
        audioHash: await hashString(audio),
        fontsHash: await hashString(fonts),
        mathHash: await hashString(`${Math.sin(1e7)}~${Math.cos(1e7)}~${Math.tan(1e7)}`)
    };
}

/**
 * Highly granular 0-100 score matrix that provides deep allowance/tolerance
 * over 15+ independent fingerprint parameters.
 */
export function calculateFuzzyMatchScore(storedVector, newVector) {
    let score = 0;

    // IMMUTABLE HARDWARE - 40 POINTS
    if (storedVector.webglHash === newVector.webglHash) score += 15;
    if (storedVector.audioHash === newVector.audioHash) score += 10;
    if (storedVector.hardwareConcurrency === newVector.hardwareConcurrency) score += 10;
    if (storedVector.maxTouchPoints === newVector.maxTouchPoints) score += 5;

    // OS / ENGINE CONSTANTS - 35 POINTS
    if (storedVector.canvasHash === newVector.canvasHash) score += 10;
    if (storedVector.voicesHash === newVector.voicesHash) score += 10; // OS voices rarely change
    if (storedVector.scrollbarWidth === newVector.scrollbarWidth) score += 5;
    if (storedVector.domRectHash === newVector.domRectHash) score += 5;
    if (storedVector.mathHash === newVector.mathHash) score += 5;

    // MONITOR CONFIGS - 15 POINTS
    if (storedVector.screenRatio === newVector.screenRatio) score += 5;
    if (storedVector.displayGamut === newVector.displayGamut) score += 5;
    if (storedVector.multiMonitorOffset === newVector.multiMonitorOffset) score += 5;

    // ENVIRONMENTAL / FLUCTUATING - 10 POINTS (Allowance layer)
    if (storedVector.fontsHash === newVector.fontsHash) score += 4;
    if (storedVector.pluginsHash === newVector.pluginsHash) score += 2;
    if (storedVector.timezone === newVector.timezone) score += 2;
    if (storedVector.language === newVector.language) score += 1;
    if (storedVector.webAssemblySupport === newVector.webAssemblySupport) score += 1;

    // We total 100 possible points. 
    // Network, DevicePixelRatio omitted from strict grading due to docking stations / 4G switching
    return score;
}
