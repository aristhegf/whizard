// Builds src/words/words.json from src/words/source.txt.
// For each word it works out the other dictionary words made of the same letters, accepted when
// unscrambling, and which letters to hide for a missing-letters puzzle: as many as the level asks
// for while few other words fit, with the words that do fit accepted too.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const dictionary = require("an-array-of-english-words");
const here = new URL("../src/words/", import.meta.url);

const LEVELS = { easy: 2, medium: 3, hard: 4 };
/** More words than this fitting a pattern makes it a guessing game, so hide fewer letters. */
const MAX_FITS = 2;

const entries = readFileSync(new URL("source.txt", here), "utf8")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"))
  .map((line) => {
    const [level, hint, word] = line.split("|").map((part) => part.trim());
    if (!(level in LEVELS) || !hint || !/^[A-Z]+$/.test(word ?? "")) {
      throw new Error(`Bad line: ${line}`);
    }
    return { level, hint, word };
  });

const byLength = new Map();
for (const word of [...dictionary.map((w) => w.toUpperCase()), ...entries.map((e) => e.word)]) {
  if (!/^[A-Z]+$/.test(word)) continue;
  const list = byLength.get(word.length) ?? new Set();
  list.add(word);
  byLength.set(word.length, list);
}

const sorted = (word) => [...word].sort().join("");

function combinations(items, k) {
  if (k === 0) return [[]];
  const out = [];
  items.forEach((item, i) => {
    for (const rest of combinations(items.slice(i + 1), k - 1)) out.push([item, ...rest]);
  });
  return out;
}

/** Hidden letters spread out read better than a run of blanks, and the first letter stays. */
function gapsFor(word, level) {
  const others = [...byLength.get(word.length)].filter((w) => w !== word);
  const positions = [...word].map((_, i) => i).slice(1);
  let best = null;
  for (let k = Math.min(LEVELS[level], Math.floor(word.length / 2)); k >= 1; k--) {
    best = null;
    for (const gaps of combinations(positions, k)) {
      const fits = others.filter((other) =>
        [...other].every((letter, i) => gaps.includes(i) || letter === word[i]),
      );
      const adjacent = gaps.filter((g, i) => i > 0 && g - gaps[i - 1] === 1).length;
      const spread = Math.abs(gaps.reduce((a, b) => a + b, 0) / k - (word.length - 1) / 2);
      // Other words that fit are accepted too, so a spread of blanks beats a run of them.
      const key = [fits.length > MAX_FITS ? 1 : 0, adjacent, fits.length, spread];
      if (!best || compare(key, best.key) < 0) best = { key, gaps, fits };
    }
    // Hiding fewer letters can only leave fewer words that fit.
    if (best.fits.length <= MAX_FITS) break;
  }
  return { gaps: best.gaps, fits: best.fits.sort() };
}

function compare(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

const seen = new Set();
const words = entries.map((entry, i) => {
  if (seen.has(entry.word)) throw new Error(`Listed twice: ${entry.word}`);
  seen.add(entry.word);
  const key = sorted(entry.word);
  const also = [...byLength.get(entry.word.length)]
    .filter((w) => w !== entry.word && sorted(w) === key)
    .sort();
  return {
    id: `word-${String(i + 1).padStart(3, "0")}`,
    level: entry.level,
    hint: entry.hint,
    word: entry.word,
    also,
    ...gapsFor(entry.word, entry.level),
  };
});

writeFileSync(new URL("words.json", here), `${JSON.stringify(words, null, 2)}\n`);
console.log(`Wrote ${words.length} words.`);
