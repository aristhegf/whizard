import { z } from "zod";
import { LEVEL_CHOICES, type LevelChoice } from "../levels";

/**
 * The twelve topics that ship with the game: the fallback catalogue when D1 can't be read, and
 * the art/colour defaults for every topic.
 */
export const QUIZ_CATEGORIES = [
  {
    id: "bible",
    name: "Bible",
    tagline: "Stories, verses and wisdom",
    colors: ["#ffb52c", "#5a2014"],
    art: "/art/topics/bible.webp",
  },
  {
    id: "quran",
    name: "Quran",
    tagline: "Surahs, verses and teachings",
    colors: ["#25c08c", "#053b33"],
    art: "/art/topics/quran.svg",
  },
  {
    id: "geography",
    name: "Geography",
    tagline: "Places, maps and landmarks",
    colors: ["#26c15f", "#023c3c"],
    art: "/art/topics/geography.webp",
  },
  {
    id: "history",
    name: "History",
    tagline: "Moments that shaped the world",
    colors: ["#ff4b3e", "#6a0b34"],
    art: "/art/topics/history.webp",
  },
  {
    id: "science",
    name: "Science",
    tagline: "How the world works",
    colors: ["#1f9dff", "#062585"],
    art: "/art/topics/science.webp",
  },
  {
    id: "animals",
    name: "Animals",
    tagline: "Wildlife from every habitat",
    colors: ["#f2a93b", "#3f2a0a"],
    art: "/art/topics/animals.svg",
  },
  {
    id: "football",
    name: "Football",
    tagline: "Clubs, players and the beautiful game",
    colors: ["#ff8a1f", "#6b1228"],
    art: "/art/topics/football.webp",
  },
  {
    id: "movies",
    name: "Movies",
    tagline: "Film, screen and cinema",
    colors: ["#8f3cff", "#2a0580"],
    art: "/art/topics/movies.webp",
  },
  {
    id: "music",
    name: "Music",
    tagline: "Artists, genres and songs",
    colors: ["#de45ff", "#5e0480"],
    art: "/art/topics/music.webp",
  },
  {
    id: "nigerian-culture",
    name: "Nigerian culture",
    tagline: "Language, food and tradition",
    colors: ["#2fc44a", "#012e2e"],
    art: "/art/topics/nigerian-culture.webp",
  },
  {
    id: "general-knowledge",
    name: "General knowledge",
    tagline: "A bit of everything",
    colors: ["#1aa6ff", "#1015a8"],
    art: "/art/topics/general-knowledge.webp",
  },
  {
    id: "pop-culture",
    name: "Pop culture",
    tagline: "TV, trends and celebrities",
    colors: ["#22b4ff", "#0232a3"],
    art: "/art/topics/pop-culture.webp",
  },
] as const;

/** One of the twelve ids that ship with the game — for maps that are genuinely shipped-only. */
export type ShippedTopicId = (typeof QUIZ_CATEGORIES)[number]["id"];

/** A live topic id: D1 owns the catalogue, so a topic can be one admins added since launch. */
export type QuizCategory = string;

/** Colours a brand-new topic gets until its admin picks their own. */
export const DEFAULT_TOPIC_COLORS = ["#6d5bff", "#1a1747"] as const;

/** A topic id's shape. Membership of the live catalogue is checked server-side, not here. */
export const topicIdSchema = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "Pick a topic.");

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
  category: topicIdSchema,
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
