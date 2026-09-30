import {
  LEVEL_NAMES,
  type LevelChoice,
  type RoundOutcome,
  type RoundResult,
  type RoundsStage,
  type SpotItPuzzleView,
  type SpotItReveal,
  type SpotItSpeedView,
  type WordPuzzleView,
  type WordReveal,
  type WordRushSpeedView,
} from "@whizard/game-core";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  type Ref,
} from "react";
import { CATALOG } from "../../catalog";
import { AddFromGame } from "../../FriendsScreen";
import type { RoomClient, RoomSnapshot } from "../../roomClient";
import { play } from "../../sounds";
import { Brand } from "../../ui/Chrome";
import { useErrorShake } from "../../ui/errorShake";
import { PlayToast } from "../../ui/gameNotice";
import { Icon } from "../../ui/Icon";
import { useServerNow } from "../../useServerNow";
import { PlayFaces, PlayTimer, PlayTop, Staged, timerMs, type Face } from "../play";
import { Podium } from "../../ui/Podium";
import { buildCard } from "../../share/outcomes";
import { useShareResults } from "../../share/ShareResults";
import { elapsedSince, Leaderboard, ScoreBoard, useCountdown } from "../quiz/QuizScreen";

// Word Rush and Spot It in Speed: everyone gets the same puzzles and plays through them at
// their own pace. This screen holds what they share; each game brings its own puzzle. The
// puzzles, answers and review are used by their Elimination screen too.

type AnyView = WordRushSpeedView | SpotItSpeedView;
export type RoundsGame = AnyView["game"];
type Stage<K extends string> = Extract<
  RoundsStage<WordPuzzleView | SpotItPuzzleView, string | number, WordReveal | SpotItReveal>,
  { kind: K }
>;

/** How long a result shows before the next round, unless the player moves on sooner. */
const RESULT_MS = 1600;

interface Props {
  view: AnyView;
  client: RoomClient;
  room: RoomSnapshot;
  playerId: string;
  isHost: boolean;
  latency: ReactNode;
  onQuit: () => void;
}

interface Context extends Props {
  name: string;
  art: string;
  avatarOf: (playerId: string) => string | null;
}

export function RoundsScreen(props: Props) {
  const { view, room } = props;
  const game = CATALOG.find((g) => g.id === view.game);
  const avatars = new Map(room.players.map((p) => [p.id, p.avatar]));
  const context: Context = {
    ...props,
    name: game?.name ?? "Game",
    art: game?.art ?? "/art/mascot/run.webp",
    avatarOf: (id) => avatars.get(id) ?? null,
  };

  const stage = view.stage as Stage<string>;
  switch (stage.kind) {
    case "puzzle":
      return (
        <Puzzle
          key={`p${(stage as Stage<"puzzle">).index}`}
          context={context}
          stage={stage as Stage<"puzzle">}
        />
      );
    case "result":
      return (
        <Result
          key={`r${(stage as Stage<"result">).index}`}
          context={context}
          stage={stage as Stage<"result">}
        />
      );
    case "done":
      return <Results context={context} results={(stage as Stage<"done">).results} />;
    default:
      return (
        <div className="game play">
          <Top context={context} index={null} />
          <div className="game-layout">
            <div className="game-main play-main">
              <p className="watching">A game is in progress. You’ll be in the next one.</p>
              <PlayFaces faces={facesOf(context)} playerId={props.playerId} />
            </div>
            <ScoreBoard
              standings={view.standings}
              playerId={props.playerId}
              avatarOf={context.avatarOf}
            />
          </div>
          <PlayToast />
        </div>
      );
  }
}

/**
 * The top of the screen: which round, as plain text, and bare Settings and Quit icons. Before
 * the first round, the game's name.
 */
function Top({ context, index }: { context: Context; index: number | null }) {
  const { view, onQuit, latency } = context;
  return (
    <PlayTop
      latency={latency}
      onQuit={onQuit}
      label={
        index === null ? (
          context.name
        ) : (
          <>
            Round <b>{index + 1}</b> / {view.total}
          </>
        )
      }
    />
  );
}

