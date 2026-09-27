import { z } from "zod";

export const QUIZ_CATEGORIES = [
  { id: "bible", name: "Bible" },
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

export const QUIZ_VARIANTS = [
  {
    id: "classic",
    name: "Classic",
    description: "Everyone gets each question at the same moment.",
  },
  {
    id: "speed",
    name: "Speed Quiz",
    description: "Everyone races through the same questions at their own pace.",
  },
] as const;
export type QuizVariant = (typeof QUIZ_VARIANTS)[number]["id"];

export const QUIZ_QUESTION_COUNTS = [5, 10, 15, 20] as const;
export const QUIZ_TIME_LIMITS_SECONDS = [10, 20, 30] as const;

export const quizSettingsSchema = z.object({
  category: z.enum(QUIZ_CATEGORIES.map((c) => c.id) as [QuizCategory, ...QuizCategory[]]),
  difficulty: z.enum(QUIZ_DIFFICULTIES),
  count: z.literal(QUIZ_QUESTION_COUNTS),
  variant: z.enum(QUIZ_VARIANTS.map((v) => v.id) as [QuizVariant, ...QuizVariant[]]),
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

export interface QuizContentRequest {
  kind: "quiz-questions";
  category: QuizCategory;
  difficulty: QuizDifficulty;
  count: number;
}

/** A question as stored in the content bank. `choices[0]` is the correct answer. */
export interface QuizQuestion {
  id: string;
  prompt: string;
  choices: string[];
  explanation?: string | null;
  reference?: string | null;
}
