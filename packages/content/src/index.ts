// Server-only: this package contains the answers, so the web app must never import it.
import {
  type ConnectionsPuzzle,
  jigsawContentId,
  pickJigsawPicture,
  seededRng,
  shuffled,
  type ContentRequest,
  type QuizCategory,
  type QuizDifficulty,
  type Level,
  type WordLevel,
} from "@whizard/game-core";
import { z } from "zod";
import animals from "./questions/animals.json";
import bible from "./questions/bible.json";
import football from "./questions/football.json";
import generalKnowledge from "./questions/general-knowledge.json";
import geography from "./questions/geography.json";
import history from "./questions/history.json";
import movies from "./questions/movies.json";
import music from "./questions/music.json";
import nigerianCulture from "./questions/nigerian-culture.json";
import popCulture from "./questions/pop-culture.json";
import quran from "./questions/quran.json";
import science from "./questions/science.json";
import connectionsFile from "./connections/puzzles.json";
import {
  storedConnectionsSchema,
  storedQuestionSchema,
  storedWordSchema,
  type StoredConnections,
  type StoredQuestion,
  type StoredWord,
} from "./schema";
import wordFile from "./words/words.json";

export * from "./quality";
export * from "./schema";

/** One file per category. They ship with the Worker until reports and history need D1. */
export const QUESTION_FILES: Record<QuizCategory, unknown> = {
  bible,
  quran,
  geography,
  history,
  science,
  animals,
  football,
  movies,
  music,
  "nigerian-culture": nigerianCulture,
  "general-knowledge": generalKnowledge,
  "pop-culture": popCulture,
};

export const QUESTIONS: readonly StoredQuestion[] = Object.values(QUESTION_FILES).flatMap((file) =>
  z.array(storedQuestionSchema).parse(file),
);

export const WORDS: readonly StoredWord[] = z.array(storedWordSchema).parse(wordFile);

export const CONNECTIONS: readonly StoredConnections[] = z
  .array(storedConnectionsSchema)
  .parse(connectionsFile);

export type QuestionCounts = Partial<Record<QuizCategory, Record<QuizDifficulty, number>>>;

export function questionCounts(questions: readonly StoredQuestion[] = QUESTIONS): QuestionCounts {
  const counts: QuestionCounts = {};
  for (const q of questions) {
    const row = (counts[q.category] ??= { easy: 0, medium: 0, hard: 0 });
    row[q.difficulty]++;
  }
  return counts;
}

/** Who in a game has seen a question before, from their history across rooms. */
const BY_ID = new Map(QUESTIONS.map((q) => [q.id, q]));

export function findQuestion(id: string): StoredQuestion | undefined {
  return BY_ID.get(id);
}

/**
 * A short fingerprint of a question's wording and answers. Reports are tied to it, so once a
 * reported question is fixed, the old reports no longer count against it.
 */
