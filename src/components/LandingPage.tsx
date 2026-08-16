import { motion } from "motion/react";
import { Zap, Shield, Play, LayoutDashboard } from "lucide-react";

interface Props {
  onNavigate: (path: string) => void;
}

export default function LandingPage({ onNavigate }: Props) {
  return (
    <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-20">
        <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] bg-[#4285F4]/10 rounded-full blur-[120px]" />
        <div className="absolute -bottom-[20%] -right-[10%] w-[60%] h-[60%] bg-[#EA4335]/10 rounded-full blur-[120px]" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="w-full max-w-4xl text-center space-y-12 relative z-10"
      >
        <div className="space-y-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="inline-block px-4 py-1.5 rounded-full bg-[#111] border border-[#222] text-[10px] font-bold tracking-[0.3em] text-[#888] uppercase"
          >
            GDG On Campus • SRMCEM
          </motion.div>
          <h1 className="text-7xl md:text-9xl font-display font-black tracking-tighter text-white italic">
            BUZZ<span className="text-[#EA4335]">I</span>NGG
          </h1>
          <p className="text-xl md:text-2xl text-[#888] max-w-2xl mx-auto font-light leading-relaxed tracking-tight">
            The high-performance real-time buzzer platform for <span className="text-white font-medium">interactive guessing games</span>.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onNavigate("/join")}
            className="group relative p-10 bg-white text-black rounded-[40px] overflow-hidden transition-all flex flex-col items-center gap-6 hover:shadow-[0_0_40px_rgba(255,255,255,0.05)]"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-transparent to-slate-100 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative z-10 w-20 h-20 bg-black rounded-3xl flex items-center justify-center text-white transition-transform group-hover:rotate-12 group-hover:scale-110">
              <Play size={36} fill="currentColor" />
            </div>
            <div className="relative z-10 text-center">
              <span className="block text-3xl font-black uppercase tracking-tighter italic">Join Session</span>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-[0.2em] opacity-60">Think Fast. Tap Faster.</span>
            </div>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onNavigate("/admin/login")}
            className="group relative p-10 bg-[#111] border border-[#222] text-white rounded-[40px] overflow-hidden transition-all flex flex-col items-center gap-6 hover:bg-[#181818] hover:border-[#333]"
          >
            <div className="relative z-10 w-20 h-20 bg-[#222] rounded-3xl flex items-center justify-center text-[#555] group-hover:text-[#4285F4] transition-all group-hover:scale-110">
              <Shield size={36} />
            </div>
            <div className="relative z-10 text-center">
              <span className="block text-3xl font-black uppercase tracking-tighter italic">Host Portal</span>
              <span className="text-xs font-bold text-[#555] uppercase tracking-[0.2em] opacity-60">Authorization required</span>
            </div>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onNavigate("/display")}
            className="md:col-span-2 group relative p-6 bg-[#080808] border border-[#111] text-white rounded-[32px] overflow-hidden transition-all flex items-center justify-center gap-6 hover:border-[#222]"
          >
            <Zap size={20} className="text-[#FBBC05]" />
            <span className="text-sm font-black uppercase tracking-[0.3em] italic">Open Public Broadcast Display</span>
          </motion.button>
        </div>

        <div className="pt-16 grid grid-cols-2 md:grid-cols-4 gap-8 max-w-3xl mx-auto opacity-40">
          <div className="flex flex-col items-center gap-2">
            <span className="text-2xl">🎬</span>
            <span className="text-[10px] font-black uppercase tracking-widest">Movies</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <span className="text-2xl">🔍</span>
            <span className="text-[10px] font-black uppercase tracking-widest">Logos</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <span className="text-2xl">⚡</span>
            <span className="text-[10px] font-black uppercase tracking-widest">Instant</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <span className="text-2xl">📈</span>
            <span className="text-[10px] font-black uppercase tracking-widest">Stats</span>
          </div>
        </div>
      </motion.div>

      {/* Footer Branding */}
      <div className="absolute bottom-12 w-full text-center px-6">
        <p className="text-[10px] font-black tracking-[0.5em] text-[#222] uppercase">
          Build for the future of interactive events • GDG SRMCEM
        </p>
      </div>
    </div>
  );
}
