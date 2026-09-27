# Whizard

Real-time games to play with friends, whether you're in the same room or on opposite sides of the world.

Pick a nickname, share a room code, and everyone gets the same challenge at the same time. Results update live as each player finishes.

Free to play. No sign-up.

## Games

- **Quiz** (launch game): Bible, Geography, History, Science, Animals, Football, Movies, Music, Nigerian culture, General knowledge and Pop culture, in Classic, Speed, Streak and Elimination variants
- **Coming later:** Word Rush, Memory, Reaction, Spot It, Pattern, Connections, social games like Most Likely To and How Well Do You Know Me?, and party games like Impostor and Draw & Guess

The full list is in [docs/GAMES.md](docs/GAMES.md).

## Status

Early development. The project foundations are in place, and rooms and the quiz are next. See the [architecture and build plan](docs/ARCHITECTURE.md).

## Tech stack

- **Client:** React, Vite, TypeScript, Phaser (canvas games)
- **Server:** Cloudflare Workers and Durable Objects (one per game room), WebSockets
- **Data:** Cloudflare D1 (content bank), R2 (images)
- **Testing:** Vitest, Playwright

## Running locally

Requires Node.js 22 and pnpm.

```sh
pnpm install
pnpm dev          # web app and server together on http://localhost:5173
pnpm test         # unit tests
pnpm lint
pnpm typecheck
```
