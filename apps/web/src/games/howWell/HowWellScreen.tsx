import {
  fillName,
  fillYou,
  HOW_WELL_PACKS,
  type HowWellStage,
  type HowWellView,
} from "@whizard/game-core";
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
import {
  type Face,
  PlayBoard,
  PlayFrame,
  PlayScreen,
  PlayTimer,
  PlayVerdict,
  rowsFrom,
  Staged,
  timerMs,
  type VerdictTone,
  CountdownNumber,
} from "../play";

interface Props {
  view: HowWellView;
  client: RoomClient;
  room: RoomSnapshot;
  playerId: string;
  isHost: boolean;
  /** The connection indicator, shown in the top bar. */
  latency: ReactNode;
  /** Quits the game. Asks first while it's still running. */
  onQuit: () => void;
}

type QuestionStage = Extract<HowWellStage, { kind: "intro" | "answer" }>;
type RevealStage = Extract<HowWellStage, { kind: "reveal" }>;

const GAME_NAME = "How Well Do You Know Me?";
const ART = "/art/games/how-well.webp";

export function HowWellScreen(props: Props) {
  const { view } = props;
  switch (view.stage.kind) {
    case "done":
      return <Results {...props} />;
    case "reveal":
      return <Reveal key={`r${view.stage.round}`} {...props} stage={view.stage} />;
    case "intro":
    case "answer":
      return <Question key={`r${view.stage.round}`} {...props} stage={view.stage} />;
  }
}

/** Everyone's score as the board shows it, with a bar for how close they are to the lead. */
const rowsOf = ({ view, room }: Props): Face[] => {
  const top = Math.max(1, ...view.standings.map((s) => s.points));
  return rowsFrom(view.standings, room, (s) => formatPoints(s.points)).map((row, i) => ({
    ...row,
    bar: view.standings[i]!.points / top,
  }));
};

function LiveBoard(props: Props) {
  return <PlayBoard rows={rowsOf(props)} playerId={props.playerId} medals />;
}

const roundLabel = (round: number, rounds: number) => (
  <>
    Round <b>{round + 1}</b> of {rounds}
  </>
);

const avatarOf = (room: RoomSnapshot, id: string) =>
  room.players.find((p) => p.id === id)?.avatar ?? null;

/** The question as this player reads it: about themselves for the subject, by name for the rest. */
const askedOf = (stage: QuestionStage | RevealStage, mine: boolean) =>
  mine ? fillYou(stage.prompt) : fillName(stage.prompt, stage.subject.nickname);

/**
 * What the round asks, over the answers: "About you. Pick the true one." for the subject; for
 * everyone else the subject's face, ringed, beside the question with their name in it.
 */
function Asked({
  props,
  stage,
  ring,
}: {
  props: Props;
  stage: QuestionStage | RevealStage;
  /** The face's ring: the accent while answering, green once the answer is out. */
  ring: string;
}) {
  const mine = stage.role === "subject";
  const question = <h2 className="prompt">{askedOf(stage, mine)}</h2>;
  if (mine && stage.kind !== "reveal") {
    return (
      <div className="howwell-ask">
        <div>
          <p className="howwell-about">About you. Pick the true one.</p>
          {question}
        </div>
      </div>
    );
  }
  return (
    <div className="howwell-ask">
      <span className="howwell-subject">
        <Avatar
          id={avatarOf(props.room, stage.subject.playerId)}
          name={stage.subject.nickname}
          size={56}
          ring={ring}
        />
      </span>
      {question}
    </div>
  );
}

