import type {
  RoundOutcome,
  RoundResult,
  RoundsStage,
  SpotItPuzzleView,
  SpotItReveal,
  SpotItSpeedView,
  WordPuzzleView,
  WordReveal,
  WordRushSpeedView,
} from "@whizard/game-core";
import { useEffect, useRef, useState, type FormEvent, type ReactNode, type Ref } from "react";
import { CATALOG } from "../../catalog";
import { AddFromGame } from "../../FriendsScreen";
import type { RoomClient, RoomSnapshot } from "../../roomClient";
import { play } from "../../sounds";
import { Brand } from "../../ui/Chrome";
import { useErrorShake } from "../../ui/errorShake";
import { Icon } from "../../ui/Icon";
import { MuteButton } from "../../ui/MuteButton";
import { useServerNow } from "../../useServerNow";
import { Podium } from "../../ui/Podium";
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
        <div className="game">
          <Bar context={context} index={null} />
          <div className="game-layout">
            <div className="game-main">
              <p className="watching">A game is in progress. You’ll be in the next one.</p>
            </div>
            <ScoreBoard
              standings={view.standings}
              playerId={props.playerId}
              avatarOf={context.avatarOf}
            />
          </div>
        </div>
      );
  }
}

function Bar({
  context,
  index,
  done = false,
  timer,
}: {
  context: Context;
  index: number | null;
  done?: boolean;
  timer?: ReactNode;
}) {
  const { view, room, onQuit, latency } = context;
  const finished = index === null ? 0 : index + (done ? 1 : 0);
  return (
    <header className="game-bar">
      <div className="game-bar-row">
        <span className="bar-brand">
          <Brand />
        </span>
        <span className="room-label" translate="no">
          Room: {room.code}
        </span>
        {index !== null && (
          <span className="progress">
            Round {index + 1} / {view.total}
          </span>
        )}
        <span className="bar-end">
          {latency}
          {timer}
          <MuteButton />
          <button className="btn quit-btn" onClick={onQuit}>
            Quit
          </button>
        </span>
      </div>
      {index !== null && (
        <div className="question-progress" aria-hidden="true">
          <div style={{ width: `${(finished / Math.max(1, view.total)) * 100}%` }} />
        </div>
      )}
    </header>
  );
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
      <div className="game">
        <Bar context={context} index={null} />
        <div className="countdown" aria-live="polite">
          <img className="countdown-game-art" src={context.art} alt="" />
          <p className="countdown-label">Get ready</p>
          <p className="countdown-number">{countdown}</p>
          <span className="pill pill-glow">{context.name}</span>
        </div>
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

  const timer = (
    <span
      className={`timer-pill${remaining / view.timeLimitMs < 0.25 ? " low" : ""}`}
      role="progressbar"
      aria-label="Time left"
      aria-valuemin={0}
      aria-valuemax={view.timeLimitMs}
      aria-valuenow={remaining}
    >
      <Icon name="clock" size={22} stroke={2.4} />
      {secondsLeft}s
    </span>
  );

  return (
    <div className="game">
      <Bar context={context} index={stage.index} timer={timer} />
      <div className="game-layout">
        <div className="game-main rounds-main">
          {view.game === "word-rush" ? (
            <WordPuzzle
              puzzle={stage.puzzle as WordPuzzleView}
              tried={stage.tried as string[]}
              triesLeft={stage.triesLeft}
              onGuess={guess}
            />
          ) : (
            <SpotPuzzle
              grid={stage.puzzle as SpotItPuzzleView}
              tried={stage.tried as number[]}
              triesLeft={stage.triesLeft}
              onTap={guess}
            />
          )}
          <button className="btn-link give-up" onClick={skip}>
            {view.game === "word-rush" ? "Give up on this word" : "Skip this grid"}
          </button>
        </div>
        <ScoreBoard
          standings={view.standings}
          playerId={context.playerId}
          avatarOf={context.avatarOf}
        />
      </div>
    </div>
  );
}