/** Everyone's score, as faces for a phone. Anyone who left, or is out, is dimmed. */
export function facesOf(context: {
  view: {
    standings: {
      playerId: string;
      nickname: string;
      rank: number;
      score: number;
      left?: boolean;
      status?: string;
    }[];
  };
  avatarOf: (playerId: string) => string | null;
}): Face[] {
  return context.view.standings.map((s) => ({
    playerId: s.playerId,
    nickname: s.nickname,
    avatar: context.avatarOf(s.playerId),
    rank: s.rank,
    value: s.score.toLocaleString(),
    gone: !!s.left || s.status === "out" || s.status === "left",
  }));
}

// Playing a round ------------------------------------------------------------------------------

function Puzzle({ context, stage }: { context: Context; stage: Stage<"puzzle"> }) {
  const { view, client } = context;
  const now = useServerNow(client.serverNow);
  const [visible, setVisible] = useState(() => client.serverNow() >= stage.startsAt);
  const shownAt = useRef<number | null>(null);
  const hadCountdown = useRef(!visible);
  const countdown = Math.max(1, Math.ceil((stage.startsAt - now) / 1000));
  const remaining = Math.max(0, stage.deadline - now);
  const secondsLeft = Math.ceil(remaining / 1000);

  useEffect(() => {
    if (!visible) play("tick");
  }, [visible, countdown]);
  useEffect(() => {
    if (visible && hadCountdown.current) play("go");
  }, [visible]);
  useEffect(() => {
    if (visible && secondsLeft > 0 && secondsLeft <= 5) play("hurry");
  }, [visible, secondsLeft]);
  useEffect(() => {
    if (stage.tried.length > 0) play("wrong");
  }, [stage.tried.length]);

  // The first round appears for everyone at the same server moment; times count from then.
  useEffect(() => {
    if (visible) {
      shownAt.current ??= performance.now();
      return;
    }
    const timer = setTimeout(
      () => setVisible(true),
      Math.max(0, stage.startsAt - client.serverNow()),
    );
    return () => clearTimeout(timer);
  }, [visible, stage.startsAt, client]);

  if (!visible) {
    return (
      <div className="game play">
        <Top context={context} index={null} />
        <div className="countdown" aria-live="polite">
          <img className="countdown-game-art" src={context.art} alt="" />
          <p className="countdown-label">Get ready</p>
          <p className="countdown-number">{countdown}</p>
          <span className="pill pill-glow">{context.name}</span>
        </div>
        <PlayToast />
      </div>
    );
  }

  const guess = (value: string | number) =>
    client.act({
      type: "guess",
      index: stage.index,
      guess: value,
      clientElapsedMs: elapsedSince(shownAt.current),
    });
  const skip = () => client.act({ type: "skip", index: stage.index });
  const scores = (
    <ScoreBoard
      standings={view.standings}
      playerId={context.playerId}
      avatarOf={context.avatarOf}
    />
  );

  return (
    <div className="game play">
      <Top context={context} index={stage.index} />
      <div className="game-layout staged">
        <div className="game-main play-main play-column rounds-main">
          <PlayTimer ms={timerMs(remaining)} low={remaining / view.timeLimitMs < 0.25} />
          {view.game === "word-rush" ? (
            <WordPuzzle
              puzzle={stage.puzzle as WordPuzzleView}
              tried={stage.tried as string[]}
              triesLeft={stage.triesLeft}
              onGuess={guess}
              onSkip={skip}
              aside={scores}
            />
          ) : (
            <SpotPuzzle
              grid={stage.puzzle as SpotItPuzzleView}
              tried={stage.tried as number[]}
              triesLeft={stage.triesLeft}
              onTap={guess}
              aside={scores}
            />
          )}
          <PlayFaces faces={facesOf(context)} playerId={context.playerId} />
          {/* Word Rush's give-up sits in its own row of buttons, with Check. */}
          {view.game === "spot-it" && (
            <div className="play-actions">
              <button className="play-pill" onClick={skip}>
                <Icon name="skip" size={20} />
                Skip this grid
              </button>
            </div>
          )}
        </div>
      </div>
      <PlayToast />
    </div>
  );
}

