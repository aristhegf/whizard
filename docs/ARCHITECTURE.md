# Whizard Architecture

Whizard is a free, real-time platform for playing games with friends: a couple on a long-distance call, or a room full of people on game night. Players join a room with a nickname and a room code, everyone gets the same challenge at the same time, and results appear live.

Quiz was the launch game, followed by Word Rush and Spot It. The platform is built so that more games (Memory, Reaction, social and party games) plug into the same room system. The full list is in [GAMES.md](GAMES.md).

This document covers the system design, the key decisions behind it, and the order we build it in.

## Goals

- **Instant to play.** No sign-up needed. Open the link, pick a nickname, play. Next time, the same name and avatar take you straight into the lobby, where tapping your own name changes them. Accounts are optional and add stats, friends and pings.
- **Fair.** Everyone gets the same content in the same order. The server owns rules, scoring and timing, so a slow connection doesn't cost points and nobody can cheat from the browser.
- **Fast.** Moving between questions should feel instant. The first page load should be quick on a phone over 4G.
- **Cheap to run with unpredictable traffic.** Usage will come in bursts (evenings, weekends, game nights). Idle time should cost close to nothing, and a sudden spike shouldn't need manual scaling.
- **One platform, many games.** Adding a game means writing its rules and its screens. Rooms, lobbies, reconnection and timing are shared.

## Non-goals (for now)

- Global leaderboards (leaderboards are per friend group)
- Native mobile apps (the web app should work well on phones)
- 3D games

## High-level design

```mermaid
flowchart LR
    subgraph Client["Browser (React + Vite)"]
        UI[Lobby / game / results screens]
        CV["Canvas games (Phaser, lazy-loaded)"]
    end

    subgraph Edge["Cloudflare"]
        W["Worker<br/>HTTP API + WebSocket routing"]
        DO["Room<br/>(one Durable Object per room)"]
        D1[("D1<br/>Content, accounts,<br/>match history")]
        R2[("R2<br/>Images")]
    end

    Q["Question files<br/>(reviewed in commits)"]

    UI -- "HTTPS: create room" --> W
    UI <-- "WebSocket" --> W
    W -- "route by room code" --> DO
    DO -- "draw content" --> D1
    CV -. "images" .-> R2
    Q -- "bundled at build" --> DO
```

The web app and the Worker deploy together as a single Cloudflare Worker: the Worker handles `/api/*` and serves the built web app for everything else. Client and API share one origin, so there's no CORS setup.

### Why a room is a Durable Object

A game room is small, short-lived and needs one source of truth. A Cloudflare Durable Object is exactly that: a single-threaded instance with its own storage, addressed by name. We name each one after its room code.

- **No routing layer.** Every player who connects with code `K7QX2M` reaches the same instance. There's no Redis pub/sub and no sticky sessions.
- **Authoritative and race-free.** One thread handles all messages for a room, so two answers arriving at the same moment can't corrupt state.
- **Close to the players.** The object is created near the first player to connect, at the edge.
- **Costs nothing while idle.** With the WebSocket hibernation API, a room waiting in the lobby isn't billed for wall-clock time. Traffic spikes just mean more rooms, and each room runs on its own.

## Repository layout

A TypeScript monorepo using pnpm workspaces:

```
whizard/
├── apps/
│   ├── web/            React + Vite client (dev server runs the Worker too)
│   └── server/         Cloudflare Worker, Room Durable Object, accounts API, D1 migrations
├── packages/
│   ├── protocol/       Message types and runtime validation (zod), shared by client and server
│   ├── game-core/      Pure game logic: room rules, game modules, scoring
│   └── content/        Question bank (server-only: it holds the answers)
└── docs/
```

`game-core` does no I/O, so it's easy to unit-test and the server and client can't drift apart on the rules.

## How games plug in

The room and the games are separate. The **room** handles everything every game needs: connections, nicknames, the host, the lobby, reconnection, timers, saving state and sending updates. A **game module** holds only the rules of one game, as pure functions:

```ts
interface GameModule<Settings, Content, State, Action, View> {
  id: string; // "quiz", "word-rush", "impostor", ...
  minPlayers: number; // 1 means it can be played solo
  maxPlayers: number;
  settingsSchema: ZodType<Settings>; // what the host can choose in the lobby
  actionSchema: ZodType<Action>; // what a player can send during the game
  contentNeeded(settings: Settings): ContentRequest | null; // e.g. 20 easy Bible questions; null if it makes its own
  setup(args: { settings; players; content: Content; seed: number; now: number }): State;
  onAction(state: State, playerId: string, action: Action, now: number): State | Rejection;
  onPlayerLeft(state: State, playerId: string, now: number): State;
  tick(state: State, now: number): State; // apply whatever is due: timeouts, next rounds
  nextWakeAt(state: State): number | null; // when tick next has something to do
  isFinished(state: State): boolean;
  viewFor(state: State, playerId: string): View; // what this player may see
}
```

Time is just another input. The room calls `tick` when `nextWakeAt` is reached, using its Durable Object alarm, and before every action. So a module never manages timers, and a test can jump straight to any moment by passing a time.

This shape covers every game on the list:

- **Hidden information** goes through `viewFor`. A quiz player never receives the answer before answering. In Impostor, only the impostor's view says "you are the impostor".
- **Timed games** (quiz questions, Reaction, Draw & Guess) report their next deadline through `nextWakeAt`, and the room wakes them with `tick`.
- **Solo play** needs nothing special: a game with `minPlayers: 1` can start with just the host in the room. The home screen has a "Play solo" button that creates a room and goes straight to the game settings.
- **Social and party games** use the same actions: votes, typed answers and drawing strokes are all player actions.
- **Randomness** comes only from the `seed`, so a game can be replayed exactly from its seed and action log. That makes bugs reproducible and tests deterministic.

Each game's screens live in the web app under `src/games/<id>/`. Canvas-heavy games load Phaser on demand, so players of other games never download it.

## Quiz (launch game)

