import { connectionsGame } from "./connections/connections";
import { jigsawGame } from "./jigsaw/jigsaw";
import { logicGame } from "./logic/logic";
import { quizGame } from "./quiz/quiz";
import { reactionGame } from "./reaction/reaction";
import { spotItGame } from "./spotIt/spotIt";
import { wordRushGame } from "./wordRush/wordRush";
import type { GameModule } from "./types";

export type AnyGameModule = GameModule<unknown, unknown, unknown, unknown, unknown>;

export const GAMES = {
  quiz: quizGame as unknown as AnyGameModule,
  jigsaw: jigsawGame as unknown as AnyGameModule,
  "word-rush": wordRushGame as unknown as AnyGameModule,
  "spot-it": spotItGame as unknown as AnyGameModule,
  connections: connectionsGame as unknown as AnyGameModule,
  logic: logicGame as unknown as AnyGameModule,
  reaction: reactionGame as unknown as AnyGameModule,
} as const;

export type GameId = keyof typeof GAMES;

export const GAME_IDS = Object.keys(GAMES) as GameId[];

export function gameModule(id: GameId): AnyGameModule {
  return GAMES[id];
}

export function isGameId(id: string): id is GameId {
  return Object.hasOwn(GAMES, id);
}
