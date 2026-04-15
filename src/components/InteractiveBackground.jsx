"use client";
import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";

// Helper moved inside or made safe
function getThemeColors() {
    if (typeof window === "undefined") return { base: "", accent1: "", accent2: "", accent3: "" };
    const root = document.documentElement;
    const style = getComputedStyle(root);
    const base = style.getPropertyValue("--dyn-particle-color").trim();
    const accent1 = style.getPropertyValue("--dyn-accent-blue").trim();
    const accent2 = style.getPropertyValue("--dyn-accent-purple").trim();
    const accent3 = style.getPropertyValue("--dyn-accent-pink").trim();
    return { base, accent1, accent2, accent3 };
}

export default function InteractiveBackground() {
    const canvasRef = useRef(null);
    const animRef = useRef(null);
    const mouseRef = useRef({ x: -9999, y: -9999 });
    const { resolvedTheme } = useTheme();

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        let width = window.innerWidth;
        let height = window.innerHeight;
        canvas.width = width;
        canvas.height = height;

        // Read CSS vars for colors
        const colors = getThemeColors();

        const PARTICLE_COUNT = 65;
        const CONNECT_DIST = 130;
        const MOUSE_RADIUS = 160;
        const MOUSE_REPEL_FORCE = 0.18;

        // Rich color palette per theme
        const palette = [
            colors.accent1,
            colors.accent2,
            colors.accent3,
            colors.base,
        ];

        class Particle {
            constructor() {
                this.reset(true);
            }

            reset(initial = false) {
                this.x = Math.random() * width;
                this.y = initial ? Math.random() * height : height + 10;
                this.baseX = this.x;
                this.baseY = this.y;
                this.vx = (Math.random() - 0.5) * 0.5;
                this.vy = -Math.random() * 0.5 - 0.1;
                this.r = Math.random() * 2.5 + 1.2;
                this.color = palette[Math.floor(Math.random() * palette.length)] || "rgba(100,150,255,0.8)";
                this.alpha = Math.random() * 0.5 + 0.5;
                this.life = 0;
                this.maxLife = Math.random() * 6000 + 4000;
            }

            update(mouse) {
                this.life += 16;
                if (this.life > this.maxLife) this.reset();

                // Mouse repulsion
                const dx = this.x - mouse.x;
                const dy = this.y - mouse.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < MOUSE_RADIUS && dist > 0) {
                    const force = (MOUSE_RADIUS - dist) / MOUSE_RADIUS;
                    this.x += (dx / dist) * force * MOUSE_REPEL_FORCE * 8;
                    this.y += (dy / dist) * force * MOUSE_REPEL_FORCE * 8;
                } else {
                    // Drift back toward natural float path
                    this.x += this.vx;
                    this.y += this.vy;
                }

                // Wrap at edges
                if (this.x < -10) this.x = width + 10;
                if (this.x > width + 10) this.x = -10;
                if (this.y < -10) this.reset();
                if (this.y > height + 10) this.y = -10;
            }

            draw(ctx) {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
                ctx.fillStyle = this.color;
                ctx.globalAlpha = this.alpha;
                ctx.fill();
                ctx.globalAlpha = 1;
            }
        }

        const particles = Array.from({ length: PARTICLE_COUNT }, () => new Particle());

        function drawConnections() {
            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < CONNECT_DIST) {
                        const opacity = (1 - dist / CONNECT_DIST) * 0.6;
                        ctx.beginPath();
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.strokeStyle = particles[i].color;
                        ctx.globalAlpha = opacity;
                        ctx.lineWidth = 1.2;
                        ctx.stroke();
                        ctx.globalAlpha = 1;
                    }
                }
            }
        }

        function animate() {
            ctx.clearRect(0, 0, width, height);
            drawConnections();
            particles.forEach((p) => {
                p.update(mouseRef.current);
                p.draw(ctx);
            });
            animRef.current = requestAnimationFrame(animate);
        }

        animate();

        // Mouse tracking
        const handleMouseMove = (e) => {
            mouseRef.current = { x: e.clientX, y: e.clientY };
        };
        const handleMouseLeave = () => {
            mouseRef.current = { x: -9999, y: -9999 };
        };

        // Resize
        const handleResize = () => {
            width = window.innerWidth;
            height = window.innerHeight;
            canvas.width = width;
            canvas.height = height;
        };

        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseleave", handleMouseLeave);
        window.addEventListener("resize", handleResize);

        return () => {
            cancelAnimationFrame(animRef.current);
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseleave", handleMouseLeave);
            window.removeEventListener("resize", handleResize);
        };
    }, [resolvedTheme]);

    return (
        <canvas
            ref={canvasRef}
            className="fixed inset-0 pointer-events-none z-0"
            aria-hidden="true"
        />
    );
}
