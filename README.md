# Whizard

Real-time quiz and puzzle games to play with friends, whether you're in the same room or on opposite sides of the world.

Pick a nickname, share a room code, and everyone gets the same questions. Choose a category (Bible, Geography, Biology and more), a difficulty and how many questions to play. Points depend on accuracy and speed, and results update live as each player finishes.

Free to play. No sign-up.

## Status

Early development. See the [architecture and build plan](docs/ARCHITECTURE.md).

## Planned features

- **Race quiz:** same questions for everyone, each player at their own pace, live results
- **Categories and difficulty:** Bible, Geography, Biology and more, from easy to hard
- **Puzzle mode:** jigsaw races with a random image or your own photo
- **Live mode:** host-paced rounds for game nights

## Tech stack

- **Client:** React, Vite, TypeScript, Phaser (puzzles)
- **Server:** Cloudflare Workers and Durable Objects (one per game room), WebSockets
- **Data:** Cloudflare D1 (question bank), R2 (puzzle images)
- **Testing:** Vitest, Playwright
