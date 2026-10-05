import type { ReactionStage, ReactionView } from "@whizard/game-core";
import { useEffect, useRef, type ReactNode } from "react";
import { AddFromGame } from "../../FriendsScreen";
import { CATALOG } from "../../catalog";
import type { RoomClient, RoomSnapshot } from "../../roomClient";
import { buildCard } from "../../share/outcomes";
import { useShareResults } from "../../share/ShareResults";
import { play } from "../../sounds";
import { useServerNow } from "../../useServerNow";
import { Avatar } from "../../ui/Avatar";
import { Brand } from "../../ui/Chrome";
import { Icon } from "../../ui/Icon";
import { Podium } from "../../ui/Podium";
import { PlayBoard, PlayFaces, PlayScreen, rowsFrom, Staged } from "../play";

interface Props {
  view: ReactionView;
  client: RoomClient;
  room: RoomSnapshot;
  playerId: string;
  isHost: boolean;
  /** The connection indicator, shown in the top bar. */
  latency: ReactNode;
  /** Quits the game. Asks first while it's still running. */
  onQuit: () => void;
}

/** A time as the game writes it: "241 ms", or "4.32 s". */
export const formatMs = (ms: number) =>
  ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`;

type CountdownStage = Extract<ReactionStage, { kind: "countdown" }>;
type WaitStage = Extract<ReactionStage, { kind: "wait" }>;
type ResultStage = Extract<ReactionStage, { kind: "result" }>;

export function ReactionScreen(props: Props) {
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
    case "wait":
      return (
        <Round key={`${view.stage.round}:${view.stage.signalAt}`} {...props} stage={view.stage} />
      );
  }
}

/** Everyone's average round as the board and faces show it. */
const rowsOf = ({ view, room }: Props) =>
  rowsFrom(view.standings, room, (s) => (s.avgMs === null ? "—" : formatMs(s.avgMs)));

function LiveBoard(props: Props) {
  return <PlayBoard rows={rowsOf(props)} playerId={props.playerId} label="Live scores" />;
}

/** Joined too late for this round, or watching from the room: the others' game. */
function Watching(props: Props & { message: string }) {
  const { message } = props;
  return (
    <PlayScreen
      label="Reaction"
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
 * One round: the countdown, the wait with the pad armed, then the signal. The signal itself is
 * revealed on the player's own clock (against its server offset), so every screen lights up
 * together; the pad takes taps from the wait on, so an early one is a false start.
 */
function Round(props: Props & { stage: CountdownStage | WaitStage }) {
  const { view, client, stage, playerId } = props;
  const now = useServerNow(client.serverNow);
  const signalAt = stage.signalAt;
  const endsAt = signalAt + view.windowMs;
  const startsAt = stage.kind === "countdown" ? stage.startsAt : signalAt;
  const started = stage.kind === "wait" || now >= startsAt;
  const lit = now >= signalAt;
  const countdown = Math.max(1, Math.ceil((startsAt - now) / 1000));
  const myTap = view.myTap;
  const missed = !myTap && now >= endsAt;

  useEffect(() => {
    if (!started) play("tick");
  }, [started, countdown]);
  const wasLit = useRef(lit);
  useEffect(() => {
    if (lit && !wasLit.current) play("go");
    wasLit.current = lit;
  }, [lit]);
  const lastTap = useRef(myTap);
  useEffect(() => {
    if (myTap && myTap !== lastTap.current) play(myTap.ms === null ? "wrong" : "correct");
    lastTap.current = myTap;
  }, [myTap]);

  const label = (
    <>
      Round <b>{stage.round + 1}</b> of {view.rounds}
    </>
  );

  if (!started) {
    return (
      <PlayScreen label={label} latency={props.latency} onQuit={props.onQuit}>
        <div className="countdown" aria-live="polite">
          <img src="/art/games/reaction.webp" alt="" />
          <p className="countdown-label">Get ready</p>
          <p className="countdown-number">{countdown}</p>
        </div>
      </PlayScreen>
    );
  }

  const tap = () => {
    if (myTap || missed) return;
    client.act({ type: "tap", clientElapsedMs: Math.round(client.serverNow() - signalAt) });
  };

  const pad = myTap
    ? myTap.ms === null
      ? "bust"
      : "hit"
    : missed
      ? "bust"
      : lit
        ? "go"
        : "waiting";
  const word = myTap
    ? myTap.falseStart
      ? "False start"
      : myTap.ms === null
        ? "Missed"
        : formatMs(myTap.ms)
    : missed
      ? "Too slow"
      : lit
        ? "TAP!"
        : "WAIT…";
  const padLabel = !myTap
    ? missed
      ? "Too slow: the round is over"
      : lit
        ? "Tap now!"
        : "Wait for the signal"
    : myTap.falseStart
      ? "False start: this round is lost"
      : myTap.ms === null
        ? "You missed this round"
        : `Your time: ${formatMs(myTap.ms)}`;
  const status = !myTap
    ? missed
      ? "You didn’t tap in time. The next round is coming."
      : lit
        ? "Tap!"
        : "Wait for it…"
    : myTap.falseStart
      ? "Too soon! That round is lost."
      : myTap.ms === null
        ? "You missed this round."
        : view.playerCount > 1
          ? `Locked in at ${formatMs(myTap.ms)}. Waiting for the others…`
          : `Your reaction: ${formatMs(myTap.ms)}`;

  return (
    <PlayScreen label={label} latency={props.latency} onQuit={props.onQuit}>
      <p className="play-task">Wait for the signal, then tap the moment the pad turns green.</p>
      <Staged aside={<LiveBoard {...props} />}>
        <button
          type="button"
          className={`reaction-pad ${pad}`}
          aria-label={padLabel}
          disabled={!!myTap || missed}
          onClick={tap}
        >
          <span className="pad-word" aria-hidden="true">
            {word}
          </span>
        </button>
        <p className="reaction-status" role="status">
          {status}
        </p>
      </Staged>
      <PlayFaces faces={rowsOf(props)} playerId={playerId} />
    </PlayScreen>
  );
}

/** Between rounds: this round's times, and the countdown to the next. */
function RoundResult(props: Props & { stage: ResultStage }) {
  const { view, client, stage, playerId } = props;
  const now = useServerNow(client.serverNow);
  const seconds = Math.max(0, Math.ceil((stage.endsAt - now) / 1000));
  const me = view.me;
  const mine = stage.times.find((t) => t.playerId === playerId) ?? null;
  const points = mine?.ms !== null && mine ? Math.max(0, view.windowMs - mine.ms) : 0;
  const verdict = !mine
    ? "You weren’t in that round"
    : mine.falseStart
      ? "False start"
      : mine.ms === null
        ? "Too slow"
        : formatMs(mine.ms);
  const good = !!mine && !mine.falseStart && mine.ms !== null;
  const names = new Map(view.standings.map((s) => [s.playerId, s.nickname]));
  const last = stage.round + 1 >= view.rounds;

  return (
    <PlayScreen
      label={
        <>
          Round <b>{stage.round + 1}</b> of {view.rounds}
        </>
      }
      latency={props.latency}
      onQuit={props.onQuit}
      side={<LiveBoard {...props} />}
    >
      <p className={`verdict ${good ? "good" : "bad"}`} role="status">
        {verdict}
        {points > 0 && <span className="points">+{points.toLocaleString("en-US")}</span>}
      </p>
      <ul className="reaction-times" aria-label={`Round ${stage.round + 1} times`}>
        {stage.times.map((t) => (
          <li key={t.playerId} className={t.playerId === playerId ? "me" : ""}>
            <Avatar
              id={roomAvatar(props.room, t.playerId)}
              name={names.get(t.playerId) ?? ""}
              size={34}
            />
            <span className="name">{t.playerId === playerId ? "You" : names.get(t.playerId)}</span>
            <span className="time">
              {t.falseStart ? "False start" : t.ms === null ? "—" : formatMs(t.ms)}
            </span>
          </li>
        ))}
      </ul>
      <p className="reaction-status" role="status">
        {last ? "Results" : "Next round"} in {seconds}
      </p>
      <PlayFaces faces={rowsOf(props)} playerId={playerId} />
      {me && <p className="dim small center">Your average: {formatMs(me.avgMs ?? 0)}</p>}
    </PlayScreen>
  );
}

const roomAvatar = (room: RoomSnapshot, playerId: string) =>
  room.players.find((p) => p.id === playerId)?.avatar ?? null;

/** The final times: a solo card, or the podium and everyone's average. */
function Results({ view, client, isHost, room, playerId, onQuit }: Props) {
  const solo = view.playerCount === 1;
  const avatars = new Map(room.players.map((p) => [p.id, p.avatar]));
  const avatarOf = (id: string) => avatars.get(id) ?? null;
  const podium = solo ? [] : view.standings.filter((s) => !s.left).slice(0, 3);
  const usernames = room.players.flatMap((p) => (p.username ? [p.username] : []));
  const me = view.me;
  useEffect(() => play("fanfare"), []);

  const text =
    me?.bestMs != null
      ? `I reacted in ${formatMs(me.bestMs)} on Whizard! Think you’re faster?`
      : "Race me at Reaction on Whizard!";
  const { open: share, dialog: shareDialog } = useShareResults(
    buildCard({
      title: "Reaction",
      subtitle: `${view.rounds} rounds`,
      art: "/art/games/reaction.webp",
      colors: CATALOG.find((g) => g.id === "reaction")?.colors ?? ["#2f78ff", "#101c5e"],
      rows: solo
        ? []
        : view.standings
            .filter((s) => !s.left && s.avgMs !== null)
            .map((s) => ({
              playerId: s.playerId,
              nickname: s.nickname,
              avatar: avatarOf(s.playerId),
              value: s.points,
              label: formatMs(s.avgMs!),
              timeMs: null,
            })),
      me: playerId,
      score: {
        value: me?.bestMs != null ? formatMs(me.bestMs) : "—",
        unit: "fastest reaction",
      },
      correct: null,
      items: view.rounds,
      facts: [
        { icon: "⚡", value: String(view.rounds), label: "Rounds" },
        { icon: "⏱️", value: me?.bestMs != null ? formatMs(me.bestMs) : "–", label: "Fastest" },
        { icon: "🎯", value: me?.avgMs != null ? formatMs(me.avgMs) : "–", label: "Average" },
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
            <h2 className="display results-title">Reaction Results</h2>
            <span className="pill">
              <Icon name="bolt" size={18} />
              {view.rounds} rounds
            </span>
          </div>

          {solo && me ? (
            <div className="panel solo-score">
              <p className="label">Fastest reaction</p>
              <p className="big-score">{me.bestMs != null ? formatMs(me.bestMs) : "—"}</p>
              <p className="muted">
                {me.played} {me.played === 1 ? "round" : "rounds"}
                {me.avgMs !== null && ` · ${formatMs(me.avgMs)} on average`}
                {me.falseStarts > 0 &&
                  ` · ${me.falseStarts} false start${me.falseStarts > 1 ? "s" : ""}`}
              </p>
            </div>
          ) : (
            <Podium
              entries={podium.map((s) => ({
                playerId: s.playerId,
                nickname: s.nickname,
                label: s.avgMs === null ? "—" : `${formatMs(s.avgMs)} avg`,
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
                  <span className="pts">{s.avgMs === null ? "—" : formatMs(s.avgMs)}</span>
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
