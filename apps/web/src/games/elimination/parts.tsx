import type { EliminationStanding, KnockoutStage, KnockoutViewBase } from "@whizard/game-core";
import { useEffect, type ReactNode } from "react";
import { AddFromGame } from "../../FriendsScreen";
import type { RoomClient, RoomSnapshot } from "../../roomClient";
import { play } from "../../sounds";
import { Avatar } from "../../ui/Avatar";
import { Brand } from "../../ui/Chrome";
import { Icon } from "../../ui/Icon";
import { PlayBoard } from "../play";
import { MuteButton } from "../../ui/MuteButton";
import { useServerNow } from "../../useServerNow";
import { buildCard } from "../../share/outcomes";
import { useShareResults } from "../../share/ShareResults";

// What every game's Elimination screens share: the bar, the knock-outs, the final's intro, the
// board and the winner. Each game brings its own question and answer screens.

type AnyStage = KnockoutStage<object, object, object>;
export type AnyEliminationView = KnockoutViewBase<AnyStage>;
export type StageOf<K extends AnyStage["kind"]> = Extract<AnyStage, { kind: K }>;

export interface EliminationContext {
  view: AnyEliminationView;
  client: RoomClient;
  room: RoomSnapshot;
  playerId: string;
  isHost: boolean;
  latency: ReactNode;
  onQuit: () => void;
  avatarOf: (playerId: string) => string | null;
  /** The game, and its topic if it has one: "Bible", "Word Rush". */
  title: string;
  /** What one item is called: "Question", "Word", "Grid". */
  noun: string;
  /** The picture and colours for the shareable results card. */
  art: string;
  colors: [string, string];
}

export const ordinal = (n: number) => {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
};

/** Where the game is: "Round 2 of 4 · Grid 3 of 5", "The Final · Word 2 of 5". */
export function eliminationWhere(context: EliminationContext): string {
  const { view } = context;
  const where = view.inFinal
    ? view.suddenDeath
      ? "Sudden death"
      : "The Final"
    : view.round !== null
      ? `Round ${view.round} of ${view.rounds}`
      : "";
  // Between items (knock-outs, the final's intro) there's nothing to count.
  if (view.stage.kind !== "question" && view.stage.kind !== "reveal") return where;
  return view.roundItem
    ? `${where} · ${context.noun} ${view.roundItem.number} of ${view.roundItem.of}`
    : `${where} · ${context.noun} ${view.questionNumber}`;
}

export function Bar({ context, timer }: { context: EliminationContext; timer?: ReactNode }) {
  const { view, room, onQuit, latency } = context;
  return (
    <header className="game-bar">
      <div className="game-bar-row">
        <span className="bar-brand">
          <Brand />
        </span>
        <span className="room-label" translate="no">
          Room: {room.code}
        </span>
        <span className="progress elim-progress">{eliminationWhere(context)}</span>
        <span className="bar-end">
          <span className="pill elim-left" title="Players still in">
            <Icon name="users" size={18} />
            {view.aliveCount} in
          </span>
          {latency}
          {timer}
          <MuteButton />
          <button className="btn quit-btn" onClick={onQuit}>
            Quit
          </button>
        </span>
      </div>
    </header>
  );
}

/** Shown to anyone knocked out or who joined late. */
export function Watching({ view }: { view: AnyEliminationView }) {
  if (!view.me || view.me.status === "in" || view.me.status === "finalist") return null;
  return (
    <p className="elim-watching" role="status">
      <Icon name="users" size={18} />
      {view.me.status === "watching"
        ? "You joined mid-game, so you’re watching this one."
        : `You’re out${view.me.outRound ? ` (round ${view.me.outRound})` : ""}. Watching the rest.`}
    </p>
  );
}

/** The time left on an item, for the bar. */
export function TimerPill({ remaining, limitMs }: { remaining: number; limitMs: number }) {
  return (
    <span
      className={`timer-pill${remaining / limitMs < 0.25 ? " low" : ""}`}
      role="progressbar"
      aria-label="Time left"
      aria-valuemin={0}
      aria-valuemax={limitMs}
      aria-valuenow={remaining}
    >
      <Icon name="clock" size={22} stroke={2.4} />
      {Math.ceil(remaining / 1000)}s
    </span>
  );
}

