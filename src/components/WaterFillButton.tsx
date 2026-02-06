import { useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';
import { motion } from 'motion/react';
import { SoundManager } from '@/core/SoundManager';

/**
 * CRITICAL SIZING ARCHITECTURE:
 * ===============================
 * The HTML button and PixiJS canvas MUST be tightly coupled.
 * 
 * 1. HTML button uses Tailwind: w-full h-24 (96px height)
 * 2. Canvas container div uses: absolute inset-0 (fills button exactly)
 * 3. buttonSize state tracks ACTUAL rendered dimensions from getBoundingClientRect()
 * 4. PixiJS canvas is created with these EXACT pixel dimensions
 * 5. All particle physics use buttonSize for boundaries
 * 
 * This ensures the canvas and button are ALWAYS the same size, preventing:
 * - Particles spawning outside visible area
 * - Canvas being wrong size on different screens
 * - Rendering issues from size mismatches
 */

interface WaterParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  settled: boolean;
}

interface WaterFillButtonProps {
  icon: React.ComponentType<any>;
  label: string;
  subtitle: string;
  color: string;
  accentColor: string;
  isHovered: boolean;
  onHoverStart: () => void;
  onHoverEnd: () => void;
  onTap: () => void;
}

export function WaterFillButton({
  icon: Icon,
  label,
  subtitle,
  color,
  accentColor,
  isHovered,
  onHoverStart,
  onHoverEnd,
  onTap,
}: WaterFillButtonProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLDivElement>(null); // NEW: Direct reference to button container
  const appRef = useRef<PIXI.Application | null>(null);
  const waterGraphicsRef = useRef<PIXI.Graphics | null>(null);
  const particlesRef = useRef<WaterParticle[]>([]);
  const [mounted, setMounted] = useState(false);
  const [isFilled, setIsFilled] = useState(false); // Track if button is filled
  
  // CRITICAL: This state holds the SINGLE SOURCE OF TRUTH for all sizing
  const [buttonSize, setButtonSize] = useState({ width: 0, height: 0 });

  // Physics constants - rain-like behavior
  // Physics constants - rain-like behavior
  const gravity = 1.2; // Fast falling like rain
  const friction = 0.85; // Friction for horizontal movement only

  useEffect(() => {
    if (!canvasRef.current || !buttonRef.current || mounted) return;

    /**
     * STEP 1: Measure the ACTUAL button dimensions
     * This happens AFTER React renders the DOM, so we get real pixel values
     */
    const measureButton = () => {
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        console.log('📏 Button measured:', rect.width, 'x', rect.height);
        setButtonSize({ width: rect.width, height: rect.height });
        return rect;
      }
      return null;
    };

    /**
     * STEP 2: Initialize PixiJS with EXACT button dimensions
     */
    const initPixi = async () => {
      // Wait for DOM to fully render
      await new Promise(resolve => requestAnimationFrame(resolve));
      
      const rect = measureButton();
      if (!rect || !canvasRef.current) return;
      
      // Clear any existing canvas elements first (important for hot reload)
      while (canvasRef.current.firstChild) {
        canvasRef.current.removeChild(canvasRef.current.firstChild);
      }
      
      const width = Math.floor(rect.width);
      const height = Math.floor(rect.height);
      
      console.log('🎨 Creating PixiJS canvas:', width, 'x', height);
      
      const app = new PIXI.Application();
      
      await app.init({
        width: width,
        height: height,
        backgroundColor: 0x000000,
        backgroundAlpha: 0,
        antialias: false,
        resolution: 1, // Optimize: Low res for pixel look & performance
        autoDensity: true,
      });

      if (!canvasRef.current) return;
      
      canvasRef.current.appendChild(app.canvas);
      appRef.current = app;

      // Make canvas EXACTLY fill the container (which is inset-0 of button)
      app.canvas.style.width = '100%';
      app.canvas.style.height = '100%';
      app.canvas.style.display = 'block';
      app.canvas.style.position = 'absolute';
      app.canvas.style.top = '0';
      app.canvas.style.left = '0';
      
      /**
       * CRITICAL: PixiJS v8 Graphics API
       * 
       * ❌ WRONG (v7 API - SILENTLY FAILS):
       *   graphics.beginFill(color, alpha);
       *   graphics.drawCircle(x, y, radius);
       *   graphics.endFill();
       * 
       * ✅ CORRECT (v8 API):
       *   graphics.circle(x, y, radius);
       *   graphics.fill({ color: 0xRRGGBB, alpha: 0.0-1.0 });
       * 
       *   graphics.rect(x, y, width, height);
       *   graphics.fill({ color: 0xRRGGBB, alpha: 0.0-1.0 });
       * 
       *   graphics.moveTo(x1, y1);
       *   graphics.lineTo(x2, y2);
       *   graphics.stroke({ width: number, color: 0xRRGGBB, alpha: 0.0-1.0 });
       */
      const waterGraphics = new PIXI.Graphics();
      waterGraphicsRef.current = waterGraphics;
      
      app.stage.addChild(waterGraphics);
      
      // Initialize graphics context
      waterGraphics.rect(0, 0, 1, 1);
      waterGraphics.fill({ color: 0x000000, alpha: 0 });
      waterGraphics.clear();

      setMounted(true);

      /**
       * Define physics functions HERE so they have access to width/height
       */
      const updateParticles = () => {
        const particles = particlesRef.current;

        // STEP 1: Update falling particles (rain)
        particles.forEach((p, i) => {
          // Falling particles - rain physics
          if (!p.settled) {
            p.vy += gravity;
            p.vx *= friction;
            p.x += p.vx;
            p.y += p.vy;

            // Bottom collision
            if (p.y + p.radius >= height) {
              p.y = height - p.radius;
              p.settled = true;
              p.vy = 0;
              p.vx = 0;
            }

            // Wall collisions
            if (p.x - p.radius <= 0) {
              p.x = p.radius;
              p.vx = 0;
            }
            if (p.x + p.radius >= width) {
              p.x = width - p.radius;
              p.vx = 0;
            }

            // Check if landing on settled particle
            for (let j = 0; j < particles.length; j++) {
              if (i === j) continue;
              const other = particles[j];
              
              if (other.settled) {
                const dx = other.x - p.x;
                const dy = other.y - p.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const touchDist = p.radius + other.radius;
                
                if (dist < touchDist && p.y < other.y) {
                  const angle = Math.atan2(dy, dx);
                  p.x = other.x - Math.cos(angle) * touchDist;
                  p.y = other.y - Math.sin(angle) * touchDist;
                  p.settled = true;
                  p.vy = 0;
                  p.vx = 0;
                }
              } else {
                // Prevent overlap between falling particles
                const dx = other.x - p.x;
                const dy = other.y - p.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const minDist = p.radius + other.radius;

                if (dist < minDist && dist > 0) {
                  const angle = Math.atan2(dy, dx);
                  const overlap = minDist - dist;
                  const pushX = Math.cos(angle) * overlap * 0.5;
                  const pushY = Math.sin(angle) * overlap * 0.5;
                  p.x -= pushX;
                  p.y -= pushY;
                  other.x += pushX;
                  other.y += pushY;
                }
              }
            }
          }
        });

        // STEP 2: LIQUID FLOW PHYSICS - settled particles flow to fill gaps
        const settledParticles = particles.filter(p => p.settled);
        
        settledParticles.forEach((p, i) => {
          // Find the liquid surface height at this X position
          let lowestY = height;
          let neighborsBelow = 0;
          
          settledParticles.forEach((other, j) => {
            if (i === j) return;
            
            const dx = Math.abs(other.x - p.x);
            const dy = other.y - p.y;
            
            // Check for particles in column below
            if (dx < p.radius * 3 && dy > 0) {
              neighborsBelow++;
              lowestY = Math.min(lowestY, other.y - other.radius * 2);
            }
          });
          
          // SURFACE TENSION: If near surface, flow horizontally to fill gaps
          const isNearSurface = neighborsBelow < 2;
          
          if (isNearSurface) {
            // Find gaps to left and right
            let leftCount = 0;
            let rightCount = 0;
            
            settledParticles.forEach((other) => {
              if (other === p) return;
              const dx = other.x - p.x;
              const dy = Math.abs(other.y - p.y);
              
              // Check if neighbor exists at same height
              if (dy < p.radius * 2) {
                if (dx > 0 && dx < p.radius * 3) rightCount++;
                if (dx < 0 && dx > -p.radius * 3) leftCount++;
              }
            });
            
            // Flow towards gaps (liquid spreading)
            const flowSpeed = 0.3;
            if (leftCount < rightCount) {
              p.x -= flowSpeed;
            } else if (rightCount < leftCount) {
              p.x += flowSpeed;
            }
            
            // Also try to level out - settle downward into gaps
            if (lowestY < p.y && lowestY > height - p.radius) {
              p.y += (lowestY - p.y) * 0.05;
            }
          }
          
          // Keep within bounds
          if (p.x - p.radius < 0) p.x = p.radius;
          if (p.x + p.radius > width) p.x = width - p.radius;
          if (p.y + p.radius > height) p.y = height - p.radius;
        });
      };

      const drawWater = () => {
        if (!waterGraphicsRef.current) return;
        
        const graphics = waterGraphicsRef.current;
        const particles = particlesRef.current;
        
        try {
          graphics.clear();
        } catch (e) {
          return;
        }

        if (particles.length === 0) return;

        const colorNum = parseInt(color.replace('#', ''), 16);

        // METABALL RENDERING: Create smooth liquid surface
        // Sample the field on a grid and draw the liquid shape
        const gridSize = 8; // Resolution of metaball calculation
        const threshold = 0.6; // Field strength threshold for surface
        
        const cols = Math.ceil(width / gridSize);
        const rows = Math.ceil(height / gridSize);
        
        // Calculate metaball field
        const field: number[][] = [];
        for (let y = 0; y < rows; y++) {
          field[y] = [];
          for (let x = 0; x < cols; x++) {
            const worldX = x * gridSize;
            const worldY = y * gridSize;
            
            // Sum influence from all particles
            let fieldValue = 0;
            particles.forEach(p => {
              const dx = worldX - p.x;
              const dy = worldY - p.y;
              const distSq = dx * dx + dy * dy;
              
              if (distSq > 0) {
                // Metaball formula: influence = radius^2 / distance^2
                const influence = (p.radius * p.radius) / distSq;
                fieldValue += influence;
              }
            });
            
            field[y][x] = fieldValue;
          }
        }
        
        // Draw liquid mass using marching squares
        for (let y = 0; y < rows - 1; y++) {
          for (let x = 0; x < cols - 1; x++) {
            const tl = field[y][x] > threshold ? 1 : 0;
            const tr = field[y][x + 1] > threshold ? 1 : 0;
            const bl = field[y + 1][x] > threshold ? 1 : 0;
            const br = field[y + 1][x + 1] > threshold ? 1 : 0;
            
            // Marching squares case
            const caseIndex = tl * 8 + tr * 4 + br * 2 + bl * 1;
            
            if (caseIndex === 0 || caseIndex === 15) continue;
            
            const x0 = x * gridSize;
            const y0 = y * gridSize;
            
            // Draw filled square for liquid
            if (caseIndex === 15) {
              graphics.rect(x0, y0, gridSize, gridSize);
              graphics.fill({ color: colorNum, alpha: 0.95 });
            } else {
              // Approximate with triangles for smooth edges
              graphics.rect(x0, y0, gridSize, gridSize);
              graphics.fill({ color: colorNum, alpha: 0.9 });
            }
          }
        }
        
        // Add highlights on surface
        const settledParticles = particles.filter(p => p.settled);
        if (settledParticles.length > 0) {
          // Find surface particles (topmost)
          const surfaceParticles = settledParticles
            .sort((a, b) => a.y - b.y)
            .slice(0, Math.min(15, settledParticles.length));

          surfaceParticles.forEach(p => {
            const shimmer = Math.sin(Date.now() * 0.003 + p.x * 0.1) * 0.3 + 0.5;
            graphics.circle(p.x, p.y - p.radius * 0.6, 2);
            graphics.fill({ color: 0xffffff, alpha: shimmer * 0.8 });
          });
        }
      };

      // Animation loop
      let animationFrameId: number = 0;
      const animate = () => {
        if (waterGraphicsRef.current && appRef.current) {
          updateParticles();
          drawWater();
        }
        animationFrameId = requestAnimationFrame(animate);
      };
      animate();

      return animationFrameId;
    };

    /**
     * STEP 3: Handle window resizes
     * If screen size changes, remeasure button and resize PixiJS canvas
     */
    const handleResize = () => {
      const rect = measureButton();
      if (rect && appRef.current) {
        const width = Math.floor(rect.width);
        const height = Math.floor(rect.height);
        console.log('🔄 Resizing canvas to:', width, 'x', height);
        appRef.current.renderer.resize(width, height);
      }
    };

    window.addEventListener('resize', handleResize);

    let frameId: number | undefined;
    initPixi().then(id => {
      frameId = id;
    });

    return () => {
      console.log('🧹 Cleaning up PixiJS');
      
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      
      if (appRef.current) {
        appRef.current.destroy(true, { children: true, texture: true });
        appRef.current = null;
      }
      
      if (waterGraphicsRef.current) {
        waterGraphicsRef.current = null;
      }
      
      // Clear canvas container
      if (canvasRef.current) {
        while (canvasRef.current.firstChild) {
          canvasRef.current.removeChild(canvasRef.current.firstChild);
        }
      }
      
      // Reset state for hot reload
      setMounted(false);
      particlesRef.current = [];
      
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Spawn particles when hovering - ONLY UNTIL FILLED
  useEffect(() => {
    if (isHovered && !isFilled) {
      // Calculate how many blobs needed to fill the button
      const calculateBlobsNeeded = () => {
        if (buttonSize.width === 0 || buttonSize.height === 0) return 0;
        
        // Area of button
        const buttonArea = buttonSize.width * buttonSize.height;
        
        // Average blob radius and area
        const avgRadius = 18;
        const avgBlobArea = Math.PI * avgRadius * avgRadius;
        
        // DOUBLED: 80% coverage for fuller liquid
        const targetCoverage = 0.8;
        return Math.ceil((buttonArea * targetCoverage) / avgBlobArea);
      };
      
      const totalBlobsNeeded = calculateBlobsNeeded();
      let blobsSpawned = 0;
      
      const spawnInterval = setInterval(() => {
        if (blobsSpawned >= totalBlobsNeeded) {
          setIsFilled(true);
          clearInterval(spawnInterval);
          return;
        }
        
        spawnWaterBlobs();
        blobsSpawned += 6; // DOUBLED: 6 blobs per spawn
      }, 120);
      
      return () => clearInterval(spawnInterval);
    } else if (!isHovered) {
      // Reset when not hovered
      setIsFilled(false);
      // Clear all particles
      particlesRef.current = [];
    }
  }, [isHovered, isFilled, buttonSize]);

  /**
   * Spawn water particles across FULL button width
   * Blobs spread evenly to fill the entire space
   */
  const spawnWaterBlobs = () => {
    if (buttonSize.width === 0 || buttonSize.height === 0) return;
    
    const blobCount = 6; // DOUBLED: 6 blobs per spawn
    
    for (let i = 0; i < blobCount; i++) {
      const particle: WaterParticle = {
        // Spawn across FULL WIDTH (0 to 100%)
        x: Math.random() * buttonSize.width,
        // Spawn from very top
        y: -20 + Math.random() * 10,
        // Minimal horizontal drift
        vx: (Math.random() - 0.5) * 1,
        // Start falling
        vy: Math.random() * 2,
        radius: 14 + Math.random() * 8, // 14-22px
        settled: false,
      };
      particlesRef.current.push(particle);
    }
  };

  return (
    <motion.button
      className="w-full relative group cursor-pointer"
      onHoverStart={() => {
        SoundManager.play('move');
        onHoverStart();
      }}
      onHoverEnd={onHoverEnd}
      onTap={() => {
        SoundManager.play('click');
        onTap();
      }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.985 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* BUTTON CONTAINER - The source of truth for size */}
      <div
        ref={buttonRef}
        className="relative h-24 rounded-2xl overflow-hidden backdrop-blur-md"
        style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))',
          border: '2px solid rgba(255,255,255,0.08)',
          boxShadow: isHovered
            ? `0 0 40px ${color}40, inset 0 2px 4px rgba(255,255,255,0.1), inset 0 -2px 4px rgba(0,0,0,0.2), 0 8px 32px rgba(0,0,0,0.4)`
            : `inset 0 2px 4px rgba(255,255,255,0.05), inset 0 -2px 4px rgba(0,0,0,0.1), 0 4px 20px rgba(0,0,0,0.3)`,
          transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
          }}
        />

        <div
          className="absolute bottom-0 left-0 right-0 h-px"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(0,0,0,0.3), transparent)',
          }}
        />

        {/* CANVAS CONTAINER - Uses inset-0 to match button EXACTLY */}
        <div 
          ref={canvasRef} 
          className="absolute inset-0"
          style={{ 
            pointerEvents: 'none',
          }}
        />

        {/* Button content - z-10 to stay above canvas */}
        <div className="relative z-10 flex items-center h-full px-8 gap-6">
          <motion.div
            className="w-14 h-14 rounded-xl flex items-center justify-center relative backdrop-blur-sm"
            style={{
              background: isHovered
                ? `linear-gradient(135deg, ${color}40, ${accentColor}30)`
                : 'rgba(255,255,255,0.04)',
              border: isHovered
                ? `1px solid ${color}60`
                : '1px solid rgba(255,255,255,0.08)',
              boxShadow: isHovered
                ? `0 0 20px ${color}40, inset 0 1px 2px rgba(255,255,255,0.2)`
                : 'inset 0 1px 2px rgba(255,255,255,0.05)',
            }}
            animate={{
              scale: isHovered ? 1.05 : 1,
            }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <Icon
              className="w-7 h-7 text-white"
              strokeWidth={2.5}
              style={{
                filter: isHovered ? `drop-shadow(0 0 8px ${color})` : 'none',
              }}
            />
          </motion.div>

          <div className="flex flex-col items-start flex-1">
            <motion.h2
              className="text-2xl font-black text-white tracking-wide"
              style={{
                letterSpacing: '0.05em',
                textShadow: isHovered ? `0 0 20px ${color}80` : 'none',
              }}
              animate={{
                x: isHovered ? 4 : 0,
              }}
              transition={{ duration: 0.3 }}
            >
              {label}
            </motion.h2>
            <motion.p
              className="text-xs font-medium text-white/50 tracking-wider mt-0.5"
              style={{
                letterSpacing: '0.1em',
              }}
              animate={{
                x: isHovered ? 4 : 0,
                opacity: isHovered ? 0.8 : 0.5,
              }}
              transition={{ duration: 0.3 }}
            >
              {subtitle}
            </motion.p>
          </div>
        </div>
      </div>
    </motion.button>
  );
}
