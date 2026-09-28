// Server-only: this package contains the answers, so the web app must never import it.
import {
  jigsawContentId,
  pickJigsawPicture,
  seededRng,
  shuffled,
  type ContentRequest,
  type QuizCategory,
  type QuizDifficulty,
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
import science from "./questions/science.json";
import { storedQuestionSchema, type StoredQuestion } from "./schema";

export * from "./quality";
export * from "./schema";

/** One file per category. They ship with the Worker until reports and history need D1. */
export const QUESTION_FILES: Record<QuizCategory, unknown> = {
  bible,
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
 * Picks a game's questions, avoiding repeats as far as the bank allows: first questions this
 * room hasn't used and none of the players has seen, then ones fewer players have seen, then
 * the ones seen longest ago. Ties are broken by the seed, and the chosen set is shuffled.
 */
export function drawQuestions(
  category: QuizCategory,
  difficulty: QuizDifficulty,
  count: number,
  seed: number,
  options: DrawOptions = {},
  questions: readonly StoredQuestion[] = QUESTIONS,
): StoredQuestion[] {
  const rng = seededRng(seed);
  const recent = new Map((options.recent ?? []).map((id, i, all) => [id, all.length - i]));
  const pool = questions
    .filter((q) => q.category === category && q.difficulty === difficulty)
    .filter((q) => !options.retired?.has(q.id));
  const ranked = shuffled(pool, rng)
    .map((q) => {
      const seen = options.seen?.get(q.id);
      // Higher is worse: used in this room lately, seen by more players, seen more recently.
      return { q, key: [recent.get(q.id) ?? 0, seen?.players ?? 0, seen?.lastSeenAt ?? 0] };
    })
    .sort((a, b) => a.key[0]! - b.key[0]! || a.key[1]! - b.key[1]! || a.key[2]! - b.key[2]!);
  return shuffled(
    ranked.slice(0, count).map((r) => r.q),
    rng,
  );
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
      return drawQuestions(
        request.category,
        request.difficulty,
        request.count,
        seed,
        options,
        questions,
      );
    case "jigsaw-picture": {
      const picture = pickJigsawPicture(request, seed, options.recent);
      return [{ id: jigsawContentId(picture.id), picture }];
    }
  }
}
