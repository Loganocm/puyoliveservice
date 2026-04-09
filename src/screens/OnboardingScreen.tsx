import { motion } from "motion/react";
import { useState } from "react";
import { AuthManager } from "@/core/AuthManager";
import { APIClient } from "@/api/client";
import { Loader2, ArrowLeft, User, Lock, Mail } from "lucide-react";

interface OnboardingScreenProps {
  onComplete: (username: string) => void;
}

type Phase = "identity" | "login" | "register";

export function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const [phase, setPhase] = useState<Phase>("identity");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [email, setEmail] = useState("");

  const handleIdentitySubmit = async () => {
    setError(null);
    const cleanName = username.trim();

    if (!cleanName) {
      // Guest Flow
      AuthManager.loginAsGuest();
      onComplete("Guest");
      return;
    }

    setIsLoading(true);
    try {
      const exists = await APIClient.checkUsername(cleanName);
      if (exists) {
        setPhase("login");
      } else {
        setPhase("register");
      }
    } catch (e) {
      console.warn("API Check failed, defaulting to offline guest/error", e);
      setError("Connection failed. Try again or play as Guest.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async () => {
    setError(null);
    setIsLoading(true);
    try {
      await AuthManager.login(username.trim(), password);
      onComplete(username.trim());
    } catch (e: any) {
      setError(
        "Wrong password. If this isn't your account, go back and choose a different username.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async () => {
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setIsLoading(true);
    try {
      await AuthManager.register(username.trim(), password, email); // Server handles hashing
      onComplete(username.trim());
    } catch (e: any) {
      setError(e.message || "Registration failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="size-full relative overflow-hidden bg-transparent flex items-center justify-center font-sans pointer-events-auto">
      {/* Background effects */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,87,51,0.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,87,51,0.3) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
        }}
      />

      <motion.div
        className="w-full max-w-md px-8 py-8 relative z-10 bg-[#1a1a24] border border-white/10 rounded-3xl shadow-2xl backdrop-blur-md"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Back Button (Phase 2/3) */}
        {phase !== "identity" && (
          <motion.button
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={() => {
              setPhase("identity");
              setError(null);
              setPassword("");
              setConfirm("");
            }}
            className="absolute -top-16 left-8 flex items-center gap-2 text-white/40 hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-bold tracking-wider">BACK</span>
          </motion.button>
        )}

        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-black text-white mb-2 tracking-tight">
            {phase === "identity"
              ? "Puyo Live"
              : phase === "login"
                ? "Account Exists"
                : "Join Puyo Live"}
          </h1>
          <p className="text-white/50 font-medium">
            {phase === "identity" && "Enter a username to begin"}
            {phase === "login" &&
              `"${username}" is already taken — log in or go back to pick a different name`}
            {phase === "register" && `Create account for ${username}`}
          </p>
          {/* Legal Disclaimer */}
          <p className="text-white/30 text-xs mt-4 max-w-xs mx-auto leading-relaxed">
            By continuing, you agree to our{" "}
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-white/50 transition-colors"
            >
              Terms & Privacy Policy
            </a>
          </p>
        </div>

        {/* Form Container */}
        <div className="space-y-4">
          {/* Identity Phase */}
          {phase === "identity" && (
            <div className="space-y-2">
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20" />
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleIdentitySubmit()}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-12 py-4 text-white placeholder-white/20 focus:outline-none focus:border-[#FF5733]/50 focus:bg-white/10 transition-all font-medium"
                  placeholder="Username (Empty for Guest)"
                  autoFocus
                />
              </div>
            </div>
          )}

          {/* Login / Register Fields */}
          {(phase === "login" || phase === "register") && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" &&
                    (phase === "login" ? handleLogin() : null)
                  }
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-12 py-4 text-white placeholder-white/20 focus:outline-none focus:border-indigo-500/50 focus:bg-white/10 transition-all font-medium"
                  placeholder="Password"
                  autoFocus
                />
              </div>
            </motion.div>
          )}

          {/* Register Extra Fields */}
          {phase === "register" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20" />
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-12 py-4 text-white placeholder-white/20 focus:outline-none focus:border-indigo-500/50 focus:bg-white/10 transition-all font-medium"
                  placeholder="Confirm Password"
                />
              </div>

              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleRegister()}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-12 py-4 text-white placeholder-white/20 focus:outline-none focus:border-indigo-500/50 focus:bg-white/10 transition-all font-medium"
                  placeholder="Email (Optional)"
                />
              </div>
            </motion.div>
          )}

          {/* Error Message */}
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="bg-red-500/10 border border-red-500/20 rounded-lg p-3"
            >
              <p className="text-red-400 text-sm font-bold text-center">
                {error}
              </p>
            </motion.div>
          )}

          {/* Action Buttons */}
          <button
            disabled={isLoading}
            onClick={() => {
              if (phase === "identity") handleIdentitySubmit();
              if (phase === "login") handleLogin();
              if (phase === "register") handleRegister();
            }}
            className={`w-full py-4 rounded-xl font-black text-white text-base tracking-wider uppercase relative overflow-hidden transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
              phase === "identity" && !username.trim()
                ? "bg-white/5 hover:bg-white/10"
                : "bg-gradient-to-r from-indigo-600 to-violet-600 hover:shadow-lg hover:shadow-indigo-500/20"
            }`}
          >
            {isLoading ? (
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-white/50" />
            ) : (
              <span>
                {phase === "identity" &&
                  (!username.trim() ? "Play as Guest" : "Continue")}
                {phase === "login" && "Log In"}
                {phase === "register" && "Create Account"}
              </span>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
