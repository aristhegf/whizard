import { LOGIC_MAX_MISTAKES, type LogicStanding, type LogicView } from "@whizard/game-core";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AddFromGame } from "../../FriendsScreen";
import type { RoomClient, RoomSnapshot } from "../../roomClient";
import { play } from "../../sounds";
import { useServerNow } from "../../useServerNow";
import { Avatar } from "../../ui/Avatar";
import { PlayBoard, rowsFrom } from "../play";
import { Brand } from "../../ui/Chrome";
import { Icon } from "../../ui/Icon";
import { MuteButton } from "../../ui/MuteButton";
import { Podium } from "../../ui/Podium";
import { CATALOG } from "../../catalog";
import { buildCard } from "../../share/outcomes";
import { useShareResults } from "../../share/ShareResults";
import { clock } from "../jigsaw/JigsawScreen";
import { gridName } from "./LogicSettingsRows";

interface Props {
  view: LogicView;
  client: RoomClient;
  room: RoomSnapshot;
  playerId: string;
  isHost: boolean;
  /** The connection indicator, shown in the top bar. */
  latency: ReactNode;
  /** Quits the game. Asks first while it's still running. */
  onQuit: () => void;
}

/** How long a wrong number shows in its cell. */
const WRONG_FLASH_MS = 1200;

