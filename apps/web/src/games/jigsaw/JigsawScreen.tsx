import { type JigsawStanding, type JigsawView } from "@whizard/game-core";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AddFromGame } from "../../FriendsScreen";
import type { RoomClient, RoomSnapshot } from "../../roomClient";
import { play } from "../../sounds";
import { useServerNow } from "../../useServerNow";
import { Avatar } from "../../ui/Avatar";
import { Brand } from "../../ui/Chrome";
import { Icon } from "../../ui/Icon";
import { MuteButton } from "../../ui/MuteButton";
import { Podium } from "../../ui/Podium";
import { CATALOG } from "../../catalog";
import { buildCard } from "../../share/outcomes";
import { useShareResults } from "../../share/ShareResults";
import { sizeName } from "./JigsawSettingsPanel";

interface Props {
  view: JigsawView;
  client: RoomClient;
  room: RoomSnapshot;
  playerId: string;
  isHost: boolean;
  /** The connection indicator, shown in the top bar. */
  latency: ReactNode;
  /** Leaves the room. Asks first while the game is still running. */
  onQuit: () => void;
}

/** A swap sent but not yet confirmed; dropped if the server doesn't agree soon. */
const OPTIMISTIC_MS = 2500;

/** "1:05" from milliseconds. */
export function clock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function JigsawScreen(props: Props) {
  const { view } = props;
  if (view.final) return <Results {...props} />;
  if (view.board === null || view.startsAt === null) {
    return (
      <div className="game">
        <Bar {...props} />
        <div className="game-layout">
          <div className="game-main">
            <p className="watching">A game is in progress. You’ll be in the next one.</p>
          </div>
          <LiveBoard {...props} />
        </div>
      </div>
    );
  }
  return <Playing {...props} board={view.board} startsAt={view.startsAt} />;
}

function Playing(props: Props & { board: number[]; startsAt: number }) {
  const { view, client, startsAt } = props;
  const now = useServerNow(client.serverNow);
  const [selected, setSelected] = useState<number | null>(null);
  const [local, setLocal] = useState<{ board: number[]; moves: number; at: number } | null>(null);
  const started = now >= startsAt;
  const countdown = Math.max(1, Math.ceil((startsAt - now) / 1000));
  const finished = !!view.me?.finished;

  // Your own swaps show at once; the server's board takes over when it catches up.
  const board =
    local && local.moves > view.moves && now - local.at < OPTIMISTIC_MS ? local.board : props.board;
  const total = view.side * view.side;
  const placed = board.reduce((n, piece, spot) => n + (piece === spot ? 1 : 0), 0);

  // A tick for each second of the countdown, "go" at the start, a click for each piece placed.
  useEffect(() => {
    if (!started) play("tick");
  }, [started, countdown]);
  const wasStarted = useRef(started);
  useEffect(() => {
    if (started && !wasStarted.current) play("go");
    wasStarted.current = started;
  }, [started]);
  const lastPlaced = useRef(placed);
  useEffect(() => {
    if (placed > lastPlaced.current) play("place");
    lastPlaced.current = placed;
  }, [placed]);

  const swap = (a: number, b: number) => {
    if (a === b || board[a] === a || board[b] === b) return;
    const next = [...board];
    [next[a], next[b]] = [next[b]!, next[a]!];
    setLocal({ board: next, moves: Math.max(view.moves, local?.moves ?? 0) + 1, at: now });
    setSelected(null);
    client.act({ type: "swap", a, b });
  };

  const tap = (spot: number) => {
    if (!started || finished || board[spot] === spot) return;
    if (selected === null) setSelected(spot);
    else if (selected === spot) setSelected(null);
    else swap(selected, spot);
  };

  if (!started) {
    return (
      <div className="game">
        <Bar {...props} />
        <div className="countdown jigsaw-countdown" aria-live="polite">
          <img className="jigsaw-preview" src={view.picture.src} alt={view.picture.name} />
          <p className="countdown-label">Get ready · {sizeName(view.side)}</p>
          <p className="countdown-number">{countdown}</p>
        </div>
      </div>
    );
  }

  const elapsed = (finished && view.me?.timeMs) || now - startsAt;
  const left = view.deadline === null ? null : view.deadline - now;
  return (
    <div className="game">
      <Bar
        {...props}
        progress={placed / total}
        middle={
          <span className="progress">
            {placed} / {total}
            <span className="progress-word"> placed</span>
          </span>
        }
        timer={
          <span
            className={`timer-pill${left !== null && left < 60_000 && !finished ? " low" : ""}`}
            role="timer"
            aria-label="Time"
          >
            <Icon name="clock" size={22} stroke={2.4} />
            {clock(elapsed)}
          </span>
        }
      />
      <div className="game-layout">
        <div className="game-main jigsaw-main">
          <Board
            side={view.side}
            src={view.picture.src}
            board={board}
            selected={selected}
            done={finished}
            onTap={tap}
            onSwap={swap}
          />
          {/* Phones have no side panel, so the picture to copy sits under the board. */}
          <figure className="jigsaw-peek">
            <img src={view.picture.src} alt="" />
            <figcaption className="dim small">{view.picture.name}</figcaption>
          </figure>
          {finished ? (
            <p className="verdict good" role="status">
              Solved in {clock(view.me?.timeMs ?? 0)} · {view.moves} moves
              <span className="dim small jigsaw-wait">Waiting for everyone to finish…</span>
            </p>
          ) : (
            <p className="muted small jigsaw-help">
              Tap two pieces to swap them, or drag one onto another. Pieces in their place lock.
            </p>
          )}
        </div>
        <aside className="jigsaw-side">
          <figure className="panel jigsaw-reference">
            <img src={view.picture.src} alt="" />
            <figcaption className="dim small">{view.picture.name}</figcaption>
          </figure>
          <LiveBoard {...props} />
        </aside>
      </div>
    </div>
  );
}