/** Who has answered so far, as faces: the ones still thinking are faded. Never what they picked. */
function Answered({ props, stage }: { props: Props; stage: QuestionStage }) {
  const { room, view, playerId } = props;
  const names = new Map(view.standings.map((s) => [s.playerId, s.nickname]));
  const done = stage.participants.filter((id) => stage.answered.includes(id)).length;
  return (
    <ul
      className="howwell-answered"
      aria-label={`${done} of ${stage.participants.length} have answered`}
    >
      {stage.participants.map((id) => {
        const answered = stage.answered.includes(id);
        const name = id === playerId ? "You" : (names.get(id) ?? "");
        return (
          <li key={id} className={answered ? "in" : "waiting"}>
            <Avatar id={avatarOf(room, id)} name={name} size={34} />
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The intro's few seconds (whose turn it is, with a countdown), then the question: the subject
 * picks their true answer while everyone else guesses it, on the same clock. The question opens
 * on each player's own clock against its server offset, so every screen opens it together.
 */
function Question(props: Props & { stage: QuestionStage }) {
  const { view, client, stage } = props;
  const now = useServerNow(client.serverNow);
  const open = stage.kind === "answer" || now >= stage.startsAt;
  const countdown = Math.max(1, Math.ceil((stage.startsAt - now) / 1000));
  const remaining = Math.max(0, stage.deadline - now);
  const myAnswer = view.myAnswer;
  const [picked, setPicked] = useState<number | null>(myAnswer?.choice ?? null);
  const watching = stage.role === "spectator";
  const locked = watching || picked !== null || myAnswer !== null || remaining === 0;
  const mine = stage.role === "subject";

  useEffect(() => {
    if (!open) play("tick");
  }, [open, countdown]);
  const wasOpen = useRef(open);
  useEffect(() => {
    if (open && !wasOpen.current) play("go");
    wasOpen.current = open;
  }, [open]);

  const label = roundLabel(stage.round, view.rounds);

  if (!open) {
    const name = stage.subject.nickname;
    return (
      <PlayFrame label={label} latency={props.latency} onQuit={props.onQuit} game="how-well">
        <div className="countdown howwell-intro" aria-live="polite">
          <span className="howwell-intro-face">
            <Avatar
              id={avatarOf(props.room, stage.subject.playerId)}
              name={name}
              size={112}
              ring="var(--accent)"
            />
          </span>
          <p className="countdown-label">{mine ? "Your turn" : `${name}’s turn`}</p>
          <CountdownNumber value={countdown} />
          <span className="pill pill-glow">
            {mine ? "Everyone’s guessing about you" : `How well do you know ${name}?`}
          </span>
        </div>
      </PlayFrame>
    );
  }

  const answer = (choice: number) => {
    if (locked) return;
    setPicked(choice);
    client.act({
      type: "answer",
      choice,
      clientElapsedMs: Math.round(client.serverNow() - stage.startsAt),
    });
  };

  const note = watching
    ? "You’re in from the next round."
    : picked === null && remaining === 0
      ? "Time’s up"
      : "";

  return (
    <PlayScreen
      label={label}
      latency={props.latency}
      onQuit={props.onQuit}
      game="how-well"
      thumb
      className="howwell-main"
    >
      <PlayTimer
        ms={timerMs(remaining)}
        low={remaining / (stage.deadline - stage.startsAt) < 0.25}
        totalMs={stage.deadline - stage.startsAt}
      />
      <Staged wide aside={<LiveBoard {...props} />}>
        <Asked props={props} stage={stage} ring="var(--accent)" />
        <Choices choices={stage.choices} picked={picked} disabled={locked} onPick={answer} />
        <p className="play-note" role="status">
          {note}
        </p>
      </Staged>
      <Answered props={props} stage={stage} />
    </PlayScreen>
  );
}

/** How many faces fit on one answer before the rest become "+3". */
const MAX_PICKERS = 4;

/** Who guessed an answer, as their faces along the bottom of its tile. */
function Pickers({ names, avatars }: { names: string[]; avatars: (string | null)[] }) {
  const extra = names.length - MAX_PICKERS;
  return (
    <span className="howwell-pickers" role="img" aria-label={`Picked by ${names.join(", ")}`}>
      {names.slice(0, MAX_PICKERS).map((name, i) => (
        <Avatar key={i} id={avatars[i]} name={name} size={26} />
      ))}
      {extra > 0 && <span className="howwell-more">+{extra}</span>}
    </span>
  );
}

/** One short line on the reveal: how the round went for you. */
function verdict(
  stage: RevealStage,
  playerId: string,
  nameOf: (id: string) => string,
): { text: string; points: number; tone: VerdictTone } {
  const name = stage.subject.nickname;
  const mine = stage.role === "subject";
  if (stage.outcome === "subject-left") return { text: `${name} left`, points: 0, tone: "info" };
  if (stage.outcome === "no-answer") {
    return {
      text: mine ? "You didn’t answer" : `${name} didn’t answer`,
      points: 0,
      tone: "late",
    };
  }
  if (mine) {
    const knew = stage.guesses.filter((g) => g.correct);
    const of = stage.guesses.length;
    if (of === 0) return { text: "Nobody guessed this time", points: 0, tone: "info" };
    if (knew.length === 0) {
      return {
        text: of === 1 ? "You kept them guessing" : "You kept them all guessing",
        points: 0,
        tone: "info",
      };
    }
    // Just the two of you: "Tolu knows you".
    const text =
      of === 1 ? `${nameOf(knew[0]!.playerId)} knows you` : `${knew.length} of ${of} know you`;
    return { text, points: stage.subjectPoints, tone: "good" };
  }
  const guess = stage.guesses.find((g) => g.playerId === playerId);
  if (!guess) return { text: `${name} picked it`, points: 0, tone: "info" };
  if (guess.correct) return { text: `You know ${name}`, points: guess.points, tone: "good" };
  if (guess.choice === null) return { text: `No guess this time`, points: 0, tone: "late" };
  return { text: `${name} keeps you guessing`, points: 0, tone: "bad" };
}

/** The subject's answer, green, with everyone's guess as their face on the answer they picked. */
function Reveal(props: Props & { stage: RevealStage }) {
  const { view, stage, playerId, room } = props;
  const answer = stage.answer;
  const names = new Map(view.standings.map((s) => [s.playerId, s.nickname]));
  const { text, points, tone } = verdict(stage, playerId, (id) => names.get(id) ?? "");

  const marks = stage.choices.map((_, i) => {
    const pickers = stage.guesses.filter((g) => g.choice === i);
    if (pickers.length === 0) return null;
    return (
      <Pickers
        names={pickers.map((g) =>
          g.playerId === playerId ? "You" : (names.get(g.playerId) ?? ""),
        )}
        avatars={pickers.map((g) => avatarOf(room, g.playerId))}
      />
    );
  });

  useEffect(() => {
    if (stage.role === "spectator") return;
    play(points > 0 ? "correct" : "wrong");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the verdict is judged once, on entry
  }, []);

  return (
    <PlayScreen
      label={roundLabel(stage.round, view.rounds)}
      latency={props.latency}
      onQuit={props.onQuit}
      game="how-well"
      thumb
      className="howwell-main howwell-reveal"
    >
      {/* The clock's place is kept, so the question and answers don't jump at the reveal. */}
      <div className="howwell-clock-space" aria-hidden="true">
        <PlayTimer ms={0} totalMs={1} />
      </div>
      <Staged wide aside={<LiveBoard {...props} />}>
        <Asked props={props} stage={stage} ring="var(--ok)" />
        {/* How the round went for you, between the question and its answers. */}
        <div className="howwell-toast">
          <PlayVerdict tone={tone} points={points}>
            {text}
          </PlayVerdict>
        </div>
        <RevealedChoices choices={stage.choices} correct={answer ?? -1} mine={null} marks={marks} />
      </Staged>
    </PlayScreen>
  );
}

/** The final scores: the podium and everyone's total. */
function Results({ view, client, isHost, room, playerId, onQuit }: Props) {
  const avatarFor = (id: string) => avatarOf(room, id);
  const stayed = view.standings.filter((s) => !s.left);
  const podium = stayed.slice(0, 3);
  const usernames = room.players.flatMap((p) => (p.username ? [p.username] : []));
  const me = view.me;
  const pack = HOW_WELL_PACKS.find((p) => p.id === view.pack)?.name ?? "";
  useEffect(() => play("fanfare"), []);

  const text = me
    ? `I scored ${formatPoints(me.points)} on How Well Do You Know Me? on Whizard! How well do you know me?`
    : "How well do you know me? Find out on Whizard!";
  const { open: share, dialog: shareDialog } = useShareResults(
    buildCard({
      title: GAME_NAME,
      subtitle: `${pack} · ${view.rounds} rounds`,
      art: ART,
      colors: CATALOG.find((g) => g.id === "how-well")?.colors ?? ["#a347ff", "#2d0d5c"],
      rows: stayed.map((s) => ({
        playerId: s.playerId,
        nickname: s.nickname,
        avatar: avatarFor(s.playerId),
        value: s.points,
        label: `${s.correct} right`,
        timeMs: null,
      })),
      me: playerId,
      score: { value: me ? formatPoints(me.points) : "0", unit: "points" },
      correct: me && me.guessed > 0 ? { got: me.correct, of: me.guessed } : null,
      items: view.rounds,
      facts: [
        { icon: "💜", value: me ? String(me.known) : "0", label: "Knew you" },
        { icon: "✅", value: me ? String(me.correct) : "0", label: "Right guesses" },
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

      <div className="results-layout">
        <section className="results-main">
          <div className="results-head">
            <h2 className="display results-title">How Well Results</h2>
            <span className="pill">
              <Icon name="heart" size={18} />
              {pack} · {view.rounds} rounds
            </span>
          </div>

          <Podium
            entries={podium.map((s) => ({
              playerId: s.playerId,
              nickname: s.nickname,
              label: formatPoints(s.points),
              unit: "points",
            }))}
            avatarOf={avatarFor}
          />

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
                <Avatar id={avatarFor(s.playerId)} name={s.nickname} size={40} />
                <span className="name">{s.nickname}</span>
                <span className="pts">{formatPoints(s.points)}</span>
              </li>
            ))}
          </ol>
        </aside>
      </div>

      <AddFromGame usernames={usernames} />
      {shareDialog}
    </div>
  );
}
