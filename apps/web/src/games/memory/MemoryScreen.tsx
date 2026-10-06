import type { MemoryStage, MemoryView } from "@whizard/game-core";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AddFromGame } from "../../FriendsScreen";
import { CATALOG } from "../../catalog";
import { formatPoints } from "../../matchInfo";
import type { RoomClient, RoomSnapshot } from "../../roomClient";
import { buildCard } from "../../share/outcomes";
import { useShareResults } from "../../share/ShareResults";
import { play } from "../../sounds";
import { useServerNow } from "../../useServerNow";
import { Avatar } from "../../ui/Avatar";
import { Brand } from "../../ui/Chrome";
import { Icon } from "../../ui/Icon";
import { Podium } from "../../ui/Podium";
import { Choices, RevealedChoices } from "../quiz/QuizScreen";
import { PlayBoard, PlayFaces, PlayScreen, PlayTimer, rowsFrom, Staged, timerMs } from "../play";

interface Props {
  view: MemoryView;
  client: RoomClient;
  room: RoomSnapshot;
  playerId: string;
  isHost: boolean;
  /** The connection indicator, shown in the top bar. */
  latency: ReactNode;
  /** Quits the game. Asks first while it's still running. */
  onQuit: () => void;
}

type CountdownStage = Extract<MemoryStage, { kind: "countdown" }>;
type RevealStage = Extract<MemoryStage, { kind: "reveal" }>;
type QuestionStage = Extract<MemoryStage, { kind: "question" }>;
type ResultStage = Extract<MemoryStage, { kind: "result" }>;

export function MemoryScreen(props: Props) {
  const { view } = props;
  switch (view.stage.kind) {
    case "done":
      return <Results {...props} />;
    case "watching":
      return <Watching {...props} message="A game is in progress. You’ll be in the next one." />;
    case "queued":
      return <Watching {...props} message="You’re in for the next round." />;
    case "result":
      return <RoundResult key={`r${view.stage.round}`} {...props} stage={view.stage} />;
    case "countdown":
    case "reveal":
      return <RevealPhase key={`r${view.stage.round}`} {...props} stage={view.stage} />;
    case "question":
      return <Question key={`r${view.stage.round}`} {...props} stage={view.stage} />;
  }
}

/** Everyone's score as the board and faces show it. */
const rowsOf = ({ view, room }: Props) =>
  rowsFrom(view.standings, room, (s) => formatPoints(s.points));

function LiveBoard(props: Props) {
  return <PlayBoard rows={rowsOf(props)} playerId={props.playerId} label="Live scores" />;
}

const roundLabel = (round: number, rounds: number) => (
  <>
    Round <b>{round + 1}</b> of {rounds}
  </>
);

/** Joined too late for this round, or watching from the room: the others' game. */
function Watching(props: Props & { message: string }) {
  const { message } = props;
  return (
    <PlayScreen
      label="Memory"
      latency={props.latency}
      onQuit={props.onQuit}
      side={<LiveBoard {...props} />}
    >
      <p className="watching">{message}</p>
      <PlayFaces faces={rowsOf(props)} playerId={props.playerId} />
    </PlayScreen>
  );
}

/**
 * "Get ready", then the items themselves. The flip happens on each player's own clock against
 * its server offset, so every screen shows and clears the set at the same instant; the server's
 * message that the reveal began only confirms what the clock already says.
 */
