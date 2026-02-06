import { Application, Graphics } from 'pixi.js';

interface WaterParticle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
    settled: boolean;
}

export class WaterButton {
    private button: HTMLElement;
    private canvasContainer: HTMLElement;
    private app: Application | null = null;
    private waterGraphics: Graphics | null = null;
    private particles: WaterParticle[] = [];
    private width: number = 0;
    private height: number = 0;
    private isHovered: boolean = false;
    private isFilled: boolean = false;
    private animationFrameId: number | null = null;
    private spawnInterval: any = null;
    private color: string;

    // Physics constants
    private readonly gravity = 1.2;
    private readonly friction = 0.85;

    constructor(buttonId: string, color: string = '#5046e5', _accentColor: string = '#818cf8') {
        const el = document.getElementById(buttonId);
        if (!el) throw new Error(`Button element #${buttonId} not found`);
        this.button = el;
        this.color = color;
        // this.accentColor = accentColor;

        // Find or create canvas container
        let container = this.button.querySelector('.water-canvas-container') as HTMLElement;
        if (!container) {
            container = document.createElement('div');
            container.className = 'water-canvas-container absolute inset-0 pointer-events-none';
            // Insert as first child
            this.button.insertBefore(container, this.button.firstChild);
        }
        this.canvasContainer = container;

        this.init();
        this.bindEvents();
    }

    private async init() {
        const rect = this.button.getBoundingClientRect();
        this.width = rect.width;
        this.height = rect.height;

        // Initialize Pixi Application
        this.app = new Application();
        await this.app.init({
            width: this.width,
            height: this.height,
            backgroundColor: 0x000000,
            backgroundAlpha: 0,
            antialias: true,
            resolution: window.devicePixelRatio || 1,
            autoDensity: true,
        });

        if (!this.canvasContainer) return;

        // Add canvas to container
        this.canvasContainer.appendChild(this.app.canvas);
        this.app.canvas.style.width = '100%';
        this.app.canvas.style.height = '100%';
        this.app.canvas.style.position = 'absolute';
        this.app.canvas.style.top = '0';
        this.app.canvas.style.left = '0';

        // Initialize Graphics
        this.waterGraphics = new Graphics();
        this.app.stage.addChild(this.waterGraphics);

        // Start Animation Loop
        this.startAnimation();
    }

    private bindEvents() {
        this.button.addEventListener('mouseenter', () => {
            this.isHovered = true;
            this.startFilling();
            // Animate content scale
            const content = this.button.querySelector('.relative.z-10'); // Target content
            if (content) {
                // content.animate... (We'll leave CSS to handle the scale for now via classes)
            }
        });

        this.button.addEventListener('mouseleave', () => {
            this.isHovered = false;
            this.isFilled = false;
            this.stopFilling();
            this.particles = [];
            if (this.waterGraphics) this.waterGraphics.clear();
        });

        window.addEventListener('resize', () => this.handleResize());
    }

    private handleResize() {
        if (!this.app || !this.button) return;
        const rect = this.button.getBoundingClientRect();
        this.width = rect.width;
        this.height = rect.height;
        this.app.renderer.resize(this.width, this.height);
    }

    private startFilling() {
        if (this.isFilled) return;

        const calculateBlobsNeeded = () => {
            const area = this.width * this.height;
            const avgRadius = 18;
            const avgBlobArea = Math.PI * avgRadius * avgRadius;
            return Math.ceil((area * 0.8) / avgBlobArea); // 80% coverage
        };

        const totalNeeded = calculateBlobsNeeded();
        let spawned = 0;

        if (this.spawnInterval) clearInterval(this.spawnInterval);

        this.spawnInterval = setInterval(() => {
            if (!this.isHovered) {
                clearInterval(this.spawnInterval);
                return;
            }
            if (spawned >= totalNeeded) {
                this.isFilled = true;
                clearInterval(this.spawnInterval);
                return;
            }

            this.spawnWaterBlobs();
            spawned += 6;
        }, 120);
    }

    private stopFilling() {
        if (this.spawnInterval) clearInterval(this.spawnInterval);
    }

