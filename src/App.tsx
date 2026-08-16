/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, Component, ErrorInfo, ReactNode } from "react";
import { Game, Participant, GameType } from "./types";
import LandingPage from "./components/LandingPage";
import JoinGame from "./components/JoinGame";
import ParticipantView from "./components/ParticipantView";
import AdminLogin from "./components/AdminLogin";
import AdminDashboard from "./components/AdminDashboard";
import PublicDisplay from "./components/PublicDisplay";
import { socket } from "./lib/socket";
import { RotateCcw, AlertTriangle } from "lucide-react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught application error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-6 text-center text-white">
          <div className="max-w-md w-full p-8 bg-[#111] border border-[#222] rounded-[32px] space-y-6">
            <div className="w-16 h-16 bg-red-500/10 text-red-400 rounded-2xl flex items-center justify-center mx-auto">
              <AlertTriangle size={32} />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-display font-black uppercase italic tracking-tighter">Session Interrupted</h2>
              <p className="text-xs text-[#888]">A recoverable runtime exception occurred. Click below to reconnect to the live session.</p>
            </div>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.href = window.location.pathname;
                }}
                className="w-full py-4 bg-white hover:bg-slate-200 text-black font-black uppercase tracking-wider text-xs rounded-xl flex items-center justify-center gap-2 transition-all"
              >
                <RotateCcw size={16} /> Reconnect Session
              </button>
              <button
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.href = "/";
                }}
                className="w-full py-3 bg-[#181818] hover:bg-[#222] text-[#888] hover:text-white font-bold uppercase tracking-wider text-[10px] rounded-xl transition-all"
              >
                Return to Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  const [path, setPath] = useState(window.location.pathname);
  const [currentGame, setCurrentGame] = useState<Game | null>(null);
  const [participant, setParticipant] = useState<Participant | null>(() => {
    try {
      const saved = localStorage.getItem("buzz_participant");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const handlePopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = (newPath: string) => {
    window.history.pushState({}, "", newPath);
    setPath(newPath);
  };

  // Global Socket Listener for Game State
  useEffect(() => {
    socket.on("game_state_changed", (updatedGame: Game) => {
      setCurrentGame(updatedGame);
    });

    return () => {
      socket.off("game_state_changed");
    };
  }, []);

  const renderView = () => {
    if (path === "/") return <LandingPage onNavigate={navigate} />;
    if (path === "/join") return <JoinGame onNavigate={navigate} onJoined={setParticipant} />;
    if (path === "/play") return <ParticipantView participant={participant} onNavigate={navigate} onReset={() => setParticipant(null)} />;
    if (path === "/admin/login") return <AdminLogin onNavigate={navigate} />;
    if (path === "/admin/dashboard") return <AdminDashboard onNavigate={navigate} />;
    if (path === "/display") return <PublicDisplay onNavigate={navigate} />;

    return <LandingPage onNavigate={navigate} />;
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[#050505] font-sans text-white selection:bg-indigo-500/30">
        {renderView()}
      </div>
    </ErrorBoundary>
  );
}