/** Shakes `ref` each time `count` goes up, i.e. after each wrong try. */
function useShakeOnMiss<T extends HTMLElement>(count: number) {
  const { ref, shake } = useErrorShake<T>();
  useEffect(() => {
    if (count > 0) shake();
  }, [count, shake]);
  return ref;
}

export function WordPuzzle({
  puzzle,
  tried,
  triesLeft,
  onGuess,
  onSkip,
  aside,
}: {
  puzzle: WordPuzzleView;
  tried: string[];
  triesLeft: number;
  onGuess: (word: string) => void;
  /** Gives up on the word, from the row of buttons at the bottom. */
  onSkip?: () => void;
  /** The scores, beside the letters on a computer. */
  aside?: ReactNode;
}) {
  const [typed, setTyped] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const slots = useShakeOnMiss<HTMLDivElement>(tried.length);
  const unscramble = puzzle.type === "unscramble";
  const blanks = unscramble ? 0 : puzzle.pattern.filter((l) => l === null).length;
  const length = unscramble ? puzzle.letters.length : puzzle.pattern.length;

  // Unscramble: letters come off the tiles as they're used. Missing letters: they fill the gaps.
  const left = unscramble ? remove(puzzle.letters, typed) : [];
  const shown: (string | null)[] = unscramble
    ? Array.from({ length }, (_, i) => typed[i] ?? null)
    : fill(puzzle.pattern, typed);
  const full = unscramble ? typed.length === length : typed.length === blanks;
  // Where the next letter goes, marked while typing.
  const nextAt = shown.findIndex((letter) => letter === null);

  const change = (value: string) => {
    let next = value.toUpperCase().replace(/[^A-Z]/g, "");
    if (unscramble) {
      // Only letters still on the tiles.
      let pool = [...puzzle.letters];
      next = [...next]
        .filter((letter) => {
          const at = pool.indexOf(letter);
          if (at === -1) return false;
          pool = pool.filter((_, i) => i !== at);
          return true;
        })
        .join("");
    }
    setTyped(next.slice(0, unscramble ? length : blanks));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!full) return;
    onGuess(shown.join(""));
    setTyped("");
    input.current?.focus();
  };

  return (
    <form className="word-puzzle" onSubmit={submit}>
      <p className="play-task word-kind">
        <b className="word-hint">{puzzle.hint}</b> ·{" "}
        {unscramble ? "Unscramble the word" : "Fill in the missing letters"} ·{" "}
        {LEVEL_NAMES[puzzle.level]}
      </p>
      <div className="play-stage fit">
        <div className="play-area">
          {/* The letters show in the slots; the field on top of them takes the typing. */}
          <div className="word-entry">
            <div ref={slots} className="t-input word-slots" aria-hidden="true">
              {shown.map((letter, i) => (
                <span
                  key={i}
                  className={`word-slot${letter ? " filled" : ""}${
                    !unscramble && puzzle.pattern[i] !== null ? " given" : ""
                  }${i === nextAt ? " next" : ""}`}
                >
                  {letter ?? ""}
                </span>
              ))}
            </div>
            <label className="sr-only" htmlFor="word-guess">
              {unscramble
                ? `Your word, ${length} letters`
                : `The ${blanks} missing letters, in order`}
            </label>
            <input
              ref={input}
              id="word-guess"
              className="word-input"
              value={typed}
              autoFocus
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              onChange={(event) => change(event.target.value)}
            />
          </div>
          {unscramble && (
            <div
              className="word-tiles"
              role="group"
              aria-label="Letters"
              style={{ "--cols": tileColumns(puzzle.letters.length) } as CSSProperties}
            >
              {puzzle.letters.map((letter, i) => {
                const used = !left.includes(i);
                return (
                  <button
                    key={i}
                    type="button"
                    className="play-tile word-tile"
                    disabled={used}
                    aria-label={`Letter ${letter}`}
                    onClick={() => {
                      change(typed + letter);
                      input.current?.focus();
                    }}
                  >
                    {letter}
                  </button>
                );
              })}
            </div>
          )}
          <p className="word-tries dim small" aria-live="polite">
            {tried.length > 0 && (
              <>
                Not it:{" "}
                {tried.map((word) => (
                  <s key={word}>{word}</s>
                ))}{" "}
                · {triesLeft} {triesLeft === 1 ? "try" : "tries"} left
              </>
            )}
          </p>
        </div>
        {aside}
      </div>
      <div className="play-actions word-actions">
        <button
          type="button"
          className="play-pill square"
          disabled={typed.length === 0}
          onClick={() => {
            setTyped(typed.slice(0, -1));
            input.current?.focus();
          }}
        >
          <Icon name="backspace" size={22} />
          <span className="sr-only">Delete a letter</span>
        </button>
        {onSkip && (
          <button
            type="button"
            className="play-pill"
            aria-label="Give up on this word"
            onClick={onSkip}
          >
            <Icon name="skip" size={20} />
            Give up
          </button>
        )}
        <button className="play-pill go" type="submit" disabled={!full}>
          Check
        </button>
      </div>
    </form>
  );
}

