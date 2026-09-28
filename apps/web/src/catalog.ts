import type { GameId, QuizCategory } from "@whizard/game-core";

export type GameGroup = "quiz" | "word" | "puzzle" | "skill" | "social" | "party" | "couples";

export const GAME_GROUPS: { id: GameGroup | "all"; name: string }[] = [
  { id: "all", name: "All Games" },
  { id: "quiz", name: "Quiz" },
  { id: "word", name: "Word" },
  { id: "puzzle", name: "Puzzle" },
  { id: "skill", name: "Skill" },
  { id: "social", name: "Social" },
  { id: "party", name: "Party" },
  { id: "couples", name: "Couples" },
];

export interface CatalogGame {
  id: string;
  name: string;
  description: string;
  players: string;
  groups: GameGroup[];
  art: string;
  /** Top and bottom of the card's colour wash. */
  colors: [string, string];
  /** Where the card goes, or null if it opens a room straight away or is still being made. */
  href: string | null;
  /** The game a room opens with, for games without a page of their own. */
  starts?: GameId;
}

/** Whether people can play it yet. */
export const isPlayable = (game: CatalogGame) => game.href !== null || !!game.starts;

export const CATALOG: CatalogGame[] = [
  {
    id: "quiz",
    name: "Quiz",
    description: "Test your knowledge across fun topics",
    players: "1–20 players",
    groups: ["quiz"],
    art: "/art/games/quiz.webp",
    colors: ["#ff8c1a", "#4a1530"],
    href: "/games/quiz",
  },
  {
    id: "word-rush",
    name: "Word Rush",
    description: "Unscramble and fill in words fast",
    players: "1–20 players",
    groups: ["word"],
    art: "/art/games/word-rush.webp",
    colors: ["#6b45ff", "#23145a"],
    href: null,
    starts: "word-rush",
  },
  {
    id: "memory",
    name: "Memory",
    description: "Remember, match and win",
    players: "2–12 players",
    groups: ["puzzle"],
    art: "/art/games/memory.webp",
    colors: ["#15b58c", "#0b2a3c"],
    href: null,
  },
  {
    id: "reaction",
    name: "Reaction",
    description: "Be the fastest. Sharp eyes, quick fingers.",
    players: "2–20 players",
    groups: ["skill"],
    art: "/art/games/reaction.webp",
    colors: ["#2f78ff", "#101c5e"],
    href: null,
  },
  {
    id: "spot-it",
    name: "Spot It",
    description: "Spot the odd one out before time runs out",
    players: "1–20 players",
    groups: ["puzzle", "skill"],
    art: "/art/games/spot-it.webp",
    colors: ["#3ccc45", "#0d3230"],
    href: null,
    starts: "spot-it",
  },
  {
    id: "most-likely-to",
    name: "Most Likely To",
    description: "Hilarious questions about your group",
    players: "3–20 players",
    groups: ["social", "party"],
    art: "/art/games/most-likely-to.webp",
    colors: ["#ff4545", "#4a0c26"],
    href: null,
  },
  {
    id: "how-well",
    name: "How Well Do You Know Me?",
    description: "Find out who really knows you",
    players: "3–20 players",
    groups: ["social", "couples"],
    art: "/art/games/how-well.webp",
    colors: ["#a347ff", "#2d0d5c"],
    href: null,
  },
  {
    id: "impostor",
    name: "Impostor",
    description: "Find the impostor before it’s too late",
    players: "4–12 players",
    groups: ["party"],
    art: "/art/games/impostor.webp",
    colors: ["#5b3cf0", "#171456"],
    href: null,
  },
];

export interface TopicStyle {
  art: string;
  /** Top and bottom of the tile's colour wash. */
  colors: [string, string];
  /** Shorter name for filter chips. */
  chip: string;
}

export const TOPIC_STYLES: Record<QuizCategory, TopicStyle> = {
  bible: { art: "/art/topics/bible.webp", colors: ["#ffb52c", "#5a2014"], chip: "Bible" },
  "general-knowledge": {
    art: "/art/topics/general-knowledge.webp",
    colors: ["#1aa6ff", "#1015a8"],
    chip: "General",
  },
  history: { art: "/art/topics/history.webp", colors: ["#ff4b3e", "#6a0b34"], chip: "History" },
  geography: {
    art: "/art/topics/geography.webp",
    colors: ["#26c15f", "#023c3c"],
    chip: "Geography",
  },
  science: { art: "/art/topics/science.webp", colors: ["#1f9dff", "#062585"], chip: "Science" },
  animals: { art: "/art/topics/animals.svg", colors: ["#f2a93b", "#3f2a0a"], chip: "Animals" },
  football: { art: "/art/topics/football.webp", colors: ["#ff8a1f", "#6b1228"], chip: "Football" },
  movies: { art: "/art/topics/movies.webp", colors: ["#8f3cff", "#2a0580"], chip: "Movies" },
  music: { art: "/art/topics/music.webp", colors: ["#de45ff", "#5e0480"], chip: "Music" },
  "nigerian-culture": {
    art: "/art/topics/nigerian-culture.webp",
    colors: ["#2fc44a", "#012e2e"],
    chip: "Nigerian Culture",
  },
  "pop-culture": {
    art: "/art/topics/pop-culture.webp",
    colors: ["#22b4ff", "#0232a3"],
    chip: "Pop Culture",
  },
};

export const cardWash = ([top, bottom]: [string, string]) =>
  `linear-gradient(165deg, ${top} 0%, color-mix(in oklab, ${top} 55%, ${bottom}) 45%, ${bottom} 100%)`;
