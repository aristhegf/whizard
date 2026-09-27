# Whizard Architecture

Whizard is a free, real-time platform for playing games with friends: a couple on a long-distance call, or a room full of people on game night. Players join a room with a nickname and a room code, everyone gets the same challenge at the same time, and results appear live.

Quiz is the launch game. The platform is built so that more games (Word Rush, Memory, Reaction, social and party games) plug into the same room system. The full list is in [GAMES.md](GAMES.md).

This document covers the system design, the key decisions behind it, and the order we build it in.

## Goals

- **Instant to play.** No sign-up needed. Open the link, pick a nickname, play. Accounts are optional and add stats, friends and pings.
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

    GEN["Content pipeline<br/>(offline script)"]

    UI -- "HTTPS: create room" --> W
    UI <-- "WebSocket" --> W
    W -- "route by room code" --> DO
    DO -- "draw content" --> D1
    CV -. "images" .-> R2
    GEN -- "validated content" --> D1
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
│   └── server/         Cloudflare Worker, Room Durable Object, wrangler config
├── packages/
│   ├── protocol/       Message types and runtime validation (zod), shared by client and server
│   └── game-core/      Pure game logic: room codes, game modules, scoring
├── tools/
│   └── content-gen/    Offline pipeline that generates, checks and imports content (M3)
└── docs/
```

`game-core` does no I/O, so it's easy to unit-test and the server and client can't drift apart on the rules.

## How games plug in

The room and the games are separate. The **room** handles everything every game needs: connections, nicknames, the host, the lobby, reconnection, timers, saving state and sending updates. A **game module** holds only the rules of one game, as pure functions:

```ts
interface GameModule<Settings, State, Action, View> {
  id: string; // "quiz", "word-rush", "impostor", ...
  settings: ZodType<Settings>; // what the host can choose in the lobby
  actions: ZodType<Action>; // what a player can send during the game
  contentNeeded(settings: Settings): ContentRequest; // e.g. 20 easy Bible questions
  setup(settings: Settings, players: PlayerId[], content: Content, seed: number): Transition<State>;
  onAction(state: State, player: PlayerId, action: Action, now: number): Transition<State>;
  onTimer(state: State, timerId: string, now: number): Transition<State>;
  viewFor(state: State, player: PlayerId): View; // what this player may see
  results(state: State): Standings | null; // null while the game is running
}

type Transition<S> = { state: S; timers?: { id: string; at: number }[] };
```

This shape covers every game on the list:

- **Hidden information** goes through `viewFor`. A quiz player never receives the answer before answering. In Impostor, only the impostor's view says "you are the impostor".
- **Timed games** (Classic quiz rounds, Reaction, Draw & Guess) ask the room for timers. The room runs them on one Durable Object alarm and calls `onTimer`.
- **Social and party games** use the same actions: votes, typed answers and drawing strokes are all player actions.
- **Randomness** comes only from the `seed`, so a game can be replayed exactly from its seed and action log. That makes bugs reproducible and tests deterministic.

Each game's screens live in the web app under `src/games/<id>/`. Canvas-heavy games load Phaser on demand, so players of other games never download it.

## Quiz (launch game)

The host picks a **category**, a **difficulty**, the **number of questions** and a **variant**. The room draws one question set, and every player gets the same questions in the same order.

Categories at launch: Bible, Geography, History, Science, Animals, Football, Movies, Music, Nigerian culture, General knowledge, Pop culture.

| Variant         | How it plays                                                                                                                                                                   | Winner                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| **Classic**     | Everyone sees each question at the same moment, with a timer. The round ends when everyone has answered or time runs out, then the answer and standings are shown.             | Most points                      |
| **Speed Quiz**  | Everyone works through the same set at their own pace. A player who finishes goes straight to the results, which update live as others finish ("Tolu is on question 7 of 20"). | Most points, then fastest finish |
| **Streak**      | Same questions, own pace, but the first wrong answer ends your run.                                                                                                            | Longest streak, then fastest     |
| **Elimination** | Classic rounds, but a wrong answer or no answer knocks you out. If everyone left gets it wrong, nobody is knocked out. Players who are out keep watching.                      | Last player standing             |

## Room lifecycle

```mermaid
stateDiagram-v2
    [*] --> Lobby: host creates room
    Lobby --> Lobby: players join / leave, host picks game and settings
    Lobby --> Playing: host starts
    Playing --> Finished: game module reports results
    Finished --> Lobby: rematch
    Finished --> [*]: idle timeout
    Lobby --> [*]: idle timeout