/** Letter tiles in one row up to four, else in two rows. */
const tileColumns = (count: number) => (count <= 4 ? count : Math.ceil(count / 2));

/** Indexes of the tiles not yet used by `typed`. */
function remove(letters: readonly string[], typed: string): number[] {
  const left = letters.map((_, i) => i);
  for (const letter of typed) {
    const at = left.findIndex((i) => letters[i] === letter);
    if (at !== -1) left.splice(at, 1);
  }
  return left;
}

/** The pattern with its gaps filled by `typed`, in order. */
function fill(pattern: readonly (string | null)[], typed: string): (string | null)[] {
  let next = 0;
  return pattern.map((letter) => letter ?? typed[next++] ?? null);
}

export function SpotPuzzle({
  grid,
  tried,
  triesLeft,
  onTap,
  aside,
}: {
  grid: SpotItPuzzleView;
  tried: number[];
  triesLeft: number;
  onTap: (cell: number) => void;
  /** The scores, beside the grid on a computer. */
  aside?: ReactNode;
}) {
  const board = useShakeOnMiss<HTMLDivElement>(tried.length);
  return (
    <div className="spot-puzzle">
      <p className="play-task">
        {SPOT_PROMPTS[grid.kind]}
        {tried.length > 0 && (
          <span className="spot-tries" aria-live="polite">
            {" "}
            · {triesLeft} {triesLeft === 1 ? "try" : "tries"} left
          </span>
        )}
      </p>
      <Staged aside={aside}>
        <SpotGrid ref={board} grid={grid} tried={tried} onTap={onTap} />
      </Staged>
    </div>
  );
}

export const SPOT_PROMPTS: Record<SpotItPuzzleView["kind"], string> = {
  emoji: "Find the odd one out",
  letter: "Find the odd letter",
  shade: "Find the different shade",
  rotation: "Find the arrow that points differently",
};

export function SpotGrid({
  ref,
  grid,
  tried = [],
  odd,
  onTap,
}: {
  ref?: Ref<HTMLDivElement>;
  grid: SpotItPuzzleView;
  tried?: number[];
  /** Shown after the round. */
  odd?: number;
  onTap?: (cell: number) => void;
}) {
  const cells: (string | number)[] = grid.cells;
  return (
    <div
      ref={ref}
      className={`t-input spot-grid spot-${grid.kind}`}
      style={{ gridTemplateColumns: `repeat(${grid.size}, minmax(0, 1fr))` }}
      role="group"
      aria-label={`${grid.size} by ${grid.size} grid`}
    >
      {cells.map((cell, i) => {
        const missed = tried.includes(i);
        const className = `play-tile spot-cell${missed ? " missed" : ""}${odd === i ? " odd" : ""}`;
        const label = `Row ${Math.floor(i / grid.size) + 1}, column ${(i % grid.size) + 1}`;
        const content =
          grid.kind === "shade" ? null : grid.kind === "rotation" ? (
            <span className="spot-arrow" style={{ transform: `rotate(${cell as number}deg)` }}>
              <Icon name="arrowRight" size={26} stroke={2.6} />
            </span>
          ) : (
            <span className="spot-glyph">{cell}</span>
          );
        const style = grid.kind === "shade" ? { background: cell as string } : undefined;
        return onTap ? (
          <button
            key={i}
            className={className}
            style={style}
            aria-label={label}
            disabled={missed}
            onClick={() => onTap(i)}
          >
            {content}
          </button>
        ) : (
          <span key={i} className={className} style={style}>
            {content}
          </span>
        );
      })}
    </div>
  );
}