export function questionVersion(q: Pick<StoredQuestion, "prompt" | "choices">): string {
  let hash = 0x811c9dc5;
  for (const char of JSON.stringify([q.prompt, q.choices])) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export interface QuestionSeen {
  /** How many of the players have seen it. */
  players: number;
  /** When the most recent of them saw it. */
  lastSeenAt: number;
}

export interface DrawOptions {
  /** Question IDs this room used, newest first. */
  recent?: readonly string[];
  /** The players' own history. */
  seen?: ReadonlyMap<string, QuestionSeen>;
  /** Questions taken out of play, e.g. after reports. */
  retired?: ReadonlySet<string>;
}

/**
 * Puts the least used items first: ones this room hasn't used and none of the players has seen,
 * then ones fewer players have seen, then the ones seen longest ago. Ties are broken by the seed.
 */
function leastUsed<T extends { id: string }>(
  pool: readonly T[],
  rng: () => number,
  options: DrawOptions,
): T[] {
  const recent = new Map((options.recent ?? []).map((id, i, all) => [id, all.length - i]));
  return shuffled(
    pool.filter((item) => !options.retired?.has(item.id)),
    rng,
  )
    .map((item) => {
      const seen = options.seen?.get(item.id);
      // Higher is worse: used in this room lately, seen by more players, seen more recently.
      return { item, key: [recent.get(item.id) ?? 0, seen?.players ?? 0, seen?.lastSeenAt ?? 0] };
    })
    .sort((a, b) => a.key[0]! - b.key[0]! || a.key[1]! - b.key[1]! || a.key[2]! - b.key[2]!)
    .map((r) => r.item);
}

/** Picks a game's questions, avoiding repeats as far as the bank allows, in a shuffled order. */
export function drawQuestions(
  category: QuizCategory,
  difficulty: QuizDifficulty,
  count: number,
  seed: number,
  options: DrawOptions = {},
  questions: readonly StoredQuestion[] = QUESTIONS,
): StoredQuestion[] {
  const rng = seededRng(seed);
  const pool = questions.filter((q) => q.category === category && q.difficulty === difficulty);
  return shuffled(leastUsed(pool, rng, options).slice(0, count), rng);
}

/** Where to borrow from when a level runs out: the nearest level first, the one below on a tie. */
const BORROW: Record<QuizDifficulty, QuizDifficulty[]> = {
  easy: ["medium", "hard"],
  medium: ["easy", "hard"],
  hard: ["medium", "easy"],
};

/**
 * One item per entry in `levels`, at that level, in that order, the least used first. A level
 * that runs out borrows from the nearest one, so a long game still gets enough and nothing
 * repeats within it. Only when every level has run out does the game get fewer.
 */
function drawByLevel<T extends { id: string }>(
  items: readonly T[],
  levelOf: (item: T) => QuizDifficulty,
  levels: readonly QuizDifficulty[],
  seed: number,
  options: DrawOptions,
): T[] {
  const rng = seededRng(seed);
  const queues = new Map<QuizDifficulty, T[]>();
  const queue = (level: QuizDifficulty) => {
    if (!queues.has(level)) {
      queues.set(
        level,
        leastUsed(
          items.filter((item) => levelOf(item) === level),
          rng,
          options,
        ),
      );
    }
    return queues.get(level)!;
  };
  return levels.flatMap((level) => {
    const from = [level, ...BORROW[level]].find((l) => queue(l).length > 0);
    return from ? [queue(from).shift()!] : [];
  });
}

/**
 * A game's questions for a level plan, in the plan's order, so an Auto game gets harder as it
 * goes. A level that runs out borrows from the nearest one.
 */
export function drawQuestionPlan(
  category: QuizCategory,
  levels: readonly QuizDifficulty[],
  seed: number,
  options: DrawOptions = {},
  questions: readonly StoredQuestion[] = QUESTIONS,
): StoredQuestion[] {
  const pool = questions.filter((q) => q.category === category);
  return drawByLevel(pool, (q) => q.difficulty, levels, seed, options);
}

/** Picks one Word Rush word per round, at that round's level, avoiding repeats the same way. */
export function drawWords(
  levels: readonly WordLevel[],
  seed: number,
  options: DrawOptions = {},
  words: readonly StoredWord[] = WORDS,
): StoredWord[] {
  return drawByLevel(words, (w) => w.level, levels, seed, options);
}

/**
 * Connections puzzles at the level asked for, the least used ones, as with questions: one for a
 * race, or one per round for Elimination, all different.
 */
export function drawConnections(
  level: Level,
  seed: number,
  options: DrawOptions = {},
  puzzles: readonly StoredConnections[] = CONNECTIONS,
  count = 1,
): ConnectionsPuzzle[] {
  const pool = puzzles.filter((p) => p.level === level);
  return leastUsed(pool.length > 0 ? pool : puzzles, seededRng(seed), options).slice(0, count);
}

/** `questions` is the bank to draw from: the one that ships, or it with admin edits applied. */
export function drawContent(
  request: ContentRequest,
  seed: number,
  options: DrawOptions = {},
  questions: readonly StoredQuestion[] = QUESTIONS,
): unknown[] {
  switch (request.kind) {
    case "quiz-questions":
      return drawQuestionPlan(request.category, request.levels, seed, options, questions);
    case "jigsaw-picture": {
      const picture = pickJigsawPicture(request, seed, options.recent);
      return [{ id: jigsawContentId(picture.id), picture }];
    }
    case "words":
      return drawWords(request.levels, seed, options);
    case "connections-puzzle":
      return drawConnections(request.level, seed, options, CONNECTIONS, request.count ?? 1);
  }
}
