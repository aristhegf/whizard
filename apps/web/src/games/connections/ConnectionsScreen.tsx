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
import {
  PlayBoard,
  PlayFaces,
  PlayFrame,
  PlayMistakes,
  PlayScreen,
  PlayTimer,
  rowsFrom,
  Staged,
  timerMs,
} from "../play";
import { Podium } from "../../ui/Podium";
import { CATALOG } from "../../catalog";
import { buildCard } from "../../share/outcomes";
import { useShareResults } from "../../share/ShareResults";
import { clock } from "../jigsaw/JigsawScreen";
import { CutPanel, puzzleRoundName } from "../elimination/parts";
import { connectionsModeName } from "./ConnectionsSettingsRows";

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

/** "Round 2 of 3" or "The Final", for Elimination; null in the race. */
const roundLabel = (view: ConnectionsView) => (view.round ? puzzleRoundName(view.round) : null);

export function ConnectionsScreen(props: Props) {
  const { view } = props;
  if (view.final) return <Results {...props} />;
  if (view.cut) return <Cut {...props} cut={view.cut} />;
  if (view.words === null || view.startsAt === null) return <Watching {...props} />;
  // Each Elimination round is a new puzzle, so it starts afresh.
  return (
    <Playing
      key={`${view.round?.index ?? 0}:${view.startsAt}`}
      {...props}
      words={view.words}
      startsAt={view.startsAt}
    />
  );
}

/** Joined too late, or knocked out of an Elimination game: the others' progress. */
function Watching(props: Props) {
  const { view } = props;
  return (
    <PlayScreen
      label={roundLabel(view) ?? "Connections"}
      latency={props.latency}
      onQuit={props.onQuit}
      side={<LiveBoard {...props} />}
    >
      <p className="watching">
        {view.me?.out
          ? `You’re out, in round ${(view.me.outRound ?? 0) + 1}. Watch who makes it to the end.`
          : view.round
            ? "An Elimination game is in progress. You’ll be in the next one."
            : "A game is in progress. You’ll be in the next one."}
      </p>
      <PlayFaces faces={rowsOf(props)} playerId={props.playerId} />
    </PlayScreen>
  );
}

/** Between Elimination rounds: who went out, then the next round starts on its own. */
function Cut(props: Props & { cut: NonNullable<ConnectionsView["cut"]> }) {
  const { view, cut, room } = props;
  const avatars = new Map(room.players.map((p) => [p.id, p.avatar]));
  const stillIn = view.standings.filter((s) => !s.out && !s.left).length;
  const nextIsFinal = !!view.round && (view.round.index + 2 >= view.round.total || stillIn <= 2);
  return (
    <PlayFrame label={roundLabel(view)} latency={props.latency} onQuit={props.onQuit}>
      <CutPanel
        client={props.client}
        playerId={props.playerId}
        avatarOf={(id) => avatars.get(id) ?? null}
        round={cut.round + 1}
        out={cut.out}
        nextIsFinal={nextIsFinal}
        until={cut.nextAt}
        rank={view.me?.rank ?? null}
        through={view.words !== null && !view.me?.out}
      />
    </PlayFrame>
  );
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

  const round = roundLabel(view);
  if (!started) {
    return (
      <PlayFrame label={round ?? "Connections"} latency={props.latency} onQuit={props.onQuit}>
        <div className="countdown" aria-live="polite">
          <img src="/art/games/connections.webp" alt="" />
          <p className="countdown-label">
            Get ready ·{" "}
            {view.round
              ? LEVEL_NAMES[view.level]
              : `${connectionsModeName(view.mode)} · ${LEVEL_NAMES[view.level]}`}
          </p>
          <p className="countdown-number">{countdown}</p>
        </div>
      </PlayFrame>
    );
  }

  // Classic has no clock; Speed and Elimination count down.
  const left = view.deadline === null ? null : view.deadline - now;
  const me = view.me;
  const missing = (view.answer ?? []).filter((g) => !view.found.some((f) => f.colour === g.colour));
  const doneText = !view.round
    ? "Waiting for everyone to finish…"
    : me?.solved
      ? "You’re through to the next round."
      : "Waiting for the round to end…";
  return (
    <PlayScreen
      label={
        <>
          {round && `${round} · `}
          <b>{view.found.length}</b> / {GROUPS} groups
        </>
      }
      latency={props.latency}
      onQuit={props.onQuit}
    >
      {left !== null && (
        <PlayTimer ms={over ? (me?.timeMs ?? 0) : timerMs(left)} low={left < 30_000 && !over} />
      )}
      <p className="play-task">
        {over
          ? me?.solved
            ? `Solved in ${clock(me.timeMs ?? 0)}`
            : me && me.mistakes >= CONNECTIONS_MAX_MISTAKES
              ? "Out of mistakes. Here’s how they fit."
              : "Time’s up. Here’s how they fit."
          : "Find four groups of four. Pick four words that share something, then Submit."}
      </p>
      <Staged aside={<LiveBoard {...props} />}>
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
                  className={`play-tile conn-tile${selected.includes(word) ? " picked" : ""}`}
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
            <span className="dim small">{doneText}</span>
          </p>
        ) : (
          <>
            <PlayMistakes left={view.mistakesLeft} max={CONNECTIONS_MAX_MISTAKES} />
            <p className="conn-message" role="status">
              {message}
            </p>
          </>
        )}
      </Staged>
      <PlayFaces faces={rowsOf(props)} playerId={props.playerId} />
      {!over && (
        <div className="play-actions">
          <button className="play-pill square" aria-label="Shuffle" onClick={shuffle}>
            <Icon name="repeat" size={22} />
          </button>
          <button
            className="play-pill"
            disabled={selected.length === 0}
            onClick={() => setSelected([])}
          >
            Deselect All
          </button>
          <button
            className="play-pill go"
            disabled={selected.length !== CONNECTIONS_GROUP_SIZE}
            onClick={submit}
          >
            Submit
          </button>
        </div>
      )}
    </PlayScreen>
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

const progressLabel = (s: ConnectionsStanding) =>
  s.left ? "Left" : s.out ? "Out" : s.solved ? clock(s.timeMs ?? 0) : `${s.found}/${GROUPS}`;

/** Everyone's progress: faces on a phone, the board on a computer. */
const rowsOf = ({ view, room }: Props) =>
  rowsFrom(view.standings, room, progressLabel).map((row, i) => ({
    ...row,
    // Knocked out of Elimination: dimmed, like someone who left.
    gone: row.gone || view.standings[i]!.out,
  }));

function LiveBoard(props: Props) {
  return <PlayBoard rows={rowsOf(props)} playerId={props.playerId} label="Live progress" />;
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
      subtitle: `${connectionsModeName(view.mode)} · ${LEVEL_NAMES[view.level]} puzzle`,
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
              {view.round ? "Elimination · " : ""}
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
                    s.playerId === view.winnerId || (s.rank === 1 && s.solved) ? "first" : "",
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
