import type { GameId } from "@whizard/game-core";
import type { IconName } from "./ui/Icon";

export type GameGroup = "knowledge" | "skill" | "puzzle" | "social" | "couples";

/** The kinds of game on the Play screen, each with its chip's icon. */
export const GAME_GROUPS: { id: GameGroup | "all"; name: string; icon: IconName | null }[] = [
  { id: "all", name: "All", icon: null },
  { id: "knowledge", name: "Knowledge", icon: "bulb" },
  { id: "skill", name: "Skill", icon: "bolt" },
  { id: "puzzle", name: "Puzzle", icon: "puzzle" },
  { id: "social", name: "Social", icon: "users" },
  { id: "couples", name: "Couples", icon: "heart" },
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
    players: "1-20 players",
    groups: ["knowledge", "social"],
    art: "/art/games/quiz.webp",
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
    colors: ["#ffb52c", "#3d1a6e"],
    href: "/games/jigsaw",
  },
  {
    id: "word-rush",
    name: "Word Rush",
    description: "Unscramble and fill in words fast",
    players: "1-20 players",
    groups: ["knowledge", "skill"],
    art: "/art/games/word-rush.webp",
    colors: ["#6b45ff", "#23145a"],
    href: null,
    starts: "word-rush",
  },
  {
    id: "memory",
    name: "Memory",
    description: "Remember, match and win",
    players: "1-12 players",
    groups: ["puzzle"],
    art: "/art/games/memory.webp",
    colors: ["#15b58c", "#0b2a3c"],
    href: null,
    starts: "memory",
  },
  {
    id: "logic",
    name: "Logic",
    description: "Crack the grid with clues and clear thinking",
    players: "1-20 players",
    groups: ["puzzle"],
    art: "/art/games/logic.webp",
    colors: ["#1aa6ff", "#0c1d5c"],
    href: null,
    starts: "logic",
  },
  {
    id: "connections",
    name: "Connections",
    description: "Find the four groups hiding in sixteen words",
    players: "1-20 players",
    groups: ["knowledge", "puzzle"],
    art: "/art/games/connections.webp",
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
    colors: ["#2f78ff", "#101c5e"],
    href: null,
    starts: "reaction",
  },
  {
    id: "spot-it",
    name: "Spot It",
    description: "Spot the odd one out before time runs out",
    players: "1-20 players",
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
    players: "3-20 players",
    groups: ["social"],
    art: "/art/games/most-likely-to.webp",
    colors: ["#ff4545", "#4a0c26"],
    href: null,
  },
  {
    id: "how-well",
    name: "How Well Do You Know Me?",
    description: "Find out who really knows you",
    players: "3-20 players",
    groups: ["social", "couples"],
    art: "/art/games/how-well.webp",
    colors: ["#a347ff", "#2d0d5c"],
    href: null,
  },
  {
    id: "impostor",
    name: "Impostor",
    description: "Find the impostor before it’s too late",
    players: "4-12 players",
    groups: ["social"],
    art: "/art/games/impostor.webp",
    colors: ["#5b3cf0", "#171456"],
    href: null,
  },
];

export const cardWash = ([top, bottom]: [string, string]) =>
  `linear-gradient(165deg, ${top} 0%, color-mix(in oklab, ${top} 55%, ${bottom}) 45%, ${bottom} 100%)`;
