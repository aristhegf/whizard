import { z } from "zod";
import { LEVEL_CHOICES, type LevelChoice } from "../levels";

export const QUIZ_CATEGORIES = [
  { id: "bible", name: "Bible" },
  { id: "quran", name: "Quran" },
  { id: "geography", name: "Geography" },
  { id: "history", name: "History" },
  { id: "science", name: "Science" },
  { id: "animals", name: "Animals" },
  { id: "football", name: "Football" },
  { id: "movies", name: "Movies" },
  { id: "music", name: "Music" },
  { id: "nigerian-culture", name: "Nigerian culture" },
  { id: "general-knowledge", name: "General knowledge" },
  { id: "pop-culture", name: "Pop culture" },
] as const;

export type QuizCategory = (typeof QUIZ_CATEGORIES)[number]["id"];

export const QUIZ_DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type QuizDifficulty = (typeof QUIZ_DIFFICULTIES)[number];
/** What the host picks: one level, or Auto, which starts easy and gets harder. */
export type QuizLevel = LevelChoice;

export const QUIZ_VARIANTS = [
  { id: "classic", name: "Classic", description: "No clock. Answer, then move on." },
  {
    id: "speed",
    name: "Speed",
    description: "A timer on every question. Faster answers score more.",
  },
  {
    id: "elimination",
    name: "Elimination",
    description:
      "Everyone answers together. The lowest scores are knocked out each round until two meet in the final. 3 or more players.",
  },
] as const;
export type QuizVariant = (typeof QUIZ_VARIANTS)[number]["id"];

export const QUIZ_QUESTION_COUNTS = [5, 10, 15, 20] as const;
export const QUIZ_TIME_LIMITS_SECONDS = [10, 20, 30] as const;

export const quizSettingsSchema = z.object({
  category: z.enum(QUIZ_CATEGORIES.map((c) => c.id) as [QuizCategory, ...QuizCategory[]]),
  difficulty: z.enum(LEVEL_CHOICES),
  count: z.literal(QUIZ_QUESTION_COUNTS),
  variant: z.enum(QUIZ_VARIANTS.map((v) => v.id) as [QuizVariant, ...QuizVariant[]]),
  /** Speed and Elimination. */
  timeLimitSeconds: z.literal(QUIZ_TIME_LIMITS_SECONDS),
});

export type QuizSettings = z.infer<typeof quizSettingsSchema>;

export const DEFAULT_QUIZ_SETTINGS: QuizSettings = {
  category: "bible",
  difficulty: "easy",
  count: 10,
  variant: "classic",
  timeLimitSeconds: 20,
};

/** One question per entry in `levels`, at that level, in that order. */
export interface QuizContentRequest {
  kind: "quiz-questions";
  category: QuizCategory;
  levels: QuizDifficulty[];
}

/** A question as stored in the content bank. `choices[0]` is the correct answer. */
export interface QuizQuestion {
  id: string;
  prompt: string;
  choices: string[];
  difficulty?: QuizDifficulty;
  explanation?: string | null;
  reference?: string | null;
}