export function Cut({ context, stage }: { context: EliminationContext; stage: StageOf<"cut"> }) {
  const { view, client, playerId, avatarOf } = context;
  const now = useServerNow(client.serverNow);
  const meOut = stage.out.some((p) => p.playerId === playerId);
  const through = view.me?.status === "in" || view.me?.status === "finalist";
  useEffect(() => {
    if (meOut) play("wrong");
    else if (through) play("correct");
  }, [meOut, through]);
  const seconds = Math.max(0, Math.ceil((stage.until - now) / 1000));
  return (
    <div className="game">
      <Bar context={context} />
      <section className="elim-cut panel" aria-labelledby="cut-title">
        <p className="elim-kicker">Round {stage.round} results</p>
        <h2 className="display" id="cut-title">
          {stage.out.length === 0 ? "Nobody goes this round" : `${stage.out.length} knocked out`}
        </h2>
        {stage.tieKept && (
          <p className="muted">
            {stage.out.length === 0
              ? "It was a tie at the line, so everyone stays."
              : "A tie at the line kept an extra player in."}
          </p>
        )}
        {stage.out.length > 0 && (
          <ul className="elim-out">
            {stage.out.map((p) => (
              <li key={p.playerId} className={p.playerId === playerId ? "me" : ""}>
                <Avatar id={avatarOf(p.playerId)} name={p.nickname} size={56} />
                <span>{p.playerId === playerId ? "You" : p.nickname}</span>
              </li>
            ))}
          </ul>
        )}
        <p className={`elim-you ${meOut ? "bad" : through ? "good" : ""}`} role="status">
          {meOut
            ? `You’re out! You finished ${view.me?.rank ? ordinal(view.me.rank) : "this game"}. Stay and watch the rest.`
            : through
              ? stage.next === "final"
                ? "You’re in the final!"
                : "You’re through to the next round!"
              : ""}
        </p>
        <p className="muted">
          {stage.next === "final" ? "The final starts" : `Round ${stage.round + 1} starts`} in{" "}
          {seconds}s
        </p>
      </section>
    </div>
  );
}

export function FinalIntro({
  context,
  stage,
}: {
  context: EliminationContext;
  stage: StageOf<"final">;
}) {
  const { client, playerId, avatarOf } = context;
  const now = useServerNow(client.serverNow);
  useEffect(() => play("go"), []);
  const [a, b] = stage.finalists;
  const seconds = Math.max(0, Math.ceil((stage.until - now) / 1000));
  const face = (p: typeof a) =>
    p && (
      <div className="elim-finalist">
        <Avatar id={avatarOf(p.playerId)} name={p.nickname} size={110} />
        <strong>{p.playerId === playerId ? "You" : p.nickname}</strong>
      </div>
    );
  return (
    <div className="game">
      <Bar context={context} />
      <section className="elim-final panel" aria-labelledby="final-title">
        <p className="elim-kicker">Two left</p>
        <h2 className="display" id="final-title">
          The <span className="gradient-text">Final</span>
        </h2>
        <div className="elim-versus">
          {face(a)}
          <span className="elim-vs" aria-label="versus">
            VS
          </span>
          {face(b)}
        </div>
        <p className="muted">
          Scores go back to zero.{" "}
          {`${stage.length} ${context.noun.toLowerCase()}${stage.length === 1 ? "" : "s"}`}, most
          points wins; if it’s level, sudden death.
        </p>
        <p className="countdown-number small">{seconds}</p>
      </section>
    </div>
  );
}

/** Everyone's standing: who's still in, then who went out when. */
/** Who's still in, and the knocked out. Drawn by `PlayBoard`, like every game's scores. */
export function Board({ context }: { context: EliminationContext }) {
  const { view, playerId, avatarOf } = context;
  const finalScores = new Map((view.finalScores ?? []).map((f) => [f.playerId, f.score]));
  return (
    <PlayBoard
      label="Players"
      title={view.inFinal ? "Final" : `${view.aliveCount} still in`}
      playerId={playerId}
      rows={view.standings.map((s) => ({
        playerId: s.playerId,
        nickname: s.nickname,
        avatar: avatarOf(s.playerId),
        rank: s.rank,
        gone: s.status === "out" || s.status === "left",
        value:
          s.status === "out"
            ? `Out · R${s.outRound}`
            : s.status === "left"
              ? "Left"
              : (finalScores.get(s.playerId) ?? s.score).toLocaleString(),
      }))}
    />
  );
}

const STATUS: Record<EliminationStanding["status"], string> = {
  in: "Still in",
  finalist: "Finalist",
  winner: "Winner",
  "runner-up": "Runner-up",
  out: "Out",
  left: "Left",
};

