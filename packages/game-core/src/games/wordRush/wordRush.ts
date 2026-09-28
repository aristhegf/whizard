import { z } from "zod";
import { shuffled, type Rng } from "../../random";
import {
  roundsGame,
  type RoundsKnockoutState,
  type RoundsKnockoutView,
  type RoundsState,
  type RoundsView,
} from "../rounds/rounds";
import {
  DEFAULT_WORD_RUSH_SETTINGS,
  levelsFor,
  wordRushSettingsSchema,
  type WordEntry,
  type WordLevel,
  type WordRushSettings,
} from "./settings";

export const WORD_POINTS: Record<WordLevel, number> = { easy: 1000, medium: 1250, hard: 1500 };
/** Wrong words allowed before the round is lost. */
export const WORD_RUSH_MAX_MISSES = 5;
export const GUESS_MAX_LENGTH = 20;

export interface WordPuzzle {
  id: string;
  level: WordLevel;
  hint: string;
  word: string;
  /** Every word that counts. */
  accepted: string[];
  type: "unscramble" | "missing";
  /** Unscramble: the letters in their shuffled order. */
  letters: string[];
  /** Missing letters: the word with null where a letter is hidden. */
  pattern: (string | null)[];
}

export type WordPuzzleView =
  | { type: "unscramble"; hint: string; level: WordLevel; letters: string[] }
  | { type: "missing"; hint: string; level: WordLevel; pattern: (string | null)[] };

export interface WordReveal {
  word: string;
  hint: string;
}

export type WordRushSpeedState = RoundsState<WordRushSettings, WordPuzzle, string>;
export type WordRushEliminationState = RoundsKnockoutState<WordRushSettings, WordPuzzle, string>;
export type WordRushState = WordRushSpeedState | WordRushEliminationState;
export type WordRushSpeedView = RoundsView<"word-rush", WordPuzzleView, string, WordReveal>;
export type WordRushEliminationView = RoundsKnockoutView<
  "word-rush",
  WordPuzzleView,
  string,
  WordReveal
>;
export type WordRushView = WordRushSpeedView | WordRushEliminationView;

export const normalizeGuess = (guess: string) => guess.toUpperCase().replace(/[^A-Z]/g, "");

/** Shuffles until the letters don't already spell a word that counts. */
function scramble(word: string, accepted: readonly string[], rng: Rng): string[] {
  for (let i = 0; i < 20; i++) {
    const letters = shuffled([...word], rng);
    if (!accepted.includes(letters.join(""))) return letters;
  }
  // Every order spells a word only for words like "AA"; reversing is as good as it gets.
  return [...word].reverse();
}

export function wordPuzzle(entry: WordEntry, rng: Rng): WordPuzzle {
  const type = entry.gaps.length > 0 && rng() < 0.5 ? "missing" : "unscramble";
  const accepted = [entry.word, ...(type === "missing" ? entry.fits : entry.also)];
  return {
    id: entry.id,
    level: entry.level,
    hint: entry.hint,
    word: entry.word,
    accepted,
    type,
    letters: type === "unscramble" ? scramble(entry.word, accepted, rng) : [],
    pattern: [...entry.word].map((letter, i) => (entry.gaps.includes(i) ? null : letter)),
  };
}

export const wordRushGame = roundsGame({
  id: "word-rush",
  name: "Word Rush",
  maxPlayers: 20,
  settingsSchema: wordRushSettingsSchema,
  defaultSettings: DEFAULT_WORD_RUSH_SETTINGS,
  guessSchema: z.string().min(1).max(GUESS_MAX_LENGTH),
  maxMisses: WORD_RUSH_MAX_MISSES,
  contentNeeded: (settings: WordRushSettings, players: number) => ({
    kind: "words",
    levels: levelsFor(settings, players),
  }),
  puzzles: (_settings, content: WordEntry[], rng) => content.map((entry) => wordPuzzle(entry, rng)),
  points: (puzzle: WordPuzzle) => WORD_POINTS[puzzle.level],
  normalize: normalizeGuess,
  check(puzzle, word) {
    if (word.length !== puzzle.word.length) {
      return { rejected: `The word has ${puzzle.word.length} letters.` };
    }
    if (puzzle.type === "missing" && puzzle.pattern.some((l, i) => l !== null && l !== word[i])) {
      return { rejected: "Keep the letters that are shown." };
    }
    if (
      puzzle.type === "unscramble" &&
      [...word].sort().join("") !== [...puzzle.word].sort().join("")
    ) {
      return { rejected: "Use only the letters shown." };
    }
    return puzzle.accepted.includes(word);
  },
  puzzleView: (puzzle): WordPuzzleView =>
    puzzle.type === "unscramble"
      ? { type: "unscramble", hint: puzzle.hint, level: puzzle.level, letters: puzzle.letters }
      : { type: "missing", hint: puzzle.hint, level: puzzle.level, pattern: puzzle.pattern },
  reveal: (puzzle): WordReveal => ({ word: puzzle.word, hint: puzzle.hint }),
});
