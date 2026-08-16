import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Users, 
  CircleStop, 
  Trophy, 
  ChevronRight,
  ChevronLeft, 
  Zap,
  Activity,
  LogOut,
  QrCode as QrIcon,
  Shield,
  CircleDot,
  Home,
  Plus,
  CheckCircle2,
  XCircle,
  X,
  Clock,
  ArrowRight,
  RotateCcw,
  Sparkles,
  Check,
  Flame,
  CornerDownRight,
  Edit3,
  UserX
} from "lucide-react";
import { Game, Participant, Buzz, GameStatus, GameType, BuzzerStatus } from "../types";
import { db } from "../lib/firebase";
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp, 
  orderBy,
  limit,
  increment,
  writeBatch,
  getDocs
} from "firebase/firestore";
import { socket } from "../lib/socket";
import { QRCodeSVG } from "qrcode.react";

interface Props {
  onNavigate: (path: string) => void;
}

export default function AdminDashboard({ onNavigate }: Props) {
  const [activeGame, setActiveGame] = useState<Game | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [recentBuzzes, setRecentBuzzes] = useState<Buzz[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGameType, setNewGameType] = useState<GameType>(GameType.MOVIE);
  const [isAuthorizing, setIsAuthorizing] = useState(true);

  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [selectedBuzzId, setSelectedBuzzId] = useState<string | null>(null);
  const [scoreToast, setScoreToast] = useState<{ message: string; type: "success" | "info" } | null>(null);
  const [editingParticipant, setEditingParticipant] = useState<Participant | null>(null);
  const [customScoreInput, setCustomScoreInput] = useState<string>("");
  const [showMaximizedQr, setShowMaximizedQr] = useState(false);

  const showToast = (message: string, type: "success" | "info" = "success") => {
    setScoreToast({ message, type });
    setTimeout(() => {
      setScoreToast(prev => prev?.message === message ? null : prev);
    }, 3500);
  };

  const handleAdjustScore = async (participantId: string, delta: number) => {
    if (!participantId || !activeGame) return;
    
    const target = participants.find(p => p.id === participantId);
    const targetName = target?.name || "Participant";
    const currentScore = Number(target?.score) || 0;
    const newScoreExpected = Math.max(0, currentScore + delta);

    // Optimistically update participant score in local state
    setParticipants(prev => {
      const updated = prev.map(p => {
        if (p.id === participantId) {
          return { ...p, score: newScoreExpected, roundScore: Math.max(0, (Number(p.roundScore) || 0) + delta) };
        }
        return p;
      });
      return [...updated].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
    });

    showToast(`${delta > 0 ? `+${delta}` : delta} PTS adjusted for ${targetName} (New Total: ${newScoreExpected})`);

    try {
      const pRef = doc(db, "participants", participantId);
      await updateDoc(pRef, {
        score: increment(delta),
        roundScore: increment(delta)
      });
    } catch (firestoreErr) {
      console.error("Firestore direct update error:", firestoreErr);
    }
  };

  const handleSetExactScore = async (participantId: string, score: number) => {
    if (!participantId || !activeGame) return;
    const safeScore = Math.max(0, score);
    const target = participants.find(p => p.id === participantId);
    const targetName = target?.name || "Participant";

    setParticipants(prev => {
      const updated = prev.map(p => {
        if (p.id === participantId) {
          return { ...p, score: safeScore, roundScore: safeScore };
        }
        return p;
      });
      return [...updated].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
    });

    showToast(`Score for ${targetName} set to ${safeScore} PTS`);

    try {
      const pRef = doc(db, "participants", participantId);
      await updateDoc(pRef, { score: safeScore, roundScore: safeScore });
    } catch (e) {
      console.error("Firestore direct score update failed:", e);
    }
  };

  const handleVerifyBuzz = async (buzz: Buzz, isCorrect: boolean) => {
    if (!activeGame || !buzz) return;
    
    const prevStatus = buzz.status;
    
    // Points system: +10 for correct, -3 penalty for incorrect
    const pts = 10;
    const penalty = 3;
    const eligibleBuzzes = recentBuzzes.filter(b => b.id !== buzz.id && b.status !== "INCORRECT");
    const nextBuzz = eligibleBuzzes[0] || null;

    // Optimistically update recentBuzzes state
    setRecentBuzzes(prev => prev.map(b => b.id === buzz.id ? { ...b, status: isCorrect ? "CORRECT" : "INCORRECT", pointsAwarded: pts } : b));

    // Determine point change for participant on the basis of correct (+pts) and incorrect (-penalty)
    let scoreDelta = 0;
    if (isCorrect) {
      if (prevStatus === "CORRECT") {
        scoreDelta = 0;
      } else if (prevStatus === "INCORRECT") {
        scoreDelta = pts + penalty;
      } else {
        scoreDelta = pts;
      }
    } else {
      if (prevStatus === "CORRECT") {
        scoreDelta = -(pts + penalty);
      } else if (prevStatus === "INCORRECT") {
        scoreDelta = 0;
      } else {
        scoreDelta = -penalty;
      }
    }

    // Optimistically update participant score
    if (scoreDelta !== 0 && buzz.participantId) {
      setParticipants(prev => {
        const updated = prev.map(p => {
          if (p.id === buzz.participantId) {
            const newScore = Math.max(0, (Number(p.score) || 0) + scoreDelta);
            const newRound = Math.max(0, (Number(p.roundScore) || 0) + scoreDelta);
            return { ...p, score: newScore, roundScore: newRound };
          }
          return p;
        });
        return [...updated].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
      });
    }

    if (isCorrect) {
      showToast(`✓ Marked Correct! +${pts} PTS awarded to ${buzz.participantName}`);
    } else {
      showToast(`✗ Marked Incorrect for ${buzz.participantName} (-${penalty} PTS). Moving to next.`, "info");
    }

    // Update selected buzz for modal auto-advancement if incorrect
    if (!isCorrect) {
      setSelectedBuzzId(nextBuzz ? nextBuzz.id : null);
    }

    try {
      const buzzRef = doc(db, "buzzes", buzz.id);
      await updateDoc(buzzRef, { status: isCorrect ? "CORRECT" : "INCORRECT", pointsAwarded: pts });

      if (scoreDelta !== 0 && buzz.participantId) {
        const pRef = doc(db, "participants", buzz.participantId);
        await updateDoc(pRef, {
          score: increment(scoreDelta),
          roundScore: increment(scoreDelta)
        });
      }
    } catch (firestoreErr) {
      console.error("Direct Firestore fallback error:", firestoreErr);
    }
  };

  // Keyboard shortcut listener for lightning-fast live moderation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      // Open/Toggle Verify Modal with [V]
      if ((e.key === "v" || e.key === "V") && !showCreateModal && recentBuzzes.length > 0) {
        setShowVerifyModal(prev => !prev);
        return;
      }

      // Find current target buzz to verify
      const pending = recentBuzzes.filter(b => b.status !== "INCORRECT");
      const target = (selectedBuzzId ? recentBuzzes.find(b => b.id === selectedBuzzId) : null) || pending[0];

      if (showVerifyModal) {
        if (e.key === "Escape") {
          setShowVerifyModal(false);
          return;
        }
      }

      // Quick action keys: C for Correct, X for Incorrect (works in modal AND on main screen banner)
      if ((e.key === "c" || e.key === "C") && target && target.status !== "CORRECT") {
        e.preventDefault();
        handleVerifyBuzz(target, true);
      } else if ((e.key === "x" || e.key === "X") && target && target.status !== "CORRECT") {
        e.preventDefault();
        handleVerifyBuzz(target, false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showVerifyModal, recentBuzzes, selectedBuzzId, showCreateModal, activeGame, participants]);

  // Eliminate a participant: delete their Firestore doc + all their buzzes.
  // The participant's onSnapshot listener will fire with no document → they are
  // automatically redirected to /join on their device.
  const handleEliminateParticipant = async (participantId: string, participantName: string) => {
    if (!confirm(`Eliminate "${participantName}" from the game? This cannot be undone.`)) return;
    try {
      // Delete all buzzes belonging to this participant
      if (activeGame) {
        const buzzQuery = query(
          collection(db, "buzzes"),
          where("gameId", "==", activeGame.id),
          where("participantId", "==", participantId)
        );
        const buzzSnap = await getDocs(buzzQuery);
        const batch = writeBatch(db);
        buzzSnap.docs.forEach(d => batch.delete(d.ref));
        // Delete participant document
        batch.delete(doc(db, "participants", participantId));
        await batch.commit();
      } else {
        await deleteDoc(doc(db, "participants", participantId));
      }
    } catch (err) {
      console.error("Error eliminating participant:", err);
      alert("Failed to eliminate participant. Please try again.");
    }
  };

  useEffect(() => {
    // Auth Check
    const token = localStorage.getItem("admin_token");
    if (!token) {
      onNavigate("/admin/login");
      return;
    }
    setIsAuthorizing(false);

    const parseTimestamp = (val: any): number => {
      if (!val) return 0;
      if (typeof val.toMillis === "function") return val.toMillis();
      if (typeof val.toDate === "function") return val.toDate().getTime();
      if (val.seconds) return val.seconds * 1000;
      if (val instanceof Date) return val.getTime();
      const p = new Date(val).getTime();
      return isNaN(p) ? 0 : p;
    };

    const activeGameId = localStorage.getItem("active_game_id");
    
    // Listen for active game
    let unsubGame = () => {};
    
    if (activeGameId) {
      const gameRef = doc(db, "games", activeGameId);
      unsubGame = onSnapshot(gameRef, (docSnap) => {
        if (docSnap.exists()) {
          const gameData = { id: docSnap.id, ...docSnap.data() } as Game;
          if (gameData.status === GameStatus.GAME_OVER) {
            localStorage.removeItem("active_game_id");
            setActiveGame(null);
            setParticipants([]);
            setRecentBuzzes([]);
          } else {
            setActiveGame(gameData);
          }
        } else {
          localStorage.removeItem("active_game_id");
          setActiveGame(null);
          setParticipants([]);
          setRecentBuzzes([]);
        }
      }, (err) => {
        console.error("Firestore Error in AdminDashboard game doc listener:", err);
      });
    } else {
      const gameQuery = query(collection(db, "games"));
      unsubGame = onSnapshot(gameQuery, (snapshot) => {
        const allGames = snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as Game))
          .filter(g => g.status !== GameStatus.GAME_OVER)
          .sort((a, b) => parseTimestamp(b.createdAt) - parseTimestamp(a.createdAt));

        if (allGames.length > 0) {
          const activeG = allGames[0];
          localStorage.setItem("active_game_id", activeG.id);
          setActiveGame(activeG);
        } else {
          setActiveGame(null);
          setParticipants([]);
          setRecentBuzzes([]);
        }
      }, (err) => {
        console.error("Firestore Error in AdminDashboard games query:", err);
      });
    }

    return () => unsubGame();
  }, [onNavigate, activeGame?.id]);

  useEffect(() => {
    if (!activeGame) {
      setParticipants([]);
      setRecentBuzzes([]);
      return;
    }

    // Listen for participants
    const pQuery = query(collection(db, "participants"), where("gameId", "==", activeGame.id));
    const unsubP = onSnapshot(pQuery, (snapshot) => {
      const pList = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Participant))
        .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
      setParticipants(pList);
    });

    // Listen for recent buzzes for current question
    const bQuery = query(
      collection(db, "buzzes"), 
      where("gameId", "==", activeGame.id)
    );
    const unsubB = onSnapshot(bQuery, (snapshot) => {
      const currentQ = activeGame.currentQuestion || 1;

      // Parse Firestore timestamp to milliseconds
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

      const bList = snapshot.docs
        .map(doc => {
          const data = doc.data() as Buzz;
          const effectiveResponseTime = getEffectiveResponseTime(data);
          return { 
            id: doc.id, 
            ...data, 
            responseTime: effectiveResponseTime 
          } as Buzz;
        })
        .filter(b => (b.questionNumber || 1) === currentQ)
        .sort((a, b) => {
          // Primary: effective response time
          const rA = Number(a.responseTime) || 0;
          const rB = Number(b.responseTime) || 0;
          if (Math.abs(rA - rB) > 0.001) return rA - rB;
          // Tiebreaker: raw arrival timestamp
          const tA = toMs(a.buzzedAt || a.serverTimestamp || (a as any).clientTimestamp);
          const tB = toMs(b.buzzedAt || b.serverTimestamp || (b as any).clientTimestamp);
          return tA - tB || a.id.localeCompare(b.id);
        });
      setRecentBuzzes(bList);
    });

    return () => {
      unsubP();
      unsubB();
    };
  }, [activeGame?.id, activeGame?.currentRound, activeGame?.currentQuestion]);

  const handleCreateGame = async () => {
    try {
      const gameData = {
        type: newGameType,
        gameType: newGameType,
        status: GameStatus.NOT_STARTED,
        currentRound: 1,
        currentQuestion: 1,
        buzzerStatus: BuzzerStatus.CLOSED,
        createdAt: serverTimestamp(),
        startedAt: serverTimestamp()
      };
      const docRef = await addDoc(collection(db, "games"), gameData);
      localStorage.setItem("active_game_id", docRef.id);
      setShowCreateModal(false);
      showToast(`${newGameType === GameType.MOVIE ? "Cinema Riddle" : "Brand Identity"} session initialized`);
    } catch (e: any) {
      console.error("Failed to create game:", e);
      showToast("Error creating session: " + (e?.message || "Failed"), "info");
    }
  };

  const sendCommand = async (command: string, payload?: any) => {
    if (!activeGame) return;

    let targetQuestion = activeGame.currentQuestion || 1;
    if (command === "NEXT_QUESTION") {
      targetQuestion = payload?.targetQuestion !== undefined 
        ? Number(payload.targetQuestion) 
        : (activeGame.currentQuestion || 1) + 1;
    } else if (command === "PREV_QUESTION") {
      targetQuestion = payload?.targetQuestion !== undefined 
        ? Number(payload.targetQuestion) 
        : Math.max(1, (activeGame.currentQuestion || 2) - 1);
    } else if (command === "SET_QUESTION") {
      targetQuestion = Math.max(1, Number(payload?.targetQuestion || payload?.questionNumber || 1));
    }

    const nowMs = Date.now();

    // 1. Optimistic state update for instantaneous host feedback
    if (command === "START_GAME") {
      setActiveGame(prev => prev ? { ...prev, status: GameStatus.ACTIVE, buzzerStatus: BuzzerStatus.OPEN, startedAt: nowMs } : null);
      showToast("Session Engaged • Buzzer Armed");
    } else if (command === "OPEN_BUZZER" || command === "REOPEN_BUZZER") {
      setActiveGame(prev => prev ? { ...prev, buzzerStatus: BuzzerStatus.OPEN, startedAt: nowMs } : null);
      showToast("Buzzer Open for Contenders");
    } else if (command === "CLOSE_BUZZER") {
      setActiveGame(prev => prev ? { ...prev, buzzerStatus: BuzzerStatus.CLOSED } : null);
      showToast("Buzzer Locked", "info");
    } else if (command === "NEXT_QUESTION" || command === "PREV_QUESTION" || command === "SET_QUESTION") {
      setActiveGame(prev => prev ? { ...prev, currentQuestion: targetQuestion, buzzerStatus: BuzzerStatus.OPEN, startedAt: nowMs } : null);
      setSelectedBuzzId(null);
      showToast(`Question ${targetQuestion} Activated • Buzzer Armed`);
    } else if (command === "END_GAME") {
      localStorage.removeItem("active_game_id");
      setActiveGame(null);
      setParticipants([]);
      setRecentBuzzes([]);
      showToast("Session Terminated & Wiped", "info");
    }

    // 2. Direct Firestore update
    try {
      const gDocRef = doc(db, "games", activeGame.id);
      if (command === "START_GAME") {
        await updateDoc(gDocRef, {
          status: GameStatus.ACTIVE,
          buzzerStatus: BuzzerStatus.OPEN,
          startedAt: serverTimestamp()
        });
      } else if (command === "OPEN_BUZZER" || command === "REOPEN_BUZZER") {
        await updateDoc(gDocRef, {
          buzzerStatus: BuzzerStatus.OPEN,
          startedAt: serverTimestamp()
        });
      } else if (command === "CLOSE_BUZZER") {
        await updateDoc(gDocRef, {
          buzzerStatus: BuzzerStatus.CLOSED
        });
      } else if (command === "NEXT_QUESTION" || command === "PREV_QUESTION" || command === "SET_QUESTION") {
        await updateDoc(gDocRef, {
          currentQuestion: targetQuestion,
          buzzerStatus: BuzzerStatus.OPEN,
          startedAt: serverTimestamp()
        });
      } else if (command === "END_ROUND") {
        await updateDoc(gDocRef, {
          buzzerStatus: BuzzerStatus.CLOSED
        });
      } else if (command === "END_GAME") {
        // Deep Cleanup session records client-side
        const pQuery = query(collection(db, "participants"), where("gameId", "==", activeGame.id));
        const bQuery = query(collection(db, "buzzes"), where("gameId", "==", activeGame.id));
        const [pSnapshot, bSnapshot] = await Promise.all([getDocs(pQuery), getDocs(bQuery)]);
        
        const batch = writeBatch(db);
        pSnapshot.docs.forEach(d => batch.delete(d.ref));
        bSnapshot.docs.forEach(d => batch.delete(d.ref));
        batch.delete(gDocRef);
        await batch.commit();
        showToast("Session Terminated & Wiped", "info");
      }
    } catch (e) {
      console.warn("Direct Firestore update warning in admin sendCommand:", e);
    }
  };

  const handleLogout = () => {
    if (activeGame && confirm("Ending session will wipe all participant data. Continue?")) {
      sendCommand("END_GAME");
    }
    localStorage.removeItem("admin_token");
    onNavigate("/admin/login");
  };

  const handleTerminateSession = () => {
    if (confirm("This will permanently REMOVE all participants, buzzes, and this game record. This cannot be undone. Proceed?")) {
      sendCommand("END_GAME");
    }
  };

  if (isAuthorizing) return null;

  if (!activeGame && !showCreateModal) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-6 text-center">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="space-y-8"
        >
          <div className="w-24 h-24 bg-[#111] border border-[#222] rounded-3xl flex items-center justify-center mx-auto text-[#4285F4]">
            <Activity size={48} />
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-display font-black text-white italic tracking-tighter">Command Center</h1>
            <p className="text-[#555] uppercase tracking-[0.2em] text-xs font-bold">No active sessions detected</p>
          </div>
          <button 
            onClick={() => setShowCreateModal(true)}
            className="px-12 py-5 bg-white text-black font-black uppercase tracking-tighter italic text-xl rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-[0_20px_50px_rgba(255,255,255,0.1)]"
          >
            Initialize Activity
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-slate-200 font-body flex flex-col overflow-x-hidden">
      {/* Header */}
      <header className="h-20 border-b border-[#222] bg-[#080808]/80 backdrop-blur-md sticky top-0 z-40 px-4 md:px-8 flex items-center justify-between">
        <div className="flex items-center gap-4 md:gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 md:w-10 md:h-10 bg-white rounded-xl flex items-center justify-center text-black">
              <Zap size={20} fill="currentColor" />
            </div>
            <span className="text-xl md:text-2xl font-display font-black italic tracking-tighter text-white">BUZZINGG</span>
          </div>
          <div className="hidden sm:block h-6 w-px bg-[#222]" />
          <div className="hidden sm:flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#555]">Live Connection</span>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-4">
          <button 
            onClick={() => onNavigate("/")}
            className="flex items-center gap-2 px-4 py-2 bg-[#111] border border-[#222] text-[#888] font-bold text-[10px] md:text-xs uppercase tracking-widest rounded-xl hover:text-white hover:border-[#444] transition-all"
          >
            <Home size={14} />
            <span className="hidden sm:inline">Home</span>
          </button>
          <button 
            onClick={handleLogout}
            className="px-4 md:px-6 py-2 md:py-2.5 bg-[#111] border border-[#222] text-[#888] font-bold text-[10px] md:text-xs uppercase tracking-widest rounded-xl hover:text-white hover:border-[#444] transition-all"
          >
            End Session
          </button>
        </div>
      </header>

      {/* Toast Alert Banner */}
      <AnimatePresence>
        {scoreToast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`fixed top-20 right-6 z-50 px-5 py-3.5 rounded-2xl shadow-2xl border backdrop-blur-xl flex items-center gap-3 text-xs md:text-sm font-bold tracking-tight ${
              scoreToast.type === "success" 
                ? "bg-emerald-950/90 border-emerald-500/40 text-emerald-200 shadow-emerald-950/40"
                : "bg-blue-950/90 border-blue-500/40 text-blue-200 shadow-blue-950/40"
            }`}
          >
            <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
              scoreToast.type === "success" ? "bg-emerald-500 text-black" : "bg-blue-500 text-white"
            }`}>
              <Check size={14} className="stroke-[3]" />
            </div>
            <span>{scoreToast.message}</span>
            <button 
              onClick={() => setScoreToast(null)}
              className="ml-2 text-white/40 hover:text-white"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1 p-4 md:p-8 grid grid-cols-12 gap-4 md:gap-8 max-w-[1600px] mx-auto w-full">
        {/* Left Column: Game Control */}
        <div className="col-span-12 lg:col-span-8 space-y-4 md:space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
            {/* Active Game Card */}
            <div className="col-span-1 p-6 md:p-10 bg-[#111] border border-[#222] rounded-[32px] md:rounded-[48px] space-y-6 md:space-y-8 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-8 opacity-5 text-[#222] scale-150 pointer-events-none">
                <Shield size={120} />
              </div>

              <div className="flex items-center justify-between relative z-10">
                <span className="px-3 py-1 bg-blue-500/10 text-blue-500 rounded-full text-[10px] font-black uppercase tracking-widest border border-blue-500/20">Session Control</span>
                <span className="text-[#333] font-mono text-[10px] uppercase tracking-widest">ID: {(activeGame?.id || "").slice(0, 8)}</span>
              </div>
              
              <div className="space-y-2 relative z-10">
                <h2 className="text-3xl md:text-5xl font-display font-black text-white italic tracking-tighter leading-none">
                  {((activeGame?.type || (activeGame as any)?.gameType) === GameType.MOVIE || activeGame?.type === "MOVIE" || (activeGame as any)?.gameType === "MOVIE") ? "Cinema Riddle" : "Brand Identity"}
                </h2>
                <div className="flex items-center gap-3 text-[#555]">
                  <span className="font-black uppercase tracking-[0.3em] text-[10px] text-white">
                    Question {activeGame?.currentQuestion || 1} of 10
                  </span>
                  <div className="w-1 h-1 bg-[#222] rounded-full" />
                  <span className="font-black uppercase tracking-[0.3em] text-[10px] text-emerald-400">
                    {activeGame?.buzzerStatus === BuzzerStatus.OPEN ? "Buzzer Armed" : "Buzzer Locked"}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 relative z-10">
                {activeGame?.status === GameStatus.NOT_STARTED ? (
                  <button 
                    onClick={() => sendCommand("START_GAME")}
                    className="col-span-2 py-5 md:py-6 bg-[#4285F4] hover:bg-[#5294ff] text-black font-black uppercase tracking-tighter italic text-xl md:text-2xl rounded-2xl md:rounded-3xl shadow-xl shadow-blue-900/20 active:scale-95 transition-all"
                  >
                    Engage Session
                  </button>
                ) : (
                  <>
                    <button 
                      onClick={() => sendCommand("OPEN_BUZZER")}
                      disabled={activeGame?.buzzerStatus === BuzzerStatus.OPEN}
                      className={`py-6 md:py-8 font-black uppercase tracking-tighter italic text-xl md:text-2xl rounded-2xl md:rounded-3xl transition-all active:scale-95 ${
                        activeGame?.buzzerStatus === BuzzerStatus.OPEN 
                          ? "bg-[#181818] text-[#333] border border-[#222] cursor-not-allowed" 
                          : "bg-white text-black shadow-2xl shadow-white/5"
                      }`}
                    >
                      Operate Buzzer
                    </button>
                    <button 
                      onClick={() => sendCommand("CLOSE_BUZZER")}
                      disabled={activeGame?.buzzerStatus === BuzzerStatus.CLOSED}
                      className={`py-6 md:py-8 font-black uppercase tracking-tighter italic text-xl md:text-2xl rounded-2xl md:rounded-3xl transition-all active:scale-95 ${
                        activeGame?.buzzerStatus === BuzzerStatus.CLOSED 
                          ? "bg-[#181818] text-[#333] border border-[#222] cursor-not-allowed" 
                          : "bg-[#EA4335] text-black shadow-2xl shadow-red-900/20"
                      }`}
                    >
                      Lock
                    </button>
                  </>
                )}
              </div>

              <div className="space-y-3 pt-1">
                {/* Stepper controls */}
                <div className="grid grid-cols-2 gap-2.5">
                  <button 
                    type="button"
                    onClick={() => sendCommand("PREV_QUESTION")}
                    disabled={(activeGame?.currentQuestion || 1) <= 1}
                    className={`py-3 px-4 rounded-xl border text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                      (activeGame?.currentQuestion || 1) <= 1
                        ? "bg-[#111] text-[#333] border-[#1c1c1c] cursor-not-allowed"
                        : "bg-[#181818] text-slate-300 border-[#262626] hover:bg-[#222] hover:text-white active:scale-95"
                    }`}
                  >
                    <ChevronLeft size={14} /> Prev Q
                  </button>

                  <button 
                    type="button"
                    onClick={() => sendCommand("NEXT_QUESTION")}
                    className="py-3 px-4 bg-[#181818] border border-[#262626] text-white hover:bg-white hover:text-black hover:border-white font-black uppercase tracking-wider text-[11px] rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    Next Q <ChevronRight size={14} />
                  </button>
                </div>

                {/* Quick Sequence Numbers Grid - Exactly 10 Questions */}
                <div className="p-3 bg-[#0c0c0c] border border-[#1c1c1c] rounded-2xl space-y-2">
                  <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-[#555]">
                    <span>Questions List (1-10)</span>
                    <span className="text-[#4285F4] font-mono text-[9px]">Active: Q{activeGame?.currentQuestion || 1}</span>
                  </div>
                  
                  <div className="grid grid-cols-5 gap-2">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
                      const isActive = (activeGame?.currentQuestion || 1) === num;
                      return (
                        <button
                          key={num}
                          type="button"
                          onClick={() => sendCommand("SET_QUESTION", { targetQuestion: num })}
                          className={`py-2 rounded-xl text-xs font-black italic transition-all flex items-center justify-center gap-1 ${
                            isActive
                              ? "bg-white text-black font-display shadow-lg shadow-white/10 scale-[1.03] ring-2 ring-white"
                              : "bg-[#141414] text-[#888] border border-[#222] hover:border-[#444] hover:text-white"
                          }`}
                        >
                          <span>Q{num}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="col-span-1 grid grid-rows-2 gap-4 md:gap-8">
              <div className="p-6 md:p-10 bg-[#4285F4] rounded-[32px] md:rounded-[48px] flex flex-col justify-between text-black relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-8 md:p-10 opacity-20 group-hover:scale-110 transition-transform">
                  <Users className="w-16 h-16 md:w-20 md:h-20" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-[0.4em] opacity-40">Connected Units</span>
                <span className="text-6xl md:text-8xl font-display font-black italic tracking-tighter leading-none">{participants.length}</span>
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-40">Active Participants</span>
              </div>
              <div className="p-6 md:p-10 bg-[#111] border border-[#222] rounded-[32px] md:rounded-[48px] flex flex-col justify-between group relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 md:p-10 opacity-5 group-hover:scale-110 transition-transform text-white">
                  <QrIcon className="w-16 h-16 md:w-20 md:h-20" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-[#444]">Access Point</span>
                <div className="flex items-center gap-4 md:gap-6">
                  {/* Zoom/Hover QR wrapper */}
                  <div 
                    onClick={() => setShowMaximizedQr(true)}
                    className="p-3 md:p-4 bg-white rounded-xl md:rounded-2xl flex-shrink-0 relative group/qr cursor-zoom-in overflow-hidden shadow-md"
                  >
                    <QRCodeSVG 
                      value={`${window.location.origin}/join?game=${activeGame?.id}`} 
                      size={120}
                      level="H"
                      bgColor="#FFFFFF"
                      fgColor="#000000"
                    />
                    {/* Hover Overlay */}
                    <div className="absolute inset-0 bg-black/80 opacity-0 group-hover/qr:opacity-100 transition-opacity flex flex-col items-center justify-center text-white gap-1 p-2">
                      <Zap className="w-5 h-5 text-yellow-400 animate-pulse" />
                      <span className="text-[8px] font-black uppercase tracking-wider text-center leading-tight">Maximize</span>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <p className="text-white font-black uppercase tracking-tighter italic text-lg md:text-xl truncate">{window.location.hostname}</p>
                    <p className="text-[#444] font-mono text-[10px] uppercase tracking-widest mt-1">Scan to connect</p>
                  </div>
                </div>
                <div className="h-px bg-[#222] w-full" />
                <span className="text-[10px] font-mono text-[#333] uppercase tracking-widest truncate">/join?game={activeGame?.id}</span>
              </div>
            </div>
          </div>

            {/* Real-time Buzz Timeline */}
            <div className="p-6 md:p-10 bg-[#080808] border border-[#181818] rounded-[32px] md:rounded-[48px] space-y-8 md:space-y-10">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 md:w-12 md:h-12 bg-[#111] border border-[#222] rounded-xl md:rounded-2xl flex items-center justify-center text-[#EA4335]">
                    <CircleDot className={`w-5 h-5 md:w-6 md:h-6 ${activeGame?.buzzerStatus === BuzzerStatus.OPEN ? "animate-pulse" : ""}`} />
                  </div>
                  <div>
                    <h3 className="text-xl md:text-2xl font-display font-black text-white italic tracking-tighter leading-none">Buzz Timeline</h3>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#333] mt-1">
                      {activeGame?.buzzerStatus === BuzzerStatus.OPEN ? "Waiting for Signal" : "Telemetry Locked"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="px-4 md:px-5 py-2 bg-[#111] rounded-full border border-[#222] text-[10px] font-black text-[#555] uppercase tracking-widest">
                    Top 5 Precision Trace
                  </div>
                  <div className="px-4 md:px-5 py-2 bg-[#111] rounded-full border border-[#222] text-[10px] font-black text-[#EA4335] uppercase tracking-widest">
                    Q{activeGame?.currentQuestion}
                  </div>
                </div>
              </div>

              {/* Active Answerer / Verification Banner */}
              {(() => {
                const pendingBuzzes = recentBuzzes.filter(b => b.status !== "INCORRECT");
                const activeBuzz = (selectedBuzzId ? recentBuzzes.find(b => b.id === selectedBuzzId) : null) || pendingBuzzes[0] || null;
                const nextBuzzInLine = pendingBuzzes.length > 1 ? pendingBuzzes[1] : null;
                const activeBuzzIndex = activeBuzz ? recentBuzzes.findIndex(b => b.id === activeBuzz.id) : -1;
                const activeBuzzPosition = activeBuzzIndex !== -1 ? activeBuzzIndex + 1 : 1;

                if (activeBuzz) {
                  return (
                    <motion.div 
                      key={activeBuzz.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`p-4 md:p-5 rounded-2xl md:rounded-3xl shadow-lg relative overflow-hidden transition-all ${
                        activeBuzz.status === 'CORRECT'
                          ? "bg-emerald-500 text-black"
                          : "bg-white text-black"
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
                        {/* Left Side: Name and stats */}
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${activeBuzz.status === 'CORRECT' ? "bg-black" : "bg-[#EA4335] animate-ping"}`} />
                              <span className="text-[8px] font-black uppercase tracking-[0.2em] opacity-60">
                                {activeBuzz.status === 'CORRECT' ? 'Verified Correct' : `Active Answerer • #${activeBuzzPosition}`}
                              </span>
                              <span className="text-[10px] font-mono font-bold opacity-60">
                                ({(activeBuzz.responseTime ?? 0).toFixed(3)}s)
                              </span>
                            </div>
                            <h4 className="text-xl sm:text-2xl font-display font-black italic tracking-tighter uppercase leading-none">
                              {activeBuzz.participantName}
                            </h4>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 bg-black text-white font-black text-[10px] italic tracking-tighter rounded">
                              +{activeBuzz.pointsAwarded} PTS
                            </span>
                            {nextBuzzInLine && activeBuzz.status !== 'CORRECT' && (
                              <span className="text-[9px] font-bold text-slate-700 bg-black/5 px-1.5 py-0.5 rounded flex items-center gap-1">
                                <CornerDownRight size={10} /> Next: {nextBuzzInLine.participantName}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Right Side: Verification Options */}
                        <div className="flex items-center gap-3 shrink-0">
                          {activeBuzz.status !== 'CORRECT' ? (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleVerifyBuzz(activeBuzz, true)}
                                className="px-4 py-2 bg-[#34A853] hover:bg-[#2e9648] text-white font-black text-xs uppercase tracking-wider italic rounded-xl hover:scale-105 active:scale-95 transition-all shadow-md shadow-[#34A853]/20 flex items-center gap-1.5"
                              >
                                <CheckCircle2 size={14} /> Correct
                              </button>
                              <button
                                onClick={() => handleVerifyBuzz(activeBuzz, false)}
                                className="px-4 py-2 bg-[#EA4335] hover:bg-[#d3382b] text-white font-black text-xs uppercase tracking-wider italic rounded-xl hover:scale-105 active:scale-95 transition-all shadow-md shadow-[#EA4335]/20 flex items-center gap-1.5"
                                title="Mark incorrect and move to next contender in queue"
                              >
                                <XCircle size={14} /> Incorrect
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1 px-3 py-2 bg-black/10 rounded-xl text-black text-xs font-black uppercase tracking-wider italic">
                                <CheckCircle2 size={14} /> Confirmed
                              </div>
                              <button
                                onClick={() => sendCommand("NEXT_QUESTION")}
                                className="px-4 py-2 bg-black text-white font-black uppercase text-xs tracking-wider italic rounded-xl hover:scale-105 transition-all"
                              >
                                Next Q →
                              </button>
                            </div>
                          )}

                          <button
                            onClick={() => {
                              setSelectedBuzzId(activeBuzz.id);
                              setShowVerifyModal(true);
                            }}
                            className="p-2 bg-black/5 hover:bg-black/10 text-black rounded-xl transition-all"
                            title="Verify Modal [V]"
                          >
                            <Shield size={14} />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                } else if (recentBuzzes.length > 0) {
                  return (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-8 bg-[#111] border border-red-900/40 rounded-[32px] text-center space-y-6"
                    >
                      <div className="space-y-2">
                        <p className="text-red-400 font-black uppercase tracking-[0.3em] text-xs italic">
                          All Buzzes Passed / Marked Incorrect for Question {activeGame?.currentQuestion}
                        </p>
                        <p className="text-slate-500 text-xs">Re-open the buzzer to allow other participants to attempt this question.</p>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-4">
                        <button
                          onClick={() => sendCommand("REOPEN_BUZZER")}
                          className="px-8 py-4 bg-white text-black font-black uppercase tracking-wider italic text-sm rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-xl shadow-white/10"
                        >
                          ⚡ Re-open Buzzer for Remaining Participants
                        </button>
                        <button
                          onClick={() => sendCommand("NEXT_QUESTION")}
                          className="px-8 py-4 bg-[#1f1f1f] hover:bg-[#2a2a2a] text-white font-black uppercase tracking-wider italic text-sm rounded-2xl transition-all"
                        >
                          Advance to Next Question →
                        </button>
                      </div>
                    </motion.div>
                  );
                }
                return null;
              })()}

              <div className="space-y-4 md:space-y-6 relative">
                {/* Timeline vertical track */}
                {recentBuzzes.length > 1 && (
                  <div className="absolute left-[27px] md:left-[35px] top-10 bottom-10 w-px bg-gradient-to-b from-[#EA4335] via-[#222] to-[#111] opacity-20 hidden sm:block" />
                )}

                <AnimatePresence mode="popLayout">
                  {recentBuzzes.length === 0 ? (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="py-16 md:py-24 text-center border-2 border-dashed border-[#111] rounded-[32px] md:rounded-[48px]"
                    >
                      <Zap className="mx-auto text-[#111] mb-6" size={48} />
                      <p className="text-[#222] font-black uppercase tracking-[0.5em] text-[10px] italic">Awaiting high-speed pulse signals...</p>
                    </motion.div>
                  ) : (
                    recentBuzzes.slice(0, 5).map((buzz, idx) => {
                      const isWinner = buzz.status === 'CORRECT';
                      const isIncorrect = buzz.status === 'INCORRECT';
                      const activeBuzz = recentBuzzes.find(b => b.status !== "INCORRECT");
                      const isActive = activeBuzz?.id === buzz.id;

                      return (
                        <motion.div 
                          key={buzz.id}
                          onClick={() => {
                            setSelectedBuzzId(buzz.id);
                            setShowVerifyModal(true);
                          }}
                          initial={{ opacity: 0, x: -30, scale: 0.95 }}
                          animate={{ opacity: 1, x: 0, scale: 1 }}
                          transition={{ type: "spring", stiffness: 400, damping: 40, delay: idx * 0.05 }}
                          className={`group relative flex items-center gap-4 md:gap-8 p-6 md:p-8 rounded-[24px] md:rounded-[32px] border transition-all cursor-pointer ${
                            isWinner
                              ? "bg-gradient-to-r from-emerald-950 to-[#0a0a0a] text-white border-emerald-500/50 shadow-2xl hover:border-emerald-400"
                              : isIncorrect
                              ? "bg-[#080808] text-slate-500 border-red-950/40 opacity-60 hover:opacity-90"
                              : isActive
                              ? "bg-gradient-to-r from-white to-slate-50 text-black border-white shadow-2xl hover:scale-[1.01]"
                              : "bg-[#0a0a0a] text-white border-[#181818] hover:border-[#444] hover:bg-[#121212]"
                          }`}
                        >
                          {/* Timeline Marker */}
                          <div className={`hidden sm:flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-full border-2 z-10 shrink-0 ${
                            isWinner ? "bg-emerald-500 border-emerald-400 text-black font-bold" : isIncorrect ? "bg-red-950 border-red-800 text-red-400" : isActive ? "bg-black border-white text-white" : "bg-[#050505] border-[#222] text-[#444]"
                          }`}>
                            <span className="text-xs font-black italic">{idx + 1}</span>
                          </div>

                          <div className="flex-1 flex items-center justify-between min-w-0">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className={`font-black uppercase tracking-tighter italic text-xl md:text-3xl leading-none truncate pr-2 ${isIncorrect ? "line-through text-slate-500" : ""}`}>
                                  {buzz.participantName}
                                </p>
                                <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity ${isActive ? "bg-black text-white" : "bg-white/10 text-white"}`}>
                                  Inspect / Verify
                                </span>
                              </div>
                              <div className="flex items-center gap-4 mt-3">
                                <div className="flex flex-col">
                                  <span className={`text-[8px] font-black uppercase tracking-widest ${isActive ? "text-slate-400" : "text-[#333]"}`}>Arrival</span>
                                  <span className={`font-mono text-xs md:text-sm font-bold ${isActive ? "text-slate-600" : "text-[#555]"}`}>
                                    {(buzz.responseTime ?? 0).toFixed(3)}s
                                  </span>
                                </div>
                                {idx > 0 && (
                                  <div className="flex flex-col">
                                    <span className="text-[8px] font-black uppercase tracking-widest text-red-900/50">Delta</span>
                                    <span className="font-mono text-xs md:text-sm font-bold text-red-500">
                                      +{Math.max(0, (buzz.responseTime ?? 0) - (recentBuzzes[0]?.responseTime ?? 0)).toFixed(3)}s
                                    </span>
                                  </div>
                                )}
                                
                                {/* Status Badge */}
                                {isWinner && (
                                  <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[9px] font-black uppercase tracking-widest rounded-lg flex items-center gap-1">
                                    <CheckCircle2 size={12} /> Correct
                                  </span>
                                )}
                                {isIncorrect && (
                                  <span className="px-3 py-1 bg-red-950/40 text-red-400 border border-red-900/40 text-[9px] font-black uppercase tracking-widest rounded-lg flex items-center gap-1">
                                    <XCircle size={12} /> Incorrect / Passed
                                  </span>
                                )}
                                {!isWinner && !isIncorrect && isActive && (
                                  <span className="px-3 py-1 bg-black text-white text-[9px] font-black uppercase tracking-widest rounded-lg animate-pulse">
                                    🎯 Active Answerer
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <div className={`text-2xl md:text-4xl font-display font-black italic tracking-tighter leading-none ${isWinner ? "text-emerald-400" : isIncorrect ? "text-slate-600 line-through" : isActive ? "text-[#34A853]" : "text-[#4285F4]"}`}>
                                +{buzz.pointsAwarded}
                              </div>
                              <p className={`text-[8px] font-black uppercase tracking-[0.2em] mt-2 ${isActive ? "text-slate-400" : "text-[#222]"}`}>Points</p>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })
                  )}
                </AnimatePresence>
              </div>
            </div>

        </div>

        {/* Right Column: Leaderboard */}
        <div className="col-span-12 lg:col-span-4 space-y-4 md:space-y-8">
          <div className="p-6 md:p-8 bg-[#0e0e0e] border border-[#222] rounded-[32px] md:rounded-[44px] flex-1 flex flex-col relative overflow-hidden h-full shadow-2xl">
            <div className="absolute -bottom-20 -right-20 opacity-5 text-white scale-150 rotate-12 pointer-events-none">
              <Trophy size={200} />
            </div>

            <div className="flex items-center justify-between mb-6 relative z-10">
              <div>
                <h3 className="text-xl md:text-2xl font-display font-black text-white italic tracking-tighter leading-none">Leaderboard</h3>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#555] mt-1.5">
                  {participants.length} Active Contender{participants.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-[#181818] border border-[#262626] flex items-center justify-center text-[#FBBC05]">
                <Trophy size={20} />
              </div>
            </div>

            <div className="space-y-2.5 relative z-10 overflow-y-auto max-h-[400px] lg:max-h-[560px] pr-1.5 custom-scrollbar">
              {[...participants].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0)).map((p, idx) => {
                const isTop1 = idx === 0;
                const isTop2 = idx === 1;
                const isTop3 = idx === 2;
                const firstBuzzerId = recentBuzzes.length > 0 ? recentBuzzes[0].participantId : null;
                const isFirstBuzzer = firstBuzzerId === p.id;

                return (
                  <div 
                    key={p.id} 
                    className={`group flex items-center justify-between p-3.5 md:p-4 rounded-2xl transition-all ${
                      isTop1 
                        ? "bg-[#FBBC05]/10 border border-[#FBBC05]/30 text-white shadow-lg shadow-[#FBBC05]/5" 
                        : isTop2 
                        ? "bg-slate-200/10 border border-slate-300/20 text-white" 
                        : isTop3 
                        ? "bg-amber-700/10 border border-amber-700/20 text-white" 
                        : "bg-[#141414] border border-[#1e1e1e] hover:border-[#333]"
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-display font-black italic text-xs shrink-0 ${
                        isTop1 ? "bg-[#FBBC05] text-black shadow-md shadow-[#FBBC05]/20" : isTop2 ? "bg-slate-200 text-black" : isTop3 ? "bg-amber-700 text-white" : "bg-[#1c1c1c] text-[#555]"
                      }`}>
                        {idx + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`font-bold text-sm md:text-base uppercase tracking-tight italic truncate ${
                            isTop1 ? "text-[#FBBC05]" : isTop2 ? "text-slate-200" : isTop3 ? "text-amber-300" : "text-white"
                          }`}>
                            {p.name}
                          </span>
                          {isFirstBuzzer && (
                            <span className="px-1.5 py-0.5 bg-yellow-400/20 text-yellow-300 text-[8px] font-black uppercase rounded shrink-0">
                              ⚡ 1st
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="text-[10px] text-[#555] font-mono">Score: {p.score || 0} pts</span>
                          {(() => {
                            const buzz = recentBuzzes.find(b => b.participantId === p.id);
                            if (buzz) {
                              return (
                                <span className={`text-[10px] font-mono font-bold flex items-center gap-0.5 ${
                                  buzz.status === "CORRECT" ? "text-emerald-400" : buzz.status === "INCORRECT" ? "text-red-400 line-through" : "text-white"
                                }`}>
                                  • ⚡ {(buzz.responseTime ?? 0).toFixed(3)}s
                                </span>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      </div>
                    </div>

                    {/* Score + Response Time info */}
                    <div className={`font-display font-black italic text-lg md:text-xl tracking-tighter shrink-0 ${
                      isTop1 ? "text-[#FBBC05]" : isTop2 ? "text-slate-200" : isTop3 ? "text-amber-300" : "text-white"
                    }`}>
                      {p.score}
                    </div>

                    {/* Eliminate button — visible on row hover */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEliminateParticipant(p.id, p.name);
                      }}
                      title={`Eliminate ${p.name}`}
                      className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 w-7 h-7 rounded-lg bg-red-950/60 hover:bg-red-600 border border-red-900/50 hover:border-red-500 flex items-center justify-center text-red-400 hover:text-white shrink-0"
                    >
                      <UserX size={13} />
                    </button>
                  </div>
                );
              })}
              {participants.length === 0 && (
                <div className="text-center py-12 px-4 space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-[#141414] border border-[#222] flex items-center justify-center mx-auto text-[#444]">
                    <Users size={20} />
                  </div>
                  <div className="space-y-1">
                    <p className="opacity-40 text-[10px] font-black uppercase tracking-widest italic">
                      No active contenders registered
                    </p>
                    <p className="text-[10px] text-[#444]">
                      Players can join using the QR code or <span className="font-mono text-[#666]">/join</span>
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-6 mt-auto relative z-10 border-t border-[#1a1a1a]">
              <button 
                onClick={handleTerminateSession}
                className="w-full py-4 text-[#555] hover:text-red-400 hover:bg-red-500/10 rounded-2xl font-black uppercase tracking-[0.3em] text-[10px] transition-all flex items-center justify-center gap-3 border border-[#222] hover:border-red-900/30"
              >
                <CircleStop size={16} />
                Terminate Session
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Verify Buzz Modal */}
      <AnimatePresence>
        {showVerifyModal && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-2xl z-50 flex items-center justify-center p-4 md:p-8">
            <motion.div 
              initial={{ opacity: 0, scale: 0.92, y: 25 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 25 }}
              transition={{ type: "spring", stiffness: 350, damping: 30 }}
              className="bg-[#0f0f0f] border border-[#262626] w-full max-w-2xl p-6 sm:p-10 md:p-12 rounded-[36px] md:rounded-[48px] space-y-8 shadow-[0_30px_100px_rgba(0,0,0,0.8)] relative overflow-hidden text-white"
            >
              {/* Subtle accent line */}
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-[#4285F4] via-[#EA4335] to-[#34A853]" />

              {/* Modal Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#1c1c1c] border border-[#2e2e2e] flex items-center justify-center text-[#FBBC05]">
                    <Shield size={20} />
                  </div>
                  <div>
                    <h3 className="text-xl md:text-2xl font-display font-black text-white italic tracking-tighter leading-none">Verify Buzz</h3>
                    <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#666] mt-1">
                      Protocol Evaluation • Question {activeGame?.currentQuestion || 1} of 10
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowVerifyModal(false)}
                  className="w-10 h-10 rounded-2xl bg-[#181818] hover:bg-[#252525] border border-[#2a2a2a] flex items-center justify-center text-[#888] hover:text-white transition-all"
                  title="Close (Esc)"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Contender Content */}
              {(() => {
                const pendingBuzzes = recentBuzzes.filter(b => b.status !== "INCORRECT");
                const currentBuzz = (selectedBuzzId ? recentBuzzes.find(b => b.id === selectedBuzzId) : null) || pendingBuzzes[0] || null;
                const currentIdx = currentBuzz ? pendingBuzzes.findIndex(b => b.id === currentBuzz.id) : -1;
                const nextCandidate = currentIdx >= 0 && currentIdx < pendingBuzzes.length - 1 ? pendingBuzzes[currentIdx + 1] : null;
                const participantData = currentBuzz ? participants.find(p => p.id === currentBuzz.participantId) : null;

                if (!currentBuzz || pendingBuzzes.length === 0) {
                  return (
                    <div className="py-12 px-6 text-center space-y-6 bg-[#141414] border border-[#222] rounded-[32px]">
                      <div className="w-16 h-16 rounded-3xl bg-red-950/40 border border-red-900/40 flex items-center justify-center mx-auto text-red-400">
                        <XCircle size={32} />
                      </div>
                      <div className="space-y-2">
                        <h4 className="text-2xl font-display font-black italic text-white uppercase tracking-tight">Queue Exhausted</h4>
                        <p className="text-sm text-[#888] max-w-md mx-auto">
                          All queued buzzes for Question {activeGame?.currentQuestion} have been passed or evaluated as incorrect.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                        <button
                          onClick={() => {
                            sendCommand("REOPEN_BUZZER");
                            setShowVerifyModal(false);
                          }}
                          className="px-6 py-3.5 bg-white text-black font-black uppercase text-xs tracking-wider italic rounded-2xl hover:scale-105 transition-all shadow-lg"
                        >
                          ⚡ Re-Open Buzzer for Remaining Players
                        </button>
                        <button
                          onClick={() => {
                            sendCommand("NEXT_QUESTION");
                            setShowVerifyModal(false);
                          }}
                          className="px-6 py-3.5 bg-[#222] hover:bg-[#2e2e2e] text-white font-black uppercase text-xs tracking-wider italic rounded-2xl transition-all"
                        >
                          Advance to Q{(activeGame?.currentQuestion || 1) + 1}
                        </button>
                      </div>
                    </div>
                  );
                }

                const isAlreadyCorrect = currentBuzz.status === "CORRECT";

                return (
                  <div className="space-y-6">
                    {/* Active Candidate Spotlight Card */}
                    <div className={`p-6 sm:p-8 rounded-[28px] border transition-all ${
                      isAlreadyCorrect
                        ? "bg-emerald-950/30 border-emerald-500/50"
                        : "bg-[#141414] border-[#262626]"
                    }`}>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${isAlreadyCorrect ? "bg-emerald-400" : "bg-yellow-400 animate-ping"}`} />
                          <span className="text-[10px] font-black uppercase tracking-[0.25em] text-[#888]">
                            {isAlreadyCorrect ? "Verified Answerer" : `Queue Position #${currentBuzz.position || 1} • Turn ${currentIdx + 1} of ${pendingBuzzes.length}`}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs font-mono text-[#888]">
                          <Clock size={13} className="text-[#666]" />
                          <span>Latency: {(currentBuzz.responseTime ?? 0).toFixed(3)}s</span>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <h2 className="text-3xl sm:text-5xl font-display font-black text-white italic tracking-tighter uppercase leading-none">
                            {currentBuzz.participantName}
                          </h2>
                          <div className="flex items-center gap-3 mt-3">
                            <span className="px-3 py-1 bg-white/10 text-white font-bold text-xs rounded-lg uppercase tracking-tight">
                              Score: {participantData?.score || 0} pts
                            </span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-xs font-black uppercase tracking-widest text-[#666] block">Award Value</span>
                          <span className={`text-3xl sm:text-4xl font-display font-black italic tracking-tighter ${isAlreadyCorrect ? "text-emerald-400" : "text-[#FBBC05]"}`}>
                            +{currentBuzz.pointsAwarded} PTS
                          </span>
                        </div>
                      </div>

                      {/* Next candidate hint banner */}
                      {nextCandidate && !isAlreadyCorrect && (
                        <div className="mt-5 pt-4 border-t border-[#222] flex items-center justify-between text-xs text-[#777]">
                          <span className="flex items-center gap-1.5">
                            <CornerDownRight size={14} className="text-[#555]" />
                            <span>Next in line if passed: <strong className="text-slate-300 font-bold uppercase">{nextCandidate.participantName}</strong></span>
                          </span>
                          <span className="font-mono text-[11px] text-[#666]">
                            +{Math.max(0, (nextCandidate.responseTime ?? 0) - (currentBuzz.responseTime ?? 0)).toFixed(3)}s
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Verification Buttons */}
                    {!isAlreadyCorrect ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {/* Correct Button */}
                          <button
                            onClick={() => handleVerifyBuzz(currentBuzz, true)}
                            className="py-5 px-6 bg-gradient-to-r from-[#34A853] to-[#2aa049] hover:from-[#2e9648] hover:to-[#22853c] text-white font-display font-black text-lg uppercase tracking-tight italic rounded-2xl hover:scale-[1.02] active:scale-98 transition-all shadow-xl shadow-[#34A853]/25 flex items-center justify-center gap-3 group"
                          >
                            <CheckCircle2 size={24} className="group-hover:scale-110 transition-transform" />
                            <span>Correct</span>
                            <span className="text-xs font-sans font-bold bg-black/20 px-2 py-0.5 rounded ml-auto">[C]</span>
                          </button>

                          {/* Incorrect Button */}
                          <button
                            onClick={() => handleVerifyBuzz(currentBuzz, false)}
                            className="py-5 px-6 bg-gradient-to-r from-[#EA4335] to-[#d6382b] hover:from-[#d3382b] hover:to-[#be2f23] text-white font-display font-black text-lg uppercase tracking-tight italic rounded-2xl hover:scale-[1.02] active:scale-98 transition-all shadow-xl shadow-[#EA4335]/25 flex items-center justify-center gap-3 group"
                          >
                            <XCircle size={24} className="group-hover:scale-110 transition-transform" />
                            <span>Incorrect</span>
                            <span className="text-xs font-sans font-bold bg-black/20 px-2 py-0.5 rounded ml-auto">[X]</span>
                          </button>
                        </div>
                        <p className="text-center text-[10px] text-[#666] font-bold uppercase tracking-wider">
                          Marking Incorrect automatically advances turn to the next contender in queue
                        </p>
                      </div>
                    ) : (
                      <div className="p-6 bg-emerald-950/30 border border-emerald-500/40 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 text-emerald-400">
                        <div className="flex items-center gap-3">
                          <CheckCircle2 size={24} />
                          <div>
                            <p className="font-bold text-sm uppercase tracking-wide">Points Verified & Awarded</p>
                            <p className="text-xs text-emerald-300/70 font-mono">+{currentBuzz.pointsAwarded} pts credited to {currentBuzz.participantName}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              sendCommand("NEXT_QUESTION");
                              setShowVerifyModal(false);
                            }}
                            className="px-5 py-2.5 bg-emerald-400 text-black font-black uppercase text-xs tracking-wider italic rounded-xl hover:bg-emerald-300 transition-all flex items-center gap-2"
                          >
                            Next Question <ChevronRight size={14} />
                          </button>
                          <button
                            onClick={() => setShowVerifyModal(false)}
                            className="px-4 py-2.5 bg-black/40 hover:bg-black/60 text-white font-bold text-xs uppercase rounded-xl transition-all"
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Queue Navigation Carousel */}
                    {recentBuzzes.length > 1 && (
                      <div className="space-y-2 pt-2 border-t border-[#1f1f1f]">
                        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-[#666]">
                          <span>Arrival Queue for Question {activeGame?.currentQuestion}</span>
                          <span>Click to Inspect / Switch</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {recentBuzzes.map((b, bIdx) => {
                            const isSelected = (currentBuzz?.id === b.id);
                            const isInc = b.status === "INCORRECT";
                            const isCorr = b.status === "CORRECT";

                            return (
                              <button
                                key={b.id}
                                onClick={() => setSelectedBuzzId(b.id)}
                                className={`p-3 rounded-xl border text-left transition-all ${
                                  isSelected
                                    ? "bg-white text-black border-white shadow-lg"
                                    : isCorr
                                    ? "bg-emerald-950/40 text-emerald-300 border-emerald-800/40"
                                    : isInc
                                    ? "bg-[#111] text-slate-600 border-[#1c1c1c] opacity-50 line-through"
                                    : "bg-[#161616] text-[#999] border-[#222] hover:border-[#444] hover:text-white"
                                }`}
                              >
                                <div className="flex items-center justify-between text-[9px] font-bold uppercase mb-1">
                                  <span>#{bIdx + 1}</span>
                                  <span>{(b.responseTime ?? 0).toFixed(2)}s</span>
                                </div>
                                <div className="font-black text-xs uppercase tracking-tight italic truncate">
                                  {b.participantName}
                                </div>
                                <div className="text-[8px] mt-1 font-mono">
                                  {isCorr ? "✓ Correct" : isInc ? "✗ Passed" : "⚡ In Queue"}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Keyboard shortcuts helper footer */}
                    <div className="flex items-center justify-between pt-2 text-[10px] text-[#555] font-mono border-t border-[#1a1a1a]">
                      <div className="flex items-center gap-4">
                        <span><kbd className="px-1.5 py-0.5 bg-[#1c1c1c] rounded text-[#888] font-bold">C</kbd> Correct</span>
                        <span><kbd className="px-1.5 py-0.5 bg-[#1c1c1c] rounded text-[#888] font-bold">X</kbd> Incorrect</span>
                        <span><kbd className="px-1.5 py-0.5 bg-[#1c1c1c] rounded text-[#888] font-bold">Esc</kbd> Close</span>
                      </div>
                      <span>Sync Latency: &lt;15ms</span>
                    </div>
                  </div>
                );
              })()}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Score Editor Modal */}
      <AnimatePresence>
        {editingParticipant && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#111] border border-[#262626] w-full max-w-md p-6 md:p-8 rounded-[32px] space-y-6 shadow-2xl relative overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-display font-black text-white italic tracking-tight uppercase">
                    Adjust Score
                  </h3>
                  <p className="text-xs text-[#888] font-bold mt-0.5">{editingParticipant.name}</p>
                </div>
                <button
                  onClick={() => setEditingParticipant(null)}
                  className="w-8 h-8 rounded-full bg-[#1c1c1c] text-[#666] hover:text-white flex items-center justify-center transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Quick Point Increments */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-[#555]">Quick Add / Deduct</label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: "+10", delta: 10, bg: "bg-emerald-950/60 hover:bg-emerald-600 text-emerald-400 hover:text-black border-emerald-800/50" },
                    { label: "+20", delta: 20, bg: "bg-emerald-950/60 hover:bg-emerald-600 text-emerald-400 hover:text-black border-emerald-800/50" },
                    { label: "+50", delta: 50, bg: "bg-blue-950/60 hover:bg-blue-600 text-blue-400 hover:text-white border-blue-800/50" },
                    { label: "-10", delta: -10, bg: "bg-red-950/60 hover:bg-red-600 text-red-400 hover:text-white border-red-800/50" }
                  ].map(btn => (
                    <button
                      key={btn.label}
                      type="button"
                      onClick={() => {
                        handleAdjustScore(editingParticipant.id, btn.delta);
                        setEditingParticipant(null);
                      }}
                      className={`py-2.5 rounded-xl border text-xs font-black tracking-tight transition-all active:scale-95 ${btn.bg}`}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Exact Score Input */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-[#555]">Set Exact Total Score</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    value={customScoreInput}
                    onChange={(e) => setCustomScoreInput(e.target.value)}
                    className="flex-1 bg-[#181818] border border-[#333] focus:border-white text-white font-mono text-lg font-bold px-4 py-3 rounded-xl outline-none"
                    placeholder="Enter points..."
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const val = parseInt(customScoreInput, 10);
                      if (!isNaN(val)) {
                        handleSetExactScore(editingParticipant.id, val);
                      }
                      setEditingParticipant(null);
                    }}
                    className="px-6 bg-white hover:bg-slate-200 text-black font-black uppercase tracking-wider text-xs rounded-xl transition-all active:scale-95"
                  >
                    Set
                  </button>
                </div>
              </div>

              {/* Reset to 0 Option */}
              <div className="pt-2 border-t border-[#1e1e1e] flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => {
                    handleSetExactScore(editingParticipant.id, 0);
                    setEditingParticipant(null);
                  }}
                  className="text-xs font-bold text-red-400 hover:text-red-300 transition-colors"
                >
                  Reset Score to 0
                </button>
                <button
                  type="button"
                  onClick={() => setEditingParticipant(null)}
                  className="text-xs text-[#666] hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Create Game Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/95 backdrop-blur-2xl z-50 flex items-center justify-center p-4 md:p-8">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              className="bg-[#111] border border-[#222] w-full max-w-xl p-8 md:p-16 rounded-[48px] md:rounded-[64px] space-y-10 md:space-y-12 shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-[#4285F4] via-[#EA4335] to-[#FBBC05]" />
              
              <div className="text-center space-y-4">
                <h2 className="text-4xl md:text-6xl font-display font-black text-white italic tracking-tighter leading-none">Initialize</h2>
                <p className="text-[#333] font-black uppercase tracking-[0.4em] text-[10px]">Select Active Session Protocol</p>
              </div>

              <div className="grid grid-cols-2 gap-4 md:gap-8">
                <button 
                  onClick={() => setNewGameType(GameType.MOVIE)}
                  className={`p-8 md:p-12 rounded-[32px] md:rounded-[40px] border-4 flex flex-col items-center gap-6 md:gap-8 transition-all group ${
                    newGameType === GameType.MOVIE ? "border-white bg-white text-black scale-105 shadow-2xl shadow-white/10" : "border-[#181818] bg-[#080808] text-[#333]"
                  }`}
                >
                  <span className="text-5xl md:text-7xl group-hover:scale-110 transition-transform">🎬</span>
                  <span className={`font-black text-[10px] uppercase tracking-[0.2em] italic ${newGameType === GameType.MOVIE ? "text-black" : "text-[#222]"}`}>Cinema Riddle</span>
                </button>
                <button 
                  onClick={() => setNewGameType(GameType.LOGO)}
                  className={`p-8 md:p-12 rounded-[32px] md:rounded-[40px] border-4 flex flex-col items-center gap-6 md:gap-8 transition-all group ${
                    newGameType === GameType.LOGO ? "border-white bg-white text-black scale-105 shadow-2xl shadow-white/10" : "border-[#181818] bg-[#080808] text-[#333]"
                  }`}
                >
                  <span className="text-5xl md:text-7xl group-hover:scale-110 transition-transform">🔍</span>
                  <span className={`font-black text-[10px] uppercase tracking-[0.2em] italic ${newGameType === GameType.LOGO ? "text-black" : "text-[#222]"}`}>Brand Identity</span>
                </button>
              </div>

              <div className="flex flex-col gap-4">
                <button 
                  onClick={handleCreateGame}
                  className="w-full bg-white text-black font-black py-5 md:py-7 rounded-2xl md:rounded-3xl italic uppercase tracking-tighter text-2xl md:text-3xl shadow-2xl shadow-white/10 hover:scale-[1.02] active:scale-98 transition-all"
                >
                  Confirm Execution
                </button>
                <button 
                  onClick={() => setShowCreateModal(false)}
                  className="w-full py-4 font-black text-[#222] uppercase tracking-[0.4em] text-[10px] hover:text-white transition-colors"
                >
                  Abort Protocol
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Maximized QR Code Modal */}
      <AnimatePresence>
        {showMaximizedQr && (
          <div 
            className="fixed inset-0 bg-black/95 backdrop-blur-2xl z-50 flex items-center justify-center p-6 cursor-zoom-out"
            onClick={() => setShowMaximizedQr(false)}
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-[#111] border border-[#222] p-8 md:p-12 rounded-[48px] max-w-2xl w-full flex flex-col items-center justify-center space-y-8 relative shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close Button */}
              <button 
                onClick={() => setShowMaximizedQr(false)}
                className="absolute top-6 right-6 w-12 h-12 rounded-full bg-[#1c1c1c] text-[#888] hover:text-white flex items-center justify-center transition-all active:scale-95"
              >
                <X size={20} />
              </button>

              <div className="text-center space-y-2 mt-4">
                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-[#4285F4]">Access Protocol</span>
                <h2 className="text-3xl md:text-5xl font-display font-black text-white italic tracking-tighter uppercase leading-none">Scan to Join Game</h2>
                <p className="text-xs text-[#555] font-mono tracking-widest mt-1">/join?game={activeGame?.id}</p>
              </div>

              {/* Larger QR Code */}
              <div className="p-6 md:p-8 bg-white rounded-[32px] shadow-2xl transition-transform hover:scale-[1.02]">
                <QRCodeSVG 
                  value={`${window.location.origin}/join?game=${activeGame?.id}`} 
                  size={360}
                  level="H"
                  bgColor="#FFFFFF"
                  fgColor="#000000"
                />
              </div>

              <div className="text-center space-y-1">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#333]">Host Domain</p>
                <p className="text-white font-black uppercase tracking-tighter italic text-xl">{window.location.hostname}</p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1a1a1a; border-radius: 10px; }
      `}</style>
    </div>
  );
}
