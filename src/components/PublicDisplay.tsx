import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Trophy, Zap, QrCode as QrIcon, Flame, Clock, Award, Users, CheckCircle2, XCircle } from "lucide-react";
import { Game, Participant, Buzz, GameStatus, BuzzerStatus } from "../types";
import { db } from "../lib/firebase";
import { socket } from "../lib/socket";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { QRCodeSVG } from "qrcode.react";

interface Props {
  onNavigate: (path: string) => void;
}

export default function PublicDisplay({ onNavigate }: Props) {
  const [activeGame, setActiveGame] = useState<Game | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [recentBuzzes, setRecentBuzzes] = useState<Buzz[]>([]);
  const [showWinner, setShowWinner] = useState(false);

  useEffect(() => {
    const parseTimestamp = (val: any): number => {
      if (!val) return 0;
      if (typeof val.toMillis === "function") return val.toMillis();
      if (typeof val.toDate === "function") return val.toDate().getTime();
      if (val.seconds) return val.seconds * 1000;
      if (val instanceof Date) return val.getTime();
      const p = new Date(val).getTime();
      return isNaN(p) ? 0 : p;
    };

    const gameQuery = query(collection(db, "games"));
    const unsubGame = onSnapshot(gameQuery, (snapshot) => {
      const allGames = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Game))
        .filter(g => g.status !== GameStatus.GAME_OVER)
        .sort((a, b) => parseTimestamp(b.createdAt) - parseTimestamp(a.createdAt));

      if (allGames.length > 0) {
        const latestGame = allGames[0];
        setActiveGame(latestGame);
        setShowWinner(latestGame.status === GameStatus.GAME_OVER);
      } else {
        setActiveGame(null);
        setShowWinner(false);
      }
    }, (err) => {
      console.error("Firestore error in PublicDisplay game query:", err);
    });

    return () => unsubGame();
  }, []);

  useEffect(() => {
    if (!activeGame) {
      setParticipants([]);
      setRecentBuzzes([]);
      return;
    }

    // Join the game socket room for real-time broadcasts
    socket.emit("join_room", activeGame.id);

    const pQuery = query(
      collection(db, "participants"), 
      where("gameId", "==", activeGame.id)
    );
    const unsubP = onSnapshot(pQuery, (snapshot) => {
      const pList = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Participant))
        .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
      setParticipants(pList);
    }, (err) => {
      console.error("Firestore error in PublicDisplay participant query:", err);
    });

    const bQuery = query(
      collection(db, "buzzes"), 
      where("gameId", "==", activeGame.id)
    );

    const toMs = (val: any): number => {
      if (!val) return 0;
      if (typeof val === "number" && !isNaN(val)) return val;
      if (typeof val.toMillis === "function") return val.toMillis();
      if (typeof val.toDate === "function") return val.toDate().getTime();
      if (val.seconds) return val.seconds * 1000;
      if (val instanceof Date) return val.getTime();
      const p = new Date(val).getTime();
      return isNaN(p) ? 0 : p;
    };

    const startedAtMs = toMs(activeGame.startedAt);

    const getEffectiveResponseTime = (data: Buzz): number => {
      const buzzedAtMs = toMs(data.buzzedAt || data.serverTimestamp || (data as any).clientTimestamp);
      if (startedAtMs > 0 && buzzedAtMs > 0 && buzzedAtMs >= startedAtMs) {
        const delta = (buzzedAtMs - startedAtMs) / 1000;
        if (delta > 0) return delta;
      }
      if (typeof data.responseTime === "number" && data.responseTime > 0) {
        return data.responseTime;
      }
      return 0.150;
    };

    const unsubB = onSnapshot(bQuery, (snapshot) => {
      const bList = snapshot.docs
        .map(doc => {
          const data = doc.data() as Buzz;
          const effectiveResponseTime = getEffectiveResponseTime(data);
          return { id: doc.id, ...data, responseTime: effectiveResponseTime } as Buzz;
        })
        .filter(b => (b.questionNumber || 1) === (activeGame.currentQuestion || 1))
        .sort((a, b) => {
          const rA = Number(a.responseTime) || 0;
          const rB = Number(b.responseTime) || 0;
          if (Math.abs(rA - rB) > 0.001) return rA - rB;
          const tA = toMs(a.buzzedAt || a.serverTimestamp || (a as any).clientTimestamp);
          const tB = toMs(b.buzzedAt || b.serverTimestamp || (b as any).clientTimestamp);
          return tA - tB || a.id.localeCompare(b.id);
        })
        .slice(0, 8);
      setRecentBuzzes(bList);
    }, (err) => {
      console.error("Firestore error in PublicDisplay buzzes query:", err);
    });

    const handleBuzzVerified = (data: any) => {
      if (data.participantId) {
        setParticipants(prev => {
          const updated = prev.map(p => {
            if (p.id === data.participantId) {
              const newScore = data.newScore !== undefined ? data.newScore : Math.max(0, (Number(p.score) || 0) + (data.scoreDelta || 0));
              const newRound = data.newScore !== undefined ? data.newScore : Math.max(0, (Number(p.roundScore) || 0) + (data.scoreDelta || 0));
              return { ...p, score: newScore, roundScore: newRound };
            }
            return p;
          });
          return [...updated].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
        });
      }
    };

    const handleScoreAdjusted = (data: any) => {
      if (data.participantId) {
        setParticipants(prev => {
          const updated = prev.map(p => {
            if (p.id === data.participantId) {
              const newScore = data.newScore !== undefined ? data.newScore : Math.max(0, (Number(p.score) || 0) + (data.delta || 0));
              const newRound = data.newScore !== undefined ? data.newScore : Math.max(0, (Number(p.roundScore) || 0) + (data.delta || 0));
              return { ...p, score: newScore, roundScore: newRound };
            }
            return p;
          });
          return [...updated].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
        });
      }
    };

    const handleGameState = (updatedGame: Game) => {
      if (updatedGame && updatedGame.id === activeGame.id) {
        setActiveGame(updatedGame);
        setShowWinner(updatedGame.status === GameStatus.GAME_OVER);
      }
    };

    socket.on("buzz_verified", handleBuzzVerified);
    socket.on("score_adjusted", handleScoreAdjusted);
    socket.on("game_state_changed", handleGameState);

    return () => {
      unsubP();
      unsubB();
      socket.off("buzz_verified", handleBuzzVerified);
      socket.off("score_adjusted", handleScoreAdjusted);
      socket.off("game_state_changed", handleGameState);
    };
  }, [activeGame?.id, activeGame?.currentQuestion]);

  if (!activeGame) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-12 text-center overflow-hidden">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="space-y-12 relative z-10"
        >
          <div className="w-32 h-32 bg-white rounded-[40px] flex items-center justify-center mx-auto text-black shadow-2xl">
            <Zap size={64} fill="currentColor" />
          </div>
          <div className="space-y-4">
            <h1 className="text-8xl md:text-9xl font-display font-black text-white italic tracking-tighter uppercase leading-none">BUZZINGG</h1>
            <p className="text-[#333] font-black uppercase tracking-[0.5em] text-sm">GDG On Campus • SRMCEM</p>
          </div>
          <p className="text-xl font-light text-[#555] tracking-tight">Waiting for session synchronization...</p>
        </motion.div>
      </div>
    );
  }

  const sortedParticipants = [...participants].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
  const firstBuzzer = recentBuzzes.length > 0 ? recentBuzzes[0] : null;
  const activeBuzzer = recentBuzzes.find(b => b.status !== 'INCORRECT') || firstBuzzer;

  return (
    <div className="min-h-screen bg-[#050505] text-white p-6 md:p-10 lg:p-14 flex flex-col overflow-hidden relative font-body">
      {/* Broadcast Background Ambient Glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-blue-900/10 via-transparent to-red-900/10" />
        <div className="absolute top-1/3 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#4285F4]/8 rounded-full blur-[140px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-[#FBBC05]/6 rounded-full blur-[150px]" />
      </div>

      {/* Broadcast Header */}
      <header className="flex items-center justify-between relative z-10 mb-8 md:mb-12 pb-6 border-b border-[#141414]">
        <div className="flex items-center gap-6 md:gap-8">
          <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-black font-black shadow-xl shadow-white/10">
            <Zap size={26} fill="currentColor" />
          </div>
          <div className="flex flex-col">
            <span className="text-[#555] font-black uppercase tracking-[0.35em] text-[10px]">GDG ON CAMPUS SRMCEM</span>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl md:text-4xl font-display font-black text-white italic tracking-tighter">BUZZINGG</h1>
              <div className="h-5 w-px bg-[#222]" />
              <div className="px-3 py-0.5 bg-red-500/10 border border-red-500/30 rounded-full text-[10px] font-black uppercase tracking-widest text-red-400 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
                Live Broadcast
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="px-5 py-2.5 bg-[#0e0e0e] border border-[#222] rounded-2xl text-right">
            <p className="text-[#555] font-black uppercase tracking-[0.3em] text-[9px]">Active Session</p>
            <p className="text-lg md:text-xl font-display font-black italic tracking-tight uppercase text-white">
              {((activeGame.type || (activeGame as any).gameType) === "MOVIE") ? "🎬 Cinema Riddle" : "🔍 Brand Identity"} • Question {activeGame.currentQuestion || 1}
            </p>
          </div>
        </div>
      </header>

      {/* Main Broadcast Grid */}
      <div className="flex-1 grid grid-cols-12 gap-8 lg:gap-12 relative z-10">
        
        {/* Left Column: First Buzzer Spotlight & Arrival Telemetry */}
        <div className="col-span-12 lg:col-span-7 flex flex-col space-y-6">
          
          {/* Section Header */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full ${activeGame.buzzerStatus === BuzzerStatus.OPEN ? "bg-emerald-500 animate-ping" : "bg-red-500"}`} />
                <h2 className="text-2xl font-display font-black text-white italic tracking-tighter uppercase">
                  Fastest Finger Spotlight
                </h2>
              </div>
              <p className="text-[#555] font-bold uppercase tracking-[0.2em] text-[10px]">
                Question {activeGame.currentQuestion} • Buzzer {activeGame.buzzerStatus === BuzzerStatus.OPEN ? "ARMED & OPEN" : "LOCKED"}
              </p>
            </div>
            
            {firstBuzzer && (
              <div className="px-4 py-1.5 bg-[#141414] border border-[#262626] rounded-full text-xs font-mono font-bold text-[#FBBC05] flex items-center gap-2">
                <Flame size={14} />
                <span>Response: {(firstBuzzer.responseTime ?? 0).toFixed(3)}s</span>
              </div>
            )}
          </div>

          {/* Active Buzzer Hero Spotlight Card */}
          <AnimatePresence mode="wait">
            {activeBuzzer ? (
              <motion.div
                key={activeBuzzer.id}
                initial={{ opacity: 0, scale: 0.92, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 260, damping: 24 }}
                className={`p-8 md:p-10 rounded-[36px] border relative overflow-hidden transition-all shadow-2xl ${
                  activeBuzzer.status === 'CORRECT'
                    ? "bg-gradient-to-br from-emerald-500 via-emerald-600 to-emerald-700 text-black border-emerald-300 shadow-emerald-500/30"
                    : activeBuzzer.status === 'INCORRECT'
                    ? "bg-[#0c0c0c] border-red-900/50 text-slate-400"
                    : "bg-white text-black border-white shadow-white/10"
                }`}
              >
                {/* Background Watermark */}
                <div className="absolute right-4 -bottom-6 text-[180px] font-display font-black italic opacity-5 select-none pointer-events-none">
                  #{activeBuzzer.position ? String(activeBuzzer.position).padStart(2, '0') : '01'}
                </div>

                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <span className={`px-3.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 ${
                        activeBuzzer.status === 'CORRECT'
                          ? "bg-black text-white"
                          : activeBuzzer.status === 'INCORRECT'
                          ? "bg-red-950 text-red-400 border border-red-800/40"
                          : "bg-black text-white"
                      }`}>
                        <Zap size={12} fill="currentColor" />
                        {activeBuzzer.position === 1 ? "FIRST ON BUZZER" : `ACTIVE CONTENDER • #${activeBuzzer.position || 1}`}
                      </span>

                      {activeBuzzer.status === 'CORRECT' && (
                        <span className="px-3.5 py-1 bg-black/15 text-black border border-black/20 text-[10px] font-black uppercase tracking-widest rounded-full flex items-center gap-1">
                          <CheckCircle2 size={12} /> Correct Answer
                        </span>
                      )}
                      {activeBuzzer.status === 'INCORRECT' && (
                        <span className="px-3.5 py-1 bg-red-950/60 text-red-400 border border-red-900/50 text-[10px] font-black uppercase tracking-widest rounded-full flex items-center gap-1">
                          <XCircle size={12} /> Passed / Incorrect
                        </span>
                      )}
                      {activeBuzzer.status !== 'CORRECT' && activeBuzzer.status !== 'INCORRECT' && (
                        <span className="px-3.5 py-1 bg-emerald-500 text-black text-[10px] font-black uppercase tracking-widest rounded-full animate-pulse font-bold">
                          🎯 Active Answering
                        </span>
                      )}
                    </div>

                    <h3 className={`text-4xl md:text-6xl font-display font-black uppercase tracking-tighter italic leading-tight ${
                      activeBuzzer.status === 'INCORRECT' ? "line-through text-slate-500" : ""
                    }`}>
                      {activeBuzzer.participantName}
                    </h3>

                    <div className="flex items-center gap-6 pt-1">
                      <div className="flex items-center gap-2">
                        <Clock size={16} className={activeBuzzer.status === 'CORRECT' ? "text-black/70" : "text-slate-500"} />
                        <span className="font-mono text-sm md:text-base font-bold">
                          Latency: {(activeBuzzer.responseTime ?? 0).toFixed(3)}s
                        </span>
                      </div>
                      <div className="h-4 w-px bg-current opacity-20" />
                      <div className="text-xs font-black uppercase tracking-wider opacity-80">
                        Position: #{activeBuzzer.position || 1} in Queue
                      </div>
                    </div>
                  </div>

                  <div className="text-right self-end md:self-center shrink-0">
                    <span className={`text-6xl md:text-7xl font-display font-black italic tracking-tighter leading-none ${
                      activeBuzzer.status === 'CORRECT'
                        ? "text-black"
                        : activeBuzzer.status === 'INCORRECT'
                        ? "text-slate-600 line-through"
                        : "text-[#34A853]"
                    }`}>
                      +{activeBuzzer.pointsAwarded}
                    </span>
                    <p className="text-[9px] font-black uppercase tracking-[0.25em] opacity-60 mt-1">Award Potential</p>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="h-[220px] md:h-[260px] flex flex-col items-center justify-center border-2 border-dashed border-[#181818] rounded-[36px] bg-[#090909]/60 p-8 text-center space-y-4"
              >
                <div className="w-16 h-16 rounded-3xl bg-[#111] border border-[#222] flex items-center justify-center text-white/30 animate-pulse">
                  <Zap size={32} />
                </div>
                <div className="space-y-1">
                  <p className="text-white font-display font-black uppercase tracking-tight text-lg italic">
                    Waiting for first buzz...
                  </p>
                  <p className="text-[#444] font-mono text-xs uppercase tracking-widest">
                    Participants: Tap your buzzer to claim 1st position
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Subsequent Buzzes Queue */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-widest text-[#444] px-2">
              <span>Arrival Sequence Queue</span>
              <span>{recentBuzzes.length} Recorded</span>
            </div>

            <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
              <AnimatePresence mode="popLayout">
                {recentBuzzes.slice(1).map((buzz, idx) => {
                  const isWinner = buzz.status === 'CORRECT';
                  const isIncorrect = buzz.status === 'INCORRECT';
                  const isActive = activeBuzzer?.id === buzz.id;
                  const delta = Math.max(0, (buzz.responseTime ?? 0) - (firstBuzzer?.responseTime ?? 0));

                  return (
                    <motion.div
                      key={buzz.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`p-4 md:p-5 rounded-2xl border flex items-center justify-between transition-all ${
                        isWinner
                          ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-300"
                          : isIncorrect
                          ? "bg-[#090909] border-red-950/30 text-slate-500 opacity-50"
                          : isActive
                          ? "bg-[#161616] border-white/50 text-white shadow-lg"
                          : "bg-[#0b0b0b] border-[#181818] text-slate-300"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <span className="font-mono text-xs font-black text-[#555] w-6">
                          #{idx + 2}
                        </span>
                        <div>
                          <p className={`font-display font-black uppercase tracking-tight text-lg md:text-xl italic ${isIncorrect ? "line-through text-slate-500" : ""}`}>
                            {buzz.participantName}
                          </p>
                          <div className="flex items-center gap-3 text-[10px] font-mono text-[#666] mt-0.5">
                            <span>{(buzz.responseTime ?? 0).toFixed(3)}s</span>
                            <span className="text-red-400">+{delta.toFixed(3)}s</span>
                            {isActive && (
                              <span className="px-2 py-0.5 bg-white text-black text-[9px] font-bold rounded uppercase">
                                Active
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-lg md:text-xl font-display font-black italic text-slate-400">
                          +{buzz.pointsAwarded}
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {recentBuzzes.length <= 1 && (
                <div className="text-center py-6 text-xs text-[#333] font-mono uppercase tracking-wider">
                  {recentBuzzes.length === 1 ? "No secondary buzzes recorded yet" : "Queue empty"}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Redesigned Full Live Leaderboard */}
        <div className="col-span-12 lg:col-span-5 flex flex-col space-y-6">
          
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <Trophy size={24} className="text-[#FBBC05]" />
                <h2 className="text-2xl font-display font-black text-white italic tracking-tighter uppercase">
                  Live Standings
                </h2>
              </div>
              <p className="text-[#555] font-bold uppercase tracking-[0.2em] text-[10px]">
                {participants.length} Registered Contender{participants.length === 1 ? "" : "s"}
              </p>
            </div>

            <div className="px-3.5 py-1 bg-white/5 border border-white/10 rounded-full text-[10px] font-black uppercase tracking-widest text-[#888] flex items-center gap-2">
              <Users size={12} />
              <span>Ranked by PTS</span>
            </div>
          </div>

          {/* Leaderboard Card Container */}
          <div className="p-6 md:p-8 bg-[#090909] border border-[#1a1a1a] rounded-[36px] relative overflow-hidden flex flex-col flex-1 shadow-2xl">
            
            {/* Scrollable Standings List */}
            <div className="space-y-2.5 relative z-10 max-h-[460px] overflow-y-auto pr-2 custom-scrollbar">
              <AnimatePresence mode="popLayout">
                {sortedParticipants.map((p, idx) => {
                  const isTop1 = idx === 0;
                  const isTop2 = idx === 1;
                  const isTop3 = idx === 2;
                  const isFirstBuzzerActive = firstBuzzer?.participantId === p.id;

                  return (
                    <motion.div
                      key={p.id}
                      layout
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ type: "spring", stiffness: 350, damping: 30, delay: idx * 0.03 }}
                      className={`flex items-center justify-between p-4 md:p-5 rounded-2xl transition-all ${
                        isTop1
                          ? "bg-gradient-to-r from-[#FBBC05]/15 via-[#181818] to-[#121212] border border-[#FBBC05]/40 shadow-lg shadow-[#FBBC05]/5"
                          : isTop2
                          ? "bg-gradient-to-r from-slate-300/10 via-[#181818] to-[#121212] border border-slate-400/30"
                          : isTop3
                          ? "bg-gradient-to-r from-amber-700/15 via-[#181818] to-[#121212] border border-amber-700/30"
                          : "bg-[#111] border border-[#1c1c1c] hover:border-[#333]"
                      }`}
                    >
                      <div className="flex items-center gap-4 md:gap-5 min-w-0">
                        {/* Rank Badge */}
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-display font-black italic text-base shrink-0 ${
                          isTop1
                            ? "bg-[#FBBC05] text-black shadow-md shadow-[#FBBC05]/30"
                            : isTop2
                            ? "bg-slate-200 text-black"
                            : isTop3
                            ? "bg-amber-700 text-white"
                            : "bg-[#181818] text-[#555] border border-[#222]"
                        }`}>
                          {idx + 1}
                        </div>

                        {/* Participant Details */}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-lg md:text-xl font-display font-black italic uppercase tracking-tight truncate ${
                              isTop1 ? "text-[#FBBC05]" : isTop2 ? "text-slate-100" : isTop3 ? "text-amber-200" : "text-white"
                            }`}>
                              {p.name}
                            </span>
                            {isFirstBuzzerActive && (
                              <span className="px-2 py-0.5 bg-yellow-400/20 border border-yellow-400/40 text-yellow-300 text-[8px] font-black uppercase tracking-wider rounded-md shrink-0 flex items-center gap-1">
                                <Zap size={10} fill="currentColor" /> 1st Buzz
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-[#666] font-mono mt-0.5">
                            <span>Score: {p.score || 0} pts</span>
                          </div>
                        </div>
                      </div>

                      {/* Total Score */}
                      <div className="text-right shrink-0">
                        <span className={`text-2xl md:text-3xl font-display font-black italic tracking-tighter leading-none ${
                          isTop1 ? "text-[#FBBC05]" : isTop2 ? "text-slate-200" : isTop3 ? "text-amber-300" : "text-white"
                        }`}>
                          {p.score || 0}
                        </span>
                        <p className="text-[8px] font-black uppercase tracking-[0.2em] text-[#444]">PTS</p>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {participants.length === 0 && (
                <div className="text-center py-16 opacity-30 text-xs font-black uppercase tracking-widest italic space-y-2">
                  <Users size={32} className="mx-auto text-[#444] mb-2" />
                  <p>No participants registered yet</p>
                  <p className="text-[10px] font-mono">Scan QR Code to join this session</p>
                </div>
              )}
            </div>
            
            {/* QR Quick Access Card at Footer */}
            <div className="mt-auto pt-6 border-t border-[#181818] flex items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-[#444] font-black uppercase tracking-[0.3em] text-[9px]">Direct Connect</p>
                <p className="text-white font-mono font-bold text-xs uppercase tracking-wider truncate max-w-[160px]">
                  {window.location.hostname}
                </p>
                <p className="text-[#333] text-[9px] font-mono">Session ID: {(activeGame.id || "").slice(0, 8)}</p>
              </div>

              <div className="p-3 bg-white rounded-2xl shadow-xl shadow-white/5 shrink-0">
                <QRCodeSVG 
                  value={`${window.location.origin}/join?game=${activeGame.id}`} 
                  size={96}
                  level="H"
                  bgColor="#FFFFFF"
                  fgColor="#000000"
                />
              </div>
            </div>

          </div>
        </div>

      </div>

      {/* Grand Final Champion Overlay */}
      <AnimatePresence>
        {showWinner && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/95 backdrop-blur-3xl z-[100] flex flex-col items-center justify-center p-12 text-center"
          >
            <Trophy size={120} className="text-[#FBBC05] mb-12 animate-bounce" />
            <div className="space-y-4">
              <p className="text-[#FBBC05] font-black uppercase tracking-[0.5em] text-sm italic">Grand Final Champion</p>
              <h2 className="text-[120px] leading-none font-display font-black text-white uppercase italic tracking-tighter">
                {sortedParticipants[0]?.name || "N/A"}
              </h2>
              <p className="text-4xl font-display font-black italic text-white/20 tracking-tighter">Total Score: {sortedParticipants[0]?.score || 0}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1f1f1f; border-radius: 10px; }
      `}</style>
    </div>
  );
}

