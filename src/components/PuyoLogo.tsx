import { motion } from 'motion/react';

interface PuyoLogoProps {
  size?: 'small' | 'medium' | 'large';
  animated?: boolean;
  className?: string;
}

export function PuyoLogo({ size = 'medium', animated = true, className = '' }: PuyoLogoProps) {
  const sizes = {
    small: {
      container: 'w-10 h-10',
    },
    medium: {
      container: 'w-14 h-14',
    },
    large: {
      container: 'w-20 h-20',
    },
  };

  return (
    <motion.div 
      className={`${sizes[size].container} relative ${className}`}
      initial={animated ? { opacity: 0, scale: 0.8 } : false}
      animate={animated ? { opacity: 1, scale: 1 } : {}}
      transition={{
        duration: 0.4,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      {/* Hexagonal base shape */}
      <div className="absolute inset-0">
        <svg viewBox="0 0 100 100" className="w-full h-full">
          {/* Outer glow */}
          <defs>
            <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style={{ stopColor: '#6366F1', stopOpacity: 1 }} />
              <stop offset="50%" style={{ stopColor: '#8B5CF6', stopOpacity: 1 }} />
              <stop offset="100%" style={{ stopColor: '#3B82F6', stopOpacity: 1 }} />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          
          {/* Main hexagon */}
          <polygon
            points="50,5 90,27.5 90,72.5 50,95 10,72.5 10,27.5"
            fill="url(#logoGradient)"
            stroke="rgba(255,255,255,0.3)"
            strokeWidth="2"
            filter="url(#glow)"
          />
          
          {/* Inner detail lines */}
          <line x1="50" y1="5" x2="50" y2="95" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
          <line x1="10" y1="27.5" x2="90" y2="72.5" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
          <line x1="10" y1="72.5" x2="90" y2="27.5" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
          
          {/* Center emblem */}
          <circle cx="50" cy="50" r="15" fill="rgba(255,255,255,0.2)" />
          <polygon
            points="50,38 58,48 54,58 46,58 42,48"
            fill="white"
            opacity="0.9"
          />
        </svg>
      </div>
    </motion.div>
  );
}

interface PuyoWordmarkProps {
  size?: 'small' | 'medium' | 'large';
}

export function PuyoWordmark({ size = 'medium' }: PuyoWordmarkProps) {
  const textSizes = {
    small: 'text-2xl',
    medium: 'text-4xl',
    large: 'text-6xl',
  };

  return (
    <div className="relative">
      <motion.h1
        className={`${textSizes[size]} font-black text-white tracking-wider relative`}
        style={{
          textShadow: '0 2px 20px rgba(99, 102, 241, 0.4)',
          letterSpacing: '0.1em',
        }}
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        PUYO
        <span className="ml-3 text-indigo-400">LIVE</span>
      </motion.h1>
    </div>
  );
}