// After a round ----------------------------------------------------------------------------------

export const VERDICTS: Record<RoundOutcome, string> = {
  solved: "Solved",
  missed: "Out of tries",
  timeout: "Time’s up",
  skipped: "Skipped",
};

function Result({ context, stage }: { context: Context; stage: Stage<"result"> }) {
  const { view, client } = context;
  const sent = useRef(false);
  const next = () => {
    if (sent.current) return;
    sent.current = true;
    client.act({ type: "next" });
  };
  const left = useCountdown(stage.isLast ? RESULT_MS + 600 : RESULT_MS, next);
  const solved = stage.outcome === "solved";
  useEffect(() => play(solved ? "correct" : "wrong"), [solved]);

  return (
    <div className="game play">
      <Top context={context} index={stage.index} />
      <div className="game-layout staged">
        <div className="game-main play-main rounds-main">
          <Reveal
            game={view.game}
            reveal={stage.reveal}
            aside={
              <ScoreBoard
                standings={view.standings}
                playerId={context.playerId}
                avatarOf={context.avatarOf}
              />
            }
          />
          <p className={`verdict ${solved ? "good" : "bad"}`} role="status">
            {VERDICTS[stage.outcome]}
            {stage.points > 0 && <span className="points">+{stage.points}</span>}
          </p>
          <div className="next-row">
            <span className="muted">
              {stage.isLast ? "Results" : "Next"} in {Math.ceil(left / 1000)}
            </span>
            <button className="btn" onClick={next}>
              Next
            </button>
          </div>
          <PlayFaces faces={facesOf(context)} playerId={context.playerId} />
        </div>
      </div>
      <PlayToast />
    </div>
  );
}

export function Reveal({
  game,
  reveal,
  aside,
}: {
  game: RoundsGame;
  reveal: WordReveal | SpotItReveal;
  /** The scores, beside the answer on a computer. */
  aside?: ReactNode;
}) {
  if (game === "word-rush") {
    const { word, hint } = reveal as WordReveal;
    return (
      <div className="word-puzzle">
        <p className="play-task word-kind">
          <b className="word-hint">{hint}</b>
        </p>
        <Staged aside={aside}>
          <div className="word-slots revealed" aria-label={`The word was ${word}`}>
            {[...word].map((letter, i) => (
              <span key={i} className="word-slot filled">
                {letter}
              </span>
            ))}
          </div>
        </Staged>
      </div>
    );
  }
  const { grid, odd } = reveal as SpotItReveal;
  return (
    <div className="spot-puzzle">
      <p className="play-task">The odd one out</p>
      <Staged aside={aside}>
        <SpotGrid grid={grid} odd={odd} />
      </Staged>
    </div>
  );
}

// Results ----------------------------------------------------------------------------------------

