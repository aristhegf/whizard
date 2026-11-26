import type { ImpostorClue, ImpostorStage, ImpostorView } from "@whizard/game-core";
import {
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
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
import { GameNoticeContext } from "../../ui/gameNotice";
import { Icon } from "../../ui/Icon";
import { Podium } from "../../ui/Podium";
import { PlayBoard, PlayScreen, PlayTimer, rowsFrom, Staged, timerMs, type Face } from "../play";

interface Props {
  view: ImpostorView;
  client: RoomClient;
  room: RoomSnapshot;
  playerId: string;
  isHost: boolean;
  /** The connection indicator, shown in the top bar. */
  latency: ReactNode;
  /** Quits the game. Asks first while it's still running. */
  onQuit: () => void;
}

/** What every stage gets: the game's props, and the card's Hide/Show for this round. */
interface StageProps extends Props {
  hidden: boolean;
  onToggleHidden: () => void;
}

type Stage<K extends ImpostorStage["kind"]> = Extract<ImpostorStage, { kind: K }>;

export function ImpostorScreen(props: Props) {
  const { view, client } = props;
  // Hide the card from anyone looking over your shoulder; a new round shows the new card.
  const [hiddenRound, setHiddenRound] = useState<number | null>(null);
  const hidden = hiddenRound === view.round;
  const onToggleHidden = () => setHiddenRound(hidden ? null : view.round);

  // A clue the server turned down (a repeat, the word itself, a blocked word) says why in the
  // slim line at the bottom.
  const notices = useContext(GameNoticeContext);
  useEffect(() => client.onRejected((message) => notices?.say(message)), [client, notices]);

  const stageProps = { ...props, hidden, onToggleHidden };
  const stage = view.stage;
  switch (stage.kind) {
    case "done":
      return <Results {...props} />;
    case "watching":
      return <Watching {...props} message="A game is in progress. You’ll be in the next one." />;
    case "queued":
      return <Watching {...props} message="You’re in from the next round." />;
    case "role":
      return <RoleStage key={`role${view.round}`} {...stageProps} stage={stage} />;
    case "clues":
      return <Clues key={`clues${view.round}`} {...stageProps} stage={stage} />;
    case "vote":
      return <Vote key={`vote${view.round}`} {...stageProps} stage={stage} />;
    case "guess":
      return <Guess key={`guess${view.round}`} {...stageProps} stage={stage} />;
    case "reveal":
      return <Reveal key={`reveal${view.round}`} {...stageProps} stage={stage} />;
  }
}

// Shared pieces --------------------------------------------------------------------------

const rowsOf = ({ view, room }: Props): Face[] =>
  rowsFrom(view.standings, room, (s) => formatPoints(s.points));

function Board(props: Props) {
  return <PlayBoard rows={rowsOf(props)} playerId={props.playerId} medals />;
}

/** Names and faces by player, for everyone who has been in the game. */
function usePeople({ view, room, playerId }: Props) {
  const names = new Map(view.standings.map((s) => [s.playerId, s.nickname]));
  const avatars = new Map(room.players.map((p) => [p.id, p.avatar]));
  return {
    name: (id: string) => names.get(id) ?? "Someone",
    /** "You" for this player, their nickname for anyone else. */
    who: (id: string) => (id === playerId ? "You" : (names.get(id) ?? "Someone")),
    avatar: (id: string) => avatars.get(id) ?? null,
  };
}

const roundLabel = (view: ImpostorView) => (
  <>
    Round <b>{view.round + 1}</b> of {view.rounds}
  </>
);

/**
 * "Food · Pancake" at the top while the round is on. The word is a button: it hides it (and
 * the card) from anyone looking over your shoulder. The impostor sees only the category.
 */
function CategoryLabel({ view, hidden, onToggleHidden }: StageProps) {
  return (
    <span className="imp-label">
      {view.category.name}
      {view.word !== null && (
        <>
          {" "}
          <button
            type="button"
            className="imp-word-chip"
            aria-label={hidden ? "Show your word" : "Hide your word"}
            aria-pressed={hidden}
            onClick={onToggleHidden}
          >
            · {hidden ? "Show word" : view.word}
          </button>
        </>
      )}
    </span>
  );
}

/** A stage's screen: the label at the top, the play area with the scores beside it on a PC. */
function ImpostorPlay({
  props,
  label,
  timer,
  bottom,
  className = "",
  children,
}: {
  props: StageProps | Props;
  label: ReactNode;
  timer?: ReactNode;
  /** The stage's own line or buttons at the foot of the screen. */
  bottom?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <PlayScreen
      label={label}
      latency={props.latency}
      onQuit={props.onQuit}
      className={`imp-main ${className}`.trim()}
    >
      {timer}
      <Staged aside={<Board {...props} />}>{children}</Staged>
      {bottom && <div className="imp-bottom">{bottom}</div>}
    </PlayScreen>
  );
}

const secondsLeft = (until: number, now: number) => Math.max(0, Math.ceil((until - now) / 1000));

/** Joined too late for this round, or watching from the room. */
function Watching(props: Props & { message: string }) {
  return (
    <PlayScreen
      label="Impostor"
      latency={props.latency}
      onQuit={props.onQuit}
      side={<Board {...props} />}
    >
      <p className="watching">{props.message}</p>
    </PlayScreen>
  );
}

// Role -------------------------------------------------------------------------------------

/** The round's card: the word for the crew, "You're the impostor" for the impostor. */
function RoleCard({ view, hidden }: { view: ImpostorView; hidden: boolean }) {
  if (hidden) {
    return (
      <div className="imp-card hidden" aria-label="Your card is hidden">
        <Icon name="eye-off" size={40} />
        <p className="imp-card-title">Hidden</p>
      </div>
    );
  }
  if (view.role === "impostor") {
    return (
      <div className="imp-card impostor">
        <p className="imp-card-category">{view.category.name}</p>
        <h2 className="imp-card-title">You’re the impostor</h2>
        <p className="imp-card-note">Blend in. Don’t get caught.</p>
      </div>
    );
  }
  return (
    <div className="imp-card crew">
      <p className="imp-card-category">{view.category.name}</p>
      <h2 className="imp-card-title word">{view.word}</h2>
      <p className="imp-card-note">One of you doesn’t have this word.</p>
    </div>
  );
}

function HideButton({ hidden, onToggleHidden }: Pick<StageProps, "hidden" | "onToggleHidden">) {
  return (
    <button type="button" className="play-pill imp-hide" onClick={onToggleHidden}>
      <Icon name={hidden ? "eye" : "eye-off"} size={20} />
      {hidden ? "Show" : "Hide"}
    </button>
  );
}

function RoleStage(props: StageProps & { stage: Stage<"role"> }) {
  const { view, client, stage } = props;
  const now = useServerNow(client.serverNow);
  const seconds = secondsLeft(stage.endsAt, now);
  useEffect(() => play("go"), []);
  return (
    <ImpostorPlay
      props={props}
      label={roundLabel(view)}
      className="imp-role-main"
      bottom={<p className="play-note">Clues start in {Math.max(1, seconds)}</p>}
    >
      <div className="imp-role">
        <RoleCard view={view} hidden={props.hidden} />
        <HideButton hidden={props.hidden} onToggleHidden={props.onToggleHidden} />
      </div>
    </ImpostorPlay>
  );
}

// Clues ------------------------------------------------------------------------------------

/** A turn's clue as its row shows it: the typed word, "said it", or a dash for none. */
function clueText(clue: ImpostorClue | undefined): string | null {
  if (!clue) return null;
  if (clue.status === "typed") return clue.text;
  if (clue.status === "spoken") return "said it";
  return "—";
}

function Clues(props: StageProps & { stage: Stage<"clues"> }) {
  const { view, client, stage, playerId } = props;
  const people = usePeople(props);
  const now = useServerNow(client.serverNow);
  const remaining = Math.max(0, stage.turnEndsAt - now);
  const myTurn = stage.turnPlayerId === playerId;
  const typed = view.clueMode === "typed";

  useEffect(() => {
    if (myTurn) play("go");
  }, [myTurn]);

  const bottom = myTurn ? (
    typed ? (
      <ClueForm key={stage.turnIndex} client={client} maxLength={view.clueMaxLength} />
    ) : (
      <div className="play-actions">
        <button className="play-pill go" onClick={() => client.act({ type: "done" })}>
          Done
        </button>
      </div>
    )
  ) : (
    <p className="play-note">
      {typed
        ? `${people.name(stage.turnPlayerId)} is thinking of a clue`
        : `${people.name(stage.turnPlayerId)} is saying their clue`}
    </p>
  );

  return (
    <ImpostorPlay
      props={props}
      label={<CategoryLabel {...props} />}
      timer={<PlayTimer ms={timerMs(remaining)} low={remaining < 5000} />}
      bottom={bottom}
    >
      <ol className="imp-rows" aria-label="Clues">
        {stage.order.map((id, i) => {
          const state = i < stage.turnIndex ? "done" : i === stage.turnIndex ? "now" : "next";
          const clue = clueText(stage.clues.find((c) => c.playerId === id));
          const mine = id === playerId;
          return (
            <li key={id} className={`imp-row ${state}`} aria-current={state === "now" || undefined}>
              <Avatar id={people.avatar(id)} name={people.name(id)} size={40} />
              <span className="imp-row-name">
                {mine ? (state === "now" ? "Your turn" : "You") : people.name(id)}
              </span>
              {state === "done" && clue && (
                <span className={`imp-clue${clue === "—" || clue === "said it" ? " quiet" : ""}`}>
                  {clue}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </ImpostorPlay>
  );
}

/** Your clue, on your turn: one word, sent with Send or the keyboard's Enter. */
function ClueForm({ client, maxLength }: { client: RoomClient; maxLength: number }) {
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const send = (event: FormEvent) => {
    event.preventDefault();
    const clue = text.trim();
    if (clue) client.act({ type: "clue", text: clue });
  };
  return (
    <form className="imp-send" onSubmit={send}>
      <label className="sr-only" htmlFor="imp-clue">
        Your clue
      </label>
      <input
        ref={input}
        id="imp-clue"
        className="imp-input"
        value={text}
        maxLength={maxLength}
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="send"
        placeholder="One word"
        onChange={(event) => setText(event.target.value)}
      />
      <button className="play-pill go imp-send-btn" disabled={!text.trim()}>
        Send
      </button>
    </form>
  );
}

// Vote -------------------------------------------------------------------------------------

function Vote(props: StageProps & { stage: Stage<"vote"> }) {
  const { view, client, stage, playerId } = props;
  const people = usePeople(props);
  const now = useServerNow(client.serverNow);
  const remaining = Math.max(0, stage.endsAt - now);
  const [picked, setPicked] = useState<string | null>(view.myVote);
  const choice = picked ?? view.myVote;
  const inRound = stage.candidates.includes(playerId);
  const clueOf = (id: string) => {
    const clue = stage.clues.find((c) => c.playerId === id);
    return clue?.status === "typed" ? clue.text : null;
  };

  const vote = (id: string) => {
    if (!inRound || id === choice) return;
    setPicked(id);
    client.act({ type: "vote", playerId: id });
  };

  const voted = new Set(stage.voted);
  return (
    <ImpostorPlay
      props={props}
      label={<CategoryLabel {...props} />}
      timer={<PlayTimer ms={timerMs(remaining)} low={remaining < 5000} />}
      bottom={
        <ul
          className="imp-voted"
          aria-label={`${stage.voted.length} of ${stage.candidates.length} have voted`}
        >
          {stage.candidates.map((id) => (
            <li key={id} className={voted.has(id) ? "in" : ""} title={people.who(id)}>
              <Avatar id={people.avatar(id)} name={people.name(id)} size={34} />
            </li>
          ))}
        </ul>
      }
    >
      <h2 className="imp-ask">Who’s the impostor?</h2>
      <div className="imp-picks" role="group" aria-label="Vote">
        {stage.candidates
          .filter((id) => id !== playerId)
          .map((id) => (
            <button
              key={id}
              className={`imp-pick${choice === id ? " on" : ""}`}
              aria-pressed={choice === id}
              disabled={!inRound}
              onClick={() => vote(id)}
            >
              <Avatar id={people.avatar(id)} name={people.name(id)} size={56} />
              <span className="imp-pick-name">{people.name(id)}</span>
              {clueOf(id) && <b className="imp-pick-clue">{clueOf(id)}</b>}
            </button>
          ))}
      </div>
    </ImpostorPlay>
  );
}

// Last chance ------------------------------------------------------------------------------

function Guess(props: StageProps & { stage: Stage<"guess"> }) {
  const { view, client, stage, playerId } = props;
  const people = usePeople(props);
  const now = useServerNow(client.serverNow);
  const remaining = Math.max(0, stage.endsAt - now);
  const [picked, setPicked] = useState<number | null>(view.myGuess);
  const mine = stage.accusedId === playerId;

  const guess = (choice: number) => {
    if (picked !== null) return;
    setPicked(choice);
    client.act({ type: "guess", choice });
  };

  return (
    <ImpostorPlay
      props={props}
      label={<CategoryLabel {...props} />}
      timer={<PlayTimer ms={timerMs(remaining)} low={remaining < 5000} />}
    >
      {mine ? (
        <>
          <h2 className="imp-ask">Last chance: what’s the word?</h2>
          <div className="imp-options" role="group" aria-label="The word">
            {stage.options.map((option, i) => (
              <button
                key={option}
                className={`play-tile imp-option${picked === i ? " picked" : ""}`}
                disabled={picked !== null}
                onClick={() => guess(i)}
              >
                {option}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="imp-guessing">
          <Avatar
            id={people.avatar(stage.accusedId)}
            name={people.name(stage.accusedId)}
            size={96}
          />
          <h2 className="imp-ask">{people.name(stage.accusedId)} is guessing the word</h2>
        </div>
      )}
    </ImpostorPlay>
  );
}

// Reveal -----------------------------------------------------------------------------------

/** What the round meant for you, for the pill at the foot of the reveal. */
function yourRound(stage: Stage<"reveal">, playerId: string): string | null {
  if (!stage.points.some((p) => p.playerId === playerId)) return null;
  if (stage.outcome === "left") return null;
  if (stage.impostorId === playerId) {
    if (stage.outcome === "escaped") return "You got away";
    if (stage.outcome === "guessed") return "You guessed the word";
    return "You got caught";
  }
  const mine = stage.votes.find((v) => v.voterId === playerId);
  if (!mine) return "You didn’t vote";
  if (mine.suspectId !== stage.impostorId) return "They fooled you";
  return stage.accusedId === stage.impostorId ? "You caught them" : "You spotted them";
}

function Reveal(props: StageProps & { stage: Stage<"reveal"> }) {
  const { view, stage, playerId } = props;
  const people = usePeople(props);
  const impostor = people.who(stage.impostorId);
  const mine = stage.impostorId === playerId;
  const points = stage.points.find((p) => p.playerId === playerId)?.points ?? 0;
  const verdict = yourRound(stage, playerId);

  useEffect(() => {
    if (points > 0) play("correct");
    else if (verdict) play("wrong");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the round is judged once, on entry
  }, []);

  // Every suspect with their voters, the impostor always among them.
  const tally = stage.tally.some((t) => t.playerId === stage.impostorId)
    ? stage.tally
    : [...stage.tally, { playerId: stage.impostorId, votes: 0 }];

  let line: ReactNode;
  if (stage.outcome === "left") {
    line = <>They left the game, so the crew win this round.</>;
  } else {
    const after =
      stage.guess !== null ? (
        <>
          {" "}
          {mine ? "You" : impostor} guessed {stage.guessedRight ? "it" : <b>{stage.guess}</b>}.
        </>
      ) : stage.outcome === "caught" ? (
        <> {mine ? "You" : impostor} ran out of time.</>
      ) : stage.accusedId === null ? (
        <> {stage.votes.length === 0 ? "Nobody voted." : "The vote was a tie."}</>
      ) : null;
    line = (
      <>
        The word was <b>{stage.word}</b>.{after}
      </>
    );
  }

  return (
    <ImpostorPlay
      props={props}
      label={roundLabel(view)}
      className="imp-reveal-main"
      bottom={
        verdict && (
          <p className="imp-points" role="status">
            {verdict}
            {points > 0 && <span>+{formatPoints(points)}</span>}
          </p>
        )
      }
    >
      <div className="imp-reveal">
        <span className="imp-reveal-face">
          <Avatar id={people.avatar(stage.impostorId)} name={impostor} size={120} />
        </span>
        <h2 className="imp-reveal-title">
          {mine ? "You were the impostor" : `${impostor} was the impostor`}
        </h2>
        <p className="imp-reveal-line">{line}</p>
      </div>
      {stage.outcome !== "left" && (
        <ol className="imp-tally" aria-label="Votes">
          {tally.map((t, i) => {
            const voters = stage.votes.filter((v) => v.suspectId === t.playerId);
            return (
              <li
                key={t.playerId}
                className={`imp-tally-row${t.playerId === stage.impostorId ? " impostor" : ""}`}
                style={{ "--i": i } as CSSProperties}
              >
                <Avatar id={people.avatar(t.playerId)} name={people.name(t.playerId)} size={36} />
                <span className="imp-row-name">{people.who(t.playerId)}</span>
                <span
                  className="imp-voters"
                  role="img"
                  aria-label={
                    voters.length > 0
                      ? `Voted for by ${voters.map((v) => people.who(v.voterId)).join(", ")}`
                      : "No votes"
                  }
                >
                  {voters.map((v) => (
                    <Avatar
                      key={v.voterId}
                      id={people.avatar(v.voterId)}
                      name={people.name(v.voterId)}
                      size={22}
                    />
                  ))}
                </span>
                <span className="imp-count">{t.votes}</span>
              </li>
            );
          })}
        </ol>
      )}
    </ImpostorPlay>
  );
}

// Results ----------------------------------------------------------------------------------

function Results({ view, client, isHost, room, playerId, onQuit }: Props) {
  const avatars = new Map(room.players.map((p) => [p.id, p.avatar]));
  const avatarOf = (id: string) => avatars.get(id) ?? null;
  const stayed = view.standings.filter((s) => !s.left);
  const podium = stayed.slice(0, 3);
  const usernames = room.players.flatMap((p) => (p.username ? [p.username] : []));
  const me = view.me;
  const played = view.history.length;
  useEffect(() => play("fanfare"), []);

  const text = me
    ? `I scored ${formatPoints(me.points)} at Impostor on Whizard! Can you spot the impostor?`
    : "Play Impostor with me on Whizard!";
  const { open: share, dialog: shareDialog } = useShareResults(
    buildCard({
      title: "Impostor",
      subtitle: `${played} ${played === 1 ? "round" : "rounds"}`,
      art: "/art/games/impostor.webp",
      colors: CATALOG.find((g) => g.id === "impostor")?.colors ?? ["#5b3cf0", "#171456"],
      rows: stayed.map((s) => ({
        playerId: s.playerId,
        nickname: s.nickname,
        avatar: avatarOf(s.playerId),
        value: s.points,
        label: `${s.correctVotes} caught`,
        timeMs: null,
      })),
      me: playerId,
      score: { value: me ? formatPoints(me.points) : "0", unit: "points" },
      correct: null,
      items: played,
      facts: [
        { icon: "🕵️", value: String(played), label: "Rounds" },
        { icon: "🎯", value: me ? String(me.correctVotes) : "0", label: "Caught" },
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
            <h2 className="display results-title">Impostor Results</h2>
            <span className="pill">
              <Icon name="shield" size={18} />
              {played} {played === 1 ? "round" : "rounds"}
            </span>
          </div>
          {view.stage.kind === "done" && view.stage.endedEarly && (
            <p className="muted center">Too few players were left to carry on.</p>
          )}

          <Podium
            entries={podium.map((s) => ({
              playerId: s.playerId,
              nickname: s.nickname,
              label: formatPoints(s.points),
              unit: "points",
            }))}
            avatarOf={avatarOf}
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
                <Avatar id={avatarOf(s.playerId)} name={s.nickname} size={40} />
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
