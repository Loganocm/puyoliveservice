import { motion } from 'motion/react';
import { ArrowLeft } from 'lucide-react';

interface BackButtonProps {
  onClick: () => void;
  label?: string;
  className?: string;
}

export function BackButton({ onClick, label = "BACK", className = "" }: BackButtonProps) {
  return (
    <motion.button
      onClick={onClick}
      className={`absolute top-8 left-8 flex items-center gap-3 px-5 py-2.5 rounded-full border border-white/20 bg-black/40 backdrop-blur-md text-white/90 font-bold text-sm tracking-widest hover:bg-white/10 hover:border-white/40 hover:text-white transition-all shadow-lg z-50 group ${className}`}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      whileHover={{ scale: 1.05, x: -5 }}
      whileTap={{ scale: 0.95 }}
    >
      <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
      {label}
    </motion.button>
  );
}
