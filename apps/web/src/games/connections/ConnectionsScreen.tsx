import {
  CONNECTIONS_GROUP_SIZE,
  CONNECTIONS_MAX_MISTAKES,
  LEVEL_NAMES,
  type ConnectionsFoundGroup,
  type ConnectionsStanding,
  type ConnectionsView,
} from "@whizard/game-core";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AddFromGame } from "../../FriendsScreen";
import type { RoomClient, RoomSnapshot } from "../../roomClient";
import { play } from "../../sounds";
import { useServerNow } from "../../useServerNow";
import { Avatar } from "../../ui/Avatar";
import { Brand } from "../../ui/Chrome";
import { useErrorShake } from "../../ui/errorShake";
import { Icon } from "../../ui/Icon";
import { MuteButton } from "../../ui/MuteButton";
import { Podium } from "../../ui/Podium";
import { CATALOG } from "../../catalog";
import { buildCard } from "../../share/outcomes";
import { useShareResults } from "../../share/ShareResults";
import { clock } from "../jigsaw/JigsawScreen";

interface Props {
  view: ConnectionsView;
  client: RoomClient;
  room: RoomSnapshot;
  playerId: string;
  isHost: boolean;
  /** The connection indicator, shown in the top bar. */
  latency: ReactNode;
  /** Quits the game. Asks first while it's still running. */
  onQuit: () => void;
}

const GROUPS = 4;

