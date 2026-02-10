import { motion, HTMLMotionProps } from 'motion/react';
import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '../utils/cn'; // Assuming you have a cn utility, if not I will use template literals or classnames

interface GameButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: LucideIcon;
  fullWidth?: boolean;
  isLoading?: boolean;
}

export function GameButton({
  children,
  variant = 'primary',
  icon: Icon,
  className,
  fullWidth = true,
  isLoading = false,
  ...props
}: GameButtonProps) {
  
  const baseStyles = "relative h-14 rounded-xl font-bold text-lg tracking-wider flex items-center justify-center gap-3 transition-all disabled:opacity-50 disabled:cursor-not-allowed";
  
  const variants = {
    primary: "bg-gradient-to-r from-emerald-500 to-green-500 text-black shadow-[0_0_20px_rgba(34,197,94,0.4)] hover:shadow-[0_0_30px_rgba(34,197,94,0.6)] border border-white/10",
    secondary: "bg-white/10 text-white/80 border border-white/20 hover:bg-white/15",
    danger: "bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30",
    ghost: "bg-transparent text-white/50 hover:text-white border border-transparent hover:bg-white/5"
  };

  return (
    <motion.button
      className={cn( // Using cn if available, otherwise I'll need to check if it exists or use template strings
        baseStyles,
        variants[variant],
        fullWidth ? "w-full" : "w-auto px-8",
        className
      )}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      disabled={isLoading}
      {...props}
    >
      {isLoading ? (
        <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        <>
          {Icon && <Icon className="w-5 h-5" />}
          {children}
        </>
      )}
    </motion.button>
  );
}
