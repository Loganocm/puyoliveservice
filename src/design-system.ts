/**
 * PUYO LIVE Design System
 * 
 * This file documents the core design principles and brand guidelines
 * implemented throughout the application.
 */

// ============================================
// COLOR PALETTE
// ============================================

export const colors = {
    // Primary Game Colors (matching puyo colors)
    blue: {
        main: '#3B82F6',
        shadow: 'rgba(59, 130, 246, 0.4)',
        bg: 'bg-blue-950/40',
    },
    purple: {
        main: '#A855F7',
        shadow: 'rgba(168, 85, 247, 0.4)',
        bg: 'bg-purple-950/40',
    },
    amber: {
        main: '#F59E0B',
        shadow: 'rgba(245, 158, 11, 0.4)',
        bg: 'bg-amber-950/40',
    },
    emerald: {
        main: '#10B981',
        shadow: 'rgba(16, 185, 129, 0.4)',
        bg: 'bg-emerald-950/40',
    },

    // Neutrals
    dark: '#0f0f1e',
    white: '#ffffff',
};

// ============================================
// TYPOGRAPHY SYSTEM
// ============================================

export const typography = {
    // All text uses font-black (900 weight) for headers
    // and font-bold (700) for body text to maintain the
    // chunky, game-like aesthetic

    display: 'text-7xl font-black tracking-tight',
    h1: 'text-5xl font-black tracking-tight',
    h2: 'text-4xl font-black tracking-tight',
    h3: 'text-3xl font-black tracking-tight',
    body: 'text-lg font-bold',
    caption: 'text-sm font-medium tracking-wider',
};

// ============================================
// ANIMATION PRINCIPLES
// ============================================

export const animations = {
    // Liquid Fill: Bottom-to-top with wave effect
    liquidFill: {
        duration: 0.6,
        ease: [0.4, 0.0, 0.2, 1], // Custom cubic bezier
    },

    // Bounce: Organic, playful spring animations
    bounce: {
        type: 'spring',
        stiffness: 200,
        damping: 15,
    },

    // Wobble: Subtle continuous movement for life
    wobble: {
        duration: 2,
        repeat: Infinity,
        ease: 'easeInOut',
    },

    // Hover: Quick, responsive feedback
    hover: {
        duration: 0.2,
        scale: 1.05,
    },
};

// ============================================
// MATERIAL DESIGN
// ============================================

export const materials = {
    // Glossy Liquid: Main visual style for puyo drops
    glossyLiquid: {
        gradient: 'linear-gradient(135deg, {color}E6 0%, {color} 100%)',
        shadow: 'inset -4px -4px 8px rgba(0,0,0,0.3), inset 4px 4px 8px rgba(255,255,255,0.2)',
        highlight: {
            primary: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.9), rgba(255,255,255,0.3), transparent)',
            secondary: 'radial-gradient(circle, rgba(255,255,255,0.4), transparent)',
        },
    },

    // Glass: UI elements with depth
    glass: {
        background: 'backdrop-blur-sm',
        border: 'border-2 border-white/10',
        shadow: '0 4px 12px rgba(0,0,0,0.2)',
    },
};

// ============================================
// COMPONENT PATTERNS
// ============================================

export const components = {
    // Button: Large, rounded, liquid-fill on hover
    button: {
        default: 'rounded-[3rem] border-4 border-white/10',
        height: 'h-32',
        padding: 'px-10',
        interaction: 'liquid-fill from bottom with wave effect',
    },

    // Badge: Small, rounded, glass effect
    badge: {
        default: 'rounded-full px-5 py-3 border-2 border-white/10',
        background: 'gradient with backdrop blur',
    },

    // Logo: Stacked liquid drops with glossy effect
    logo: {
        structure: '4 vertically stacked drops',
        colors: ['blue', 'purple', 'amber', 'emerald'],
        animation: 'entrance spring + continuous wobble',
    },
};

// ============================================
// SPACING & LAYOUT
// ============================================

export const layout = {
    // All rounded corners use large values (3rem, 2xl, etc)
    borderRadius: {
        button: '3rem',
        card: '2xl',
        badge: 'full',
    },

    // Generous spacing for breathing room
    spacing: {
        section: '8', // p-8, gap-8
        component: '6', // gap-6
        element: '4', // gap-4
    },
};

// ============================================
// DESIGN PHILOSOPHY
// ============================================

/**
 * Core Principles:
 * 
 * 1. LIQUID FIRST
 *    - All primary interactions use liquid/puyo aesthetics
 *    - Organic, rounded shapes throughout
 *    - Glossy, translucent materials
 * 
 * 2. BOLD & CHUNKY
 *    - Extra-bold typography (font-black)
 *    - Large interactive elements
 *    - High contrast for readability
 * 
 * 3. PLAYFUL MOTION
 *    - Bounce and spring animations
 *    - Continuous subtle wobble for life
 *    - Rewarding hover/click feedback
 * 
 * 4. VIBRANT HARMONY
 *    - Four signature colors from puyo game
 *    - Gradients connecting colors
 *    - Glowing shadows for depth
 * 
 * 5. GAME-CENTRIC UI
 *    - Buttons are the hero, not just navigation
 *    - Every interaction feels like gameplay
 *    - Visual hierarchy guides player journey
 */