export function LogicScreen(props: Props) {
  const { view } = props;
  if (view.final) return <Results {...props} />;
  if (view.grid === null || view.startsAt === null) {
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
  return <Playing {...props} grid={view.grid} startsAt={view.startsAt} />;
}

function Playing(props: Props & { grid: number[]; startsAt: number }) {
  const { view, client, startsAt, grid } = props;
  const now = useServerNow(client.serverNow);
  const { size } = view;
  const [selected, setSelected] = useState<number | null>(null);
  const started = now >= startsAt;
  const countdown = Math.max(1, Math.ceil((startsAt - now) / 1000));
  const over = view.solution !== null;
  const filled = view.me?.filled ?? 0;
  const total = view.me?.total ?? 1;

  useEffect(() => {
    if (!started) play("tick");
  }, [started, countdown]);
  const wasStarted = useRef(started);
  useEffect(() => {
    if (started && !wasStarted.current) play("go");
    wasStarted.current = started;
  }, [started]);
  const lastFilled = useRef(filled);
  useEffect(() => {
    if (filled > lastFilled.current) play("place");
    lastFilled.current = filled;
  }, [filled]);
  const lastWrongAt = useRef(view.lastWrong?.at ?? null);
  useEffect(() => {
    const at = view.lastWrong?.at ?? null;
    if (at !== null && at !== lastWrongAt.current) play("wrong");
    lastWrongAt.current = at;
  }, [view.lastWrong?.at]);

  const place = (value: number) => {
    if (!started || over || selected === null || grid[selected] !== 0) return;
    client.act({ type: "place", cell: selected, value });
  };

  // Numbers from the keyboard, and arrow keys to move around the grid.
  const keys = useRef({ place, size, selected });
  useEffect(() => {
    keys.current = { place, size, selected };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const { place, size, selected } = keys.current;
      const n = Number(event.key);
      if (n >= 1 && n <= size) {
        place(n);
        return;
      }
      const moves: Record<string, number> = {
        ArrowLeft: -1,
        ArrowRight: 1,
        ArrowUp: -size,
        ArrowDown: size,
      };
      const move = moves[event.key];
      if (move === undefined) return;
      event.preventDefault();
      const from = selected ?? 0;
      const next = from + move;
      if (next < 0 || next >= size * size) return;
      if (Math.abs(move) === 1 && Math.floor(next / size) !== Math.floor(from / size)) return;
      setSelected(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!started) {
    return (
      <div className="game">
        <Bar {...props} />
        <div className="countdown" aria-live="polite">
          <img src="/art/games/logic.webp" alt="" />
          <p className="countdown-label">Get ready · {gridName(size)}</p>
          <p className="countdown-number">{countdown}</p>
        </div>
      </div>
    );
  }

  const left = view.deadline === null ? 0 : view.deadline - now;
  const me = view.me;
  const wrong =
    view.lastWrong && now - view.lastWrong.at < WRONG_FLASH_MS && !over ? view.lastWrong : null;
  const shown = over ? view.solution! : grid;
  const count = (n: number) => grid.filter((v) => v === n).length;
  const selectedValue = selected !== null ? grid[selected] : 0;
  const rowOf = (cell: number) => Math.floor(cell / size);
  const colOf = (cell: number) => cell % size;
  const boxOf = (cell: number) =>
    Math.floor(rowOf(cell) / view.boxRows) * (size / view.boxCols) +
    Math.floor(colOf(cell) / view.boxCols);
  const related = (cell: number) =>
    selected !== null &&
    (rowOf(cell) === rowOf(selected) ||
      colOf(cell) === colOf(selected) ||
      boxOf(cell) === boxOf(selected));

  return (
    <div className="game">
      <Bar
        {...props}
        progress={filled / total}
        middle={
          <span className="progress">
            {filled} / {total}
            <span className="progress-word"> filled</span>
          </span>
        }
        timer={
          <span
            className={`timer-pill${left < 60_000 && !over ? " low" : ""}`}
            role="timer"
            aria-label="Time left"
          >
            <Icon name="clock" size={22} stroke={2.4} />
            {clock(over ? (me?.timeMs ?? 0) : left)}
          </span>
        }
      />
      <div className="game-layout">
        <div className="game-main logic-main">
          <p className="muted small logic-help">
            {over
              ? me?.solved
                ? `Solved in ${clock(me.timeMs ?? 0)}`
                : me && me.mistakes >= LOGIC_MAX_MISTAKES
                  ? "Out of mistakes. Here’s the full grid."
                  : "Time’s up. Here’s the full grid."
              : `Fill the grid so every row, column and box has 1 to ${size} once. Pick a cell, then a number.`}
          </p>
          <div
            className={`logic-grid size-${size}`}
            style={
              {
                "--size": size,
                "--box-rows": view.boxRows,
                "--box-cols": view.boxCols,
              } as CSSProperties
            }
            role="grid"
            aria-label={`Grid, ${size} by ${size}`}
          >
            {shown.map((value, cell) => {
              const given = view.givens[cell] !== 0;
              const mine = !given && grid[cell] !== 0;
              const missed = over && grid[cell] === 0;
              const flash = wrong?.cell === cell;
              const classes = [
                "logic-cell",
                given ? "given" : mine ? "mine" : "",
                missed ? "missed" : "",
                selected === cell ? "selected" : related(cell) ? "related" : "",
                selectedValue && value === selectedValue && !missed ? "same" : "",
                flash ? "wrong" : "",
                colOf(cell) % view.boxCols === view.boxCols - 1 && colOf(cell) < size - 1
                  ? "box-right"
                  : "",
                rowOf(cell) % view.boxRows === view.boxRows - 1 && rowOf(cell) < size - 1
                  ? "box-bottom"
                  : "",
              ].filter(Boolean);
              return (
                <button
                  key={cell}
                  type="button"
                  role="gridcell"
                  data-cell={cell}
                  className={classes.join(" ")}
                  aria-label={`Row ${rowOf(cell) + 1}, column ${colOf(cell) + 1}${value ? `, ${value}` : ", empty"}`}
                  aria-selected={selected === cell}
                  disabled={over}
                  onClick={() => setSelected(cell)}
                >
                  {flash ? wrong.value : value || ""}
                </button>
              );
            })}
          </div>

          {over ? (
            <p className="verdict good logic-wait" role="status">
              {me?.solved ? "You cracked it!" : `${filled} of ${total} filled`}
              <span className="dim small">Waiting for everyone to finish…</span>
            </p>
          ) : (
            <>
              <div
                className="logic-pad"
                style={{ "--size": size } as CSSProperties}
                role="group"
                aria-label="Numbers"
              >
                {Array.from({ length: size }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    className="logic-key"
                    disabled={count(n) >= size || selected === null || grid[selected] !== 0}
                    onClick={() => place(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="conn-mistakes" aria-label={`${view.mistakesLeft} mistakes left`}>
                <span className="muted small">Mistakes left</span>
                {Array.from({ length: LOGIC_MAX_MISTAKES }, (_, i) => (
                  <span key={i} className={`conn-dot${i < view.mistakesLeft ? "" : " used"}`} />
                ))}
              </div>
            </>
          )}
        </div>
        <LiveBoard {...props} />
      </div>
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
        {middle ?? <span className="progress">Logic · {gridName(view.size)}</span>}
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

const progressLabel = (s: LogicStanding) =>
  s.left ? "Left" : s.solved ? clock(s.timeMs ?? 0) : `${s.filled}/${s.total}`;

/** Everyone's progress as they play. Only on tablets and computers; phones leave it out. */
function LiveBoard({ view, playerId, room }: Props) {
  return (
    <PlayBoard
      rows={rowsFrom(view.standings, room, progressLabel)}
      playerId={playerId}
      label="Live progress"
    />
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

  const text = me?.solved
    ? `I cracked a ${view.size}×${view.size} Logic grid in ${clock(me.timeMs ?? 0)} on Whizard!`
    : "Race me at a Logic grid on Whizard!";
  const { open: share, dialog: shareDialog } = useShareResults(
    buildCard({
      title: "Logic",
      subtitle: gridName(view.size),
      art: "/art/games/logic.webp",
      colors: CATALOG.find((g) => g.id === "logic")?.colors ?? ["#8b4dff", "#23145a"],
      rows: solo
        ? []
        : view.standings
            .filter((s) => !s.left)
            .map((s) => ({
              playerId: s.playerId,
              nickname: s.nickname,
              avatar: avatarOf(s.playerId),
              value: s.filled,
              label: progressLabel(s),
              timeMs: s.timeMs,
            })),
      me: playerId,
      score: me?.solved
        ? { value: clock(me.timeMs ?? 0), unit: "to solve" }
        : { value: `${me?.filled ?? 0}/${me?.total ?? 0}`, unit: "cells filled" },
      // Solved without a mistake is a perfect game.
      correct: me?.solved && me.mistakes === 0 ? { got: me.total, of: me.total } : null,
      items: 1,
      finished: me?.solved ?? false,
      facts: [
        { icon: "🔢", value: gridName(view.size), label: "Grid" },
        { icon: "❌", value: String(me?.mistakes ?? 0), label: "Mistakes" },
        { icon: "⏱️", value: me?.solved ? clock(me.timeMs ?? 0) : "–", label: "Time" },
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
            <h2 className="display results-title">Logic Results</h2>
            <span className="pill">
              <Icon name="trophy" size={18} />
              {gridName(view.size)}
            </span>
          </div>

          {solo && me ? (
            <div className="panel solo-score">
              <p className="label">{me.solved ? "Solved in" : "Cells filled"}</p>
              <p className="big-score">
                {me.solved ? clock(me.timeMs ?? 0) : `${me.filled}/${me.total}`}
              </p>
              <p className="muted">
                {me.mistakes} {me.mistakes === 1 ? "mistake" : "mistakes"}
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
                Change Settings
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
                    s.rank === 1 && s.solved ? "first" : "",
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
