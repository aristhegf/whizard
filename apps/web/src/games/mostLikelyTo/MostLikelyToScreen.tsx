import type { MostLikelyToStage, MostLikelyToView } from "@whizard/game-core";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
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
import {
  PlayBoard,
  PlayFrame,
  PlayScreen,
  PlayTimer,
  rowsFrom,
  Staged,
  timerMs,
  type Face,
  CountdownNumber,
} from "../play";
import { packName } from "./MostLikelyToSettingsRows";

interface Props {
  view: MostLikelyToView;
  client: RoomClient;
  room: RoomSnapshot;
  playerId: string;
  isHost: boolean;
  /** The connection indicator, shown in the top bar. */
  latency: ReactNode;
  /** Quits the game. Asks first while it's still running. */
  onQuit: () => void;
}

type CountdownStage = Extract<MostLikelyToStage, { kind: "countdown" }>;
type VoteStage = Extract<MostLikelyToStage, { kind: "vote" }>;
type RevealStage = Extract<MostLikelyToStage, { kind: "reveal" }>;

const NAME = "Most Likely To";
const ART = "/art/games/most-likely-to.webp";

export function MostLikelyToScreen(props: Props) {
  const { view } = props;
  switch (view.stage.kind) {
    case "done":
      return <Results {...props} />;
    case "countdown":
      return <Countdown {...props} stage={view.stage} />;
    case "vote":
      return <Vote key={`v${view.stage.round}`} {...props} stage={view.stage} />;
    case "reveal":
      return <Reveal key={`r${view.stage.round}`} {...props} stage={view.stage} />;
  }
}

const rowsOf = ({ view, room }: Props): Face[] => {
  const top = Math.max(1, ...view.standings.map((s) => s.points));
  return rowsFrom(view.standings, room, (s) => formatPoints(s.points)).map((row, i) => ({
    ...row,
    bar: view.standings[i]!.points / top,
  }));
};

function LiveBoard(props: Props) {
  // Before anyone has scored, everyone shares first place: no medals for that.
  const scored = props.view.standings.some((s) => s.points > 0);
  return <PlayBoard rows={rowsOf(props)} playerId={props.playerId} medals={scored} />;
}

const roundLabel = (round: number, rounds: number) => (
  <>
    Round <b>{round + 1}</b> of {rounds}
  </>
);

/** Everyone's avatar by id, and "You" for this player. */
function usePeople({ room, view, playerId }: Props) {
  const avatars = new Map(room.players.map((p) => [p.id, p.avatar]));
  const names = new Map(view.standings.map((s) => [s.playerId, s.nickname]));
  return {
    avatarOf: (id: string) => avatars.get(id) ?? null,
    nameOf: (id: string) => (id === playerId ? "You" : (names.get(id) ?? "")),
  };
}

/** What a player who can't vote this round is told, if anything. */
function waitingNote(view: MostLikelyToView): string {
  if (view.status === "queued") return "You’re in from the next round.";
  if (view.status === "watching") return "A game is in progress. You’ll be in the next one.";
  return "";
}

/** "Get ready" before the first prompt, as in every game. */
function Countdown(props: Props & { stage: CountdownStage }) {
  const { client, stage } = props;
  const now = useServerNow(client.serverNow);
  const count = Math.max(1, Math.ceil((stage.startsAt - now) / 1000));
  useEffect(() => play("tick"), [count]);
  return (
    <PlayFrame
      label={roundLabel(stage.round, props.view.rounds)}
      latency={props.latency}
      onQuit={props.onQuit}
    >
      <div className="countdown" aria-live="polite">
        <img className="countdown-game-art" src={ART} alt="" />
        <p className="countdown-label">Get ready</p>
        <CountdownNumber value={count} />
        <span className="pill pill-glow">{NAME}</span>
      </div>
    </PlayFrame>
  );
}

/** The prompt and everyone to vote for. Only who has voted shows, never who for. */
function Vote(props: Props & { stage: VoteStage }) {
  const { view, client, stage } = props;
  const now = useServerNow(client.serverNow);
  const { avatarOf, nameOf } = usePeople(props);
  const [picked, setPicked] = useState<string | null>(view.myVote);
  const mine = view.myVote ?? picked;
  const remaining = Math.max(0, stage.deadline - now);
  const locked = !view.canVote || mine !== null || remaining === 0;

  useEffect(() => play("go"), []);

  const vote = (target: string) => {
    if (locked) return;
    setPicked(target);
    client.act({ type: "vote", target });
  };

  const voted = new Set(stage.voted);
  return (
    <PlayScreen
      label={roundLabel(stage.round, view.rounds)}
      latency={props.latency}
      onQuit={props.onQuit}
      className="mlt-main"
    >
      <PlayTimer
        ms={timerMs(remaining)}
        low={remaining / Math.max(1, stage.deadline - stage.startsAt) < 0.25}
      />
      <Staged aside={<LiveBoard {...props} />}>
        <div className="mlt-prompt">
          <p className="mlt-lead">Most likely to</p>
          <h2 className="mlt-line">{stage.prompt.text}</h2>
        </div>
        <ul
          className={`mlt-picks${view.status === "playing" ? "" : " waiting"}`}
          aria-label="Players"
        >
          {stage.candidates.map((c) => (
            <li key={c.playerId}>
              <button
                className={`play-tile mlt-pick${mine === c.playerId ? " picked" : ""}`}
                aria-pressed={mine === c.playerId}
                disabled={locked && mine !== c.playerId}
                onClick={() => vote(c.playerId)}
              >
                <Avatar id={avatarOf(c.playerId)} name={c.nickname} size={44} />
                <span className="mlt-name">{nameOf(c.playerId)}</span>
              </button>
            </li>
          ))}
        </ul>
        {waitingNote(view) && (
          <p className="play-note" role="status">
            {waitingNote(view)}
          </p>
        )}
        <ul
          className="mlt-voted"
          aria-label={`${stage.voted.length} of ${stage.voters} have voted`}
        >
          {stage.candidates.map((c) => (
            <li key={c.playerId} className={voted.has(c.playerId) ? "" : "wait"}>
              <Avatar id={avatarOf(c.playerId)} name={c.nickname} size={34} />
            </li>
          ))}
        </ul>
      </Staged>
    </PlayScreen>
  );
}

