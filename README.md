# Whizard

Real-time games to play with friends, whether you're in the same room or on opposite sides of the world.

Pick a nickname, share a room code, and everyone gets the same challenge at the same time. Results update live as each player finishes.

Free to play, with no sign-up needed. An optional account keeps your stats and lets you ping friends when you're free to play.

## Games

- **Quiz** (launch game): Bible, Geography, History, Science, Animals, Football, Movies, Music, Nigerian culture, General knowledge and Pop culture, in Classic, Speed, Streak and Elimination variants
- **Coming later:** Word Rush, Memory, Reaction, Spot It, Pattern, Connections, social games like Most Likely To and How Well Do You Know Me?, and party games like Impostor and Draw & Guess

The full list is in [docs/GAMES.md](docs/GAMES.md).

## Status

Early development. The Bible quiz is playable: play solo or invite friends with a link or code, pick Classic (no clock) or Speed (a timer on every question), a level and the number of questions. Everyone starts together and plays at their own pace, then sees a points leaderboard and a private review of their own answers. More categories are next. See the [architecture and build plan](docs/ARCHITECTURE.md).

## Tech stack

- **Client:** React, Vite, TypeScript, Phaser (canvas games)
- **Server:** Cloudflare Workers and Durable Objects (one per game room), WebSockets
- **Data:** Cloudflare D1 (content bank, accounts, match history), R2 (images)
- **Testing:** Vitest, Playwright

## Running locally

Requires Node.js 22 and pnpm.

```sh
pnpm install
pnpm dev          # web app and server together on http://localhost:5173
pnpm test         # unit tests
pnpm e2e          # browser tests
pnpm lint
pnpm typecheck
```

## Deploying

The app runs on Cloudflare Workers. Every push to `main` that passes CI is deployed automatically, once two repository secrets are set in **Settings → Secrets and variables → Actions**:

- `CLOUDFLARE_API_TOKEN`: an API token created from the "Edit Cloudflare Workers" template
- `CLOUDFLARE_ACCOUNT_ID`: the account ID shown in the Cloudflare dashboard

To deploy by hand instead, run `pnpm deploy` after `wrangler login`.
