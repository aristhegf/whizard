import type { GameId } from "@whizard/game-core";
import type { IconName } from "./ui/Icon";

export type GameGroup = "quiz" | "brain" | "skill" | "puzzle" | "party" | "couples";

/** The kinds of game on the Play screen, each with its chip's icon. */
export const GAME_GROUPS: { id: GameGroup | "all"; name: string; icon: IconName | null }[] = [
  { id: "all", name: "All", icon: null },
  { id: "quiz", name: "Quiz", icon: "bulb" },
  { id: "brain", name: "Brain Games", icon: "bulb" },
  { id: "puzzle", name: "Puzzles", icon: "puzzle" },
  { id: "skill", name: "Word & Skill", icon: "bolt" },
  { id: "party", name: "Party & Social", icon: "users" },
  { id: "couples", name: "Couples", icon: "heart" },
];

export interface CatalogGame {
  id: string;
  name: string;
  description: string;
  players: string;
  /**
   * Categories for discovery. The first group is the primary category; an optional
   * second group is a secondary category. Keep this list to at most two entries.
   */
  groups: [GameGroup] | [GameGroup, GameGroup];
  art: string;
  /** The glyph on the card's badge. */
  icon: IconName;
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
    players: "1-20 players",
    groups: ["quiz", "party"],
    art: "/art/games/quiz.webp",
    icon: "help",
    colors: ["#ff8c1a", "#4a1530"],
    href: "/games/quiz",
  },
  {
    id: "jigsaw",
    name: "Jigsaw",
    description: "Race to put the picture back together",
    players: "1-20 players",
    groups: ["puzzle"],
    art: "/art/games/jigsaw.webp",
    icon: "puzzle",
    colors: ["#ffb52c", "#3d1a6e"],
    href: "/games/jigsaw",
  },
  {
    id: "word-rush",
    name: "Word Rush",
    description: "Unscramble and fill in words fast",
    players: "1-20 players",
    groups: ["skill"],
    art: "/art/games/word-rush.webp",
    icon: "letters",
    colors: ["#6b45ff", "#23145a"],
    href: null,
    starts: "word-rush",
  },
  {
    id: "memory",
    name: "Memory",
    description: "Remember, match and win",
    players: "1-12 players",
    groups: ["skill", "puzzle"],
    art: "/art/games/memory.webp",
    icon: "star",
    colors: ["#15b58c", "#0b2a3c"],
    href: null,
    starts: "memory",
  },
  {
    id: "logic",
    name: "Logic",
    description: "Crack the grid with clues and clear thinking",
    players: "1-20 players",
    groups: ["puzzle", "brain"],
    art: "/art/games/logic.webp",
    icon: "grid",
    colors: ["#1aa6ff", "#0c1d5c"],
    href: null,
    starts: "logic",
  },
  {
    id: "connections",
    name: "Connections",
    description: "Find the four groups hiding in sixteen words",
    players: "1-20 players",
    groups: ["puzzle", "brain"],
    art: "/art/games/connections.webp",
    icon: "link2",
    colors: ["#b05bff", "#2a0f5c"],
    href: null,
    starts: "connections",
  },
  {
    id: "reaction",
    name: "Reaction",
    description: "Be the fastest. Sharp eyes, quick fingers.",
    players: "1-20 players",
    groups: ["skill"],
    art: "/art/games/reaction.webp",
    icon: "bolt",
    colors: ["#2f78ff", "#101c5e"],
    href: null,
    starts: "reaction",
  },
  {
    id: "spot-it",
    name: "Spot It",
    description: "Spot the odd one out before time runs out",
    players: "1-20 players",
    groups: ["skill", "puzzle"],
    art: "/art/games/spot-it.webp",
    icon: "search",
    colors: ["#3ccc45", "#0d3230"],
    href: null,
    starts: "spot-it",
  },
  {
    id: "most-likely-to",
    name: "Most Likely To",
    description: "Hilarious questions about your group",
    players: "3-20 players",
    groups: ["party"],
    art: "/art/games/most-likely-to.webp",
    icon: "users",
    colors: ["#ff4545", "#4a0c26"],
    href: null,
  },
  {
    id: "how-well",
    name: "How Well Do You Know Me?",
    description: "Find out who really knows you",
    players: "2-20 players",
    groups: ["couples", "party"],
    art: "/art/games/how-well.webp",
    icon: "heart",
    colors: ["#a347ff", "#2d0d5c"],
    href: null,
    starts: "how-well",
  },
  {
    id: "impostor",
    name: "Impostor",
    description: "Find the impostor before it’s too late",
    players: "4-12 players",
    groups: ["party"],
    art: "/art/games/impostor.webp",
    icon: "shield",
    colors: ["#5b3cf0", "#171456"],
    href: null,
  },
];

export const cardWash = ([top, bottom]: [string, string]) =>
  `linear-gradient(165deg, ${top} 0%, color-mix(in oklab, ${top} 55%, ${bottom}) 45%, ${bottom} 100%)`;