/** Faces in a short overlapping stack: who voted for someone. */
function Voters({ ids, size, people }: { ids: string[]; size: number; people: Person }) {
  if (ids.length === 0) return null;
  return (
    <span
      className="mlt-stack"
      role="img"
      aria-label={`Voted for by ${ids.map(people.nameOf).join(", ")}`}
    >
      {ids.map((id) => (
        <Avatar key={id} id={people.avatarOf(id)} name={people.nameOf(id)} size={size} />
      ))}
    </span>
  );
}

type Person = ReturnType<typeof usePeople>;

const votesLabel = (n: number, each = false) =>
  `${n} ${n === 1 ? "vote" : "votes"}${each ? " each" : ""}`;

/** The tally: the winner (or winners) big, everyone else who got a vote as a row. */
function Reveal(props: Props & { stage: RevealStage }) {
  const { view, stage } = props;
  const people = usePeople(props);
  const winners = stage.tally.filter((t) => t.winner);
  const others = stage.tally.filter((t) => !t.winner && t.votes > 0);
  const scored = (view.myPoints ?? 0) > 0;

  useEffect(() => {
    play(scored ? "correct" : "place");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- played once, as the tally comes up
  }, []);

  return (
    <PlayScreen
      label={roundLabel(stage.round, view.rounds)}
      latency={props.latency}
      onQuit={props.onQuit}
      className="mlt-main mlt-reveal"
    >
      <Staged aside={<LiveBoard {...props} />}>
        <p className="mlt-said">Most likely to {stage.prompt.text}</p>
        {winners.length === 0 ? (
          <p className="mlt-none">No votes</p>
        ) : (
          <div className={`mlt-winners${winners.length > 1 ? " tie" : ""}`}>
            {winners.map((w, i) => (
              <div key={w.playerId} className="mlt-winner" style={{ "--i": i } as CSSProperties}>
                <Avatar
                  id={people.avatarOf(w.playerId)}
                  name={w.nickname}
                  size={winners.length > 1 ? 96 : 128}
                />
                <h2 className="mlt-winner-name">{people.nameOf(w.playerId)}</h2>
                <p className="mlt-count">{votesLabel(w.votes, winners.length > 1)}</p>
                {w.voters && <Voters ids={w.voters} size={22} people={people} />}
              </div>
            ))}
          </div>
        )}
        {others.length > 0 && (
          <ol className="mlt-rows" aria-label="Other votes">
            {others.map((t, i) => (
              <li key={t.playerId} style={{ "--i": i } as CSSProperties}>
                <Avatar id={people.avatarOf(t.playerId)} name={t.nickname} size={40} />
                <span className="mlt-name">{people.nameOf(t.playerId)}</span>
                {t.voters && <Voters ids={t.voters} size={22} people={people} />}
                <span className="mlt-n" aria-label={votesLabel(t.votes)}>
                  {t.votes}
                </span>
              </li>
            ))}
          </ol>
        )}
        {scored && (
          <p className="mlt-toast" role="status">
            You read the room <span>+{formatPoints(view.myPoints ?? 0)}</span>
          </p>
        )}
      </Staged>
    </PlayScreen>
  );
}

/** The final scores: the podium and everyone's total. */
function Results({ view, client, isHost, room, playerId, onQuit }: Props) {
  const avatars = new Map(room.players.map((p) => [p.id, p.avatar]));
  const avatarOf = (id: string) => avatars.get(id) ?? null;
  const stayed = view.standings.filter((s) => !s.left);
  const podium = stayed.slice(0, 3);
  const usernames = room.players.flatMap((p) => (p.username ? [p.username] : []));
  const me = view.me;
  const rounds = view.history.length;
  useEffect(() => play("fanfare"), []);

  const text = me
    ? `I read the room for ${formatPoints(me.points)} points on ${NAME} on Whizard! Who knows your friends best?`
    : `Play ${NAME} with me on Whizard!`;
  const { open: share, dialog: shareDialog } = useShareResults(
    buildCard({
      title: NAME,
      subtitle: `${packName(view.pack)} · ${rounds} rounds`,
      art: ART,
      colors: CATALOG.find((g) => g.id === "most-likely-to")?.colors ?? ["#ff4545", "#4a0c26"],
      rows: stayed.map((s) => ({
        playerId: s.playerId,
        nickname: s.nickname,
        avatar: avatarOf(s.playerId),
        value: s.points,
        label: `${formatPoints(s.points)} pts`,
        timeMs: null,
      })),
      me: playerId,
      score: { value: me ? formatPoints(me.points) : "0", unit: "points" },
      correct: null,
      items: rounds,
      facts: [
        { icon: "🙋", value: String(rounds), label: "Rounds" },
        { icon: "🎯", value: me ? String(me.reads) : "0", label: "Read" },
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
            <h2 className="display results-title">{NAME} Results</h2>
            <span className="pill">
              <Icon name="users" size={18} />
              {packName(view.pack)}
            </span>
          </div>

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