function Results({
  context,
  results,
}: {
  context: Context;
  results: (RoundResult & { reveal: WordReveal | SpotItReveal })[];
}) {
  const { view, client, playerId, isHost, room, name, avatarOf } = context;
  const solo = view.playerCount === 1;
  const podium = view.final && !solo ? view.standings.filter((s) => !s.left).slice(0, 3) : [];
  const usernames = room.players.flatMap((p) => (p.username ? [p.username] : []));
  useEffect(() => {
    if (view.final) play("fanfare");
  }, [view.final]);

  const text = view.me
    ? `I scored ${view.me.score.toLocaleString()} in ${name} on Whizard!`
    : `Play ${name} with me on Whizard!`;
  const catalogGame = CATALOG.find((g) => g.id === view.game);
  const level = (room.game.settings as { level?: LevelChoice } | null)?.level;
  const { open: share, dialog: shareDialog } = useShareResults(
    buildCard({
      title: name,
      subtitle: ["Speed", level ? LEVEL_NAMES[level] : ""].filter(Boolean).join(" · "),
      art: context.art,
      colors: catalogGame?.colors ?? ["#6b45ff", "#23145a"],
      rows:
        view.final && !solo
          ? view.standings
              .filter((s) => !s.left)
              .map((s) => ({
                playerId: s.playerId,
                nickname: s.nickname,
                avatar: avatarOf(s.playerId),
                value: s.score,
                label: `${s.score.toLocaleString()} pts`,
                timeMs: s.timeMs,
              }))
          : [],
      me: playerId,
      score: { value: (view.me?.score ?? 0).toLocaleString(), unit: "points" },
      correct: view.me ? { got: view.me.solvedCount, of: view.total } : null,
      items: view.total,
      facts: [
        { icon: "🎯", value: String(view.total), label: "Rounds" },
        { icon: "✅", value: `${view.me?.solvedCount ?? 0}/${view.total}`, label: "Solved" },
        { icon: "📈", value: level ? LEVEL_NAMES[level] : "Speed", label: "Level" },
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
          <button className="btn bar-pill" onClick={context.onQuit}>
            <Icon name="home" size={20} />
            <span>Home</span>
          </button>
        </span>
      </header>

      <div className={`results-layout${solo ? " solo" : ""}`}>
        <section className="results-main">
          <img
            className="results-mascot"
            src="/art/mascot/podium.webp"
            alt=""
            width={590}
            height={620}
          />
          <div className="results-head">
            <h2 className="display results-title">Game Results</h2>
            <span className="pill">
              <Icon name="trophy" size={18} />
              {name} • {view.total} Rounds
            </span>
          </div>

          {solo && view.me ? (
            <div className="panel solo-score">
              <p className="label">Your score</p>
              <p className="big-score">{view.me.score.toLocaleString()}</p>
              <p className="muted">
                {view.me.solvedCount} of {view.total} solved
              </p>
            </div>
          ) : podium.length > 0 ? (
            <Podium
              entries={podium.map((p) => ({ ...p, label: p.score.toLocaleString() }))}
              avatarOf={avatarOf}
            />
          ) : (
            <p className="muted center waiting-note">Waiting for everyone to finish…</p>
          )}

          {view.final &&
            (isHost ? (
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
            ))}
        </section>

        {!solo && (
          <aside className="panel rankings" aria-labelledby="rankings-title">
            <h2 className="rankings-title" id="rankings-title">
              <Icon name="trophy" size={24} />
              {view.final ? "Final Rankings" : "Results so far"}
            </h2>
            <Leaderboard standings={view.standings} me={playerId} avatarOf={avatarOf} />
          </aside>
        )}
      </div>

      {view.final && !solo && <AddFromGame usernames={usernames} />}

      <RoundsReview game={view.game} results={results} />
      {shareDialog}
    </div>
  );
}

/** Each player's own rounds at the end: the word or grid, and how it went. */
export function RoundsReview({
  game,
  results,
}: {
  game: RoundsGame;
  results: (RoundResult & { reveal: WordReveal | SpotItReveal })[];
}) {
  if (results.length === 0) return null;
  return (
    <section className="panel review-panel" aria-labelledby="review-title">
      <h2 className="section-title" id="review-title">
        Your rounds
      </h2>
      <ol className="review rounds-review">
        {results.map((r) => (
          <li key={r.index}>
            <span className="q">
              {r.index + 1}.{" "}
              {game === "word-rush"
                ? `${(r.reveal as WordReveal).word} (${(r.reveal as WordReveal).hint})`
                : SPOT_PROMPTS[(r.reveal as SpotItReveal).grid.kind]}
            </span>
            <span className={`line ${r.outcome === "solved" ? "good" : "bad"}`}>
              {r.outcome === "solved" ? "✓" : "✗"} {VERDICTS[r.outcome]}
              {r.points > 0 && ` · +${r.points}`}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