/** The puzzle: tap one piece then another, or drag one onto another, to swap them. */
function Board({
  side,
  src,
  board,
  selected,
  done,
  onTap,
  onSwap,
}: {
  side: number;
  src: string;
  board: number[];
  selected: number | null;
  done: boolean;
  onTap: (spot: number) => void;
  onSwap: (a: number, b: number) => void;
}) {
  const dragFrom = useRef<number | null>(null);
  // On touch screens the piece a drag started on also gets a click; that one isn't a tap.
  const dragged = useRef(false);
  const spotAt = (x: number, y: number) => {
    const target = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-spot]");
    return target ? Number(target.dataset.spot) : null;
  };

  return (
    <div
      className={`jigsaw-board${done ? " done" : ""}`}
      style={{ "--side": side } as CSSProperties}
      role="group"
      aria-label={`Puzzle, ${side} by ${side}`}
    >
      {board.map((piece, spot) => {
        const placed = piece === spot;
        const row = Math.floor(piece / side);
        const col = piece % side;
        return (
          <button
            key={spot}
            type="button"
            data-spot={spot}
            data-piece={piece}
            className={`jigsaw-piece${placed ? " placed" : ""}${selected === spot ? " selected" : ""}`}
            style={{
              backgroundImage: `url(${src})`,
              backgroundSize: `${side * 100}%`,
              backgroundPosition: `${(col / (side - 1)) * 100}% ${(row / (side - 1)) * 100}%`,
            }}
            aria-label={`Row ${Math.floor(spot / side) + 1}, column ${(spot % side) + 1}${placed ? ", in place" : ""}`}
            aria-pressed={selected === spot}
            disabled={placed || done}
            onClick={() => {
              if (dragged.current) dragged.current = false;
              else onTap(spot);
            }}
            onPointerDown={(event) => {
              if (event.pointerType !== "mouse" || event.button === 0) dragFrom.current = spot;
            }}
            onPointerUp={(event) => {
              const from = dragFrom.current;
              dragFrom.current = null;
              const to = spotAt(event.clientX, event.clientY);
              // A drag onto another piece swaps them; a tap is handled by onClick.
              if (from !== null && to !== null && to !== from) {
                dragged.current = event.pointerType !== "mouse";
                onSwap(from, to);
              }
            }}
          />
        );
      })}
    </div>
  );
}

function Bar({
  view,
  room,
  latency,
  onQuit,
  middle,
  timer,
  progress,
}: Props & { middle?: ReactNode; timer?: ReactNode; progress?: number }) {
  return (
    <header className="game-bar">
      <div className="game-bar-row">
        <span className="bar-brand">
          <Brand />
        </span>
        <span className="room-label" translate="no">
          Room: {room.code}
        </span>
        {middle ?? <span className="progress">Jigsaw · {view.picture.name}</span>}
        <span className="bar-end">
          {latency}
          {timer}
          <MuteButton />
          <button className="btn quit-btn" onClick={onQuit}>
            Quit
          </button>
        </span>
      </div>
      {progress !== undefined && (
        <div className="question-progress" aria-hidden="true">
          <div style={{ width: `${progress * 100}%` }} />
        </div>
      )}
    </header>
  );
}

const progressLabel = (s: JigsawStanding) =>
  s.left ? "Left" : s.finished ? clock(s.timeMs ?? 0) : `${s.placed}/${s.total}`;

/** Everyone's progress as they play. Only on tablets and computers; phones leave it out. */
function LiveBoard({ view, playerId, room }: Props) {
  const avatars = new Map(room.players.map((p) => [p.id, p.avatar]));
  if (view.standings.length === 0) return null;
  return (
    <aside className="panel live-board" aria-label="Live progress">
      <h2 className="live-title">
        {view.standings.length} {view.standings.length === 1 ? "player" : "players"}
      </h2>
      <ol>
        {view.standings.map((s) => (
          <li
            key={s.playerId}
            className={`${s.playerId === playerId ? "me" : ""}${s.left ? " gone" : ""}`}
          >
            <span className="rank">{s.rank}</span>
            <Avatar id={avatars.get(s.playerId) ?? null} name={s.nickname} size={40} />
            <span className="name">{s.playerId === playerId ? "You" : s.nickname}</span>
            <span className="pts">{progressLabel(s)}</span>
          </li>
        ))}
      </ol>
    </aside>
  );
}