/** The winner, the rankings, and whatever review the game has of your own play. */
export function Done({
  context,
  stage,
  children,
}: {
  context: EliminationContext;
  stage: StageOf<"done">;
  children?: ReactNode;
}) {
  const { view, client, isHost, playerId, room, title, avatarOf } = context;
  useEffect(() => play("fanfare"), []);
  const winner = stage.winner;
  const iWon = winner?.playerId === playerId;
  const usernames = room.players.flatMap((p) => (p.username ? [p.username] : []));
  const text = iWon
    ? `I won an Elimination game of ${title} on Whizard! 🏆`
    : `Play an Elimination game of ${title} with me on Whizard!`;
  const placed = view.standings.filter((s) => s.status !== "left");
  const { open: share, dialog: shareDialog } = useShareResults(
    buildCard({
      title,
      subtitle: `Elimination · ${view.playerCount} players`,
      art: context.art,
      colors: context.colors,
      // Placings, not points, decide Elimination: the bars follow the placing.
      rows: placed.map((s, i) => ({
        playerId: s.playerId,
        nickname: s.nickname,
        avatar: avatarOf(s.playerId),
        value: placed.length - i,
        label:
          s.status === "winner"
            ? "Winner"
            : s.status === "runner-up"
              ? "Final"
              : s.outRound
                ? `Out · R${s.outRound}`
                : STATUS[s.status],
      })),
      me: playerId,
      score: { value: (view.me?.score ?? 0).toLocaleString(), unit: "points" },
      correct: null,
      items: view.questionNumber,
      facts: [],
      elimination: { outRound: view.me?.outRound ?? null },
    }),
    text,
  );
  return (
    <div className="results">
      <header className="results-bar">
        <Brand />
        <span className="bar-end">
          <button className="btn bar-pill" onClick={share}>
            <Icon name="share" size={20} />
            <span>Share</span>
          </button>
          <button className="btn bar-pill" onClick={context.onQuit}>
            <Icon name="home" size={20} />
            <span>Home</span>
          </button>
        </span>
      </header>
      <div className="results-layout">
        <section className="results-main elim-winner">
          <p className="elim-kicker">Elimination · {title}</p>
          {winner ? (
            <>
              <div className="elim-crowned">
                <span className="podium-crown" aria-hidden="true">
                  <Icon name="crown" size={52} fill />
                </span>
                <Avatar id={avatarOf(winner.playerId)} name={winner.nickname} size={150} />
              </div>
              <h2 className="display results-title">
                {iWon ? (
                  <>
                    You <span className="gradient-text">won!</span>
                  </>
                ) : (
                  <>
                    {winner.nickname} <span className="gradient-text">wins!</span>
                  </>
                )}
              </h2>
            </>
          ) : (
            <h2 className="display results-title">Game over</h2>
          )}
          {view.me && !iWon && view.me.rank && (
            <p className="muted center">
              You finished {ordinal(view.me.rank)}
              {view.me.outRound ? `, out in round ${view.me.outRound}` : ""}.
            </p>
          )}
          {isHost ? (
            <div className="results-actions">
              <button className="btn btn-primary" onClick={() => client.startGame()}>
                <Icon name="play" size={20} fill />
                Play Again
              </button>
              <button className="btn" onClick={() => client.backToLobby()}>
                <Icon name="games" size={22} />
                Change Game
              </button>
            </div>
          ) : (
            <p className="muted center">Waiting for the host to start the next game.</p>
          )}
        </section>
        <aside className="panel rankings" aria-labelledby="rankings-title">
          <h2 className="rankings-title" id="rankings-title">
            <Icon name="trophy" size={24} />
            Final Rankings
          </h2>
          <ol className="board">
            {view.standings.map((s) => (
              <li
                key={s.playerId}
                className={[
                  s.status === "winner" ? "first" : "",
                  s.playerId === playerId ? "me" : "",
                  s.status === "left" ? "gone" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span className={`rank rank-${s.rank}`}>{s.rank}</span>
                <Avatar id={avatarOf(s.playerId)} name={s.nickname} size={40} />
                <span className="name">{s.nickname}</span>
                <span className="playing">
                  {s.status === "out" ? `Out in round ${s.outRound}` : STATUS[s.status]}
                </span>
              </li>
            ))}
          </ol>
        </aside>
      </div>
      <AddFromGame usernames={usernames} />
      {children}
      {shareDialog}
    </div>
  );
}
