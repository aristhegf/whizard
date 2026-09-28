import type { z } from "zod";
import type { JigsawContentRequest } from "./jigsaw/settings";
import type { QuizContentRequest } from "./quiz/settings";
import type { WordsContentRequest } from "./wordRush/settings";

export interface GamePlayer {
  id: string;
  nickname: string;
}

/** What a game needs from the content bank before it can start. */
export type ContentRequest = QuizContentRequest | JigsawContentRequest | WordsContentRequest;

/** How a finished game went, for match history. The same shape for every game. */
export interface GameSummary {
  /** What stats are grouped by, e.g. the quiz category. */
  category: string | null;
  difficulty: string | null;
  mode: string | null;
  /** Questions or rounds played. */
  rounds: number;
  /** Players who stayed to the end, best first. */
  players: {
    playerId: string;
    placing: number;
    score: number;
    /** Correct answers, for games that have them. */
    correct: number | null;
  }[];
  /** How each piece of content (such as a question) went, for games that have them. */
  items?: ItemResult[];
}

export interface ItemResult {
  id: string;
  /** Players who picked an answer. */
  answered: number;
  correct: number;
  /** Players whose time ran out. */
  timedOut: number;
  /** Wrong answers picked, by their text. */
  wrongPicks: Record<string, number>;
}

export interface Rejection {
  rejected: string;
}

/**
 * The rules of one game, as pure functions. The room owns connections, players, persistence
 * and the clock; a module only turns (state, input, time) into new state and per-player views.
 *
 * Time is handled by `tick`: the room calls it whenever `nextWakeAt` is reached and before
 * every action, so a module never manages timers itself.
 */
export interface GameModule<Settings, Content, State, Action, View> {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  /** A higher minimum for some settings, such as a mode that needs a crowd, and why. */
  playersNeeded?(settings: Settings): { min: number; message: string } | null;
  settingsSchema: z.ZodType<Settings>;
  defaultSettings: Settings;
  actionSchema: z.ZodType<Action>;
  /** null for games that make their own, such as Spot It's grids. */
  contentNeeded(settings: Settings, players: number): ContentRequest | null;
  setup(args: {
    settings: Settings;
    players: GamePlayer[];
    content: Content;
    seed: number;
    now: number;
  }): State;
  onAction(state: State, playerId: string, action: Action, now: number): State | Rejection;
  onPlayerLeft(state: State, playerId: string, now: number): State;
  /** Someone joining a game that has already started, when the room allows it. */
  onPlayerJoined(state: State, player: GamePlayer, now: number): State;
  tick(state: State, now: number): State;
  /** The next time `tick` has something to do, or null. */
  nextWakeAt(state: State): number | null;
  isFinished(state: State): boolean;
  /** Only called once the game is finished. */
  summarize(state: State): GameSummary;
  /** Everything this player may see. Must never include hidden information. */
  viewFor(state: State, playerId: string): View;
}

export function isRejection(value: unknown): value is Rejection {
  return typeof value === "object" && value !== null && "rejected" in value;
}