export function ConnectionsScreen(props: Props) {
  const { view } = props;
  if (view.final) return <Results {...props} />;
  if (view.words === null || view.startsAt === null) {
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
  return <Playing {...props} words={view.words} startsAt={view.startsAt} />;
}

function Playing(props: Props & { words: string[]; startsAt: number }) {
  const { view, client, startsAt, words } = props;
  const now = useServerNow(client.serverNow);
  const [selected, setSelected] = useState<string[]>([]);
  // Your own shuffle of the board; words found since are dropped from it.
  const [order, setOrder] = useState<string[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { ref: gridRef, shake } = useErrorShake<HTMLDivElement>();
  const started = now >= startsAt;
  const countdown = Math.max(1, Math.ceil((startsAt - now) / 1000));
  const over = view.answer !== null;
  const shown = order ? order.filter((w) => words.includes(w)) : words;

  useEffect(() => {
    if (!started) play("tick");
  }, [started, countdown]);
  const wasStarted = useRef(started);
  useEffect(() => {
    if (started && !wasStarted.current) play("go");
    wasStarted.current = started;
  }, [started]);

  // A group found clears the pick; a wrong one shakes the board and says how close it was.
  const lastFound = useRef(view.found.length);
  const lastTried = useRef(view.tried.length);
  useEffect(() => {
    if (view.found.length > lastFound.current) {
      play("correct");
      setSelected([]);
      setMessage(null);
    }
    lastFound.current = view.found.length;
  }, [view.found.length]);
  useEffect(() => {
    if (view.tried.length > lastTried.current) {
      play("wrong");
      shake();
      setMessage(view.oneAway ? "One away…" : "Not quite.");
    }
    lastTried.current = view.tried.length;
  }, [view.tried.length, view.oneAway, shake]);

  const toggle = (word: string) => {
    if (!started || over) return;
    setMessage(null);
    setSelected((picked) =>
      picked.includes(word)
        ? picked.filter((w) => w !== word)
        : picked.length < CONNECTIONS_GROUP_SIZE
          ? [...picked, word]
          : picked,
    );
  };

  const submit = () => {
    if (selected.length !== CONNECTIONS_GROUP_SIZE) return;
    const sorted = [...selected].sort().join("|");
    if (view.tried.some((t) => t.join("|") === sorted)) {
      shake();
      setMessage("You’ve tried those four.");
      return;
    }
    client.act({ type: "guess", words: selected });
  };

  const shuffle = () => {
    const next = [...shown];
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j]!, next[i]!];
    }
    setOrder(next);
  };

  if (!started) {
    return (
      <div className="game">
        <Bar {...props} />
        <div className="countdown" aria-live="polite">
          <img src="/art/games/connections.webp" alt="" />
          <p className="countdown-label">Get ready · {LEVEL_NAMES[view.level]}</p>
          <p className="countdown-number">{countdown}</p>
        </div>
      </div>
    );
  }

  const left = view.deadline === null ? 0 : view.deadline - now;
  const me = view.me;
  const missing = (view.answer ?? []).filter((g) => !view.found.some((f) => f.colour === g.colour));
  return (
    <div className="game">
      <Bar
        {...props}
        progress={view.found.length / GROUPS}
        middle={
          <span className="progress">
            {view.found.length} / {GROUPS}
            <span className="progress-word"> groups</span>
          </span>
        }
        timer={
          <span
            className={`timer-pill${left < 30_000 && !over ? " low" : ""}`}
            role="timer"
            aria-label="Time left"
          >
            <Icon name="clock" size={22} stroke={2.4} />
            {clock(over ? (me?.timeMs ?? 0) : left)}
          </span>
        }
      />
      <div className="game-layout">
        <div className="game-main conn-main">
          <p className="muted small conn-help">
            {over
              ? me?.solved
                ? `Solved in ${clock(me.timeMs ?? 0)}`
                : me && me.mistakes >= CONNECTIONS_MAX_MISTAKES
                  ? "Out of mistakes. Here’s how they fit."
                  : "Time’s up. Here’s how they fit."
              : "Find four groups of four. Pick four words that share something, then Submit."}
          </p>
          <div className="conn-board">
            {view.found.map((group) => (
              <GroupRow key={group.colour} group={group} />
            ))}
            {over ? (
              missing.map((group) => <GroupRow key={group.colour} group={group} missed />)
            ) : (
              <div ref={gridRef} className="conn-grid" role="group" aria-label="Words">
                {shown.map((word) => (
                  <button
                    key={word}
                    type="button"
                    className={`conn-tile${selected.includes(word) ? " selected" : ""}`}
                    aria-pressed={selected.includes(word)}
                    onClick={() => toggle(word)}
                  >
                    <span>{word}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {over ? (
            <p className="verdict good conn-wait" role="status">
              {me?.solved ? "You found every group!" : `${view.found.length} of 4 groups found`}
              <span className="dim small">Waiting for everyone to finish…</span>
            </p>
          ) : (
            <>
              <div className="conn-mistakes" aria-label={`${view.mistakesLeft} mistakes left`}>
                <span className="muted small">Mistakes left</span>
                {Array.from({ length: CONNECTIONS_MAX_MISTAKES }, (_, i) => (
                  <span key={i} className={`conn-dot${i < view.mistakesLeft ? "" : " used"}`} />
                ))}
              </div>
              <p className="conn-message" role="status">
                {message}
              </p>
              <div className="conn-actions">
                <button className="btn" onClick={shuffle}>
                  <Icon name="repeat" size={20} />
                  Shuffle
                </button>
                <button
                  className="btn"
                  disabled={selected.length === 0}
                  onClick={() => setSelected([])}
                >
                  Deselect All
                </button>
                <button
                  className="btn btn-primary"
                  disabled={selected.length !== CONNECTIONS_GROUP_SIZE}
                  onClick={submit}
                >
                  Submit
                </button>
              </div>
            </>
          )}
        </div>
        <LiveBoard {...props} />
      </div>
    </div>
  );
}

function GroupRow({ group, missed = false }: { group: ConnectionsFoundGroup; missed?: boolean }) {
  return (
    <div className={`conn-group conn-${group.colour}${missed ? " missed" : ""}`}>
      <strong>{group.name}</strong>
      <span>{group.words.join(", ")}</span>
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
        {middle ?? <span className="progress">Connections · {LEVEL_NAMES[view.level]}</span>}
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

const progressLabel = (s: ConnectionsStanding) =>
  s.left ? "Left" : s.solved ? clock(s.timeMs ?? 0) : `${s.found}/${GROUPS}`;

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

  const text = me?.solved
    ? `I found all four Connections groups in ${clock(me.timeMs ?? 0)} on Whizard!`
    : "Can you find the four groups? Play Connections on Whizard!";
  const { open: share, dialog: shareDialog } = useShareResults(
    buildCard({
      title: "Connections",
      subtitle: `${LEVEL_NAMES[view.level]} puzzle`,
      art: "/art/games/connections.webp",
      colors: CATALOG.find((g) => g.id === "connections")?.colors ?? ["#8b4dff", "#23145a"],
      rows: solo
        ? []
        : view.standings
            .filter((s) => !s.left)
            .map((s) => ({
              playerId: s.playerId,
              nickname: s.nickname,
              avatar: avatarOf(s.playerId),
              value: s.found,
              label: progressLabel(s),
              timeMs: s.timeMs,
            })),
      me: playerId,
      score: me?.solved
        ? { value: clock(me.timeMs ?? 0), unit: "to find all four" }
        : { value: `${me?.found ?? 0}/${GROUPS}`, unit: "groups found" },
      // Every group without a mistake is a perfect game.
      correct: me?.solved && me.mistakes === 0 ? { got: GROUPS, of: GROUPS } : null,
      items: 1,
      finished: me?.solved ?? false,
      facts: [
        { icon: "🔗", value: `${me?.found ?? 0}/${GROUPS}`, label: "Groups" },
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
            <h2 className="display results-title">Connections Results</h2>
            <span className="pill">
              <Icon name="trophy" size={18} />
              {LEVEL_NAMES[view.level]} puzzle
            </span>
          </div>

          {solo && me ? (
            <div className="panel solo-score">
              <p className="label">{me.solved ? "Solved in" : "Groups found"}</p>
              <p className="big-score">
                {me.solved ? clock(me.timeMs ?? 0) : `${me.found}/${GROUPS}`}
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

          {view.answer && (
            <div className="conn-board conn-answer" aria-label="The answer">
              {view.answer.map((group) => (
                <GroupRow key={group.colour} group={group} />
              ))}
            </div>
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
