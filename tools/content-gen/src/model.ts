import type { QuizCategory, QuizDifficulty } from "@whizard/game-core";

export interface WriteRequest {
  category: QuizCategory;
  difficulty: QuizDifficulty;
  count: number;
  /** Prompts already in the bank for this category, so the model steers away from them. */
  avoid: string[];
}

export interface Draft {
  topic: string;
  prompt: string;
  answer: string;
  wrong: string[];
  explanation: string;
  reference: string | null;
}

export interface CheckItem {
  id: string;
  prompt: string;
  /** Shuffled, so the checker can't tell which is the intended answer. */
  choices: string[];
}

export interface Verdict {
  id: string;
  /** Index into the item's choices. */
  choice: number;
  confident: boolean;
  /** Empty when the question is sound. */
  problem: string;
}

/** The two model calls the pipeline needs, kept separate so tests can supply a fake. */
export interface QuestionModel {
  write(request: WriteRequest): Promise<Draft[]>;
  /** Answers each question independently, without being told the intended answer. */
  check(items: CheckItem[], category: QuizCategory): Promise<Verdict[]>;
}
