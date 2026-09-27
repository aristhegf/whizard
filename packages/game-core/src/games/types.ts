import type { z } from "zod";
import type { QuizContentRequest } from "./quiz/settings";

export interface GamePlayer {
  id: string;
  nickname: string;
}

/** What a game needs from the content bank before it can start. */
export type ContentRequest = QuizContentRequest;

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
  settingsSchema: z.ZodType<Settings>;
  defaultSettings: Settings;
  actionSchema: z.ZodType<Action>;
  contentNeeded(settings: Settings): ContentRequest;
  setup(args: {
    settings: Settings;
    players: GamePlayer[];
    content: Content;
    seed: number;
    now: number;
  }): State;
  onAction(state: State, playerId: string, action: Action, now: number): State | Rejection;
  onPlayerLeft(state: State, playerId: string, now: number): State;
  tick(state: State, now: number): State;
  /** The next time `tick` has something to do, or null. */
  nextWakeAt(state: State): number | null;
  isFinished(state: State): boolean;
  /** Everything this player may see. Must never include hidden information. */
  viewFor(state: State, playerId: string): View;
}

export function isRejection(value: unknown): value is Rejection {
  return typeof value === "object" && value !== null && "rejected" in value;
}
