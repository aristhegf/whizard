import { JIGSAW_PICTURES, type JigsawStanding, type JigsawView } from "@whizard/game-core";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { AddFromGame } from "../../FriendsScreen";
import type { RoomClient, RoomSnapshot } from "../../roomClient";
import { play } from "../../sounds";
import { useServerNow } from "../../useServerNow";
import { Avatar } from "../../ui/Avatar";
import { Brand } from "../../ui/Chrome";
import { Icon } from "../../ui/Icon";
import { Podium } from "../../ui/Podium";
import { CATALOG } from "../../catalog";
import { buildCard } from "../../share/outcomes";
import { useShareResults } from "../../share/ShareResults";
import { levelName, modeName, parseJigsawSettings } from "./JigsawSettingsPanel";
import { KNOB_REACH, PIECE_SIZE, pieceShapes } from "./pieceShape";
import { InsaneBoard } from "./InsaneBoard";
import { PlayFaces, PlayTimer, PlayTop, type Face } from "../play";
import { PlayToast } from "../../ui/gameNotice";

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
/** The countdown turns red for the last this long. */
const LOW_MS = 30_000;

/** "1:05" from milliseconds. */
export function clock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** "Round 2 / 4" or "The final", for Elimination; null in the race. */
function roundLabel(view: JigsawView): ReactNode {
  if (!view.round) return null;
  if (view.round.final) return <b>The final</b>;
  return (
    <>
      Round <b>{view.round.index + 1}</b> / {view.round.total - 1}
    </>
  );
}

export function JigsawScreen(props: Props) {
  const { view } = props;
  if (view.final) return <Results {...props} />;
  if (view.cut) return <Cut {...props} cut={view.cut} />;
  if (view.board === null || view.startsAt === null) return <Watching {...props} />;
  // Each Elimination round is a new puzzle, so it starts afresh.
  return (
    <Playing
      key={`${view.round?.index ?? 0}:${view.startsAt}`}
      {...props}
      board={view.board}
      startsAt={view.startsAt}
    />
  );
}

/** Joined too late, or knocked out of an Elimination game: the others' progress. */
function Watching(props: Props) {
  const { view } = props;
  const out = view.me?.out;
  return (
    <div className="game play">
      <PlayTop latency={props.latency} onQuit={props.onQuit} label={roundLabel(view) ?? "Jigsaw"} />
      <div className="game-layout">
        <div className="game-main play-main">
          <p className="watching">
            {out
              ? `You’re out, in round ${(view.me?.outRound ?? 0) + 1}. Watch who makes it to the end.`
              : view.round
                ? "An Elimination game is in progress. You’ll be in the next one."
                : "A game is in progress. You’ll be in the next one."}
          </p>
          <PlayFaces faces={faces(props)} playerId={props.playerId} />
        </div>
        <LiveBoard {...props} />
      </div>
      <PlayToast />
    </div>
  );
}

