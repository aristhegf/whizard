# Games

Every game runs in the same room: one room code, the same lobby, the same live results. The host picks the game in the lobby. Games that work alone can be played solo: start with nobody else in the room. See [ARCHITECTURE.md](ARCHITECTURE.md#how-games-plug-in) for how a game plugs in.

## Playable now

### 🧠 Quiz

Everyone answers the same questions. This is the foundation game and has the biggest content library.

- **Categories:** Bible, Quran, Geography, History, Science, Animals, Football, Movies, Music, Nigerian culture, General knowledge, Pop culture
- **How it plays:** everyone starts together on the same questions, then plays at their own pace. The leaderboard shows points only, and each player reviews their own answers at the end (details in [ARCHITECTURE.md](ARCHITECTURE.md#quiz-launch-game))
- **Players:** 1 to 16. Play solo, or with friends
- **Modes:** Classic (no clock, points for right answers), Speed (a timer on every question, faster answers score more) and Elimination (knock-out rounds, 3 or more players; the number of questions is per round, and the final has as many)
- **Levels:** Easy, Medium, Hard, or Auto, which starts easy and gets harder, mixing the three
- **Settings:** mode, category, level (easy, medium, hard), number of questions, and time per question for Speed

### 🔤 Word Rush

Everyone gets the same words, with a hint for each: unscramble one (`O I L N`, an animal) or fill in its missing letters (`P A _ R _ T`). Easy words first, harder ones later.

- **How it plays:** own pace, like the quiz. Type the word or tap the letters; a wrong word shakes and costs a try (5 a round). Give up to see the word and move on
- **Players:** 1 to 20
- **Modes:** Speed (own pace) and Elimination (everyone on the same word, knock-outs until two meet in a final; 3 or more players). In Elimination the number of words is per round, and the final has as many
- **Levels:** Easy, Medium, Hard, or Auto, which starts easy and gets harder
- **Settings:** 5, 10 or 15 rounds; 20, 30 or 45 seconds a round
- **Points:** faster solves score more, less a little for each wrong try (details in [ARCHITECTURE.md](ARCHITECTURE.md#word-rush-and-spot-it))

### 🔎 Spot It

Find the one cell in the grid that's different: an emoji, a letter, a shade of colour or an arrow's angle. The grid grows from 4 by 4 to 7 by 7 and the difference gets subtler.

- **How it plays:** own pace. Tap the odd one out; a wrong tap costs a try (3 a round)
- **Players:** 1 to 20
- **Modes:** Speed and Elimination, as in Word Rush
- **Levels:** Easy, Medium, Hard, or Auto
- **Settings:** 5, 10 or 15 rounds; 15, 20 or 30 seconds a round
- **Grids** are made from the room's seed, so everyone gets the same ones

### 🧩 Jigsaw

Race to put the picture back together: every piece starts in a tray, and a piece dropped on its own spot snaps in and locks.

- **How it plays:** the same picture and the same shuffled tray for everyone
- **Players:** 1 to 20
- **Modes:** Classic (no clock on screen, an hour's hidden limit; first finished wins), Speed (against the countdown, 7:00 to 17:00 by level; most pieces placed wins), Elimination (a new picture each round; the fewest pieces go out, until two meet in the final)
- **Levels:** Easy (16 pieces), Medium (25), Hard (36) and Insane (about a hundred, cut in the picture's own shape); Auto climbs a level a round in Elimination
- **Pictures:** ours by theme, or the host's own photo; **Next Jigsaw** starts another straight after, and Surprise me takes one the room hasn't had lately

### 🔗 Connections

Find the four groups hiding in sixteen words: four words that go together, picked out of look-alike decoys.

- **How it plays:** pick four words at a time; a found group becomes one bar, and a wrong set costs one of your four mistakes
- **Players:** 1 to 20
- **Modes:** Classic (no clock; first to find all four groups wins), Speed (against the countdown; fastest solve wins, the most groups found if time runs out), Elimination (a new puzzle each round; the fewest groups go out, until two meet in the final)
- **Levels:** Easy, Medium or Hard — the puzzles come from the content bank
- **Settings:** mode, level and time: 3, 5 or 10 minutes, for the whole game in Speed and each round in Elimination

### 🔢 Logic

Fill the grid so every row, column and box holds each number once, from the clues already in it.

- **How it plays:** tap a cell, then a number key; a wrong pick costs one of your three mistakes
- **Players:** 1 to 20
- **Modes:** Classic (no clock; first to fill the grid wins), Speed (against the countdown; fastest solve wins, the most cells filled if time runs out), Elimination (a new grid each round; the fewest cells filled go out, until two meet in the final)
- **Levels:** Easy (4×4), Medium (6×6), Hard (9×9) — the grids are made from the room's seed, so a race gets the same one
- **Settings:** mode, level and time: 5, 10 or 15 minutes, for the whole game in Speed and each round in Elimination

### ⚡ Reaction

See the target, find it, tap it. The round says what to tap — “Tap the 🍌 Banana” — the countdown runs 3, 2, 1, and the options come up at an instant nobody can guess. The fastest correct tap wins.

- **How it plays:** all together, round by round. What to tap is announced, then the board appears on every screen at the same moment. A wrong tile flashes red where you tap it and you carry on — only the target counts, so a mistake never costs the round. Too slow and it's missed
- **Players:** 1 to 20
- **Levels:** Easy (1 tile: pure reaction), Medium (2: pick the right one), Hard (4: find it among four), Insane — a 5×5, 6×6 or 7×7 grid to search, the host picks the size
- **Settings:** level (and the grid for Insane); 5, 10 or 15 rounds; 2, 3 or 5 seconds to find and tap
- **Points:** faster taps score more, down to nothing at the end of the window; a miss scores nothing. The standings rank everyone by their average round, fastest first, and equal times share the rank. Rounds found first try — no wrong tile on the way — build a streak, and every round past the first two in a row pays a 1,000-point streak bonus
- **Between rounds:** the live standings come up with each round's times — rank, where everyone stood last round (▲▼ places gained or lost), first-try streaks on fire, and everyone's average
- **Sharing:** the share card leads with your fastest single hit and your average time, with the level it was played on
- **Timing:** each round's wait comes from the room's seed, and the options reach every screen at the same moment (details in [ARCHITECTURE.md](ARCHITECTURE.md#fair-timing-and-scoring))

### 🧠 Memory

Everyone sees the same six items for the same moment — 🐱 🦜 🍕 🎸 🐶 🚗 — then the items go and a question comes: which was NOT shown? What was in position 4? How many animals?

- **How it plays:** all together, round by round. Look while the clock runs out, then pick your answer; a right answer scores more the faster it is
- **Players:** 1 to 12
- **Settings:** 5, 10 or 15 rounds; 3, 5 or 8 seconds to remember
- **Questions:** three kinds, taking turns: the one that was not shown, what stood in a position, and how many of a kind
- **Timing:** the reveal is timed by the server, so every screen shows the items for exactly as long (details in [ARCHITECTURE.md](ARCHITECTURE.md#fair-timing-and-scoring))

## After launch

New games are added one at a time. These are planned concepts, not necessarily playable catalogue entries yet.

| Game | How it plays | Notes |
| --- | --- | --- |
| Pattern / Sequences | Complete number or visual patterns; fastest correct answer wins. | Many patterns can be generated by code, no content bank needed. |
| Most Likely To | Everyone votes for a player in response to a prompt, then the votes are revealed. | Social; no objectively right answer. |
| Would You Rather | Everyone votes between two options, then the split is revealed. | Social. |
| How Well Do You Know Me? | Everyone guesses a subject's answer, then the subject's real answer is revealed. | Prompt packs can target couples, best friends, family, or friend groups. |
| Predict Me | One player answers privately; everyone else predicts their answer. | Tests how well people know each other, not factual knowledge. |
| Impostor | Everyone gets the same word except one player, who must blend in and avoid being identified. | Hidden roles use per-player views. |
| Guess the Answer | Everyone answers an open question anonymously, then players guess who wrote each answer. | Typed answers need text filtering. |
| Draw & Guess | One player draws a word while everyone else guesses. | Phaser; strokes are streamed through the room. |
| Guess the Song | Identify a song, artist, album, decade or genre from an audio clip. | On hold: music needs licensing before this can ship. |

## Home-screen taxonomy

The catalogue has seven discovery views in this order: **All**, **Quiz**, **Brain Games**, **Puzzles**, **Word & Skill**, **Party & Social**, and **Couples**.

Each game has one primary category and may have at most one secondary category. The primary category reflects the game's main purpose; the secondary category is optional and should only be used when it meaningfully improves discovery. A game can appear in multiple category views, but it remains one catalogue entry with one canonical ID and implementation. The All view includes every implemented catalogue game exactly once.

- **Quiz:** Quiz; secondary: Party & Social
- **Jigsaw:** Puzzles
- **Word Rush:** Word & Skill
- **Memory:** Word & Skill; secondary: Puzzles
- **Logic:** Puzzles; secondary: Brain Games
- **Connections:** Puzzles; secondary: Brain Games
- **Reaction:** Word & Skill
- **Spot It:** Word & Skill; secondary: Puzzles
- **Most Likely To:** Party & Social
- **How Well Do You Know Me?:** Couples; secondary: Party & Social
- **Impostor:** Party & Social

Future game concepts should receive category assignments when they are actually implemented and added to the live catalogue.
