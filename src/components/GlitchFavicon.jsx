"use client";

import { useEffect } from "react";

const SIZE = 64;
const S = SIZE / 100;

function drawJ(ctx, ox, oy) {
    ctx.beginPath();
    ctx.moveTo(56 * S + ox, 15 * S + oy);
    ctx.lineTo(78 * S + ox, 15 * S + oy);
    ctx.lineTo(78 * S + ox, 62 * S + oy);
    ctx.bezierCurveTo(78 * S + ox, 76 * S + oy, 66 * S + ox, 87 * S + oy, 50 * S + ox, 87 * S + oy);
    ctx.bezierCurveTo(34 * S + ox, 87 * S + oy, 22 * S + ox, 76 * S + oy, 22 * S + ox, 62 * S + oy);
    ctx.lineTo(22 * S + ox, 50 * S + oy);
    ctx.lineTo(40 * S + ox, 50 * S + oy);
    ctx.lineTo(40 * S + ox, 62 * S + oy);
    ctx.bezierCurveTo(40 * S + ox, 67 * S + oy, 44 * S + ox, 71 * S + oy, 50 * S + ox, 71 * S + oy);
    ctx.bezierCurveTo(56 * S + ox, 71 * S + oy, 60 * S + ox, 67 * S + oy, 60 * S + ox, 62 * S + oy);
    ctx.lineTo(56 * S + ox, 62 * S + oy);
    ctx.closePath();
}

function drawBg(ctx, color1, color2) {
    ctx.beginPath();
    ctx.roundRect(2.5, 2.5, SIZE - 5, SIZE - 5, 14);
    const bgGrad = ctx.createLinearGradient(0, 0, SIZE, SIZE);
    bgGrad.addColorStop(0, color1 || "#0E001F");
    bgGrad.addColorStop(1, color2 || "#05000A");
    ctx.fillStyle = bgGrad;
    ctx.fill();
    const borderGrad = ctx.createLinearGradient(0, 0, SIZE, SIZE);
    borderGrad.addColorStop(0, "#B56EFF");
    borderGrad.addColorStop(1, "#06B6D4");
    ctx.strokeStyle = borderGrad;
    ctx.lineWidth = 1.6;
    ctx.stroke();
}

// Draw horizontal glitch corruption bars
function drawCorruptionBars(ctx, count, hue) {
    for (let i = 0; i < count; i++) {
        const y = Math.random() * SIZE;
        const h = 1 + Math.random() * 4;
        const x = Math.random() * SIZE * 0.3;
        const w = SIZE * (0.4 + Math.random() * 0.6);
        ctx.fillStyle = `hsla(${hue}, 100%, 60%, ${0.3 + Math.random() * 0.4})`;
        ctx.fillRect(x, y, w, h);
    }
}

// Frame renderers — each produces a dramatically different favicon
const frameFns = [
    // NORMAL
    (canvas, ctx) => {
        ctx.clearRect(0, 0, SIZE, SIZE);
        drawBg(ctx);
        drawJ(ctx, 0, 0);
        ctx.fillStyle = "#FFFFFF";
        ctx.fill();
        return canvas.toDataURL("image/png");
    },
    // CYAN FLASH — whole J turns cyan, shifted left
    (canvas, ctx) => {
        ctx.clearRect(0, 0, SIZE, SIZE);
        drawBg(ctx, "#001520", "#000A10");
        drawJ(ctx, -4 * S, 0);
        ctx.fillStyle = "#06B6D4";
        ctx.fill();
        drawCorruptionBars(ctx, 3, 190);
        return canvas.toDataURL("image/png");
    },
    // PINK FLASH — whole J turns pink, shifted right
    (canvas, ctx) => {
        ctx.clearRect(0, 0, SIZE, SIZE);
        drawBg(ctx, "#1A0015", "#0A000A");
        drawJ(ctx, 4 * S, 0);
        ctx.fillStyle = "#FF5DD0";
        ctx.fill();
        drawCorruptionBars(ctx, 3, 320);
        return canvas.toDataURL("image/png");
    },
    // RGB SPLIT — 3 offset J's in R/G/B
    (canvas, ctx) => {
        ctx.clearRect(0, 0, SIZE, SIZE);
        drawBg(ctx);
        // Red layer
        ctx.save(); ctx.globalAlpha = 0.7; ctx.globalCompositeOperation = "screen";
        drawJ(ctx, -5 * S, -2 * S); ctx.fillStyle = "#FF0040"; ctx.fill();
        ctx.restore();
        // Green layer
        ctx.save(); ctx.globalAlpha = 0.7; ctx.globalCompositeOperation = "screen";
        drawJ(ctx, 5 * S, 3 * S); ctx.fillStyle = "#00FF80"; ctx.fill();
        ctx.restore();
        // Blue layer
        ctx.save(); ctx.globalAlpha = 0.7; ctx.globalCompositeOperation = "screen";
        drawJ(ctx, 0, -4 * S); ctx.fillStyle = "#4060FF"; ctx.fill();
        ctx.restore();
        return canvas.toDataURL("image/png");
    },
    // HEAVY CORRUPTION — J with scanlines
    (canvas, ctx) => {
        ctx.clearRect(0, 0, SIZE, SIZE);
        drawBg(ctx);
        drawJ(ctx, 3 * S, -3 * S);
        ctx.fillStyle = "#B56EFF";
        ctx.fill();
        drawCorruptionBars(ctx, 6, 270);
        return canvas.toDataURL("image/png");
    },
    // INVERTED — dark J on bright bg
    (canvas, ctx) => {
        ctx.clearRect(0, 0, SIZE, SIZE);
        drawBg(ctx, "#E0D0FF", "#C0E8FF");
        drawJ(ctx, 0, 0);
        ctx.fillStyle = "#0E001F";
        ctx.fill();
        return canvas.toDataURL("image/png");
    },
    // DOUBLE — two offset J's
    (canvas, ctx) => {
        ctx.clearRect(0, 0, SIZE, SIZE);
        drawBg(ctx);
        ctx.save(); ctx.globalAlpha = 0.6;
        drawJ(ctx, -6 * S, 4 * S); ctx.fillStyle = "#FF5DD0"; ctx.fill();
        ctx.restore();
        drawJ(ctx, 4 * S, -3 * S); ctx.fillStyle = "#FFFFFF"; ctx.fill();
        drawCorruptionBars(ctx, 2, 200);
        return canvas.toDataURL("image/png");
    },
];