```

- **Room codes** are 6 characters from an alphabet with no look-alike characters (no `0/O`, `1/I/L`). That gives about 890 million combinations. Creating a room claims the code in its Durable Object. If the code is already in use, the server tries another.
- **Room state** lives in Durable Object storage, so it survives hibernation and restarts. The rules for joining, leaving, host handover and expiry are pure functions in `game-core`, and the Durable Object applies them.
- **Players who drop** stay in the room, shown as offline, for 10 minutes so they can come back.
- **Host handover:** if the host leaves, the longest-connected player becomes host right away. If the host only loses connection, they keep the role for 30 seconds first, so a locked phone doesn't hand it over.
- **Cleanup** runs from a Durable Object alarm. A room is deleted 30 minutes after the last player disconnects.
- **Limits:** up to 16 players per room, nicknames up to 20 characters (emoji welcome), unique within the room.

## Real-time protocol

JSON messages over one WebSocket per player. Every message has a `type` and is validated with zod on both ends. Messages that fail validation are dropped.

| Client → Server                                     | Purpose                                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------------ |
| `join { protocolVersion, nickname, sessionToken? }` | Join, or rejoin with the token from an earlier `welcome`                       |
| `leave {}`                                          | Leave the room for good                                                        |
| `ping { t }`                                        | Measure round-trip time and clock offset                                       |
| `configure { game, settings }`                      | Host picks the game and its settings in the lobby (M2)                         |
| `start {}`                                          | Host starts the game (M2)                                                      |
| `action { payload }`                                | A game move (an answer, a vote, a stroke), validated by the game's schema (M2) |
| `rematch {}`                                        | Host returns everyone to the lobby (M2)                                        |

| Server → Client                            | Purpose                                             |
| ------------------------------------------ | --------------------------------------------------- |
| `welcome { playerId, sessionToken, room }` | Joined. Includes the full room snapshot             |
| `room { room }`                            | Players, host or who's online changed               |
| `pong { t, serverTime }`                   | Reply to `ping`                                     |
| `error { code, message }`                  | Something was rejected, with a message for the user |
| `view { view }`                            | This player's view of the game, from `viewFor` (M2) |
| `results { standings, final }`             | Live or final results (M2)                          |

The protocol has a version number, so an old client gets a clear "please refresh" message instead of breaking. When a room can't be used (it doesn't exist or has expired, the client is out of date, or the player opened it somewhere else), the server closes the connection with a specific close code and the client shows a message instead of reconnecting.

### Reconnection

On first join the server issues a random `sessionToken`, which the browser keeps in `localStorage` for a day. If a phone locks, the network drops or the tab is closed and reopened, the client reconnects with backoff and sends the token. The room restores that player's place: same player, same score, same question. Opening the same room in a second tab moves the player there, and the first tab says so.

## Fair timing and scoring

**The server holds the answers.** Nothing a player shouldn't know yet is ever sent to their browser. The server checks every answer.

**Answer choices are shuffled per room** on the server, so the correct answer isn't always in the same position.

**Timing doesn't punish slow connections.** Measuring purely on the server would count each player's network delay as thinking time, which is unfair when one player is on the other side of the world. Instead:

1. The client measures how long the question was on screen before the tap (`clientElapsedMs`, using `performance.now()`).
2. The server measures the time between sending the question and receiving the answer.
3. The server accepts the client's time only if it fits inside that window, allowing for the player's measured round-trip time. Anything outside it is replaced with the server's own measurement.

**Simultaneous starts.** For games where everyone must see something at the same moment (Classic rounds, Reaction), the server sends the content slightly ahead with a start time in server time. Each client works out its clock offset from `ping`/`pong` and reveals the content at that moment. A player on a slow connection sees the question at the same instant as everyone else instead of a few hundred milliseconds late.

**Quiz scoring** (in `game-core`, easy to tune):

```
points = correct ? round(base × (0.5 + 0.5 × (1 − elapsed / timeLimit))) : 0
base   = 1000 (easy) · 1250 (medium) · 1500 (hard)
```

A correct answer earns between 50% and 100% of the base points, depending on speed. A wrong answer or a timeout earns 0. Ties are broken by total time taken.

## Content bank

Game content is prepared ahead of time and stored, not written while players wait. That keeps games starting instantly, keeps the cost fixed however many people play, and means everything has been checked before anyone sees it.

Each game that needs content gets its own table: quiz questions first, later word lists (Word Rush), group sets (Connections), and prompts for the social games (Most Likely To, Would You Rather, Predict Me).

### Quiz questions (D1 / SQLite)

```sql
CREATE TABLE questions (
  id              TEXT PRIMARY KEY,
  category        TEXT NOT NULL,        -- bible, geography, football, nigerian-culture, ...
  topic           TEXT,                 -- e.g. "Genesis", "Rivers", "Premier League"
  difficulty      TEXT NOT NULL,        -- easy, medium, hard
  prompt          TEXT NOT NULL,
  choices         TEXT NOT NULL,        -- JSON array, correct answer first
  explanation     TEXT,
  reference       TEXT,                 -- e.g. "Genesis 6:14"
  time_sensitive  INTEGER NOT NULL DEFAULT 0,  -- facts that can go stale (football, pop culture)
  checked_at      INTEGER NOT NULL,     -- when the facts were last verified
  content_hash    TEXT NOT NULL UNIQUE, -- normalised prompt + answer, for de-duplication
  status          TEXT NOT NULL DEFAULT 'approved',  -- approved, flagged, retired
  reports         INTEGER NOT NULL DEFAULT 0,
  rand_key        REAL NOT NULL,        -- stored random value for fast random draws
  created_at      INTEGER NOT NULL
);
CREATE INDEX idx_draw ON questions (category, difficulty, status, rand_key);
```

### Drawing a question set

- The room picks a random point and walks the `idx_draw` index from there. That's fast at any size, unlike `ORDER BY RANDOM()`.
- **Avoiding repeats:** each browser keeps a list of recently seen question IDs, and signed-in players' match history is used too. Those questions are skipped where possible.
- A **"report this question"** button increments `reports`. Questions with too many reports are flagged and hidden until reviewed.
- **Stale facts:** time-sensitive questions are re-verified on a schedule, and retired if they no longer hold ("Who won the last World Cup?").

### Generation pipeline (`tools/content-gen`)

An offline script that fills and grows the bank. It never runs during a game.

1. **Plan coverage.** Each category has a topic list (Bible: books, people, events; Geography: continents, capitals, rivers; ...). Requests are spread across topics and difficulties so the bank doesn't cluster around the same famous facts.
2. **Generate** candidate questions in batches through an LLM API, as structured JSON.
3. **Validate** each candidate against the schema: exactly one correct answer, distinct choices, length limits.
4. **De-duplicate** with a normalised content hash, plus a similarity check against existing questions on the same topic.
5. **Verify** with a separate pass that answers each question independently. If it disagrees with the stated answer, or finds the question ambiguous, the question is flagged for manual review instead of being imported. Bible questions must include a verse reference.
6. **Import** approved questions into D1.

Estimated cost is a few dollars per 10,000 questions. The same pipeline, with a different schema and checks, produces content for the other games.

To unblock the first playable version, we seed it with a small hand-checked Bible set (100–200 questions) before the pipeline is built.

## Accounts (optional)

Anyone can play as a guest with just a nickname. An account is optional and adds the features that need a lasting identity:

- **Friends:** add friends by username or with an invite link.
- **Pings:** tell a friend you're free to play. They get a notification with a link to your room ("Tolu wants to play. Join K7QX2M").
- **History and stats:** every game you've played, your wins and losses against each friend, and your best categories.
- **Group leaderboards:** save a friend group ("Game night crew") and see who tops each category across the games you've played together.

Guests appear in results like everyone else, but nothing is saved for them.

### Identity

- A **player** exists inside one room, as it does today. A **user** is an account. When a signed-in user joins a room, the Worker checks their session on the WebSocket upgrade and passes the user ID to the room, which records it on the player. Rooms and game modules don't need to know the difference.
- Each browser also has a random **guest ID** in `localStorage`, which the room records for guest players when a game ends.
- **Signing up after a game** attaches that browser's recent guest games to the new account, so the game that convinced someone to sign up still counts.

### Sign-in

Google sign-in and email sign-in links, with no passwords to store or reset. It's built on an established auth library running in the Worker (Better Auth, with sessions in D1), not hand-written security code. Passkeys can come later.

### Recording results

When a game finishes, the room writes one match record to D1: the game, variant, category and difficulty, and each player's placing and score, with their user ID or guest ID. Stats, head-to-head records and leaderboards are all queries over these records, so new stats can be added later without touching any game.

```sql
users                (id, username, display_name, created_at)
friendships          (user_id, friend_id, status, created_at)   -- requested, accepted, blocked
friend_groups        (id, owner_id, name)
friend_group_members (group_id, user_id)
matches              (id, game, variant, category, difficulty, finished_at)
match_players        (match_id, user_id, guest_id, nickname, placing, score)  -- one of user_id / guest_id
push_subscriptions   (user_id, endpoint, keys, created_at)
```

### Notifications

Pings use **Web Push**, which works in current browsers, including on iPhone once the site is added to the home screen. A native app later registers with the same system, so pings work the same way. Players can turn pings off, mute a friend and set quiet hours.

### Privacy

Accounts mean storing personal data, so they launch with a privacy policy and terms, account deletion that removes personal data, a data export, and a minimum age of 13.

## Canvas games (after launch)

Jigsaw, Spot It, Reaction and Draw & Guess use **Phaser**, loaded only when one of those games starts.

- **Identical boards:** the server sends a seed, and every player's jigsaw pieces or Spot It grid are generated from it, so everyone gets the same challenge.
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

- **Rate limiting** room creation and joins per IP, using the Workers rate-limiting binding.
- **Validation** of every incoming message with a size cap. Unknown or malformed messages are dropped.
- **Nickname and text filtering** for length, characters and a basic profanity list. This matters more once social games let players type answers.
- **Guests leave nothing behind.** Nicknames, typed answers and uploaded images live only as long as the room. Account data is covered in [Privacy](#privacy).
- **Account sessions** are checked by the Worker. The room only ever receives a verified user ID, never a password or token it has to trust.
- **Hidden information stays on the server** until a player is allowed to see it.

## Testing and CI

- **Unit tests** (Vitest) for `game-core`: every game module, scoring, timing clamps, content drawing. Game modules are pure, so tests replay a seed and a list of actions and check the result.
- **Integration tests** for the Room Durable Object, using Cloudflare's Vitest pool to run it in the real Workers runtime.
- **End-to-end tests** (Playwright, phone-sized screens): several browsers join the same room, reload, drop off and hand over the host role. Full games are added with each game.
- **GitHub Actions** on every push and pull request: format, lint, typecheck, tests and a production build.

## Key decisions

| Decision          | Chosen                                                       | Alternatives considered                                           | Why                                                                                                                                    |
| ----------------- | ------------------------------------------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Real-time backend | Cloudflare Workers + Durable Objects                         | Node.js + `ws`/Socket.IO on a VM, with Redis for multiple servers | Rooms map directly to Durable Objects. No routing layer, no always-on server bill, handles spikes on its own                           |
| Game rules        | Pure game modules behind one interface                       | Separate server code per game                                     | New games reuse rooms, reconnection and timing. Rules are testable and replayable without a network                                    |
| Frontend          | React + Vite, TypeScript                                     | Next.js                                                           | The app is interactive and client-side. A single-page app is simpler and faster to load                                                |
| Transport         | Raw WebSocket + zod-validated JSON                           | Socket.IO, Colyseus                                               | Small, explicit, typed protocol with no extra runtime dependency                                                                       |
| Content           | Pre-built, verified content bank                             | Generating content live per game                                  | Instant starts, fixed cost, everything checked, easy to avoid repeats                                                                  |
| 2D games          | Phaser (lazy-loaded)                                         | Plain canvas                                                      | Mature 2D engine, good fit for jigsaws, drawing and reaction games                                                                     |
| 3D                | Not now                                                      | PlayCanvas                                                        | No 3D game is planned yet. Revisit if one is designed                                                                                  |
| Accounts          | Optional: guests play, accounts add stats, friends and pings | Required sign-up; no accounts at all                              | Required sign-up loses people before their first game. With no accounts, there's no way to reach a friend or keep head-to-head records |
| Sign-in           | Auth library in the Worker (Better Auth, D1)                 | Hosted provider (Clerk, Auth0); hand-written auth                 | Data stays in our database with no per-user fees, and no security-critical code written from scratch                                   |
| Language          | TypeScript everywhere                                        | Java                                                              | One language across client, server and tools, with shared types. The Workers runtime runs JavaScript/TypeScript                        |

## Build plan

| Milestone                    | Scope                                                                                                                              | Status |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **M0: Foundations**          | Monorepo, lint/format, CI, Worker + Room Durable Object, web app, room codes, WebSocket ping                                       | Done   |
| **M1: Rooms**                | Nicknames, live lobby, invite link, host and host handover, reconnection, room expiry, end-to-end tests                            | Done   |
| **M2: Quiz**                 | Game module runner, game settings in the lobby, Classic and Speed Quiz, seeded Bible set, scoring, live results, rematch           |        |
| **M3: Content pipeline**     | Generate, validate, de-duplicate, verify, import. Fill all 11 quiz categories                                                      |        |
| **M4: Accounts and friends** | Sign-in, profiles, friends, pings (web push), match history, head-to-head records, group leaderboards, account deletion and export |        |
| **M5: Launch**               | Streak and Elimination, visual design, sounds, report button, no repeated questions, rate limiting, privacy policy                 |        |
| **After launch**             | New games category by category, in the order in [GAMES.md](GAMES.md)                                                               |        |

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

- A free **Cloudflare account** is needed before the first deploy. Then `pnpm deploy` publishes the whole app.
- An **LLM API key** is needed for the content pipeline (M3).
- For accounts (M4): a **Google sign-in client** (free, from Google Cloud), an email sending service for sign-in links, and a **privacy policy and terms**.
- **Domain name:** optional. The app can run on a free `*.workers.dev` address until there is one.
