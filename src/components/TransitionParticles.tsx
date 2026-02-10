import React from 'react';
import { motion } from 'motion/react';

export const TransitionParticles: React.FC = () => {
    // Generate random particles
    const particles = Array.from({ length: 30 }).map((_, i) => ({
        id: i,
        x: Math.random() * 100, // %
        y: Math.random() * 100, // %
        size: Math.random() * 4 + 2, // px
        duration: Math.random() * 1 + 0.5, // s
        delay: Math.random() * 0.5,
    }));

    return (
        <div className="absolute inset-0 z-50 overflow-hidden bg-black flex items-center justify-center pointer-events-none">
            {particles.map((p) => (
                <motion.div
                    key={p.id}
                    className="absolute rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]"
                    style={{
                        left: `${p.x}%`,
                        top: `${p.y}%`,
                        width: p.size,
                        height: p.size,
                    }}
                    initial={{ opacity: 0, scale: 0, y: 0 }}
                    animate={{ 
                        opacity: [0, 1, 0], 
                        scale: [0, 1.5, 0], 
                        y: -100 // Float up
                    }}
                    transition={{
                        duration: p.duration,
                        delay: p.delay,
                        ease: "easeOut",
                        repeat: Infinity,
                        repeatDelay: Math.random() * 0.5
                    }}
                />
            ))}
            <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="text-2xl font-bold text-white tracking-[0.5em] uppercase text-center"
            >
                Loading
            </motion.div>
        </div>
    );
};
