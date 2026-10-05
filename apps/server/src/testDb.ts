// A stand-in for D1 in unit tests: an in-memory SQLite database from Node, with every migration
// applied, behind the few D1 calls the server makes, and helpers to fill it with accounts and
// finished games. Only for tests; the Worker never loads it.

interface SqliteStatement {
  all(...params: unknown[]): Record<string, unknown>[];
  get(...params: unknown[]): Record<string, unknown> | undefined;
  run(...params: unknown[]): { changes: number | bigint };
}

interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
}

class Statement {
  constructor(
    private readonly db: SqliteDatabase,
    private readonly sql: string,
    private readonly params: unknown[] = [],
  ) {}

  bind(...params: unknown[]) {
    return new Statement(this.db, this.sql, params);
  }

  async all() {
    return { results: this.db.prepare(this.sql).all(...this.params), success: true, meta: {} };
  }

  async first(column?: string) {
    const row = this.db.prepare(this.sql).get(...this.params) ?? null;
    return column && row ? (row[column] ?? null) : row;
  }

  async run() {
    const { changes } = this.db.prepare(this.sql).run(...this.params);
    return { results: [], success: true, meta: { changes: Number(changes) } };
  }
}

/** A fresh database with the schema from `migrations/`, as D1. */
export async function testDb(): Promise<D1Database> {
  // Named at run time, so the Worker's type check doesn't look for Node's modules.
  const sqliteModule = "node:sqlite";
  const fsModule = "node:fs";
  const { DatabaseSync } = (await import(sqliteModule)) as {
    DatabaseSync: new (path: string) => SqliteDatabase;
  };
  const fs = (await import(fsModule)) as {
    readdirSync(path: URL): string[];
    readFileSync(path: URL, encoding: "utf8"): string;
  };
  const db = new DatabaseSync(":memory:");
  const folder = new URL("../migrations/", (import.meta as ImportMeta & { url: string }).url);
  for (const file of fs.readdirSync(folder).sort()) {
    if (file.endsWith(".sql")) db.exec(fs.readFileSync(new URL(file, folder), "utf8"));
  }
  const d1 = {
    prepare: (sql: string) => new Statement(db, sql),
    batch: async (statements: Statement[]) => {
      const results = [];
      for (const statement of statements) results.push(await statement.all());
      return results;
    },
    exec: async (sql: string) => db.exec(sql),
  };
  return d1 as unknown as D1Database;
}

// Accounts and games -------------------------------------------------------------------------

let nextMatch = 0;

export async function addUser(db: D1Database, id: string, name = id) {
  await db
    .prepare("INSERT INTO users (id, username, display_name, created_at) VALUES (?, ?, ?, ?)")
    .bind(id, id, name, 0)
    .run();
}

export async function makeFriends(db: D1Database, a: string, b: string, at = 0) {
  for (const [from, to] of [
    [a, b],
    [b, a],
  ]) {
    await db
      .prepare("INSERT INTO friends (user_id, friend_id, created_at) VALUES (?, ?, ?)")
      .bind(from, to, at)
      .run();
  }
}

export interface TestGame {
  game?: string;
  category?: string | null;
  difficulty?: string | null;
  rounds?: number;
  startedAt?: number;
  finishedAt: number;
  /** Best first: [user ID, score, correct]. A null ID is a guest. The fourth item is a
   * player's fastest single tap, for Reaction. */
  players: [string | null, number, number | null, (number | null)?][];
}

export async function addGame(db: D1Database, game: TestGame): Promise<string> {
  const id = `m${++nextMatch}`;
  await db
    .prepare(
      `INSERT INTO matches
         (id, game, category, difficulty, mode, rounds, player_count, started_at, finished_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      game.game ?? "quiz",
      game.category ?? null,
      game.difficulty ?? null,
      game.rounds ?? 10,
      game.players.length,
      game.startedAt ?? game.finishedAt - 60_000,
      game.finishedAt,
    )
    .run();
  for (const [i, [userId, score, correct, bestMs]] of game.players.entries()) {
    await db
      .prepare(
        `INSERT INTO match_players (match_id, placing, user_id, guest_id, nickname, score, correct, best_ms)
         VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`,
      )
      .bind(id, i + 1, userId, userId ?? "Guest", score, correct, bestMs ?? null)
      .run();
  }
  return id;
}