function RevealPhase(props: Props & { stage: CountdownStage | RevealStage }) {
  const { client, stage } = props;
  const now = useServerNow(client.serverNow);
  const revealed = stage.kind === "reveal" || now >= stage.startsAt;
  const countdown = Math.max(1, Math.ceil((stage.startsAt - now) / 1000));
  const remaining = Math.max(0, stage.endsAt - now);

  useEffect(() => {
    if (!revealed) play("tick");
  }, [revealed, countdown]);

  const wasRevealed = useRef(revealed);
  useEffect(() => {
    if (revealed && !wasRevealed.current) play("go");
    wasRevealed.current = revealed;
  }, [revealed]);

  if (!revealed) {
    return (
      <PlayScreen
        label={roundLabel(stage.round, props.view.rounds)}
        latency={props.latency}
        onQuit={props.onQuit}
      >
        <div className="countdown" aria-live="polite">
          <img src="/art/games/memory.webp" alt="" />
          <p className="countdown-label">Get ready</p>
          <p className="countdown-number">{countdown}</p>
        </div>
      </PlayScreen>
    );
  }

  return (
    <PlayScreen
      label={roundLabel(stage.round, props.view.rounds)}
      latency={props.latency}
      onQuit={props.onQuit}
    >
      <PlayTimer ms={timerMs(remaining)} low={remaining < 2000} />
      <p className="play-task">Remember these — the question comes when the clock runs out.</p>
      <Staged aside={<LiveBoard {...props} />}>
        <ul className="memory-set" aria-label="Items to remember">
          {stage.items.map((item) => (
            <li key={item.id} className="memory-item">
              <span className="memory-emoji" aria-hidden="true">
                {item.emoji}
              </span>
              <span className="memory-name">{item.name}</span>
            </li>
          ))}
        </ul>
      </Staged>
      <PlayFaces faces={rowsOf(props)} playerId={props.playerId} />
    </PlayScreen>
  );
}

/** The question, with the answers to pick from. The right one is never sent before it closes. */
function Question(props: Props & { stage: QuestionStage }) {
  const { view, client, stage, playerId } = props;
  const now = useServerNow(client.serverNow);
  const myAnswer = view.myAnswer;
  const [picked, setPicked] = useState<number | null>(myAnswer?.choice ?? null);
  const remaining = Math.max(0, stage.deadline - now);
  const locked = picked !== null || myAnswer !== null || remaining === 0;

  const answer = (choice: number) => {
    if (locked) return;
    setPicked(choice);
    client.act({
      type: "answer",
      choice,
      clientElapsedMs: Math.round(client.serverNow() - stage.startsAt),
    });
  };

  const status =
    picked !== null
      ? view.playerCount > 1
        ? "Locked in. Waiting for the others…"
        : "Locked in!"
      : remaining === 0
        ? "Time’s up"
        : "Pick the answer you remember";

  return (
    <PlayScreen
      label={roundLabel(stage.round, view.rounds)}
      latency={props.latency}
      onQuit={props.onQuit}
    >
      <PlayTimer
        ms={timerMs(remaining)}
        low={remaining / (stage.deadline - stage.startsAt) < 0.25}
      />
      <p className="play-task">{stage.question}</p>
      <Staged aside={<LiveBoard {...props} />}>
        <Choices choices={stage.choices} picked={picked} disabled={locked} onPick={answer} />
        <p className="memory-status" role="status">
          {status}
        </p>
      </Staged>
      <PlayFaces faces={rowsOf(props)} playerId={playerId} />
    </PlayScreen>
  );
}

/** Between rounds: the right answer, your verdict, and everyone else's answers. */
function RoundResult(props: Props & { stage: ResultStage }) {
  const { view, client, stage, playerId } = props;
  const now = useServerNow(client.serverNow);
  const seconds = Math.max(0, Math.ceil((stage.endsAt - now) / 1000));
  const mine = stage.answers.find((a) => a.playerId === playerId) ?? null;
  const points = view.myAnswer?.points ?? 0;
  const verdict =
    mine?.choice === null || mine === null ? "Time’s up" : mine.correct ? "Correct" : "Wrong";
  const names = new Map(view.standings.map((s) => [s.playerId, s.nickname]));
  const last = stage.round + 1 >= view.rounds;

  useEffect(() => {
    if (mine?.correct) play("correct");
    else play("wrong");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the verdict is judged once, on entry
  }, []);

  return (
    <PlayScreen
      label={roundLabel(stage.round, view.rounds)}
      latency={props.latency}
      onQuit={props.onQuit}
      side={<LiveBoard {...props} />}
    >
      <p className={`verdict ${mine?.correct ? "good" : "bad"}`} role="status">
        {verdict}
        {points > 0 && <span className="points">+{formatPoints(points)}</span>}
      </p>
      <p className="play-task">{stage.question}</p>
      <RevealedChoices
        choices={stage.choices}
        correct={stage.correct}
        mine={mine?.choice ?? null}
      />
      <ul className="memory-answers" aria-label={`Round ${stage.round + 1} answers`}>
        {stage.answers.map((a) => (
          <li key={a.playerId} className={a.playerId === playerId ? "me" : ""}>
            <Avatar
              id={roomAvatar(props.room, a.playerId)}
              name={names.get(a.playerId) ?? ""}
              size={34}
            />
            <span className="name">{a.playerId === playerId ? "You" : names.get(a.playerId)}</span>
            <span className="time">
              {a.choice === null ? "No answer" : a.correct ? `+${formatPoints(a.points)}` : "Wrong"}
            </span>
          </li>
        ))}
      </ul>
      <p className="memory-status" role="status">
        {last ? "Results" : "Next round"} in {seconds}
      </p>
      <PlayFaces faces={rowsOf(props)} playerId={playerId} />
    </PlayScreen>
  );
}