/** Between Elimination rounds: who went out, then the next round starts on its own. */
function Cut(props: Props & { cut: NonNullable<JigsawView["cut"]> }) {
  const { view, cut, room, client, playerId } = props;
  const now = useServerNow(client.serverNow);
  const avatars = new Map(room.players.map((p) => [p.id, p.avatar]));
  const meOut = cut.out.some((o) => o.playerId === playerId);
  const next = Math.max(0, Math.ceil((cut.nextAt - now) / 1000));
  const nextIsFinal = view.standings.filter((s) => !s.out && !s.left).length <= 2;
  return (
    <div className="game play">
      <PlayTop latency={props.latency} onQuit={props.onQuit} label={roundLabel(view)} />
      <div className="game-layout">
        <div className="game-main play-main jigsaw-cut" aria-live="polite">
          <h2 className="display cut-title">
            {meOut ? "You’re out" : `Round ${cut.round + 1} is over`}
          </h2>
          <p className="play-task">Going out this round, with the fewest pieces placed:</p>
          <ul className="cut-list">
            {cut.out.map((o) => (
              <li key={o.playerId}>
                <Avatar id={avatars.get(o.playerId) ?? null} name={o.nickname} size={52} />
                <span>{o.playerId === playerId ? "You" : o.nickname}</span>
              </li>
            ))}
          </ul>
          <p className="play-task">
            {nextIsFinal ? "The final" : `Round ${cut.round + 2}`} starts in {next}…
          </p>
        </div>
        <LiveBoard {...props} />
      </div>
      <PlayToast />
    </div>
  );
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
  const total = view.cols * view.rows;
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

  const left = view.deadline === null ? null : view.deadline - now;
  const outOfTime = left !== null && left <= 0;
  const tap = (spot: number) => {
    if (!started || finished || outOfTime || board[spot] === spot) return;
    if (selected === null) setSelected(spot);
    else if (selected === spot) setSelected(null);
    else swap(selected, spot);
  };

  const round = roundLabel(view);
  if (!started) {
    return (
      <div className="game play">
        <PlayTop latency={props.latency} onQuit={props.onQuit} label={round ?? "Jigsaw"} />
        <div className="countdown jigsaw-countdown" aria-live="polite">
          <img className="jigsaw-preview" src={view.picture.src} alt={view.picture.name} />
          <p className="countdown-label">
            Get ready ·{" "}
            {view.round
              ? `${levelName(view.level)}`
              : `${modeName(view.mode)} · ${levelName(view.level)}`}
          </p>
          <p className="countdown-number">{countdown}</p>
        </div>
        <PlayToast />
      </div>
    );
  }

  const count = (
    <>
      <b>{placed}</b> / {total} placed
    </>
  );
  const help = view.tray
    ? "Drag pieces from the tray onto their spots. Pinch to zoom, double-tap to zoom in or out"
    : "Tap two pieces to swap them, or drag one onto another";
  const doneText = view.round
    ? view.round.final
      ? "Finished!"
      : "You’re through to the next round."
    : "Waiting for everyone to finish…";
  return (
    <div className="game play">
      <PlayTop latency={props.latency} onQuit={props.onQuit} label={round ?? count} />
      <div className="game-layout staged">
        <div className={`game-main play-main jigsaw-main${view.tray ? " insane-main" : ""}`}>
          {/* Classic has no clock; Speed and Elimination count down. */}
          {left !== null && (
            <PlayTimer ms={finished ? left : Math.max(0, left)} low={left < LOW_MS && !finished} />
          )}
          {finished ? (
            <p className="play-task good" role="status">
              Solved in {clock(view.me?.timeMs ?? 0)} · {view.moves} moves
              <span className="jigsaw-wait">{doneText}</span>
            </p>
          ) : outOfTime ? (
            <p className="play-task" role="status">
              Time’s up · {placed} of {total} placed
            </p>
          ) : (
            <p className="play-task">
              {round && (
                <span className="jigsaw-count">
                  {placed} of {total} placed ·{" "}
                </span>
              )}
              {help}
            </p>
          )}
          {/* On a computer the scores and the picture sit beside the board, level with it. */}
          <div className={`play-stage jigsaw-stage${view.tray ? "" : " fit-board"}`}>
            <div className="play-area">
              {view.tray ? (
                <InsaneBoard
                  key={`${props.room.code}:${startsAt}`}
                  cols={view.cols}
                  rows={view.rows}
                  src={view.picture.src}
                  board={props.board}
                  tray={view.tray}
                  done={finished || outOfTime}
                  storageKey={`${props.room.code}:${startsAt}:${props.playerId}`}
                  onPlace={(piece) => client.act({ type: "place", piece })}
                />
              ) : (
                <>
                  <Board
                    side={view.cols}
                    src={view.picture.src}
                    board={board}
                    selected={selected}
                    done={finished || outOfTime}
                    onTap={tap}
                    onSwap={swap}
                  />
                  {/* Phones have no side panel, so the picture to copy sits under the board. */}
                  <figure className="jigsaw-peek">
                    <img src={view.picture.src} alt="" />
                    <figcaption>{view.picture.name}</figcaption>
                  </figure>
                </>
              )}
            </div>
            <aside className="jigsaw-side">
              <LiveBoard {...props} />
              <figure className="panel jigsaw-reference">
                <img src={view.picture.src} alt="" />
                <figcaption className="dim small">{view.picture.name}</figcaption>
              </figure>
            </aside>
          </div>
          <PlayFaces faces={faces(props)} playerId={props.playerId} />
        </div>
      </div>
      <PlayToast />
    </div>
  );
}