function Results({ view, client, isHost, room, playerId, onQuit }: Props) {
  const solo = view.playerCount === 1;
  const avatars = new Map(room.players.map((p) => [p.id, p.avatar]));
  const avatarOf = (id: string) => avatars.get(id) ?? null;
  const podium = solo ? [] : view.standings.filter((s) => !s.left).slice(0, 3);
  const usernames = room.players.flatMap((p) => (p.username ? [p.username] : []));
  const me = view.me;
  useEffect(() => play("fanfare"), []);

  const text = me?.finished
    ? `I finished a ${me.total}-piece jigsaw in ${clock(me.timeMs ?? 0)} on Whizard!`
    : "Race me at a jigsaw on Whizard!";
  const { open: share, dialog: shareDialog } = useShareResults(
    buildCard({
      title: "Jigsaw",
      subtitle: `${sizeName(view.side)} · ${view.picture.name}`,
      art: view.picture.src,
      colors: CATALOG.find((g) => g.id === "jigsaw")?.colors ?? ["#ff9f2e", "#3a1a5c"],
      rows: solo
        ? []
        : view.standings
            .filter((s) => !s.left)
            .map((s) => ({
              playerId: s.playerId,
              nickname: s.nickname,
              avatar: avatarOf(s.playerId),
              value: s.placed,
              label: progressLabel(s),
              timeMs: s.timeMs,
            })),
      me: playerId,
      score: me?.finished
        ? { value: clock(me.timeMs ?? 0), unit: "to finish" }
        : { value: `${me?.placed ?? 0}/${me?.total ?? 0}`, unit: "pieces in place" },
      correct: null,
      items: 1,
      finished: me?.finished ?? false,
      facts: [
        { icon: "🧩", value: String(me?.total ?? view.side * view.side), label: "Pieces" },
        { icon: "🔁", value: String(me?.moves ?? 0), label: "Moves" },
        { icon: "⏱️", value: me?.finished ? clock(me.timeMs ?? 0) : "–", label: "Time" },
      ],
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
          <button className="btn bar-pill" onClick={onQuit}>
            <Icon name="home" size={20} />
            <span>Home</span>
          </button>
        </span>
      </header>

      <div className={`results-layout${solo ? " solo" : ""}`}>
        <section className="results-main">
          <div className="results-head">
            <h2 className="display results-title">
              Jigsaw <span className="gradient-text">Results</span>
            </h2>
            <span className="pill">
              <Icon name="trophy" size={18} />
              {view.picture.name} • {view.side * view.side} pieces
            </span>
          </div>

          {solo && me ? (
            <div className="panel solo-score jigsaw-solo">
              <img className="jigsaw-solved" src={view.picture.src} alt={view.picture.name} />
              <p className="label">{me.finished ? "Solved in" : "Pieces placed"}</p>
              <p className="big-score">
                {me.finished ? clock(me.timeMs ?? 0) : `${me.placed}/${me.total}`}
              </p>
              <p className="muted">
                {me.moves} {me.moves === 1 ? "move" : "moves"}
                {me.outOfTime && " · time ran out"}
              </p>
            </div>
          ) : (
            <Podium
              entries={podium.map((s) => ({ ...s, label: progressLabel(s) }))}
              avatarOf={avatarOf}
            />
          )}

          {isHost ? (
            <div className="results-actions">
              <button className="btn btn-primary" onClick={() => client.startGame()}>
                <Icon name="play" size={20} fill />
                Play Again
              </button>
              <button className="btn" onClick={() => client.backToLobby()}>
                <Icon name="games" size={22} />
                Change Picture
              </button>
              <button className="btn" onClick={share}>
                <Icon name="share" size={20} />
                Share Results
              </button>
            </div>
          ) : (
            <p className="muted center">Waiting for the host to start the next game.</p>
          )}
        </section>

        {!solo && (
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
                    s.rank === 1 && s.finished ? "first" : "",
                    s.playerId === playerId ? "me" : "",
                    s.left ? "gone" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <span className={`rank rank-${s.rank}`}>{s.rank}</span>
                  <Avatar id={avatarOf(s.playerId)} name={s.nickname} size={40} />
                  <span className="name">{s.nickname}</span>
                  <span className="pts">{progressLabel(s)}</span>
                </li>
              ))}
            </ol>
          </aside>
        )}
      </div>

      {!solo && <AddFromGame usernames={usernames} />}
      {shareDialog}
    </div>
  );
}