const roomAvatar = (room: RoomSnapshot, playerId: string) =>
  room.players.find((p) => p.id === playerId)?.avatar ?? null;

/** The final scores: a solo card, or the podium and everyone's total. */
function Results({ view, client, isHost, room, playerId, onQuit }: Props) {
  const solo = view.playerCount === 1;
  const avatars = new Map(room.players.map((p) => [p.id, p.avatar]));
  const avatarOf = (id: string) => avatars.get(id) ?? null;
  const podium = solo ? [] : view.standings.filter((s) => !s.left).slice(0, 3);
  const usernames = room.players.flatMap((p) => (p.username ? [p.username] : []));
  const me = view.me;
  useEffect(() => play("fanfare"), []);

  const text = me
    ? `I scored ${formatPoints(me.points)} on Memory on Whizard! Think you can beat it?`
    : "Race me at Memory on Whizard!";
  const { open: share, dialog: shareDialog } = useShareResults(
    buildCard({
      title: "Memory",
      subtitle: `${view.rounds} rounds`,
      art: "/art/games/memory.webp",
      colors: CATALOG.find((g) => g.id === "memory")?.colors ?? ["#15b58c", "#0b2a3c"],
      rows: solo
        ? []
        : view.standings
            .filter((s) => !s.left)
            .map((s) => ({
              playerId: s.playerId,
              nickname: s.nickname,
              avatar: avatarOf(s.playerId),
              value: s.points,
              label: `${s.correct}/${view.rounds} right`,
              timeMs: null,
            })),
      me: playerId,
      score: {
        value: me ? formatPoints(me.points) : "0",
        unit: "points",
      },
      correct: me ? { got: me.correct, of: view.rounds } : null,
      items: view.rounds,
      facts: [
        { icon: "⚡", value: String(view.rounds), label: "Rounds" },
        { icon: "✅", value: me ? String(me.correct) : "0", label: "Right" },
        { icon: "🏆", value: me ? formatPoints(me.points) : "0", label: "Score" },
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
            <h2 className="display results-title">Memory Results</h2>
            <span className="pill">
              <Icon name="bulb" size={18} />
              {view.rounds} rounds
            </span>
          </div>

          {solo && me ? (
            <div className="panel solo-score">
              <p className="label">Score</p>
              <p className="big-score">{formatPoints(me.points)}</p>
              <p className="muted">
                {me.correct} of {view.rounds} right
                {me.played < view.rounds && ` · ${view.rounds - me.played} not answered`}
              </p>
            </div>
          ) : (
            <Podium
              entries={podium.map((s) => ({
                playerId: s.playerId,
                nickname: s.nickname,
                label: `${s.correct}/${view.rounds} right`,
              }))}
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
                    s.rank === 1 && !s.left ? "first" : "",
                    s.playerId === playerId ? "me" : "",
                    s.left ? "gone" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <span className={`rank rank-${s.rank}`}>{s.rank}</span>
                  <Avatar id={avatarOf(s.playerId)} name={s.nickname} size={40} />
                  <span className="name">{s.nickname}</span>
                  <span className="pts">{formatPoints(s.points)}</span>
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
