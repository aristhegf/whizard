# Whizard

Real-time games to play with friends, whether you're in the same room or on opposite sides of the world.

Pick a nickname, share a room code, and everyone gets the same challenge at the same time. Results update live as each player finishes.

Free to play, with no sign-up needed. An optional account keeps your stats and lets you ping friends when you're free to play.

## Games

- **Quiz** (launch game): Bible, Geography, History, Science, Animals, Football, Movies, Music, Nigerian culture, General knowledge and Pop culture, in Classic (no clock), Speed (a timer on every question) and Elimination (everyone answers together; the lowest scores are knocked out each round until two meet in a final)
- **Word Rush:** unscramble words or fill in their missing letters, with a hint for each, in Speed or Elimination
- **Spot It:** find the odd one out in a grid, in Speed or Elimination
- **Reaction:** everyone sees the signal at the same instant; tap the moment the pad lights up green, and don't tap early
- **Memory:** the same set of items on every screen for the same beat, then the question — which one was NOT shown, what sat in position 4, how many animals did you see?
- **Levels everywhere:** Easy, Medium, Hard, or Auto, which starts easy and gets harder round by round
- **Coming later:** Pattern, social games like Most Likely To and How Well Do You Know Me?, and party games like Impostor and Draw & Guess

The full list is in [docs/GAMES.md](docs/GAMES.md).

## Status

Launched. The quiz has 1,980 fact-checked questions across 11 categories, 60 at every level of each: pick a topic, then play solo or invite friends with a link, code or QR code. Choose Classic, Speed or Elimination, a level and the number of questions. Everyone starts together and plays at their own pace; on tablets and computers a live scoreboard shows everyone's points. At the end there's a podium, the final rankings and a private review of your own answers, where any question can be reported. Games avoid questions you or your friends have already had, and there are sounds, with a mute button. Word Rush (240 words) and Spot It can be started from their cards on the Games page, or picked in any lobby, in Speed (same puzzles for everyone, own pace, a podium at the end) or Elimination. Every game has Easy, Medium, Hard and Auto levels; Auto starts easy and blends in harder questions round by round until the final is all hard.

Optional accounts sign in with a passkey (no passwords) and keep your game history and stats, including games you played as a guest just before signing up. Add friends by username, invite link or straight from a game's results to see your record against each of them, and save groups with their own leaderboards. Ping a friend and they get a notification that opens your room, with mute and quiet hours on their side. The home page shows how many people have visited and how many are here now, and `/stats` has the numbers behind them: visits, rooms created, games played, where visitors came from and more. Admins get a dashboard at `/admin` with the site's numbers, live rooms, accounts, reported questions, a question editor whose changes reach games without a redeploy, blocked words for names, site switches such as an announcement or pausing new rooms, games and topics on and off, and Pro members with payments recorded by hand. See the [architecture and build plan](docs/ARCHITECTURE.md).

## Tech stack

- **Client:** React, Vite, TypeScript, Phaser (canvas games)
- **Server:** Cloudflare Workers and Durable Objects (one per game room), WebSockets
- **Data:** Cloudflare D1 (accounts, match history), R2 (images, later)
- **Sign-in:** passkeys (WebAuthn, verified with SimpleWebAuthn)
- **Notifications:** Web Push, encrypted in the Worker with PushForge
- **Testing:** Vitest, Playwright

## Running locally

Requires Node.js 22 and pnpm.

```sh
pnpm install
pnpm dev          # sets up the local database, then runs the app on http://localhost:5173
pnpm test         # unit tests
pnpm e2e          # browser tests
pnpm lint
pnpm typecheck
```

## Deploying

The app runs on Cloudflare Workers. Every push to `main` that passes CI is deployed automatically, once two repository secrets are set in **Settings → Secrets and variables → Actions**:

- `CLOUDFLARE_API_TOKEN`: an API token created from the "Edit Cloudflare Workers" template, with **Account → D1 → Edit** added
- `CLOUDFLARE_ACCOUNT_ID`: the account ID shown in the Cloudflare dashboard

The deploy job creates the D1 database the first time and applies any new migrations from `apps/server/migrations/` before each deploy.

To see the site's stats as tables, run the **Site stats** workflow from the Actions tab. To open the admin dashboard at `/admin`, run the **Admins** workflow with your username and **grant**; after that, admins can add others from **Settings**.

## Adding questions

Questions live in `packages/content/src/questions/`, one file per category, and the test suite checks every one. See [docs/QUESTIONS.md](docs/QUESTIONS.md) for the format, the rules and how a batch gets fact-checked before it ships.
