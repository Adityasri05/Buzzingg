import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { User, ArrowRight, Loader2 } from "lucide-react";
import { Participant, Game, GameStatus } from "../types";
import { db } from "../lib/firebase";
import { collection, query, where, getDocs, addDoc, serverTimestamp, onSnapshot, orderBy, limit } from "firebase/firestore";
import { socket } from "../lib/socket";

interface Props {
  onNavigate: (path: string) => void;
  onJoined: (p: Participant) => void;
}

export default function JoinGame({ onNavigate, onJoined }: Props) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeGame, setActiveGame] = useState<Game | null>(null);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const urlGameId = searchParams.get("game");

    const q = query(collection(db, "games"));
    
    const parseTimestamp = (val: any): number => {
      if (!val) return 0;
      if (typeof val.toMillis === "function") return val.toMillis();
      if (typeof val.toDate === "function") return val.toDate().getTime();
      if (val.seconds) return val.seconds * 1000;
      if (val instanceof Date) return val.getTime();
      const p = new Date(val).getTime();
      return isNaN(p) ? 0 : p;
    };

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allGames = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Game));
      
      // If URL has specific gameId, check for that game
      let selectedGame = urlGameId ? allGames.find(g => g.id === urlGameId) : null;
      
      if (!selectedGame) {
        // Otherwise pick the latest active or not started game
        const activeGames = allGames
          .filter(g => g.status !== GameStatus.GAME_OVER)
          .sort((a, b) => parseTimestamp(b.createdAt) - parseTimestamp(a.createdAt));
        selectedGame = activeGames[0] || null;
      }

      setActiveGame(selectedGame);
      setError("");
    }, (err) => {
      console.error("Firestore Error in JoinGame:", err);
      setError("Sync error. Please refresh.");
    });

    return () => unsubscribe();
  }, []);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Name is required");
    if (name.length < 2) return setError("Name too short");
    if (!activeGame) return setError("No active game found. Please wait for the host.");

    setLoading(true);
    setError("");

    try {
      // Check for duplicate names in the same game (case-insensitive)
      const q = query(
        collection(db, "participants"), 
        where("gameId", "==", activeGame.id)
      );
      const snapshot = await getDocs(q);
      const isDuplicate = snapshot.docs.some(doc => (doc.data().name || "").toLowerCase() === name.trim().toLowerCase());
      if (isDuplicate) {
        setError("Name already taken in this game");
        setLoading(false);
        return;
      }

      const pDoc = await addDoc(collection(db, "participants"), {
        gameId: activeGame.id,
        name: name.trim(),
        score: 0,
        roundScore: 0,
        status: "ONLINE",
        joinedAt: serverTimestamp()
      });

      const participant: Participant = {
        id: pDoc.id,
        gameId: activeGame.id,
        name: name.trim(),
        score: 0,
        roundScore: 0,
        status: "ONLINE",
        joinedAt: new Date()
      };

      localStorage.setItem("buzz_participant", JSON.stringify(participant));
      onJoined(participant);
      onNavigate("/play");
    } catch (err) {
      console.error(err);
      setError("Failed to join game. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-[#050505]">
      {/* Background Decor */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[800px] aspect-square bg-[#EA4335]/5 rounded-full blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-[#111] p-10 md:p-12 rounded-[48px] border border-[#222] shadow-[0_40px_100px_rgba(0,0,0,0.8)] relative z-10"
      >
        <div className="text-center space-y-6 mb-12">
          <div className="flex items-center justify-between">
            <button 
              onClick={() => onNavigate("/")}
              className="p-2 text-[#333] hover:text-white transition-colors"
            >
              <ArrowRight size={20} className="rotate-180" />
            </button>
            <div className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full bg-[#181818] border border-[#222]">
              <div className="w-1.5 h-1.5 bg-[#4285F4] rounded-full animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#555]">GDG SRMCEM Activity</span>
            </div>
            <div className="w-8" /> {/* Spacer */}
          </div>
          
          <div className="space-y-2">
            <h2 className="text-4xl md:text-5xl font-display font-black text-white italic tracking-tighter leading-none uppercase">
              {activeGame ? ((activeGame.type === "MOVIE" || (activeGame as any).gameType === "MOVIE") ? "Cinema Riddle" : "Brand Identity") : "Session Join"}
            </h2>
            <p className="text-[#333] font-black uppercase tracking-[0.4em] text-[10px]">Initialize Identity Unit</p>
          </div>
        </div>

        <form onSubmit={handleJoin} className="space-y-10">
          <div className="space-y-4">
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none text-[#222] group-focus-within:text-[#EA4335] transition-colors">
                <User size={20} />
              </div>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="REGISTRATION NAME"
                className="w-full bg-[#080808] border border-[#222] rounded-[24px] py-6 pl-14 pr-6 focus:border-[#EA4335] focus:ring-4 focus:ring-[#EA4335]/10 transition-all font-black text-xl text-white tracking-tighter uppercase placeholder:text-[#1a1a1a]"
                disabled={loading}
              />
            </div>
            
            <AnimatePresence>
              {error && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="px-6 py-3 bg-[#EA4335]/10 border border-[#EA4335]/20 rounded-2xl"
                >
                  <p className="text-[#EA4335] text-[11px] font-black uppercase tracking-widest text-center">{error}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="space-y-4">
            <button
              type="submit"
              disabled={loading || (!activeGame && !error)}
              className="w-full flex items-center justify-center gap-4 bg-white hover:bg-slate-100 disabled:bg-[#0a0a0a] disabled:text-[#111] disabled:border-[#111] border-2 border-transparent text-black font-black text-2xl py-6 rounded-[28px] transition-all active:scale-[0.95] shadow-2xl shadow-white/5 uppercase italic tracking-tighter group"
            >
              {loading ? (
                <Loader2 className="animate-spin" size={28} />
              ) : (
                <>
                  Connect
                  <ArrowRight size={28} className="group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>

            {!activeGame && !loading && (
              <p className="text-center text-[#333] text-[9px] font-black uppercase tracking-[0.4em] animate-pulse">
                Awaiting Host Connection...
              </p>
            )}
          </div>
        </form>

        <div className="mt-12 flex items-center justify-center gap-6 text-[#1a1a1a]">
          <div className="h-px flex-1 bg-[#1a1a1a]" />
          <span className="text-[9px] font-black uppercase tracking-[0.5em] select-none">Buzz Protocol V1.0</span>
          <div className="h-px flex-1 bg-[#1a1a1a]" />
        </div>
      </motion.div>
    </div>
  );
}