const NORMAL_FN = frameFns[0];
const GLITCH_FNS = frameFns.slice(1);

// Point EVERY favicon at the current frame so we never have to win a priority war.
// Next.js auto-injects icon links from app/favicon.ico AND app/icon.svg, and Chrome
// PREFERS the SVG — so updating our own appended <link> alone was invisible (the
// browser kept showing the static SVG). Instead we set the same data URL on all icon
// links and strip `type`/`sizes` (so the SVG is no longer preferred and a data: URL
// isn't skipped). We only MUTATE attributes — never removeChild — because removing a
// Next-managed <head> node crashes the App Router reconciler (that broke navigation).
// Idempotent: re-running never creates or accumulates nodes.
let _ownLink = null;

function makeOwnLink(dataUrl) {
    const link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/png";
    link.setAttribute("data-glitch-favicon", "true");
    link.href = dataUrl;
    return link;
}

function setFavicon(dataUrl) {
    // 1) Point every browser-managed icon link (Next auto-injects one from favicon.ico
    //    and one from icon.svg) at the same frame. Chrome/Firefox repaint on an href
    //    change, so whichever they prefer shows the glitch — precedence is moot. Strip
    //    `type`/`sizes` so the SVG isn't preferred and a data: URL isn't skipped.
    //    Attribute-only — we NEVER remove these Next-managed nodes (that broke nav).
    document.querySelectorAll('link[rel~="icon"], link[rel="shortcut icon"]').forEach((l) => {
        if (l.hasAttribute("data-glitch-favicon")) return;
        l.setAttribute("href", dataUrl);
        l.removeAttribute("type");
        l.removeAttribute("sizes");
    });

    // 2) Our OWN link: REPLACE the node each frame (remove old + insert fresh) instead of
    //    mutating its href. Chrome/FF don't need this, but Safari only repaints the favicon
    //    when the <link> element itself is re-inserted. Safe because this node is created by
    //    us imperatively — React/Next never tracks it, so swapping it can't crash the
    //    reconciler (that's the distinction that broke navigation with the old observer).
    const fresh = makeOwnLink(dataUrl);
    if (_ownLink && _ownLink.isConnected) {
        _ownLink.replaceWith(fresh);
    } else {
        // First run (or our link went missing): clear any stray glitch links, then append.
        document.querySelectorAll("link[data-glitch-favicon]").forEach((l) => l.remove());
        document.head.appendChild(fresh);
    }
    _ownLink = fresh;
}

export default function GlitchFavicon() {
    useEffect(() => {
        const canvas = document.createElement("canvas");
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        setFavicon(NORMAL_FN(canvas, ctx));

        // Removed MutationObserver. Next.js router manages <head> tags, 
        // aggressively removing them manually creates unrecoverable React crashes.

        let timeoutId;

        function runGlitchBurst() {
            // Pick 3-5 random glitch frames for this burst
            const burstLen = 3 + Math.floor(Math.random() * 3);
            let step = 0;

            function tick() {
                if (step >= burstLen) {
                    setFavicon(NORMAL_FN(canvas, ctx));
                    timeoutId = setTimeout(runGlitchBurst, 1500 + Math.random() * 2000);
                    return;
                }
                const fn = GLITCH_FNS[Math.floor(Math.random() * GLITCH_FNS.length)];
                setFavicon(fn(canvas, ctx));
                step++;
                timeoutId = setTimeout(tick, 80 + Math.random() * 50);
            }

            tick();
        }

        timeoutId = setTimeout(runGlitchBurst, 800);

        return () => {
            clearTimeout(timeoutId);
        };
    }, []);

    return null;
}