/** Where a piece's outline and picture are drawn: its square, with room for knobs all round. */
const VIEW_BOX = `${-KNOB_REACH} ${-KNOB_REACH} ${PIECE_SIZE + 2 * KNOB_REACH} ${PIECE_SIZE + 2 * KNOB_REACH}`;

/**
 * The puzzle: tap one piece then another, or drag one onto another, to swap them. Pieces are
 * jigsaw-shaped, so they only lock together in their own places.
 */
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
  /** The picture, which also picks how it's cut. */
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
  const shapes = useMemo(() => pieceShapes(side, side, src), [side, src]);
  const clipId = `jigsaw${useId().replace(/[^a-zA-Z0-9]/g, "")}-`;
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
          >
            <svg className="jigsaw-shape" viewBox={VIEW_BOX} aria-hidden="true">
              <clipPath id={`${clipId}${piece}`}>
                <path d={shapes[piece]} />
              </clipPath>
              <image
                href={src}
                x={-col * PIECE_SIZE}
                y={-row * PIECE_SIZE}
                width={side * PIECE_SIZE}
                height={side * PIECE_SIZE}
                preserveAspectRatio="xMidYMid slice"
                clipPath={`url(#${clipId}${piece})`}
              />
              <path className="jigsaw-edge" d={shapes[piece]} />
            </svg>
          </button>
        );
      })}
    </div>
  );
}

const progressLabel = (s: JigsawStanding) =>
  s.left ? "Left" : s.finished ? clock(s.timeMs ?? 0) : `${s.placed}/${s.total}`;

/** Everyone's progress, as faces for a phone. */
const faces = ({ view, room }: Props): Face[] => {
  const avatars = new Map(room.players.map((p) => [p.id, p.avatar]));
  return view.standings.map((s) => ({
    playerId: s.playerId,
    nickname: s.nickname,
    avatar: avatars.get(s.playerId) ?? null,
    rank: s.rank,
    value: progressLabel(s),
    gone: s.left,
  }));
};

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

  /**
   * On to another jigsaw, same mode and level: a chosen picture moves on to the next in the
   * list, and "Surprise me" (or a photo) gets one the room hasn't had lately.
   */
  const nextJigsaw = () => {
    const settings = parseJigsawSettings(room.game.settings);
    if (settings && settings.picture !== "random") {
      const at = JIGSAW_PICTURES.findIndex((p) => p.id === settings.picture);
      const picture = at === -1 ? "random" : JIGSAW_PICTURES[(at + 1) % JIGSAW_PICTURES.length]!.id;
      client.configure({ ...settings, picture });
    }
    client.startGame();
  };

  const text = me?.finished
    ? `I finished a ${me.total}-piece jigsaw in ${clock(me.timeMs ?? 0)} on Whizard!`
    : "Race me at a jigsaw on Whizard!";
  const { open: share, dialog: shareDialog } = useShareResults(
    buildCard({
      title: "Jigsaw",
      subtitle: `${modeName(view.mode)} · ${levelName(view.level)} · ${view.picture.name}`,
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
        { icon: "🧩", value: String(me?.total ?? view.cols * view.rows), label: "Pieces" },
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
            <h2 className="display results-title">Jigsaw Results</h2>
            <span className="pill">
              <Icon name="trophy" size={18} />
              {view.picture.name} • {view.cols * view.rows} pieces
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
              <button className="btn btn-primary" onClick={nextJigsaw}>
                <Icon name="play" size={20} fill />
                Next Jigsaw
              </button>
              <button className="btn" onClick={() => client.backToLobby()}>
                <Icon name="games" size={22} />
                Change Picture
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
