import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Lock, Zap, Award, Trophy, Loader2, Activity, CheckCircle2, XCircle } from "lucide-react";
import confetti from "canvas-confetti";
import { Participant, Game, GameStatus, BuzzerStatus, Buzz } from "../types";
import { socket } from "../lib/socket";
import { db } from "../lib/firebase";
import { doc, onSnapshot, query, where, collection, addDoc, updateDoc, serverTimestamp } from "firebase/firestore";

interface Props {
  participant: Participant | null;
  onNavigate: (path: string) => void;
  onReset: () => void;
}

export default function ParticipantView({ participant: initialParticipant, onNavigate, onReset }: Props) {
  const [participant, setParticipant] = useState<Participant | null>(initialParticipant);
  const [game, setGame] = useState<Game | null>(null);
  const [buzzResult, setBuzzResult] = useState<Buzz | null>(null);
  const [status, setStatus] = useState<"WAITING" | "READY" | "SUBMITTING" | "DONE" | "CORRECT" | "INCORRECT">("WAITING");

  useEffect(() => {
    if (!initialParticipant) {
      onNavigate("/join");
    }
  }, [initialParticipant, onNavigate]);

  useEffect(() => {
    if (!initialParticipant) return;
    
    const unsubP = onSnapshot(doc(db, "participants", initialParticipant.id), (snapshot) => {
      if (snapshot.exists()) {
        setParticipant({ id: snapshot.id, ...snapshot.data() } as Participant);
      } else {
        localStorage.removeItem("buzz_participant");
        onReset();
        onNavigate("/join");
      }
    });

    const unsubG = onSnapshot(doc(db, "games", initialParticipant.gameId), (docSnap) => {
      if (docSnap.exists()) {
        const gameData = { id: docSnap.id, ...docSnap.data() } as Game;
        setGame(gameData);
        if (gameData.buzzerStatus === BuzzerStatus.OPEN) {
          setStatus(prev => (prev === "DONE" || prev === "CORRECT" || prev === "INCORRECT" ? prev : "READY"));
        } else if (gameData.buzzerStatus === BuzzerStatus.CLOSED) {
          setStatus(prev => (prev === "READY" || prev === "SUBMITTING" ? "WAITING" : prev));
        }
      } else {
        // Game has been ended or removed
        console.warn("[Participant] Game not found, resetting session");
        localStorage.removeItem("buzz_participant");
        onReset();
        onNavigate("/join");
      }
    });

    return () => {
      unsubP();
      unsubG();
    };
  }, [initialParticipant?.id, initialParticipant?.gameId]);

  // Real-time listener for current question buzz status
  useEffect(() => {
    if (!initialParticipant || !game) return;

    const bQuery = query(
      collection(db, "buzzes"),
      where("gameId", "==", game.id)
    );

    const unsubB = onSnapshot(bQuery, (snapshot) => {
      const currentQ = game.currentQuestion || 1;

      // Parse Firestore timestamp helper
      const toMs = (val: any): number => {
        if (!val) return 0;
        if (typeof val.toMillis === "function") return val.toMillis();
        if (typeof val.toDate === "function") return val.toDate().getTime();
        if (val.seconds) return val.seconds * 1000;
        if (val instanceof Date) return val.getTime();
        const p = new Date(val).getTime();
        return isNaN(p) ? 0 : p;
      };

      const startedAtMs = toMs(game.startedAt);

      const questionBuzzDocs = snapshot.docs
        .map(doc => {
          const data = doc.data() as Buzz;
          // Calculate unbiased responseTime from Firestore server timestamps only
          const buzzedAtMs = toMs(data.buzzedAt || data.serverTimestamp);
          const serverResponseTime = startedAtMs > 0 && buzzedAtMs > 0
            ? Math.max(0, (buzzedAtMs - startedAtMs) / 1000)
            : (Number(data.responseTime) || 0);
          return { id: doc.id, ...data, responseTime: serverResponseTime } as Buzz;
        })
        .filter(b => (b.questionNumber || 1) === currentQ)
        .sort((a, b) => {
          const rA = Number(a.responseTime) || 0;
          const rB = Number(b.responseTime) || 0;
          if (Math.abs(rA - rB) > 0.001) return rA - rB;
          const tA = toMs(a.buzzedAt || a.serverTimestamp);
          const tB = toMs(b.buzzedAt || b.serverTimestamp);
          return tA - tB || a.id.localeCompare(b.id);
        });

      const myIndex = questionBuzzDocs.findIndex(b => b.participantId === initialParticipant.id);
      if (myIndex !== -1) {
        const myBuzz = questionBuzzDocs[myIndex];
        const dynamicPosition = myIndex + 1;
        const updatedBuzz = { ...myBuzz, position: dynamicPosition };
        setBuzzResult(updatedBuzz);
        if (myBuzz.status === "CORRECT") {
          setStatus("CORRECT");
        } else if (myBuzz.status === "INCORRECT") {
          setStatus("INCORRECT");
        } else {
          setStatus("DONE");
        }
      } else {
        setBuzzResult(null);
        if (game.buzzerStatus === BuzzerStatus.OPEN) {
          setStatus("READY");
        } else {
          setStatus("WAITING");
        }
      }
    }, (err) => {
      console.error("Firestore error in ParticipantView buzz query:", err);
    });

    return () => unsubB();
  }, [initialParticipant?.id, game?.id, game?.currentRound, game?.currentQuestion, game?.buzzerStatus]);

  // Trigger victory confetti on correct answer
  useEffect(() => {
    if (status === "CORRECT") {
      const duration = 3 * 1000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 999 };
      const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

      const interval: any = setInterval(() => {
        const timeLeft = animationEnd - Date.now();
        if (timeLeft <= 0) {
          return clearInterval(interval);
        }
        const particleCount = 50 * (timeLeft / duration);
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
      }, 250);

      return () => clearInterval(interval);
    }
  }, [status]);

  if (!initialParticipant) {
    return null;
  }

  const handleBuzz = async () => {
    if (status !== "READY" || !game || !participant) return;
    
    setStatus("SUBMITTING");

    if ("vibrate" in navigator) {
      navigator.vibrate([10, 30, 10]);
    }

    try {
      // Submit buzz record — responseTime is calculated server-side from
      // Firestore timestamps to eliminate all client clock-skew bias.
      // buzzedAt = serverTimestamp() (Firestore server time of arrival)
      // True responseTime = buzzedAt - game.startedAt (both Firestore server times)
      await addDoc(collection(db, "buzzes"), {
        gameId: game.id,
        roundNumber: game.currentRound || 1,
        questionNumber: game.currentQuestion || 1,
        participantId: participant.id,
        participantName: participant.name,
        serverTimestamp: serverTimestamp(),
        buzzedAt: serverTimestamp(),
        position: 1,
        pointsAwarded: 0,
        responseTime: 0, // Will be recalculated server-side from Firestore timestamps
        status: "PENDING"
      });

      // 2. Lock the buzzer locally/globally in the game document
      const gameRef = doc(db, "games", game.id);
      await updateDoc(gameRef, { 
        buzzerStatus: BuzzerStatus.CLOSED 
      });

    } catch (err) {
      console.error("Error submitting buzz:", err);
      setStatus("READY");
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#050505] text-slate-200 font-body overflow-hidden">
      {/* Dynamic Aura Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <AnimatePresence>
          {status === "READY" && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full aspect-square bg-[#EA4335]/5 rounded-full blur-[120px] animate-pulse" 
            />
          )}
        </AnimatePresence>
      </div>

      <header className="p-6 flex items-center justify-between relative z-10 border-b border-[#111] bg-[#050505]/80 backdrop-blur-md">
        <div className="flex flex-col">
          <span className="text-[9px] font-black uppercase tracking-[0.3em] text-[#333]">Identity Card</span>
          <span className="text-xl font-display font-black text-white italic tracking-tighter uppercase leading-tight">
            {participant?.name}
          </span>
        </div>
        <div className="text-right">
          <span className="text-[9px] font-black uppercase tracking-[0.3em] text-[#333]">Total Score</span>
          <div className="flex items-center gap-2 justify-end">
            <Trophy size={14} className="text-[#FBBC05]" />
            <span className="text-2xl font-display font-black text-white italic tracking-tighter leading-none">
              {participant?.score || 0}
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 grid place-items-center p-4 relative z-10">
        <div className="w-full max-w-lg flex flex-col items-center gap-12 md:gap-16">
          <div className="text-center space-y-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={game?.currentQuestion}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="inline-block px-4 py-1.5 rounded-full bg-[#111] border border-[#222]"
              >
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#555]">
                  Question {game?.currentQuestion || 0}
                </span>
              </motion.div>
            </AnimatePresence>

            <h2 className="text-4xl md:text-5xl font-display font-black text-white italic tracking-tighter leading-none uppercase">
              {status === "READY" 
                ? "SIGNAL ARMED" 
                : status === "DONE" 
                ? "TRANSMISSION OK" 
                : status === "CORRECT" 
                ? "CORRECT ANSWER! 🎉" 
                : status === "INCORRECT" 
                ? "ANSWER PASSED ❌" 
                : "SIGNAL LOCKED"}
            </h2>
            <p className="text-[#333] font-bold uppercase tracking-[0.2em] text-[10px]">
              {status === "READY" 
                ? "TAP TO BROADCAST" 
                : status === "SUBMITTING" 
                ? "SYNCING PULSE..." 
                : status === "DONE" 
                ? "AWAITING HOST VERIFICATION" 
                : status === "CORRECT" 
                ? "POINTS CONFIRMED & AWARDED" 
                : status === "INCORRECT" 
                ? "LOCKED OUT FOR THIS QUESTION" 
                : "WAIT FOR HOST"}
            </p>
          </div>

          <div className="relative w-full flex justify-center">
            <AnimatePresence mode="wait">
              {status === "CORRECT" && buzzResult ? (
                <motion.div
                  key="correct"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center gap-6 text-center"
                >
                  <div className="text-[100px] md:text-[140px] leading-none mb-4 select-none drop-shadow-[0_0_50px_rgba(52,168,83,0.4)]">
                    🎉
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-4xl md:text-5xl font-display font-black text-emerald-400 uppercase italic tracking-tighter leading-none">
                      Correct Answer!
                    </h3>
                    <div className="flex items-center justify-center gap-2">
                      <div className="px-6 py-2 bg-[#34A853] text-black font-black text-2xl italic tracking-tight rounded-xl">
                        +{buzzResult.pointsAwarded} PTS
                      </div>
                    </div>
                  </div>
                  <p className="text-slate-500 font-mono text-[10px] mt-2 tracking-[0.2em] uppercase">
                    Latency: {(buzzResult.responseTime ?? 0).toFixed(3)}s
                  </p>
                </motion.div>
              ) : status === "INCORRECT" && buzzResult ? (
                <motion.div
                  key="incorrect"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center gap-6 text-center"
                >
                  <div className="text-[100px] md:text-[140px] leading-none mb-4 select-none drop-shadow-[0_0_50px_rgba(234,67,53,0.3)]">
                    ❌
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-4xl md:text-5xl font-display font-black text-red-500 uppercase italic tracking-tighter leading-none">
                      Answer Incorrect
                    </h3>
                    <div className="px-4 py-1.5 bg-red-950/50 border border-red-900/50 text-red-400 font-bold text-xs uppercase tracking-widest rounded-lg">
                      Question Passed to Next
                    </div>
                  </div>
                  <p className="text-slate-600 font-mono text-[10px] mt-2 tracking-[0.2em] uppercase">
                    Latency: {(buzzResult.responseTime ?? 0).toFixed(3)}s
                  </p>
                </motion.div>
              ) : status === "DONE" && buzzResult ? (
                <motion.div
                  key="done"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center gap-6 text-center"
                >
                  <div className="text-[100px] md:text-[140px] leading-none mb-4 select-none drop-shadow-[0_0_40px_rgba(255,255,255,0.1)]">
                     ⚡
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-4xl md:text-5xl font-display font-black text-white uppercase italic tracking-tighter leading-none">
                      Done
                    </h3>
                    <div className="flex items-center justify-center gap-2">
                      <div className="px-4 py-1.5 bg-yellow-500/20 border border-yellow-500/40 text-yellow-300 font-black text-sm italic tracking-tight uppercase rounded-lg animate-pulse">
                        ⏳ Awaiting Host Verification
                      </div>
                    </div>
                  </div>
                  <p className="text-[#333] font-mono text-[9px] mt-4 tracking-[0.2em] uppercase">
                    Latency: {(buzzResult.responseTime ?? 0).toFixed(3)}s
                  </p>
                </motion.div>
              ) : (
                <div className="relative w-full flex justify-center items-center">
                  <AnimatePresence>
                    {status === "WAITING" && (
                      <motion.div
                        key="waiting"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.1 }}
                        className="absolute z-20 text-[#111] pointer-events-none"
                      >
                        <Lock size={120} strokeWidth={1} />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <motion.button
                    whileTap={status === "READY" ? { scale: 0.95, y: 8 } : {}}
                    onClick={handleBuzz}
                    disabled={status !== "READY"}
                    className={`relative w-[85vw] h-[85vw] max-w-[320px] max-h-[320px] md:max-w-[400px] md:max-h-[400px] rounded-full flex items-center justify-center transition-all duration-300 ${
                      status === "READY"
                        ? "bg-white text-black shadow-[0_20px_0_rgb(200,200,200),0_40px_80px_rgba(255,255,255,0.1)] active:shadow-none"
                        : "bg-[#0a0a0a] text-[#111] border-8 border-[#111] shadow-none scale-95"
                    }`}
                  >
                    <AnimatePresence mode="wait">
                      {status === "SUBMITTING" ? (
                        <motion.div 
                          key="submitting" 
                          initial={{ opacity: 0, rotate: 0 }} 
                          animate={{ opacity: 1, rotate: 360 }} 
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                          className="relative flex items-center justify-center"
                        >
                          <Loader2 size={80} className="text-[#EA4335]" strokeWidth={3} />
                          <div className="absolute inset-0 bg-[#EA4335]/20 rounded-full blur-xl animate-pulse" />
                        </motion.div>
                      ) : (
                        <motion.div key="icon" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }}>
                          <Zap 
                            size={120} 
                            fill="currentColor" 
                            className={status === "READY" ? "animate-pulse" : ""} 
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.button>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      <footer className="p-12 text-center relative z-10">
        <div className="flex items-center justify-center gap-6 text-[#111]">
          <div className="h-px w-12 bg-[#111]" />
          <span className="text-[10px] font-black uppercase tracking-[0.5em] select-none">System V1.0 • GDG SRMCEM</span>
          <div className="h-px w-12 bg-[#111]" />
        </div>
      </footer>
    </div>
  );
}