The host picks a **mode**, a **category**, a **level** (easy, medium, hard or Auto, see [Levels](#levels-and-auto)) and the **number of questions** (5, 10, 15 or 20): the game's length in Classic and Speed, which are one round, and each round's in Elimination. The room draws one question set. Quiz can be played solo.

| Mode            | Questions                                                                      | Points                                                            |
| --------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| **Classic**     | No clock. Answer, then move on.                                                | The full points for the question's level for each right answer    |
| **Speed**       | A countdown on every question: 10, 20 or 30 seconds, host's choice             | 50% to 100% of the points for a right answer, the faster the more |
| **Elimination** | Everyone on the same question with a countdown; knock-out rounds, then a final | As in Speed                                                       |

In both modes, ties are broken by who answered faster overall. A Classic question still closes after 5 minutes without an answer, so a player who walks away can't hold up everyone's final results.

Categories at launch: Bible, Geography, History, Science, Animals, Football, Movies, Music, Nigerian culture, General knowledge, Pop culture.

**Everyone starts together, then plays at their own pace.** The first question appears for every player at the same moment, and every player gets the same questions in the same order. After that nobody waits for anybody: answering takes you straight on to your next question.

**Between questions:**

| Playing          | After each answer                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| **With friends** | The result and points show for about a second, then the next question appears. The explanations wait for the end. |
| **Solo**         | The result and its explanation show for 3 seconds, with a Skip button.                                            |

Signed-in players change this in **Settings**, and it's saved to their account:

- **Explanations:** after each question (solo games only) or at the end. With friends they always wait for the results.
- **After you answer:** pause 3 seconds, with Skip, or go straight on after a one-second glance. An explanation always gets the 3 seconds.

Guests get the table above. This pacing is decided entirely on the player's own screen: the server only needs to hear "next", so the settings don't change the game rules.

**Live scores.** On tablets and computers, a panel beside the question shows everyone's points as they play. Phones leave it out to keep the question and answers large. Either way it shows **rank, name and points only**: what anyone else got right or wrong stays private.

**Results.** Whoever finishes first sees the rankings straight away. They fill in as the others finish, and players still going show as "Playing…". Once everyone is done, the top three go on a podium.

**Review.** Every player gets a private review of their own game at the end: each question, their answer, the correct answer and the explanation where the category has one.

**Late joiners.** By default, someone who arrives mid-game watches until the next one. If the host turns on **Allow late join**, they join the running game instead, starting from the first question with their own countdown. It works because every player already moves at their own pace.

### Elimination

A mode for 3 or more players, in the quiz, Word Rush and Spot It. All three use the same knock-out rules (`games/knockout/knockout.ts`); each game only brings its items (questions, words or grids) and what a move on one is worth. Unlike Classic and Speed, **everyone plays each question together**: it opens for all at the same moment, and closes when time runs out or everyone still in is done with it (answered, solved, out of tries or given up). Then everyone sees the right answer for 3.5 seconds.

- **Rounds.** The number the host picks is **per round**: every knock-out round has that many questions, and so does the final. There are as many knock-out rounds as players to knock out, at most 6 (`roundCount`, `planRounds`). At 10 a round, 3 players play one round and the final (20 questions), 5 players three rounds and the final (40), and 8 or more six rounds and the final (70). The lobby says how long the game will be for the players there.
- **Who goes.** At the end of each round the lowest total scores are knocked out (`keepCount`). Each round keeps the same share of the players still in, so the field shrinks geometrically to exactly two: with 20 players the rounds knock out 6, 5, 3, 2, 1 and 1; with 12, 3, 2, 2, 1, 1 and 1; with 5, one a round. Every round knocks out at least one, and leaves enough for later rounds to knock out one each. It's worked out from whoever is still in, so players leaving don't break it: if only two are left, the final starts early, and if only one is left, they win.
- **Ties.** Totals are compared by points, then by answer time (faster stays). Two players level on both at the cut line both stay, so that round knocks out one fewer; if that leaves more than two after the last round, one extra one-question round follows, using one of 5 spare questions drawn for the game.
- **Knocked out.** Players who go out stay in the room and watch: they see each question, the answers and the rest of the game, but can't answer. Late joiners watch too.
- **The final.** The two finalists start again from zero for a round's worth of questions. If they're level, sudden-death questions follow from the spares until one leads; if the spares run out, the faster player wins.
- **Placings.** The winner, the runner-up, then everyone knocked out, later knock-outs placing higher; within a round, the higher score places higher. Match history and the stats record the game with mode `elimination`.

Between phases there are short screens: each round's knock-outs (6 seconds, with "You're through" or "You're out, you finished 5th"), and the finalists' introduction (5 seconds). All the timing is on the server, in the game's state, so every player sees the same thing at the same time.

### Levels and Auto

Every game with levels offers **Easy**, **Medium**, **Hard** and **Auto** (`games/levels.ts`), in every mode. A fixed level keeps the whole game at it. **Auto** starts easy and gets harder, mixing the three levels as it goes. Harder items are worth more: 1,000, 1,250 and 1,500 points.

Auto splits the game into stages: the knock-out rounds and the final in Elimination, or up to 5 even stages in Classic and Speed. With `p` running from 0 at the first stage to 1 at the last, each stage's share of easy, medium and hard is (1 − p)², 2p(1 − p) and p². They always add up to 1, all easy at the start, all hard at the end. Each stage's share becomes whole items by the nearest counts that add up, ties going to the harder level, with the easier ones first. The final and sudden death are all hard. For 20 players at 10 questions a round:

| Round | Easy / medium / hard share | Questions (easy, medium, hard) |
| ----- | -------------------------- | ------------------------------ |
| 1     | 100 / 0 / 0                | 10, 0, 0                       |
| 2     | 69 / 28 / 3                | 7, 3, 0                        |
| 3     | 44 / 44 / 11               | 4, 5, 1                        |
| 4     | 25 / 50 / 25               | 2, 5, 3                        |
| 5     | 11 / 44 / 44               | 1, 4, 5                        |
| 6     | 3 / 28 / 69                | 0, 3, 7                        |
| Final | 0 / 0 / 100                | 0, 0, 10                       |

The plan is made before the game starts (`levelPlan`, `knockoutLevelPlan`), from the settings and how many are playing, and the room draws content to match it (`drawQuestionPlan`, `drawWords`): each level's least-used items, in the plan's order. A long game can need more of a level than the bank has (hard throughout for 20 players at 20 a round is 145 questions, and a topic has 60 hard ones); then that level borrows from the nearest one (hard from medium, then easy), so nothing repeats within a game.

## Word Rush and Spot It

Both games have two modes. **Elimination** is the quiz's, above. In **Speed** (`games/rounds/rounds.ts`) everyone gets the same puzzles and the first one appears for everyone at the same moment, then each player works through them at their own pace, like a Classic or Speed quiz. A round ends when the player solves it, gives up, runs out of tries or runs out of time. The result shows for about 1.5 seconds, then the next round starts. Each game only brings its puzzles, how a guess is checked, and what a puzzle looks like to the player.

- **Points.** A solve earns 50% to 100% of the round's points by speed, less 10% for each wrong try, and never less than 10%. Giving up, running out of tries or time earns nothing. Ties are broken by total time.
- **Tries.** A wrong try is shown to the player (the word crossed out, or the tapped cell marked) and shakes the puzzle. A guess that couldn't be right, such as a word of the wrong length, is turned down without costing a try, and so is the same guess twice.
- **Settings:** the mode, the level, 5, 10 or 15 rounds, and the time per round.
- **Results:** a podium and final rankings as in the quiz, and each player's own rounds: the word, or which grid, and how it went.

### Word Rush

Each round is a word with a hint (Animal, Food, Nigerian food, City…), shown one of two ways, chosen from the seed:

- **Unscramble:** the letters in a shuffled order that never already spells an accepted word. Players type or tap the letter tiles.
- **Missing letters:** the word with some letters hidden, never the first. Players type just the missing ones, which fill the gaps.

The words come at the level picked, or on Auto from easy to hard. The words are in `packages/content/src/words/source.txt` (240 at launch: 97 easy, 80 medium, 63 hard). `pnpm --filter @whizard/content words` turns them into `words.json`, using an English word list (`an-array-of-english-words`, MIT) to work out two things for each word, so a real word is never marked wrong:

- **Other words from the same letters** (LION: LOIN), which count when unscrambling.
- **Which letters to hide:** 2 for easy words, 3 for medium, 4 for hard (at most half the word), spread out rather than in a run, picked so that at most two other words fit the pattern; those count too. Short words with too many look-alikes get fewer gaps.

A room draws one word per round at that round's level, avoiding words the room used and ones its players have seen before, the same way as quiz questions.

### Spot It

Each round is a grid with exactly one cell that's different. Tap it. The grids are made from the room's seed, so everyone gets the same ones and nothing comes from the content bank. Four kinds take turns: look-alike emoji, look-alike letters (E and F, O and Q, 8 and B), a slightly different shade of a colour, and an arrow turned a little. Each level sets the grid and how subtle the difference is: easy is 4 by 4 with obvious pairs, an 18% shade and a 45° turn; medium is 5 by 5, 12% and 25°; hard is 6 by 6 with the closest look-alikes, 7% and 12°. Grids grow by one in the second half of the game, so Auto runs from 4 by 4 to 7 by 7. Three wrong taps lose the round. The result shows the grid again with the odd one marked.

## Room lifecycle

```mermaid
stateDiagram-v2
    [*] --> Lobby: host creates room
    Lobby --> Lobby: players join / leave, host picks game and settings
    Lobby --> Playing: host starts
    Playing --> Finished: game module reports results
    Finished --> Playing: play again
    Finished --> Lobby: change settings
    Finished --> [*]: idle timeout
    Lobby --> [*]: idle timeout
```

- **Room codes** are 6 characters from an alphabet with no look-alike characters (no `0/O`, `1/I/L`). That gives about 890 million combinations. Creating a room claims the code in its Durable Object. If the code is already in use, the server tries another.
- **Room state** lives in Durable Object storage, so it survives hibernation and restarts. The rules for joining, leaving, host handover and expiry are pure functions in `game-core`, and the Durable Object applies them.
- **Players who drop** stay in the room, shown as offline, for 10 minutes so they can come back.
- **Host handover:** if the host leaves, the longest-connected player becomes host right away. If the host only loses connection or taps back by mistake, they keep the role for 2 minutes first, so a locked phone doesn't hand it over. Every other page shows a "Return to your room" bar while the room is still open, so a host who went back can walk straight back in, with everyone still there.
- **Quitting a game** mid-game takes a player back to the room page, not home: they stay in the room while the others play on, and they're in the next game (`quitGame`; the room snapshot lists them in `sittingOut`). If nobody is left playing, the game ends. Once a game is over, the host can start the next one or change the settings from there, which brings everyone back to the lobby.
- **Toasts** tell everyone in the room who joined, who left the game, who left the room, and who the host is now.
- **Cleanup** runs from a Durable Object alarm. A room is deleted 30 minutes after the last player disconnects, or straight away when the last player in it leaves.
- **Room settings** belong to the host: the most players the room takes (2 to 20) and whether late joiners can enter a running game.
- **Limits:** up to 20 players per room, nicknames up to 20 characters (emoji welcome), unique within the room. Each player picks an avatar from a built-in set, or makes their own (see Avatars).
- **Rooms can be opened with a game already set up**, such as a topic picked on the Quiz Topics page, or Word Rush or Spot It from their cards on the Games page. In the lobby the host can switch to another game, which starts from that game's settings.

## Real-time protocol

JSON messages over one WebSocket per player. Every message has a `type` and is validated with zod on both ends. Messages that fail validation are dropped.

| Client → Server                                                        | Purpose                                                             |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `join { protocolVersion, nickname, avatar?, guestId?, sessionToken? }` | Join, or rejoin with the token from an earlier `welcome`            |
| `leave {}`                                                             | Leave the room for good                                             |
| `profile { nickname, avatar? }`                                        | Change your own nickname or avatar between games                    |
| `ping { t }`                                                           | Measure round-trip time and clock offset                            |
| `chooseGame { game }`                                                  | Host switches the room to another game in the lobby                 |
| `configure { settings }`                                               | Host changes the game settings in the lobby                         |
| `roomSettings { maxPlayers?, lateJoin? }`                              | Host changes who can join                                           |
| `start {}`                                                             | Host starts a game, or plays again from the results                 |
| `action { action }`                                                    | A game move (an answer, "next"), validated by the game's own schema |
| `backToLobby {}`                                                       | Host returns everyone to the lobby to change settings               |
| `quitGame {}`                                                          | Quit the running game but stay in the room for the next one         |

| Server → Client                                        | Purpose                                                                 |
| ------------------------------------------------------ | ----------------------------------------------------------------------- |
| `welcome { playerId, sessionToken, room, serverTime }` | Joined. Includes the full room snapshot                                 |
| `room { room }`                                        | Players, host, who's online, phase or settings changed                  |
| `pong { t, serverTime }`                               | Reply to `ping`                                                         |
| `error { code, message }`                              | Something was rejected, with a message for the user                     |
| `game { view }`                                        | This player's view of the game from `viewFor`, including live standings |

The protocol has a version number, so an old client gets a clear "please refresh" message instead of breaking. When a room can't be used (it doesn't exist or has expired, the client is out of date, or the player opened it somewhere else), the server closes the connection with a specific close code and the client shows a message instead of reconnecting.

### Reconnection

On first join the server issues a random `sessionToken`, which the browser keeps in `localStorage` for a day. If a phone locks, the network drops or the tab is closed and reopened, the client reconnects with backoff and sends the token. The room restores that player's place: same player, same score, same question. Opening the same room in a second tab moves the player there, and the first tab says so.

## Fair timing and scoring

**The server holds the answers.** Nothing a player shouldn't know yet is ever sent to their browser. The server checks every answer.

**Answer choices are shuffled per room** on the server, so the correct answer isn't always in the same position.

**Timing doesn't punish slow connections.** Measuring purely on the server would count each player's network delay as thinking time, which is unfair when one player is on the other side of the world. Instead:

1. The client measures how long the question was on screen before the tap (`clientElapsedMs`, using `performance.now()`).
2. The server measures the time between sending the question and receiving the answer.
3. The server accepts the client's time if it's at most 1.5 seconds faster than its own measurement, which covers network delay on a slow connection. A faster claim is raised to that limit, and a slower one is capped at the server's time.

**Simultaneous starts.** For games where everyone must see something at the same moment (the quiz's first question, Reaction), the server sends the content slightly ahead with a start time in server time. Each client works out its clock offset from `ping`/`pong`, keeping the estimate from the fastest recent round trip, and reveals the content at that moment. A player on a slow connection sees the question at the same instant as everyone else instead of a few hundred milliseconds late.

**No early hints.** Nobody sees anyone else's score until they've finished their own game, so a jump in someone's score can't give an answer away.

**Speed scoring** (in `game-core`, easy to tune). Classic gives the full base points for every right answer:

```
points = correct ? round(base × (0.5 + 0.5 × (1 − elapsed / timeLimit))) : 0
base   = 1000 (easy) · 1250 (medium) · 1500 (hard)
```

A correct answer earns between 50% and 100% of the base points, depending on speed. A wrong answer or a timeout earns 0. Ties are broken by total time taken.

## Content bank

Game content is prepared ahead of time and stored, not written while players wait. That keeps games starting instantly, keeps the cost fixed however many people play, and means everything has been checked before anyone sees it.

Each game that needs content gets its own set: quiz questions first, then Word Rush's words (see [Word Rush](#word-rush)), later group sets (Connections) and prompts for the social games (Most Likely To, Would You Rather, Predict Me).

### Where questions live

The questions are JSON files in `packages/content/src/questions/`, one per category, bundled with the Worker. At a few thousand questions that is small, fast and needs no database. Every change goes through a pull request, so each new question gets reviewed and tested before it ships.

What changes while the site runs lives in D1 instead: which questions each player has seen, reports that take a question out of play, and questions admins edit or add from the **Content** page (`custom_questions`). A row with a shipped question's ID replaces it; any other ID is a new question. Games, reports and the topic counts all read the shipped bank with those rows applied (`loadBank`), which each Worker reloads at most every 15 seconds, so an edit reaches new games within a minute; if D1 can't be reached, games fall back to the shipped bank. Admin edits pass the same checks as the shipped bank (limits, four different answers, no giveaways, Bible references, no near-duplicates in the category or repeats of another category's fact). To make an edit permanent, copy it into the category's JSON file through a pull request and then undo the edit. That gives the benefits the original plan wanted from moving the whole bank to D1 (no redeploy to retire a bad question, no repeats) without moving the questions themselves, which only pays off at many thousands. The room draws questions through a single `drawContent` function, so moving the bank later wouldn't change the rooms.

A lint rule blocks the web app from importing `packages/content`, so answers can never end up in the browser.

### Drawing a question set

- **Avoiding repeats.** Each room remembers the last 300 questions it used, and each player's questions from the last 60 days are kept in `seen_questions`, under their account or, for guests, the random guest ID their browser sends. When a game starts, the draw ranks the pool: questions the room hasn't used and no player has seen come first, then ones fewer of the players have seen, then the ones seen longest ago. Ties are broken by the game's seed, and the chosen set is shuffled. A guest's history moves to their account when they sign up.
- **The pool sets the limit.** Every category has 60 questions per level, so three of the longest games fit before anything comes back, and the ranking then brings back the ones seen longest ago.
- **Reporting.** Every question in the end-of-game review has a "Report this question" link with four reasons (wrong answer, unclear or a typo, out of date, offensive) and no free text, so there's nothing to moderate. Reports go to `question_reports`, one per person per question (by account, or the guest ID), tied to a fingerprint of the question's wording and answers. Once 3 people report the current wording, the question is left out of new games, with no redeploy. Editing a question changes its fingerprint, so a fixed question comes back with a clean slate; one that's fine as it is can be kept, or a bad one retired for good, from the admin **Reports** page (or the **Keep a reported question** workflow). Reported questions, their reasons and their status are listed at the end of the **Site stats** report. Reports are rate-limited to 20 a minute per address and deleted after a year.
- **Stale facts:** time-sensitive questions are re-verified on a schedule, and retired if they no longer hold ("Who won the last World Cup?").

### Quality checks

Every question in the bank must pass these checks, which run as tests on every push:

- **Shape:** four choices, length limits, a known category and level, and a verse reference for Bible questions.
- **No giveaways:** all four choices are different, and the answer doesn't appear in the prompt.
- **No duplicates:** within a category, no two questions share a prompt. Two questions with the same answer and prompts at least 70% similar (by character trigrams) also count as the same question. This keeps "Which river flows through Cairo?" and "…through Baghdad?" apart while catching rewordings.
- **No repeats across categories:** a fact belongs to one category. Across categories the bar is lower, the same answer and prompts at least 50% alike, because a player who plays both would get it twice.
- **Enough to play:** at least 60 questions at every level of every category, three of the longest games' worth.

### Adding questions

New questions are written in batches and fact-checked independently before they ship: someone who didn't write a batch reviews every question as a skeptic and fixes or replaces anything doubtful. The tests above then gate the commit. The full standard, including the format, the rules and what to avoid in each category, is in [QUESTIONS.md](QUESTIONS.md).

### Starter set

The launch bank had 740 questions: 140 Bible, and 60 (20 per level) in each of the other ten categories. Each set was written, then reviewed by a separate fact-checker that assumed nothing. That review changed 28 questions, mostly tightening explanations, removing a second defensible answer, or replacing questions that were too easy for their level.

The bank then grew to 1,980: 180 in every category, 60 per level. The new questions went through the same two steps, with each category's writer and fact-checker working separately. The fact-checkers changed or replaced about a fifth of them: removing claims in explanations that couldn't be confirmed, swapping wrong choices that could also be defended, rewording anything that depended on the translation (Bible) or could go out of date, and cutting facts another category already asks. The same pass removed 22 older questions that repeated another category's, such as "What is the chemical symbol for gold?" in both Science and General knowledge.

## Accounts (optional)

Anyone can play as a guest with just a nickname. An account is optional and adds the features that need a lasting identity:

- **Friends:** add friends by username or with an invite link.
- **Pings:** tell a friend you're free to play. They get a notification with a link to your room ("Tolu wants to play. Join K7QX2M").
- **History and stats:** every game you've played, your wins and losses against each friend, and your best categories.
- **Group leaderboards:** save a friend group ("Game night crew") and see who tops each category across the games you've played together.

Guests appear in results like everyone else, but nothing is saved for them.

### Identity

- A **player** exists inside one room. A **user** is an account. When a signed-in player opens a room's WebSocket, the Worker checks their session cookie and passes their user ID and username to the room in a header it always rebuilds itself, so a client can't claim to be someone else. It only does this for connections from our own pages, because browsers send cookies with WebSocket upgrades from any site.
- The room records the account on the player. Other players see only the username, never the user ID. Game modules don't know the difference between guests and accounts.
- Each browser also keeps a random **guest ID**, sent when joining. **Signing up or signing in** moves games played with that guest ID in the past week onto the account, so the game that convinced someone to sign up still counts.

### Sign-in

Sign-in is by **passkey** only: the phone or computer's screen lock (face, fingerprint or PIN) instead of a password. There's nothing to remember, nothing to reset, no email service or Google client to set up, and nothing phishable stored on the server.

- The WebAuthn ceremony is verified with **SimpleWebAuthn**, a widely used library, rather than hand-written crypto. Challenges are stored for five minutes and deleted on first use.
- Passkeys are discoverable, so signing in needs no username: the browser offers the accounts it has.
- Passkeys sync across a person's devices (iCloud Keychain, Google Password Manager). For a device that doesn't sync, a signed-in user can add another passkey.
- A session is a random 256-bit token in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie. The database stores only its SHA-256 hash. Sessions last 60 days and are extended when used.
- Requests that change anything must come with our own `Origin`, which blocks cross-site request forgery.

Sign-in with Google can be added later as a second way in.

### Recording results

When a game finishes, the room saves one match record to D1: the game, category, level and mode, and each player's placing, score and correct answers, with their user ID or guest ID. The room keeps a roster of who started, so a result is saved even if someone closes the tab before the end. Players who quit mid-game aren't included.

Stats, head-to-head records and leaderboards are all queries over these records, so new stats can be added later without touching any game. History shows your own correct answers but only other players' placings and scores.

A daily scheduled job deletes expired sessions and, after the week-long claim window, removes guest IDs. Games that no account holder played are deleted at that point.

```sql
users           (id, username, display_name, show_explanations, pause_after_answer, pings,
                 quiet_start, quiet_end, time_zone, created_at)
passkeys        (id, user_id, public_key, counter, transports, name, created_at, last_used_at)
sessions        (id /* token hash */, user_id, created_at, expires_at)
auth_challenges (id, kind, challenge, data, expires_at)
matches         (id, game, category, difficulty, mode, rounds, player_count, started_at, finished_at)
match_players   (match_id, placing, user_id, guest_id, nickname, score, correct)
friend_requests      (from_id, to_id, created_at)
friends              (user_id, friend_id, muted, last_pinged_at, created_at)  -- one row each way
friend_groups        (id, owner_id, name, created_at)
friend_group_members (group_id, user_id)
push_subscriptions   (endpoint, user_id, p256dh, auth, created_at)
server_keys          (name, value, created_at)                  -- the VAPID key pair
```

Schema changes are numbered SQL migrations in `apps/server/migrations/`. CI applies new ones before each deploy; `pnpm dev` and the browser tests apply them to the local database.

### Friends and groups

- **Adding a friend** sends a request by username, from an invite link (`/add/username`), or from the results screen after playing with someone signed in. Asking someone who already asked you makes you friends straight away. Removing works from either side and also clears any pending request.
- A friendship is stored as two rows, one each way, so each person keeps their own settings for the other, such as muting their pings.
- **Head-to-head records** come from games you both finished: whoever placed higher won that game.
- **Groups** are saved sets of friends, like "Game night crew". Every member sees the group; only the person who made it can rename it or change who's in it, and only their friends can be added. The **group leaderboard** counts games where at least two members finished together, overall or for one category, and the member who placed highest among them wins that game.

### Notifications

A **ping** tells a friend you're in a room and want them to join: "Ada wants to play. Tap to join room K7QX2M." Tapping it opens the room.

- Pings use **Web Push**, which works in current browsers, including on iPhone once Whizard is added to the home screen (the site has a web app manifest and icons for this). A small service worker (`/sw.js`) shows the notification and opens the room; it caches nothing.
- Each browser that turns pings on stores a push subscription. The server encrypts and signs each ping itself (with PushForge, which uses Web Crypto and runs in Workers) and sends it straight to the browser's push service. Subscriptions the push service reports as gone are deleted.
- The signing key pair (VAPID) is generated by the server on first use and kept in D1, so there's no secret to set up. Only the public half is ever sent to browsers.
- Only endpoints on the browsers' own push services are accepted, so the server never posts to an arbitrary URL.
- You can ping from the lobby, or from your friends list, which opens a new room and pings from there. One ping per friend per minute.
- The person being pinged decides: they can turn pings off entirely, mute one friend, or set quiet hours, which are checked in their own time zone. The sender only learns that a ping couldn't be delivered, not why.

A native app later registers with the same system, so pings work the same way there.

### Privacy

Accounts mean storing personal data, so they launch with a plain-language privacy policy (`/privacy`), a minimum age of 13 confirmed at sign-up, a JSON download of everything stored, and account deletion. Deleting removes the account, passkeys, sessions and settings; the player's rows in other people's games become "Former player" with no link back.

## Site stats

The home page shows two live numbers, "visitors so far" and "here now", and `/stats` shows the fuller picture for the last 7, 30 or 90 days: visitors, visits, page views, rooms created, games played and average visit length, a chart of visitors and games per day, and top pages, sources, countries, topics, devices and game modes.

- **Presence.** Every open tab keeps one small WebSocket to a single `Presence` Durable Object (`/api/presence`). "Here now" is the number of different visitors with a socket open, sent to everyone at most every 2 seconds when it changes. Tabs send `ping` every 30 seconds, which Cloudflare answers without waking the object; once a minute it closes sockets that have been quiet for 150 seconds, so phones that dropped off don't linger. A tab in the background disconnects after 2 minutes and reconnects when it's shown again.
- **Visits.** A socket's first message (`hello`) carries a random visitor ID the browser keeps (separate from the guest ID used in games), the page, the device type from the screen width, and the source: `utm_source` if the link has one, else the referring site. The Worker adds the country from Cloudflare and the visitor's network: the whole IPv4 address, or the first half of an IPv6 one.
- **Recognising people.** The presence object turns the network and the browser's user agent into a one-way code, an HMAC with a secret kept in `server_keys`, so the address is never stored and the code can't be reversed. A visit is from a known person if either the browser ID or the network code has been seen; only when neither has is it a new visitor. So a private window, cleared storage or a script making up IDs from one connection counts once, and "here now" counts people, not IDs. Network codes match for 30 days after they were last seen (addresses get reassigned) and are then deleted. Mobile networks put many phones behind one address, so two people on the same network with the same phone and browser can be counted as one: the numbers lean low rather than high. Crawlers and headless browsers are never counted.
- **Storage.** `visitor_people` has one row per person with their first and last day, which gives unique counts for any range; `visitor_browsers` and `visitor_networks` map browser IDs and network codes to people. Everything else is a daily total in `daily_counts` (`day`, `metric`, `count`); breakdowns use a prefix such as `page:games`, `topic:bible` or `source:whatsapp`. Rooms, games (started and finished, players, topic, mode), accounts and pings are counted where they happen. A failed stats write is logged and never breaks the thing being counted.
- **Reading them.** `GET /api/stats?range=7|30|90` builds the page's numbers in three queries and caches them for two minutes. For the raw tables, run the **Site stats** workflow in GitHub Actions; it prints every total and breakdown to the run summary.
- To share a link and see how it did, add a campaign tag, e.g. `?utm_source=whatsapp`.

## Admin dashboard

`/admin` is for accounts marked as admin (`users.is_admin`), set with the **Admins** workflow in GitHub Actions (a username, then grant or revoke). The page checks the signed-in account, and every `/api/admin/*` request checks it again on the server, so the page being public does nothing on its own.

- **Dashboard.** Five headline numbers for the last 7, 30 or 90 days, each compared with the period before: games played, unique players, rooms created, completion rate (finished games over started ones) and average players per room. Below them: games per day, live activity, the most played games and topics, players per game, retention (the share of new players who came back 1, 7 and 30 days later), countries, and room behaviour (invites, join rate, rematches, rooms nobody else joined). The panels sit on one 12-column grid, so their edges line up row to row at every width. Numbers refresh every minute, the activity feed every 15 seconds.
- **Where the numbers come from.** Most are daily totals in `daily_counts`: `room_joins`, `rooms_shared` (a second player joined), `games_started`, `rematches`, `invites` (a copied or shared invite link), and `game_size:<bucket>` for finished games. Unique and returning players come from `player_days`, one row per player (account, or guest ID) per day they started a game, kept 400 days. The activity feed is `activity`: short events like "room created" or "game finished" with no names, deleted after 7 days.
- **Reports.** Reported questions with their reasons and counts, for the current wording only. **Keep** puts a question back in play, **Retire** takes it out for good (`question_retired`), **Reopen** undoes either. Every decision is written to `admin_log`.
- **Users.** Every account with its games, wins (first place in games with two or more players) and last day played, searchable by username or name and sortable by newest, most games or last played, 50 at a time. **Suspend** sets `users.suspended_at` and deletes the account's sessions: it's signed out everywhere, can't sign in (`account_suspended`), and is hidden from friend search and the public leaderboard. **Unsuspend** undoes it. **Delete** runs the same deletion as a player deleting their own account. Admins can't be suspended or deleted here; revoke the role first.
- **Rooms.** Rooms open right now, from `live_rooms`. Each room writes its row whenever something shown there changes (players, who's connected, the phase, the game settings), not on every answer, and deletes it when it closes; the nightly clean-up removes any row not updated for a day. **Close room** tells the room's Durable Object to send everyone away with close code 4403 ("This room was closed by Whizard.") and delete itself.
- **Analytics.** The public stats page's detailed visitor numbers for 7, 30 or 90 days, with the period before for comparison: visitors, new visitors, visits, page views and average visit length; visitors per day; new and returning visitors, visits per visitor and sign-ups; top pages; and, for new visitors, sources, countries and devices; plus the topics and modes played.
- **Moderation.** Admins keep a list of blocked words (`blocked_words`), each matching as a whole word or anywhere inside a name. Room nicknames, usernames and account names at sign-up, profile names and group names are all checked; a name using one is refused with "That name isn't allowed here" and counted as `names_refused`. The check undoes accents and look-alikes (0 for o, 4 or @ for a, $ for s), reads spaced or dotted letters as one word, and squeezes repeated letters, so "T r 0 o l l" matches "troll". The same matcher is in `@whizard/protocol`, so the page can test a name. Chosen names go to `recent_names` for 7 days; the page lists them, flagged ones first, matched against the current list, so blocking a word also flags names already in use. **Remove from room** has the room's Durable Object close that player's sockets (close code 4406, "You were removed from this room by Whizard.") and take them out of the room; **Reset name** sets an account's name to its username or a group's to "Group". Returning players keep their nickname when they reconnect.
- **Settings.** Site switches in `site_settings`, read through `siteSettings` (each Worker reloads them at most every 15 seconds, and falls back to everything open if D1 can't be reached): an announcement shown across the top of every page except rooms (served by the public `GET /api/site`; a visitor can close it until there's a new one), **Pause new rooms** (`POST /api/rooms` answers 503 "New rooms are paused", except for the deploy's smoke test; open rooms carry on) and **Pause sign-ups** (new accounts are refused; signing in and guests still work). Admins can make another account an admin by username or take the role away (not their own), so the **Admins** workflow is only needed for the first one. The page lists the latest 50 entries of `admin_log` in words.
- Every admin action (report decisions, suspending, deleting, closing a room, question edits, blocked words, removed players and reset names, settings and admin changes) is written to `admin_log`.
- **Questions.** The bank in play by topic and level, with any level under 30 marked (players see repeats sooner there); the hardest questions (fewer than half right) and the easiest (three in four or more), once a question has 5 answers; and a level check for questions with 10 answers whose share right doesn't fit their level, such as an easy question under 40%. The numbers come from `question_stats` and `question_wrong_picks`: when a game finishes, each question's answers, correct answers, timeouts and the wrong answers picked are added for its current wording, so editing a question starts its numbers again. They're totals, with nothing about who answered.
- **Content.** Browse and search the whole bank by topic, level and status (added, edited, out of play), sorted by ID, hardest first or most played. The editor changes a question's wording, answers, level, sub-topic, explanation and reference; **Undo my edits** puts a shipped question back, **Delete question** removes an added one, and the question can be taken out of play or put back. It shows how the question has played, including the wrong answers picked most, and the shipped wording next to an edit.
- **Games.** Every game in the catalog with its finished games over 30 and 7 days; games that exist can be turned off (`games_off`), which stops new rooms for them while rooms already playing finish. **New Room Defaults** (`quiz_defaults`) set the topic, level, number of questions, mode and time a quiz room starts with; a topic someone picked on the topics page still wins, and hosts can change anything in the lobby. Each quiz topic can be turned off (`topics_off`): it's left out of `GET /api/quiz/categories`, so the topics page hides it and the lobby shows it as unavailable, and the room refuses it if someone picks it or starts a game with it. At least one topic stays on, and the default topic can't be turned off. `newRoomSettings` applies all of this when a room is made: the built-in settings, then the defaults, then the room's own choice, leaving out anything that doesn't fit.
- **Payments.** No card checkout is connected yet, so Pro is recorded by hand. **Record a Payment** (a username, how many months, the amount in naira, bank transfer, cash or other, and a note such as the transfer reference) goes in `payments` and extends the account's row in `pro_memberships`; more paid time is added after what's left. **Give Pro for Free** does the same without a payment, for 1 to 12 months or with no end, and **End Pro** ends it now. The page shows Pro members (soonest to end first), money recorded in the last 30 days and in all, memberships ending within a week, and the latest 100 payments. When an account is deleted its payments stay, without the username. Nothing is unlocked by Pro yet; the pricing page still says it's coming soon.

## Visual design

A dark, cozy game-night look: deep navy and purple with warm lamp glows behind every screen, glassy panels, and bright cards for each game and topic.

- **Type:** Poppins for headings, Nunito for everything else, both bundled with the app.
- **Colour:** purple for primary actions, gold for the big "Create a Room" call to action and for scores, green and red for right and wrong answers. Tokens live at the top of `apps/web/src/styles/base.css`.
- **Layouts:** every page outside a game has the same top bar, with different links for guests and signed-in players:

  |           | Top bar (wide screens)       | Tabs at the bottom (phones)                    |
  | --------- | ---------------------------- | ---------------------------------------------- |
  | Guests    | Games, Pricing, About, Stats | Games, Pricing, Stats, Profile                 |
  | Signed in | Games, Friends, Create       | Games, Friends, Create, their avatar (Profile) |

  The bar also holds friend requests (signed in), Settings and Sign In or the profile picture; on phones it's just the logo, Settings and Sign In, with no menu. How It Works, Pricing, About, Stats and Privacy are in the footer of every page. Game screens drop the navigation to give the question room.

- **Settings:** a dialog anyone can open from the top bar or the room's bar. Sound and Reduce animations are kept on the device; Reduce animations stills CSS animations and the motion components on top of the device's own setting. Signed-in players also get the quiz settings above.
- **Artwork** is plain image files in `apps/web/public/art/`: `mascot/`, `games/` (one per game), `topics/` (one per quiz category), `avatars/` (`a01` to `a12`), `avatar-parts/` (the avatar creator's parts, see Avatars), and the logo (`logo-mark.webp` for the crown W, `logo-lockup.webp` for the full logo). To update a picture, replace the file with one of the same name; transparent WebP works best. The favicon and app icons in `apps/web/public/` are made from the crown W.

### Sound

Sounds are made in the browser with the Web Audio API (`apps/web/src/sounds.ts`), so there are no audio files to download or license: a tick for each second of the countdown and a higher note as the question appears, a two-note chime for a right answer and a low slide for a wrong one, quiet ticks in the last five seconds of a Speed question, a short fanfare on the final results, and a soft pop when someone joins the lobby. Browsers only allow sound after a tap, so audio starts on the first one. A speaker button in the lobby and game bars mutes everything, remembered on the device.

### Avatars

Players pick one of the 12 built-in pictures, or make their own in the **avatar creator** at `/avatar` ("Build your Whizard"). The finished art is arriving one part at a time, so for now only admins are offered the creator from the avatar pickers (`CREATOR_OPEN` in `apps/web/src/avatar/parts.ts`); the page itself works for anyone with the link. It works like a face construction kit: a blank face, and one pick for each feature from a set that each look clearly different. The creator only shows parts that have art: today that's the painted head in 8 skin tones, 4 hairstyles (tests of new hair art; in the hair colour, or bald), 8 eye shapes in 5 eye colours, 12 lash styles (or none), 12 eyebrows (in the hair colour), 12 mouths, the space between the eyes (seven steps, closer to wider, with arrow buttons), and the background colour. Each mouth is stored once per skin tone so the lips match the face, but it's one choice to the player.

- **The code.** A made-up avatar is stored and sent as a short code, `w1.` followed by one id per part in the order of `AVATAR_FIELDS` (`packages/protocol/src/accounts.ts`), e.g. `w1.classic.4.none…`. It goes wherever a built-in avatar id goes: the join message, the account, the room and match history. The server only checks its shape (`isAvatarValue`), allowing up to 32 parts. New parts are only ever added to the end, so older codes stay valid, and the web app draws any part it doesn't know as the default. Part, colour, pose and expression ids are never renamed, and colours are only ever added to the end of a palette.
- **Poses.** Each pose is its own template, with every part drawn for that angle, in `apps/web/public/art/avatar-parts/<pose>/<category>/<option>/<file>`. A pose can reuse another's art flipped left to right (`mirrorOf`). Each option lists the poses it has art for, and the creator only offers what the chosen pose has. Today there's one pose, `front`.
- **The parts** are listed in `apps/web/src/avatar/parts.ts`: the files each option has, whether a hat covers the top of the hair, all of it or none, whether a part is painted once for each value of another part (`paintedFor`: a head per skin tone, `head-3.webp`; an eye per eye colour, `open-3.webp`; a mouth per skin tone, `mouth-3.webp`, with only the lips recoloured to suit the skin; every mouth hangs from the same line under the nose, and open mouths are made smaller so none is more than 100 pixels tall on the grid and reaches the chin), and whether it's a pair (`pair`): eyes, lashes and eyebrows are drawn for the left of the picture only, and the right is the same art flipped around the middle of the face. Lashes are made once for each eye shape (`paintedFor: "eyes"`, `lashes-e3.webp`): when the files are made, the top edge of each eye's lid is measured and the base of each lash style is bent onto it, column by column, so the lashes grow out of the lid with no gap on any eye shape. Past the outer corner the lashes keep their own flick, and they stop at the inner corner. The eyebrows move up or down with the eye shape (`browDrop`), so they sit as far above every eye as above Eyes 2, and move up a little more for lashes tall enough to reach them (`browLift`, only Lashes 11 today), leaving at least 8 pixels between lashes and brows on the grid. The eye gap moves the eyes, lashes and eyebrows out from (or in to) the middle together, 6 pixels on the grid per step. The head comes with its neck and shoulders, so clothes are drawn over it. A unit test checks that every listed file exists, in every pose and tone.
- **Hair on the template.** New hair is drawn by the owner's image generator on the head template (the bald head on a 1024 × 1224 canvas, 200 pixels of room above the grid), so it fits the head as it is. The generator often changes the picture's size and moves the head, so the picture (a see-through background counting as white) is resized and moved until its skin lines up best with the template's. The hair is what's darker than the template there and not skin coloured, outside the face itself. Deep inside the hair it's solid; near its edges, and where it fades into the skin (a fade haircut), how see-through it is comes from how much darker it is than the template. The generator tends to draw the hair bigger than the head, so it's then pulled in: along lines from the middle of the head, hair outside the skull keeps 55% of its distance from it, most at the top and upper sides and not at all below the eyes, so long hair still falls as drawn. It's turned to grey for the hair colour, and a soft `shadow` file of it is drawn on the skin just after the head. Styles made this way have ids starting `hc`.
- **Hair from other art.** The first test styles (`hb`) were painted on a head with a longer, narrower face than ours, so each style is bent to fit when its files are made, rather than scaled as one piece (which made it sit on the head like a wig): the crown is sized so its edge just above the hairline (250 on the grid) sits on our skull plus the hair's own thickness, and follows the skull's curve lower down; the face opening is widened to 410 wide, a little narrower than the head, so the hair covers the sides of the head instead of stopping at its edge; the hair around the face keeps the crown's proportions, so it isn't blown up; and between the hairline and the ears the hair always reaches past the edge of the skull. Hair files reach 200 pixels above the grid (`above`), so tall styles like buns fit, and the whole avatar is drawn at 85% of its circle from the bottom (`FRAME` in `render.ts`), leaving room above the head as in the reference art; close-ups in the creator show the parts at full size. Long hair has a `back` file drawn behind the head: the hair behind the neck, and a dark fill for the back of the hair between the hair and the face. The hair is turned to grey for the hair colour, and hair cuffs are kept in their own colours in a `details` file drawn over it.
- **Colours.** Parts the player recolours (hair, eyebrows, facial hair, clothes, some hats) are drawn in grey with the main colour at 55% grey, and the browser colours them with a gradient map: dark greys become the shadow colour, the main grey the chosen colour, light greys the highlight, and white stays white.
- **Expressions.** The player only picks their parts; the saved expression is Happy, which uses the mouth they picked. The other faces (laughing, wink, cheeky, surprised, thinking) each use one of the twelve mouths, and are for the game to pull for a reaction (`avatarPicture` takes a `Face`); the winks need eyes with a closed version. A wink joins half of the open eyes with half of the closed ones.
- **Drawing.** `avatar/layers.ts` works out which files to draw, back to front. `avatar/render.ts` draws them on a canvas, on a glowing disc with a bright rim like the art direction, and keeps each picture once drawn. Nothing is uploaded.

### Sharing results

Every results screen's **Share** button makes a 1080 × 1920 (9:16) picture of the game (`apps/web/src/share/`), sized for stories and statuses. `outcomes.ts` works out what kind of finish it was, the best thing that's true first: last one standing, perfect score, winner, fastest player, bad result, runner-up, top 3, a big crowd, nailed it, or not bad. In Elimination, going out in the first round of four or more is a bad result; otherwise it's knocked out. Each finish has its own headline, mascot, colour and call to action. `shareCard.ts` draws it: the logo, the game and its mode and level, a big headline, the sharer's score, the leaderboard with bars (the top five, or four and the sharer, then "+ N more players") or the solo stats, a call to action, and a QR code. The background is an arena with a spotlight and confetti (`public/art/share/stage.webp`); bad results and knock-outs get it dim and grey, with a facepalming or dazed mascot. The QR code opens the site at whatever address it's served from, so it will follow a domain once there is one; the address isn't written out. The picture is drawn in the browser on a canvas, so nothing is uploaded. The headline font (Luckiest Guy) and handwriting font (Caveat) are loaded only when a picture is made. A dialog shows it with **Share** (the phone's share sheet, where it can share files) and **Download**.

## Canvas games (after launch)

Jigsaw, Reaction and Draw & Guess use **Phaser**, loaded only when one of those games starts. Spot It turned out not to need it: its grids are plain buttons.

- **Identical boards:** every player's jigsaw pieces are generated from the room's seed, as Spot It's grids are, so everyone gets the same challenge.
- **Draw & Guess** sends the drawer's strokes in small batches through the room to the other players, who redraw them as they arrive.
- **Images** come from a curated set, or the host uploads one. Uploads are resized in the browser, stored in R2 under the room, and deleted when the room expires.

## Performance targets

| Metric                        | Target                                                   |
| ----------------------------- | -------------------------------------------------------- |
| Next question after answering | 1 network round trip (typically under 100 ms)            |
| Initial JavaScript            | under 150 KB gzipped. Phaser and game screens load later |
| Time to interactive on 4G     | under 2 s                                                |
| Room creation                 | under 300 ms                                             |

## Security and abuse

- **Rate limiting** per address with the Workers rate-limiting binding, each minute: 30 new rooms, 120 room connections (joins and reconnects), 100 presence connections and 20 question reports. The limits are generous because mobile networks put many people behind one address.
- **Validation** of every incoming message with a size cap. Unknown or malformed messages are dropped.
- **Nickname and text filtering** for length, characters and a basic profanity list. This matters more once social games let players type answers.
- **Guests leave nothing behind.** Nicknames, typed answers and uploaded images live only as long as the room. Account data is covered in [Privacy](#privacy).
- **Account sessions** are checked by the Worker. The room only ever receives a verified user ID, never a password or token it has to trust.
- **Hidden information stays on the server** until a player is allowed to see it.
- **Stats resist faking.** Presence only accepts sockets from the site's own pages, one `hello` per socket, and at most 100 connections a minute from one address. Made-up visitor IDs from one connection are matched by network code, so only someone rotating through many addresses could inflate the counts.

## Testing and CI

- **Unit tests** (Vitest) for `game-core`: every game module, scoring, timing clamps, content drawing. Game modules are pure, so tests replay a seed and a list of actions and check the result.
- **Integration tests** for the Room Durable Object, using Cloudflare's Vitest pool to run it in the real Workers runtime.
- **End-to-end tests** (Playwright, phone-sized screens): several browsers join the same room, reload, drop off and hand over the host role. Full games are added with each game.
- **GitHub Actions** on every push and pull request: format, lint, typecheck, tests and a production build.

## Key decisions

| Decision          | Chosen                                                       | Alternatives considered                                            | Why                                                                                                                                    |
| ----------------- | ------------------------------------------------------------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Real-time backend | Cloudflare Workers + Durable Objects                         | Node.js + `ws`/Socket.IO on a VM, with Redis for multiple servers  | Rooms map directly to Durable Objects. No routing layer, no always-on server bill, handles spikes on its own                           |
| Game rules        | Pure game modules behind one interface                       | Separate server code per game                                      | New games reuse rooms, reconnection and timing. Rules are testable and replayable without a network                                    |
| Frontend          | React + Vite, TypeScript                                     | Next.js                                                            | The app is interactive and client-side. A single-page app is simpler and faster to load                                                |
| Transport         | Raw WebSocket + zod-validated JSON                           | Socket.IO, Colyseus                                                | Small, explicit, typed protocol with no extra runtime dependency                                                                       |
| Content           | Pre-built, verified content bank                             | Generating content live per game                                   | Instant starts, fixed cost, everything checked, easy to avoid repeats                                                                  |
| 2D games          | Phaser (lazy-loaded)                                         | Plain canvas                                                       | Mature 2D engine, good fit for jigsaws, drawing and reaction games                                                                     |
| 3D                | Not now                                                      | PlayCanvas                                                         | No 3D game is planned yet. Revisit if one is designed                                                                                  |
| Accounts          | Optional: guests play, accounts add stats, friends and pings | Required sign-up; no accounts at all                               | Required sign-up loses people before their first game. With no accounts, there's no way to reach a friend or keep head-to-head records |
| Sign-in           | Passkeys, verified with SimpleWebAuthn, sessions in D1       | Passwords; email links; Google sign-in; hosted auth (Clerk, Auth0) | Nothing to remember or reset and nothing phishable stored. Needs no email service or third-party client, and costs nothing per user    |
| Language          | TypeScript everywhere                                        | Java                                                               | One language across client, server and tools, with shared types. The Workers runtime runs JavaScript/TypeScript                        |

## Build plan

| Milestone                    | Scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Status |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **M0: Foundations**          | Monorepo, lint/format, CI, Worker + Room Durable Object, web app, room codes, WebSocket ping                                                                                                                                                                                                                                                                                                                                                                                                                     | Done   |
| **M1: Rooms**                | Nicknames, live lobby, invite link, host and host handover, reconnection, room expiry, end-to-end tests                                                                                                                                                                                                                                                                                                                                                                                                          | Done   |
| **M2: Quiz**                 | Game module runner, game settings in the lobby, solo play, synchronized start with own-pace play, points-only leaderboard, private review, 140 hand-checked Bible questions                                                                                                                                                                                                                                                                                                                                      | Done   |
| **M3: Content**              | Question bank for all 11 categories (740 questions, independently fact-checked), quality checks in CI, a written standard for adding questions                                                                                                                                                                                                                                                                                                                                                                   | Done   |
| **M4: Accounts and friends** | Sign-in, quiz preferences (explanations during the quiz), profiles, friends, pings (web push), match history, head-to-head records, group leaderboards, account deletion and export                                                                                                                                                                                                                                                                                                                              | Done   |
| **M5: Launch**               | Sounds with a mute button, no repeated questions (per room and per player), reporting questions with automatic retirement, rate limiting, live visitor counts and a public stats page, privacy policy                                                                                                                                                                                                                                                                                                            | Done   |
| **M6: Admin**                | Dashboard (headline numbers, charts, retention, live activity), reported questions, users (suspend and delete), live rooms (close), visitor analytics, the question bank with answer numbers and a level check, editing and adding questions without a redeploy, blocked words and name moderation, site switches (announcement, pausing rooms and sign-ups), admins managed from the page, an admin activity log, games and topics on and off with new room defaults, Pro members and payments recorded by hand | Done   |
| **After launch**             | New games category by category, in the order in [GAMES.md](GAMES.md)                                                                                                                                                                                                                                                                                                                                                                                                                                             |        |

The first playable version is **M0 to M2**: you and a friend can play a Bible quiz together.

## Running locally

```sh
pnpm install
pnpm dev          # web app and Worker together on http://localhost:5173
pnpm test         # unit tests
pnpm e2e          # browser tests (starts its own server)
pnpm lint && pnpm typecheck
```

## Open items

- **Deploys** run from CI on every green push to `main`, using the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets. The job creates the D1 database the first time and applies new migrations before deploying.
- The Cloudflare API token needs **D1 → Edit** as well as the Workers permissions, so the deploy job can create the database and run migrations.
- **Domain name:** optional. The app can run on a free `*.workers.dev` address until there is one.
