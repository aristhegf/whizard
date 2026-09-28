import { quizGame } from "./quiz/quiz";
import { spotItGame } from "./spotIt/spotIt";
import { wordRushGame } from "./wordRush/wordRush";
import type { GameModule } from "./types";

export type AnyGameModule = GameModule<unknown, unknown, unknown, unknown, unknown>;

export const GAMES = {
  quiz: quizGame as unknown as AnyGameModule,
  "word-rush": wordRushGame as unknown as AnyGameModule,
  "spot-it": spotItGame as unknown as AnyGameModule,
} as const;

export type GameId = keyof typeof GAMES;

export const GAME_IDS = Object.keys(GAMES) as GameId[];

export function gameModule(id: GameId): AnyGameModule {
  return GAMES[id];
}

export function isGameId(id: string): id is GameId {
  return Object.hasOwn(GAMES, id);
}
