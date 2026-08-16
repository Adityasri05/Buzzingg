/**
 * Shared types for Buzzingg
 */

export enum GameType {
  MOVIE = "MOVIE",
  LOGO = "LOGO"
}

export enum GameStatus {
  NOT_STARTED = "NOT_STARTED",
  ACTIVE = "ACTIVE",
  PAUSED = "PAUSED",
  GAME_OVER = "GAME_OVER"
}

export enum BuzzerStatus {
  CLOSED = "CLOSED",
  OPEN = "OPEN"
}

export interface Game {
  id: string;
  gameCode?: string;
  organization?: string;
  type?: GameType | string;
  gameType?: GameType | string;
  status: GameStatus;
  currentRound?: number;
  currentQuestion: number;
  totalRounds?: number;
  buzzerStatus: BuzzerStatus;
  createdAt: any;
  startedAt?: any;
  endedAt?: any;
}

export interface Participant {
  id: string;
  gameId: string;
  name: string;
  score: number;
  roundScore: number;
  status: 'ONLINE' | 'OFFLINE';
  joinedAt: Date;
}

export interface Buzz {
  id: string;
  gameId: string;
  roundNumber: number;
  questionNumber: number;
  participantId: string;
  participantName: string;
  serverTimestamp: number;
  position: number;
  pointsAwarded: number;
  responseTime: number;
  status?: 'PENDING' | 'CORRECT' | 'INCORRECT';
}

export interface GameState {
  game: Game | null;
  participants: Participant[];
  currentBuzzes: Buzz[];
}
