import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Lock, ShieldCheck, ArrowRight, Loader2, Zap } from "lucide-react";

interface Props {
  onNavigate: (path: string) => void;
}

export default function AdminLogin({ onNavigate }: Props) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("admin_token");
    if (token) {
      onNavigate("/admin/dashboard");
    }
  }, [onNavigate]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    setTimeout(() => {
      if (password.trim().toLowerCase() === "gdgsrmcem") {
        localStorage.setItem("admin_token", "admin-token-buzzingg");
        onNavigate("/admin/dashboard");
      } else {
        setError("Invalid Authorization Key.");
      }
      setLoading(false);
    }, 400);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-[#050505]">
      {/* Background Aura */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full aspect-square bg-[#4285F4]/5 rounded-full blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full bg-[#111] p-12 rounded-[48px] border border-[#222] shadow-[0_40px_100px_rgba(0,0,0,0.5)] relative z-10"
      >
        <div className="text-center space-y-6 mb-12 relative">
          <button 
            onClick={() => onNavigate("/")}
            className="absolute top-0 left-0 p-2 text-[#333] hover:text-white transition-colors"
          >
            <ArrowRight size={20} className="rotate-180" />
          </button>
          <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center mx-auto shadow-2xl">
            <ShieldCheck size={40} className="text-black" />
          </div>
          <div className="space-y-2">
            <p className="text-[#555] font-black uppercase text-[10px] tracking-[0.4em] leading-none">COMMAND ACCESS</p>
            <h2 className="text-5xl font-display font-black text-white italic tracking-tighter uppercase leading-none">Admin</h2>
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-10">
          <div className="space-y-4">
            <label className="text-[10px] font-black text-[#333] uppercase tracking-[0.3em] ml-1">Identity Authorization</label>
            <div className="relative">
              <Lock className="absolute left-6 top-1/2 -translate-y-1/2 text-[#333]" size={20} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="ENTER PROTOCOL KEY"
                className="w-full bg-[#080808] border border-[#222] rounded-3xl py-6 pl-16 pr-6 focus:border-[#4285F4] focus:ring-0 transition-all font-black text-xl text-white tracking-tight italic placeholder:text-[#222] uppercase"
                disabled={loading}
              />
            </div>
            {error && (
              <motion.p 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-[#EA4335] text-[10px] font-black uppercase tracking-widest ml-1"
              >
                {error}
              </motion.p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-4 bg-white hover:bg-slate-200 disabled:bg-[#222] disabled:text-[#444] text-black font-black text-xl py-6 rounded-3xl transition-all active:scale-[0.98] shadow-2xl shadow-white/5 italic uppercase tracking-tighter"
          >
            {loading ? <Loader2 className="animate-spin" /> : (
              <>
                Initialize Dashboard
                <ArrowRight size={24} />
              </>
            )}
          </button>
        </form>

        <div className="mt-16 pt-8 border-t border-[#1a1a1a] flex items-center justify-center gap-4 text-[#222]">
          <Zap size={14} fill="currentColor" />
          <span className="text-[9px] font-black uppercase tracking-[0.5em]">SRMCEM • SECURE NODE</span>
          <Zap size={14} fill="currentColor" />
        </div>
      </motion.div>
    </div>
  );
}