    private spawnWaterBlobs() {
        const count = 6;
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: Math.random() * this.width,
                y: -20 + Math.random() * 10,
                vx: (Math.random() - 0.5) * 1,
                vy: Math.random() * 2,
                radius: 14 + Math.random() * 8,
                settled: false
            });
        }
    }

    private updatePhysics() {
        // Step 1: Falling
        this.particles.forEach((p, i) => {
            if (!p.settled) {
                p.vy += this.gravity;
                p.vx *= this.friction;
                p.x += p.vx;
                p.y += p.vy;

                // Bottom collision
                if (p.y + p.radius >= this.height) {
                    p.y = this.height - p.radius;
                    p.settled = true;
                    p.vy = 0;
                    p.vx = 0;
                }

                // Wall collision
                if (p.x - p.radius <= 0) {
                    p.x = p.radius;
                    p.vx = 0;
                }
                if (p.x + p.radius >= this.width) {
                    p.x = this.width - p.radius;
                    p.vx = 0;
                }

                // Particle-Particle collision (Simplified)
                for (let j = 0; j < this.particles.length; j++) {
                    if (i === j) continue;
                    const other = this.particles[j];

                    if (other.settled) {
                        const dx = other.x - p.x;
                        const dy = other.y - p.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        const minDist = p.radius + other.radius;

                        if (dist < minDist && p.y < other.y) {
                            // Land on top
                            const angle = Math.atan2(dy, dx);
                            p.x = other.x - Math.cos(angle) * minDist;
                            p.y = other.y - Math.sin(angle) * minDist;
                            p.settled = true;
                            p.vy = 0;
                            p.vx = 0;
                        }
                    } else {
                        // Repel falling particles slightly
                        const dx = other.x - p.x;
                        const dy = other.y - p.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        const minDist = p.radius + other.radius;
                        if (dist < minDist && dist > 0) {
                            const angle = Math.atan2(dy, dx);
                            const overlap = minDist - dist;
                            p.x -= Math.cos(angle) * overlap * 0.5;
                            p.y -= Math.sin(angle) * overlap * 0.5;
                        }
                    }
                }
            }
        });

        // Step 2: Fluid Flow (Simplified surface tension)
        const settled = this.particles.filter(p => p.settled);
        settled.forEach((p) => {
            // Check neighbors
            let leftCount = 0;
            let rightCount = 0;
            settled.forEach(other => {
                if (p === other) return;
                const dx = other.x - p.x;
                const dy = Math.abs(other.y - p.y);
                if (dy < p.radius * 2) {
                    if (dx > 0 && dx < p.radius * 3) rightCount++;
                    if (dx < 0 && dx > -p.radius * 3) leftCount++;
                }
            });

            // Flow
            if (leftCount < rightCount) p.x -= 0.3;
            else if (rightCount < leftCount) p.x += 0.3;

            // Bounds check again
            if (p.x - p.radius < 0) p.x = p.radius;
            if (p.x + p.radius > this.width) p.x = this.width - p.radius;
        });
    }

    private draw() {
        if (!this.waterGraphics) return;
        this.waterGraphics.clear();
        if (this.particles.length === 0) return;

        const colorNum = parseInt(this.color.replace('#', ''), 16);
        const gridSize = 8;
        const threshold = 0.6;

        const cols = Math.ceil(this.width / gridSize);
        const rows = Math.ceil(this.height / gridSize);
        const field: number[][] = [];

        // Calculate Field
        for (let y = 0; y < rows; y++) {
            field[y] = [];
            for (let x = 0; x < cols; x++) {
                const wx = x * gridSize;
                const wy = y * gridSize;
                let sum = 0;
                this.particles.forEach(p => {
                    const dx = wx - p.x;
                    const dy = wy - p.y;
                    const distSq = dx * dx + dy * dy;
                    if (distSq > 0) sum += (p.radius * p.radius) / distSq;
                });
                field[y][x] = sum;
            }
        }

        // Marching Squares / Draw Rects
        for (let y = 0; y < rows - 1; y++) {
            for (let x = 0; x < cols - 1; x++) {
                if (field[y][x] > threshold) {
                    this.waterGraphics.rect(x * gridSize, y * gridSize, gridSize, gridSize);
                    this.waterGraphics.fill({ color: colorNum, alpha: 0.9 });
                }
            }
        }

        // Highlights
        const settled = this.particles.filter(p => p.settled);
        if (settled.length > 0) {
            const surface = settled.sort((a, b) => a.y - b.y).slice(0, 15);
            surface.forEach(p => {
                const shimmer = Math.sin(Date.now() * 0.003 + p.x * 0.1) * 0.3 + 0.5;
                this.waterGraphics!.circle(p.x, p.y - p.radius * 0.6, 2);
                this.waterGraphics!.fill({ color: 0xffffff, alpha: shimmer * 0.8 });
            });
        }
    }

    private startAnimation() {
        const animate = () => {
            if (this.app) {
                this.updatePhysics();
                this.draw();
                this.animationFrameId = requestAnimationFrame(animate);
            }
        };
        this.animationFrameId = requestAnimationFrame(animate);
    }

    public destroy() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        if (this.app) {
            this.app.destroy(true);
            this.app = null;
        }
    }
}
