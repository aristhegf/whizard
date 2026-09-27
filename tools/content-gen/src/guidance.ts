import type { QuizCategory, QuizDifficulty } from "@whizard/game-core";

interface CategoryGuidance {
  name: string;
  cover: string;
  avoid: string;
}

const STALE =
  "anything current or recent (current holders, champions, owners, records that could be broken, rankings, 'latest' anything)";

export const CATEGORY_GUIDANCE: Record<QuizCategory, CategoryGuidance> = {
  bible: {
    name: "Bible",
    cover:
      "stories, people, places and teachings across the Old and New Testaments, roughly 60/40, with a verse reference for every question",
    avoid:
      "anything that depends on the translation (numbers or wording that differ between KJV, NIV and ESV), anything denominational or disputed, and details found only in tradition",
  },
  geography: {
    name: "Geography",
    cover:
      "capitals, countries and continents, rivers, lakes, mountains, deserts, oceans, islands, borders, landmarks, map knowledge, with a fair share of Africa and Nigeria",
    avoid:
      "population figures or rankings, 'largest city' claims, disputed territories or capitals, recently renamed places",
  },
  history: {
    name: "History",
    cover:
      "ancient civilisations, empires, world wars, revolutions, explorers, inventions and firsts, independence movements, the Cold War, and African and Nigerian history",
    avoid:
      "contested interpretations, disputed numbers such as death tolls, anything after 2020, anything still politically contested",
  },
  science: {
    name: "Science",
    cover:
      "physics, chemistry, biology, the human body, earth science, space, famous scientists and discoveries, units",
    avoid:
      "facts that change with new discoveries (numbers of moons, 'largest known' objects), figures where sources disagree",
  },
  animals: {
    name: "Animals",
    cover:
      "mammals, birds, reptiles, fish, insects, sea life, animal groups and young, habitats, diets, firmly established record-holders, African wildlife",
    avoid:
      "exact lifespans, speeds or weights where sources disagree, popular myths, conservation status",
  },
  football: {
    name: "Football",
    cover:
      "World Cup and continental competition history, legendary players and their nationalities, famous clubs and their cities or stadiums, the rules, Nigerian football",
    avoid: `${STALE}, and nothing after early 2024`,
  },
  movies: {
    name: "Movies",
    cover:
      "famous films and directors, iconic characters and actors, animation, franchises, Best Picture history, film firsts, Nollywood",
    avoid: `${STALE}, box-office rankings, uncertain or commonly misquoted lines, and nothing after 2023`,
  },
  music: {
    name: "Music",
    cover:
      "artists, bands, songs and albums, instruments, music terms, classical composers, genres, African and Nigerian music from Afrobeat and highlife to Afrobeats and gospel",
    avoid: `${STALE}, chart positions, streaming numbers, disputed songwriting credits, and nothing after 2023`,
  },
  "nigerian-culture": {
    name: "Nigerian culture",
    cover:
      "languages and peoples, states and capitals, food, festivals, attire and crafts, national symbols, landmarks, literature, Nollywood, music, history",
    avoid:
      "current office holders, population figures, contested ethnic or religious claims, politically sensitive topics",
  },
  "general-knowledge": {
    name: "General knowledge",
    cover:
      "classic quiz trivia: language, numbers, everyday science, inventions, art, literature, flags described in words, calendars, food origins, sports rules, mythology",
    avoid: `${STALE}, prices`,
  },
  "pop-culture": {
    name: "Pop culture",
    cover:
      "TV shows and characters, cartoons, video games and consoles, toys and brands, superheroes, internet history, reality TV history, African and Nigerian pop culture",
    avoid: `${STALE}, relationships, follower counts, and nothing after 2023`,
  },
};

export const LEVEL_GUIDANCE: Record<QuizDifficulty, string> = {
  easy: "most adults know it",
  medium: "someone who enjoys the subject knows it",
  hard: "a real fan of the subject might still miss it",
};