const LEVEL_NAMES = { easy: "Easy", medium: "Medium", hard: "Hard" } as const;

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
}: {
  puzzle: WordPuzzleView;
  tried: string[];
  triesLeft: number;
  onGuess: (word: string) => void;
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
      <p className="word-kind">
        <span className="pill pill-glow">{puzzle.hint}</span>
        <span className="dim small">
          {unscramble ? "Unscramble the word" : "Fill in the missing letters"} ·{" "}
          {LEVEL_NAMES[puzzle.level]}
        </span>
      </p>
      {/* The letters show in the slots; the field on top of them takes the typing. */}
      <div className="word-entry">
        <div ref={slots} className="t-input word-slots" aria-hidden="true">
          {shown.map((letter, i) => (
            <span
              key={i}
              className={`word-slot${letter ? " filled" : ""}${
                !unscramble && puzzle.pattern[i] !== null ? " given" : ""
              }`}
            >
              {letter ?? ""}
            </span>
          ))}
        </div>
        <label className="sr-only" htmlFor="word-guess">
          {unscramble ? `Your word, ${length} letters` : `The ${blanks} missing letters, in order`}
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
        <div className="word-tiles" role="group" aria-label="Letters">
          {puzzle.letters.map((letter, i) => {
            const used = !left.includes(i);
            return (
              <button
                key={i}
                type="button"
                className="word-tile"
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
      <div className="word-actions">
        <button
          type="button"
          className="btn"
          disabled={typed.length === 0}
          onClick={() => {
            setTyped(typed.slice(0, -1));
            input.current?.focus();
          }}
        >
          <Icon name="arrowLeft" size={20} />
          <span className="sr-only">Delete a letter</span>
        </button>
        <button className="btn btn-primary" type="submit" disabled={!full}>
          Check
        </button>
      </div>
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
    </form>
  );
}

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
}: {
  grid: SpotItPuzzleView;
  tried: number[];
  triesLeft: number;
  onTap: (cell: number) => void;
}) {
  const board = useShakeOnMiss<HTMLDivElement>(tried.length);
  return (
    <div className="spot-puzzle">
      <p className="word-kind">
        <span className="pill pill-glow">{SPOT_PROMPTS[grid.kind]}</span>
        {tried.length > 0 && (
          <span className="dim small" aria-live="polite">
            {triesLeft} {triesLeft === 1 ? "try" : "tries"} left
          </span>
        )}
      </p>
      <SpotGrid ref={board} grid={grid} tried={tried} onTap={onTap} />
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
        const className = `spot-cell${missed ? " missed" : ""}${odd === i ? " odd" : ""}`;
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
    <div className="game">
      <Bar context={context} index={stage.index} done />
      <div className="game-layout">
        <div className="game-main rounds-main">
          <Reveal game={view.game} reveal={stage.reveal} />
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
        </div>
        <ScoreBoard
          standings={view.standings}
          playerId={context.playerId}
          avatarOf={context.avatarOf}
        />
      </div>
    </div>
  );
}

export function Reveal({ game, reveal }: { game: RoundsGame; reveal: WordReveal | SpotItReveal }) {
  if (game === "word-rush") {
    const { word, hint } = reveal as WordReveal;
    return (
      <div className="word-puzzle">
        <p className="word-kind">
          <span className="pill pill-glow">{hint}</span>
        </p>
        <div className="word-slots revealed" aria-label={`The word was ${word}`}>
          {[...word].map((letter, i) => (
            <span key={i} className="word-slot filled">
              {letter}
            </span>
          ))}
        </div>
      </div>
    );
  }
  const { grid, odd } = reveal as SpotItReveal;
  return (
    <div className="spot-puzzle">
      <SpotGrid grid={grid} odd={odd} />
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

  const share = async () => {
    const text = view.me
      ? `I scored ${view.me.score.toLocaleString()} in ${name} on Whizard!`
      : `Play ${name} with me on Whizard!`;
    try {
      if (navigator.share) await navigator.share({ title: "Whizard", text, url: location.origin });
      else await navigator.clipboard.writeText(`${text} ${location.origin}`);
    } catch {
      // Dismissed or blocked.
    }
  };

  return (
    <div className="results">
      <header className="results-bar">
        <Brand />
        <span className="bar-end">
          <button className="btn bar-pill" onClick={() => void share()}>
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
            <h2 className="display results-title">
              Game <span className="gradient-text">Results</span>
            </h2>
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
                <button className="btn" onClick={() => void share()}>
                  <Icon name="share" size={20} />
                  Share Results
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
