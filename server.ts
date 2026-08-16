import express from "express";
import path from "path";
import fs from "fs";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import { 
  doc, 
  collection, 
  getDoc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  serverTimestamp, 
  writeBatch 
} from "firebase/firestore";
import { db } from "./src/lib/firebase-admin.ts";
import { GameStatus, BuzzerStatus, Game, Participant, Buzz } from "./src/types.ts";

async function startServer() {
  console.log("NODE_ENV is:", process.env.NODE_ENV);
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = 3000;

  app.use(express.json());

  // Health Check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // Admin Login
  app.post("/api/admin/login", (req, res) => {
    const { password } = req.body;
    if (password === "gdgsrmcem") {
      res.json({ success: true, token: "admin-token-buzzingg" });
    } else {
      res.status(401).json({ success: false, message: "Invalid password" });
    }
  });

  // Verify Buzz & Authoritatively Update Scores
  app.post("/api/admin/verify-buzz", async (req, res) => {
    const { buzzId, isCorrect, pointsAwarded, gameId, participantId: reqParticipantId, penalty } = req.body;
    if (!buzzId) {
      return res.status(400).json({ error: "Missing buzzId" });
    }
    try {
      const buzzRef = doc(db, "buzzes", buzzId);
      const buzzSnap = await getDoc(buzzRef);
      
      let prevStatus = "PENDING";
      let targetParticipantId = reqParticipantId || "";
      let awardedPts = Number(pointsAwarded) > 0 ? Number(pointsAwarded) : 10;
      const penaltyPts = typeof penalty === "number" ? Math.abs(penalty) : 5;

      if (buzzSnap.exists()) {
        const buzzData = buzzSnap.data() as Buzz;
        prevStatus = buzzData.status || "PENDING";
        if (!targetParticipantId && buzzData.participantId) {
          targetParticipantId = buzzData.participantId;
        }
        if (buzzData.pointsAwarded && Number(buzzData.pointsAwarded) > 0) {
          awardedPts = Number(buzzData.pointsAwarded);
        }
      }

      const newStatus = isCorrect ? "CORRECT" : "INCORRECT";
      let deltaApplied = 0;

      if (isCorrect) {
        if (prevStatus === "CORRECT") {
          deltaApplied = 0;
        } else if (prevStatus === "INCORRECT") {
          // Refund penalty and award full points
          deltaApplied = awardedPts + penaltyPts;
        } else {
          deltaApplied = awardedPts;
        }
      } else {
        if (prevStatus === "CORRECT") {
          // Remove awarded points and apply penalty
          deltaApplied = -(awardedPts + penaltyPts);
        } else if (prevStatus === "INCORRECT") {
          deltaApplied = 0;
        } else {
          // Deduct penalty for incorrect answer
          deltaApplied = -penaltyPts;
        }
      }

      // Update Buzz record in Firestore
      if (buzzSnap.exists()) {
        await updateDoc(buzzRef, { 
          status: newStatus, 
          pointsAwarded: awardedPts,
          verifiedAt: serverTimestamp()
        });
      }

      let updatedScore = 0;
      if (targetParticipantId) {
        const pRef = doc(db, "participants", targetParticipantId);
        const pSnap = await getDoc(pRef);
        if (pSnap.exists()) {
          const pData = pSnap.data() as Participant;
          const currentScore = Number(pData.score) || 0;
          const currentRound = Number(pData.roundScore) || 0;
          updatedScore = Math.max(0, currentScore + deltaApplied);
          const newRound = Math.max(0, currentRound + deltaApplied);
          await updateDoc(pRef, { 
            score: updatedScore, 
            roundScore: newRound,
            updatedAt: serverTimestamp()
          });
        }
      }

      const payloadData = {
        buzzId,
        participantId: targetParticipantId,
        isCorrect: !!isCorrect,
        pointsAwarded: awardedPts,
        scoreDelta: deltaApplied,
        newScore: updatedScore
      };

      if (gameId) {
        io.to(`game:${gameId}`).emit("buzz_verified", payloadData);
      }
      io.emit("buzz_verified", payloadData);

      res.json({ success: true, ...payloadData });
    } catch (err: any) {
      console.error("Error in /api/admin/verify-buzz:", err);
      res.status(500).json({ error: err.message || "Verification failed" });
    }
  });

  // Direct Score Adjustment
  app.post("/api/admin/adjust-score", async (req, res) => {
    const { participantId, delta, gameId } = req.body;
    if (!participantId || typeof delta !== "number") {
      return res.status(400).json({ error: "Missing participantId or delta" });
    }
    try {
      const pRef = doc(db, "participants", participantId);
      const pSnap = await getDoc(pRef);
      if (!pSnap.exists()) {
        return res.status(404).json({ error: "Participant not found" });
      }

      const pData = pSnap.data() as Participant;
      const currentScore = Number(pData.score) || 0;
      const currentRound = Number(pData.roundScore) || 0;
      const finalScore = Math.max(0, currentScore + delta);
      const finalRound = Math.max(0, currentRound + delta);

      await updateDoc(pRef, { 
        score: finalScore, 
        roundScore: finalRound,
        updatedAt: serverTimestamp()
      });

      const payloadData = { participantId, delta, newScore: finalScore };
      if (gameId) {
        io.to(`game:${gameId}`).emit("score_adjusted", payloadData);
      }
      io.emit("score_adjusted", payloadData);
      res.json({ success: true, ...payloadData });
    } catch (err: any) {
      console.error("Error in /api/admin/adjust-score:", err);
      res.status(500).json({ error: err.message || "Failed to adjust score" });
    }
  });

  // Set Exact Total Score
  app.post("/api/admin/set-score", async (req, res) => {
    const { participantId, score, gameId } = req.body;
    if (!participantId || typeof score !== "number") {
      return res.status(400).json({ error: "Missing participantId or score" });
    }
    try {
      const pRef = doc(db, "participants", participantId);
      const safeScore = Math.max(0, score);
      await updateDoc(pRef, { 
        score: safeScore, 
        roundScore: safeScore,
        updatedAt: serverTimestamp()
      });

      const payloadData = { participantId, delta: 0, newScore: safeScore };
      if (gameId) {
        io.to(`game:${gameId}`).emit("score_adjusted", payloadData);
      }
      io.emit("score_adjusted", payloadData);
      res.json({ success: true, ...payloadData });
    } catch (err: any) {
      console.error("Error in /api/admin/set-score:", err);
      res.status(500).json({ error: err.message || "Failed to set score" });
    }
  });

  // Admin Game Commands
  app.post("/api/admin/command", async (req, res) => {
    const { gameId, command, payload } = req.body;
    if (!gameId || !command) {
      return res.status(400).json({ error: "Missing gameId or command" });
    }
    try {
      const result = await executeAdminCommand(gameId, command, payload, io);
      res.json({ success: true, game: result });
    } catch (err: any) {
      console.error("Error in /api/admin/command:", err);
      res.status(500).json({ error: err.message || "Failed to execute command" });
    }
  });

  async function executeAdminCommand(gameId: string, command: string, payload: any, ioInstance: Server) {
    const gameRef = doc(db, "games", gameId);
    
    switch (command) {
      case "START_GAME":
        await updateDoc(gameRef, { 
          status: GameStatus.ACTIVE, 
          buzzerStatus: BuzzerStatus.OPEN,
          startedAt: serverTimestamp() 
        });
        ioInstance.to(`game:${gameId}`).emit("buzzer_opened", { gameId });
        ioInstance.emit("buzzer_opened", { gameId });
        break;
      case "OPEN_BUZZER":
        try {
          const currentGDoc = await getDoc(gameRef);
          if (currentGDoc.exists()) {
            const currentG = currentGDoc.data() as Game;
            const bQuery = query(
              collection(db, "buzzes"),
              where("gameId", "==", gameId),
              where("roundNumber", "==", currentG.currentRound),
              where("questionNumber", "==", currentG.currentQuestion)
            );
            const oldBuzzes = await getDocs(bQuery);
            if (!oldBuzzes.empty) {
              const bBatch = writeBatch(db);
              oldBuzzes.docs.forEach(d => bBatch.delete(d.ref));
              await bBatch.commit();
            }
          }
        } catch (e) {
          console.error("Error clearing old buzzes:", e);
        }
        
        await updateDoc(gameRef, { buzzerStatus: BuzzerStatus.OPEN, startedAt: serverTimestamp() });
        ioInstance.to(`game:${gameId}`).emit("buzzer_opened", { gameId });
        ioInstance.emit("buzzer_opened", { gameId });
        break;
      case "CLOSE_BUZZER":
        await updateDoc(gameRef, { buzzerStatus: BuzzerStatus.CLOSED });
        ioInstance.to(`game:${gameId}`).emit("buzzer_closed", { gameId });
        ioInstance.emit("buzzer_closed", { gameId });
        break;
      case "REOPEN_BUZZER":
        await updateDoc(gameRef, { buzzerStatus: BuzzerStatus.OPEN, startedAt: serverTimestamp() });
        ioInstance.to(`game:${gameId}`).emit("buzzer_opened", { gameId });
        ioInstance.emit("buzzer_opened", { gameId });
        break;
      case "NEXT_QUESTION": {
        const gDoc = await getDoc(gameRef);
        const gData = gDoc.exists() ? (gDoc.data() as Game) : null;
        const targetQ = payload?.targetQuestion 
          ? Number(payload.targetQuestion) 
          : (gData?.currentQuestion || 1) + 1;
        await updateDoc(gameRef, { 
          currentQuestion: Math.max(1, targetQ),
          buzzerStatus: BuzzerStatus.OPEN,
          startedAt: serverTimestamp()
        });
        ioInstance.to(`game:${gameId}`).emit("buzzer_opened", { gameId });
        ioInstance.emit("buzzer_opened", { gameId });
        break;
      }
      case "PREV_QUESTION": {
        const gDoc = await getDoc(gameRef);
        const gData = gDoc.exists() ? (gDoc.data() as Game) : null;
        const targetQ = payload?.targetQuestion 
          ? Number(payload.targetQuestion) 
          : Math.max(1, (gData?.currentQuestion || 2) - 1);
        await updateDoc(gameRef, { 
          currentQuestion: Math.max(1, targetQ),
          buzzerStatus: BuzzerStatus.OPEN,
          startedAt: serverTimestamp()
        });
        ioInstance.to(`game:${gameId}`).emit("buzzer_opened", { gameId });
        ioInstance.emit("buzzer_opened", { gameId });
        break;
      }
      case "SET_QUESTION": {
        const targetQ = Math.max(1, Number(payload?.targetQuestion || payload?.questionNumber || 1));
        await updateDoc(gameRef, { 
          currentQuestion: targetQ,
          buzzerStatus: BuzzerStatus.OPEN,
          startedAt: serverTimestamp()
        });
        ioInstance.to(`game:${gameId}`).emit("buzzer_opened", { gameId });
        ioInstance.emit("buzzer_opened", { gameId });
        break;
      }
      case "END_ROUND":
        await updateDoc(gameRef, { buzzerStatus: BuzzerStatus.CLOSED });
        ioInstance.to(`game:${gameId}`).emit("buzzer_closed", { gameId });
        ioInstance.emit("buzzer_closed", { gameId });
        break;
      case "END_GAME":
        await updateDoc(gameRef, { status: GameStatus.GAME_OVER, endedAt: serverTimestamp() });
        
        // Deep Cleanup session records
        try {
          const pQuery = query(collection(db, "participants"), where("gameId", "==", gameId));
          const bQuery = query(collection(db, "buzzes"), where("gameId", "==", gameId));
          const [pSnapshot, bSnapshot] = await Promise.all([getDocs(pQuery), getDocs(bQuery)]);
          
          const batch = writeBatch(db);
          pSnapshot.docs.forEach(d => batch.delete(d.ref));
          bSnapshot.docs.forEach(d => batch.delete(d.ref));
          batch.delete(gameRef);
          await batch.commit();
          
          console.log(`Deep cleaned session data for game ${gameId}`);
        } catch (e) {
          console.error("Failed to cleanup session:", e);
        }
        break;
    }
    
    const updatedDoc = await getDoc(gameRef);
    if (updatedDoc.exists()) {
      const updatedData = { id: gameId, ...updatedDoc.data() };
      ioInstance.to(`game:${gameId}`).emit("game_state_changed", updatedData);
      ioInstance.emit("game_state_changed", updatedData);
      return updatedData;
    } else {
      ioInstance.to(`game:${gameId}`).emit("session_reset", { gameId });
      ioInstance.emit("session_reset", { gameId });
      return null;
    }
  }

  // Socket.IO Logic
  io.on("connection", (socket) => {
    socket.on("join_room", (gameId) => {
      socket.join(`game:${gameId}`);
    });

    socket.on("buzz", async (data: { gameId: string, participantId: string, participantName: string }) => {
      const { gameId, participantId, participantName } = data;
      
      try {
        const gameRef = doc(db, "games", gameId);
        const gameDoc = await getDoc(gameRef);
        
        if (!gameDoc.exists()) return;
        const gameData = gameDoc.data() as Game;

        if (gameData.buzzerStatus !== BuzzerStatus.OPEN) return;

        const buzzesQuery = query(
          collection(db, "buzzes"),
          where("gameId", "==", gameId),
          where("roundNumber", "==", gameData.currentRound),
          where("questionNumber", "==", gameData.currentQuestion)
        );
        
        const existingBuzzes = await getDocs(buzzesQuery);

        // Prevent duplicate buzz by the same participant on the same question
        const alreadyBuzzed = existingBuzzes.docs.some(d => d.data().participantId === participantId);
        if (alreadyBuzzed) return;

        const position = existingBuzzes.size + 1;
        if (position > 5) return; // Only accept top 5 arrivals

        const pointsMap: Record<number, number> = { 1: 10, 2: 7, 3: 5, 4: 3, 5: 2 };
        const pointsAwarded = pointsMap[position] || 0;
        
        const serverTimestampNow = Date.now();
        let startTimeMs = serverTimestampNow;
        if (gameData.startedAt) {
          if (typeof (gameData.startedAt as any).toDate === "function") {
            startTimeMs = (gameData.startedAt as any).toDate().getTime();
          } else if (typeof (gameData.startedAt as any).seconds === "number") {
            startTimeMs = (gameData.startedAt as any).seconds * 1000;
          } else if (gameData.startedAt instanceof Date) {
            startTimeMs = gameData.startedAt.getTime();
          } else {
            const parsed = new Date(gameData.startedAt as any).getTime();
            if (!isNaN(parsed)) startTimeMs = parsed;
          }
        }
        
        const rawResponseTime = (serverTimestampNow - startTimeMs) / 1000;
        const responseTime = isNaN(rawResponseTime) || rawResponseTime < 0 ? 0 : rawResponseTime;

        const buzzRecord = {
          gameId,
          roundNumber: gameData.currentRound,
          questionNumber: gameData.currentQuestion,
          participantId,
          participantName,
          serverTimestamp: serverTimestampNow,
          position,
          pointsAwarded,
          responseTime,
          status: "PENDING"
        };

        const newDocRef = await addDoc(collection(db, "buzzes"), buzzRecord);

        // Lock buzzer on first buzz
        await updateDoc(gameRef, { buzzerStatus: BuzzerStatus.CLOSED });

        const fullBuzzRecord = { id: newDocRef.id, ...buzzRecord };
        io.to(`game:${gameId}`).emit("buzz_received", fullBuzzRecord);
        io.emit("buzz_received", fullBuzzRecord);
        io.to(`game:${gameId}`).emit("buzzer_closed", { gameId });
        io.emit("buzzer_closed", { gameId });
      } catch (error) {
        console.error("Error processing buzz:", error);
      }
    });

    // Admin commands via socket
    socket.on("admin_command", async (data: { gameId: string, command: string, payload?: any }) => {
      const { gameId, command, payload } = data;
      try {
        await executeAdminCommand(gameId, command, payload, io);
      } catch (error) {
        console.error("Error executing admin command via socket:", error);
      }
    });

    socket.on("disconnect", () => {
      // client disconnected
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    app.get("*", async (req, res, next) => {
      const url = req.originalUrl;
      console.log("Wildcard handler hit for url:", url);
      try {
        let template = await fs.promises.readFile(
          path.resolve(process.cwd(), "index.html"),
          "utf-8"
        );
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e) {
        console.error("Error serving HTML:", e);
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
