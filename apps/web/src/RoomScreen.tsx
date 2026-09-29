import {
  ELIMINATION_MIN_PLAYERS,
  JIGSAW_PICTURES,
  photoPicture,
  LEVEL_NAMES,
  MAX_PLAYERS,
  NICKNAME_INPUT_MAX_LENGTH,
  QUIZ_CATEGORIES,
  QUIZ_VARIANTS,
  ROUNDS_MODES,
  type AnyQuizView,
  type ConnectionsView,
  type JigsawView,
  type LogicView,
  type SpotItView,
  type WordRushView,
} from "@whizard/game-core";
import { AVATAR_IDS } from "@whizard/protocol";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ActionSwapCascadeIcon,
  ActionSwapCascadeText,
} from "@/components/motion/action-swap-cascade";
import { AnimatedBadge } from "@/components/motion/animated-badge";
import { SlideActionButton } from "@/components/motion/slide-action-button";
import { Tooltip } from "@/components/motion/tooltip";
import { useAccount } from "./account";
import { PingFriends } from "./FriendsScreen";
import { ProfileDialog } from "./ProfileDialog";
import { CATALOG, isPlayable } from "./catalog";
import { ConnectionsScreen } from "./games/connections/ConnectionsScreen";
import {
  ConnectionsSettingsRows,
  parseConnectionsSettings,
} from "./games/connections/ConnectionsSettingsRows";
import { useJigsawPhoto } from "./games/jigsaw/JigsawPhoto";
import { JigsawScreen } from "./games/jigsaw/JigsawScreen";
import {
  JigsawSettingsRows,
  parseJigsawSettings,
  pictureName,
  sizeName,
} from "./games/jigsaw/JigsawSettingsPanel";
import { LogicScreen } from "./games/logic/LogicScreen";
import { gridName, LogicSettingsRows, parseLogicSettings } from "./games/logic/LogicSettingsRows";
import { QuizScreen } from "./games/quiz/QuizScreen";
import { QuizSettingsRows, parseQuizSettings } from "./games/quiz/QuizSettingsPanel";
import { TopicPicker } from "./games/quiz/TopicPicker";
import { RoundsEliminationScreen } from "./games/rounds/RoundsEliminationScreen";
import { RoundsScreen } from "./games/rounds/RoundsScreen";
import {
  RoundsSettingsRows,
  isRoundsGame,
  parseRoundsSettings,
} from "./games/rounds/RoundsSettingsRows";
import { Notice } from "./Notice";
import type { RoomClient, RoomClientState, RoomSnapshot } from "./roomClient";
import { navigate, roomPath } from "./router";
import { loadAvatar, loadNickname, saveNickname } from "./storage";
import { Avatar } from "./ui/Avatar";
import { AvatarPicker, openAvatarCreator } from "./ui/AvatarPicker";
import { Brand } from "./ui/Chrome";
import { useMediaQuery } from "./ui/common";
import { useShakeOnError } from "./ui/errorShake";
import { focusSetting, SettingSelect } from "./ui/SettingSelect";
import { canGenerateArt, preloadGeneratingArt } from "./ui/GeneratingArt";
import { useToast } from "./ui/toast";
import { Icon } from "./ui/Icon";
import { QrCode } from "./ui/QrCode";
import { reportInvite } from "./presence";
import { play } from "./sounds";
import { MuteButton } from "./ui/MuteButton";
import { SettingsButton } from "./ui/SettingsDialog";
import { useRoom } from "./useRoom";

export function RoomScreen({ code }: { code: string }) {
  const { client, state } = useRoom(code);
  useRoomToasts(state);

  if (state.fatal) return <Notice message={state.fatal} />;

  const room = state.room;
  const joined = !!(state.playerId && room);
  // Someone who quit the game waits in the room for the next one.
  const sittingOut =
    joined && room!.phase !== "lobby" && room!.sittingOut.includes(state.playerId!);
  const inGame = joined && room!.phase !== "lobby" && !!state.game && !sittingOut;

  const view = inGame
    ? (state.game as
        AnyQuizView | WordRushView | SpotItView | JigsawView | ConnectionsView | LogicView)
    : null;
  // Leaving mid-game can't be undone, so it asks first while you're still playing: in a
  // jigsaw until you finish, in Elimination only while you're still in it.
  let midGame = false;
  if (room?.phase === "playing" && view) {
    if (view.game === "jigsaw") {
      midGame = view.board !== null && !view.me?.finished && !view.final;
    } else if (view.game === "connections") {
      midGame = view.words !== null && view.answer === null;
    } else if (view.game === "logic") {
      midGame = view.grid !== null && view.solution === null;
    } else {
      const stage = view.stage.kind;
      const stillIn =
        "mode" in view ? view.me?.status === "in" || view.me?.status === "finalist" : true;
      midGame =
        stillIn &&
        (stage === "question" ||
          stage === "answer" ||
          stage === "reveal" ||
          stage === "cut" ||
          stage === "final" ||
          stage === "puzzle" ||
          stage === "result");
    }
  }
  const gameProps = {
    client,
    room: room!,
    playerId: state.playerId!,
    isHost: room?.hostId === state.playerId,
    latency: <Latency state={state} />,
    onQuit: () => quit(),
  };

  // Quitting a game that's still going takes you back to the room; the others play on, and
  // you're in the next game. Once it's over, the results' Home button leaves the room.
  const quit = () => {
    if (room?.phase !== "playing") {
      leave("/");
      return;
    }
    if (
      midGame &&
      !window.confirm("Quit this game? You’ll go back to the room for the next one.")
    ) {
      return;
    }
    client.quitGame();
  };

  const leave = (to: string) => {
    if (midGame && !window.confirm("Leave this game? You can’t rejoin it.")) return;
    client.leave();
    navigate(to);
  };

  return (
    <div className="page room-page">
      <h1 className="sr-only">Whizard room {code}</h1>
      {view?.game === "jigsaw" ? (
        <JigsawScreen {...gameProps} view={view} />
      ) : view?.game === "connections" ? (
        <ConnectionsScreen {...gameProps} view={view} />
      ) : view?.game === "logic" ? (
        <LogicScreen {...gameProps} view={view} />
      ) : view && view.game !== "quiz" && "mode" in view ? (
        <RoundsEliminationScreen {...gameProps} view={view} />
      ) : view && view.game !== "quiz" ? (
        <RoundsScreen {...gameProps} view={view} />
      ) : view ? (
        <QuizScreen {...gameProps} view={view} />
      ) : joined ? (
        <Lobby
          client={client}
          state={state}
          room={room!}
          playerId={state.playerId!}
          sittingOut={sittingOut}
          onLeave={leave}
        />
      ) : (
        <JoinScreen code={code} state={state} client={client} />
      )}
    </div>
  );
}

/** Toasts for who comes and goes, a new host, the connection dropping and coming back, and errors. */
function useRoomToasts(state: RoomClientState) {
  const toast = useToast();
  const seen = useRef<{
    players: Map<string, string>;
    hostId: string | null;
    sittingOut: Set<string>;
  } | null>(null);
  const offline = useRef<string | null>(null);

  const { room, playerId, connection, notice } = state;

  // Something the server turned down, like starting a game without enough players.
  useEffect(() => {
    if (notice) toast.show({ title: notice, status: "error" });
  }, [notice, toast]);

  useEffect(() => {
    if (!room || !playerId) return;
    const players = new Map(room.players.map((p) => [p.id, p.nickname]));
    const sittingOut = new Set(room.sittingOut);
    const before = seen.current;
    seen.current = { players, hostId: room.hostId, sittingOut };
    // The first snapshot after joining is just who's already here.
    if (!before) return;
    for (const [id, nickname] of players) {
      if (!before.players.has(id)) toast.show({ title: `${nickname} joined`, status: "info" });
    }
    for (const [id, nickname] of before.players) {
      if (!players.has(id)) toast.show({ title: `${nickname} left the room`, status: "neutral" });
    }
    // Quitting a game keeps you in the room: the others hear you've left the game.
    for (const id of sittingOut) {
      const nickname = players.get(id);
      if (id !== playerId && nickname && !before.sittingOut.has(id)) {
        toast.show({ title: `${nickname} left the game`, status: "neutral" });
      }
    }
    const newHost = room.hostId && room.hostId !== playerId ? players.get(room.hostId) : null;
    if (newHost && before.hostId !== room.hostId) {
      toast.show({ title: `${newHost} is the host now`, status: "info" });
    }
    if (room.hostId === playerId && before.hostId !== playerId) {
      toast.show({
        title: "You’re the host now",
        description: "You choose the settings and start the game.",
        status: "success",
      });
    }
  }, [room, playerId, toast]);

  useEffect(() => {
    if (connection === "reconnecting" && !offline.current) {
      offline.current = toast.show({
        title: "Connection lost",
        description: "Reconnecting…",
        status: "loading",
        duration: 0,
        dismissible: false,
      });
    } else if (connection === "open" && offline.current) {
      toast.update(offline.current, {
        title: "Back online",
        description: undefined,
        status: "success",
        duration: 2500,
        dismissible: true,
      });
      offline.current = null;
    } else if (connection === "closed" && offline.current) {
      toast.dismiss(offline.current);
      offline.current = null;
    }
  }, [connection, toast]);
}

/** How the connection is doing: a green badge with the round trip, or a spinning one while
    (re)connecting. It only animates when the state changes, not on every new ping. */
export function Latency({ state }: { state: RoomClientState }) {
  const connected = state.connection === "open";
  return (
    <AnimatedBadge
      className={`net${connected ? "" : " warn"}`}
      status={connected ? "success" : "loading"}
      size="sm"
      contentKey={state.connection}
      aria-live="polite"
    >
      {connected
        ? state.latencyMs === null
          ? "Connected"
          : `${state.latencyMs}\u00a0ms`
        : state.connection === "connecting"
          ? "Connecting…"
          : "Reconnecting…"}
    </AnimatedBadge>
  );
}

// Joining --------------------------------------------------------------------------------------

function JoinScreen({
  code,
  state,
  client,
}: {
  code: string;
  state: RoomClientState;
  client: RoomClient;
}) {
  const account = useAccount();
  const user = account.status === "ready" ? account.user : null;
  // The name they played under last time, or their account's.
  const known = loadNickname() || user?.displayName || "";
  // null until they type, so the account name can fill in once it has loaded.
  const [typed, setTyped] = useState<string | null>(null);
  const nickname = typed ?? known;
  const [picked, setPicked] = useState<string | null>(null);
  const avatar = picked ?? user?.avatar ?? loadAvatar() ?? AVATAR_IDS[0];
  const disabled = state.connection !== "open";
  const [attempt, setAttempt] = useState(0);
  const { ref, isError } = useShakeOnError<HTMLInputElement>(state.joinError, attempt);

  // Someone who has played before goes straight in with the same name and avatar. They can
  // change either in the lobby. If the name is taken here, the form below asks for another.
  const autoJoined = useRef(false);
  // While the account loads, there may be a name coming: wait rather than flash the form.
  const goingStraightIn = (!!known || account.status === "loading") && !state.joinError;
  useEffect(() => {
    // A player coming back to this room is already rejoining with their session.
    if (!known || autoJoined.current || state.joining || state.connection !== "open") return;
    autoJoined.current = true;
    client.join(known, avatar);
  }, [known, avatar, state.joining, state.connection, client]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!nickname.trim()) return;
    setAttempt((n) => n + 1);
    client.join(nickname, avatar);
  };

  return (
    <div className="join-screen">
      <header className="topnav">
        <Brand />
      </header>
      <form className="panel join-card" onSubmit={handleSubmit}>
        <div className="code-box small-code">
          <span className="code-label">Room Code</span>
          <strong translate="no">{code}</strong>
        </div>
        {(state.joining || goingStraightIn) && !state.joinError ? (
          <p className="muted center" aria-live="polite">
            Joining…
          </p>
        ) : (
          <>
            <label className="label" htmlFor="nickname">
              Choose a nickname
            </label>
            <input
              ref={ref}
              className={`t-input${isError ? " is-error" : ""}`}
              id="nickname"
              name="nickname"
              aria-invalid={isError}
              value={nickname}
              maxLength={NICKNAME_INPUT_MAX_LENGTH}
              autoComplete="nickname"
              placeholder="e.g. Tolu"
              autoFocus
              onChange={(event) => setTyped(event.target.value)}
            />
            <span className="label" id="avatar-label">
              Pick your avatar
            </span>
            <AvatarPicker
              value={avatar}
              onPick={setPicked}
              onMake={() => {
                // Keep what they typed for when they come back.
                if (nickname.trim()) saveNickname(nickname);
                openAvatarCreator();
              }}
              labelledBy="avatar-label"
              size={56}
            />
            <button
              className="btn btn-primary btn-block"
              type="submit"
              disabled={disabled || !nickname.trim()}
            >
              Join
            </button>
            {state.joinError && (
              <p className="error" role="alert">
                {state.joinError}
              </p>
            )}
          </>
        )}
      </form>
    </div>
  );
}

// Lobby ----------------------------------------------------------------------------------------

const CAPACITY_OPTIONS = [2, 4, 6, 8, 10, 12, 16, 20].filter((n) => n <= MAX_PLAYERS);

function Lobby({
  client,
  state,
  room,
  playerId,
  sittingOut,
  onLeave,
}: {
  client: RoomClient;
  state: RoomClientState;
  room: RoomSnapshot;
  playerId: string;
  /** Quit the game that's running (or just finished), and waiting for the next one. */
  sittingOut: boolean;
  onLeave: (to: string) => void;
}) {
  const isHost = room.hostId === playerId;
  // The game's settings can change in the lobby, or once a game is over, not while it runs.
  const canEdit = isHost && room.phase !== "playing";
  const gameId = room.game.id;
  const game = CATALOG.find((g) => g.id === gameId);
  const settings = gameId === "quiz" ? parseQuizSettings(room.game.settings) : null;
  const rounds = isRoundsGame(gameId) ? parseRoundsSettings(gameId, room.game.settings) : null;
  const jigsaw = gameId === "jigsaw" ? parseJigsawSettings(room.game.settings) : null;
  const photo = useJigsawPhoto(room.code, isHost && gameId === "jigsaw");
  const connections =
    gameId === "connections" ? parseConnectionsSettings(room.game.settings) : null;
  const logic = gameId === "logic" ? parseLogicSettings(room.game.settings) : null;
  const connected = room.players.filter((p) => p.connected);
  const alone = connected.length <= 1;
  const needMore =
    settings?.variant === "elimination" || rounds?.mode === "elimination"
      ? Math.max(0, ELIMINATION_MIN_PLAYERS - connected.length)
      : 0;
  const category = QUIZ_CATEGORIES.find((c) => c.id === settings?.category);
  const url = `${location.origin}${roomPath(room.code)}`;
  const [choosingTopic, setChoosingTopic] = useState(false);
  const [editingMe, setEditingMe] = useState(false);
  const me = room.players.find((p) => p.id === playerId);

  // The quiz countdown's generating effect needs three.js; fetch it while everyone gathers.
  const isQuiz = room.game.id === "quiz";
  useEffect(() => {
    if (isQuiz && canGenerateArt()) void preloadGeneratingArt().catch(() => {});
  }, [isQuiz]);

  // A soft pop when someone new arrives in the lobby.
  const joined = useRef(connected.length);
  useEffect(() => {
    if (connected.length > joined.current) play("join");
    joined.current = connected.length;
  }, [connected.length]);

  return (
    <>
      {photo.element}
      <header className="room-bar">
        <button className="btn-link back-link" onClick={() => onLeave("/games")}>
          <Icon name="chevronLeft" size={20} />
          Back to Games
        </button>
        <Latency state={state} />
        <div className="room-actions">
          <InviteButton url={url} />
          <SettingsButton />
          <MuteButton />
          <button className="bar-btn leave" onClick={() => onLeave("/")}>
            <Icon name="logout" size={20} />
            <span>Leave</span>
          </button>
        </div>
      </header>

      <div className="lobby">
        <section className="lobby-main">
          <div className="panel game-summary">
            <span className={jigsaw ? "summary-art picture" : "summary-art"}>
              <img
                src={
                  (jigsaw?.picture === "photo" && jigsaw.photo
                    ? photoPicture(room.code, jigsaw.photo).src
                    : jigsaw && JIGSAW_PICTURES.find((p) => p.id === jigsaw.picture)?.src) ||
                  (game?.art ?? "/art/games/quiz.webp")
                }
                alt=""
              />
            </span>
            <div className="summary-text">
              <h2 className="summary-title">{game?.name ?? "Quiz"}</h2>
              <span className="pill">
                {settings
                  ? (category?.name ?? "Quiz")
                  : jigsaw
                    ? pictureName(jigsaw.picture)
                    : (game?.description ?? "")}
              </span>
              {!isHost && jigsaw && <p className="summary muted small">{sizeName(jigsaw.side)}</p>}
              {!isHost && connections && (
                <p className="summary muted small">
                  {LEVEL_NAMES[connections.level]} · {connections.minutes} minutes
                </p>
              )}
              {!isHost && logic && (
                <p className="summary muted small">
                  {gridName(logic.size)} · {logic.minutes} minutes
                </p>
              )}
              {!isHost && rounds && (
                <p className="summary muted small">
                  {ROUNDS_MODES.find((m) => m.id === rounds.mode)?.name} ·{" "}
                  {LEVEL_NAMES[rounds.level]} ·{" "}
                  {rounds.mode === "elimination"
                    ? `${rounds.rounds} ${gameId === "word-rush" ? "words" : "grids"} a round`
                    : `${rounds.rounds} rounds`}{" "}
                  · {rounds.timeLimitSeconds}s each
                </p>
              )}
              {!isHost && settings && (
                <p className="summary muted small">
                  {QUIZ_VARIANTS.find((v) => v.id === settings.variant)?.name} quiz ·{" "}
                  {category?.name} ·{" "}
                  {settings.difficulty[0]!.toUpperCase() + settings.difficulty.slice(1)} ·{" "}
                  {settings.count} questions{settings.variant === "elimination" && " a round"}
                  {settings.variant !== "classic" && ` · ${settings.timeLimitSeconds}s each`}
                </p>
              )}
            </div>
            {isHost && (settings || jigsaw) && (
              <Tooltip content={jigsaw ? "Change picture" : "Change topic"}>
                <button
                  className="icon-btn edit-btn"
                  aria-label={jigsaw ? "Change picture" : "Change topic"}
                  onClick={() => (jigsaw ? focusSetting("picture") : setChoosingTopic(true))}
                >
                  <Icon name="pencil" size={20} />
                </button>
              </Tooltip>
            )}
          </div>

          {editingMe && me && (
            <ProfileDialog
              nickname={me.nickname}
              avatar={me.avatar ?? AVATAR_IDS[0]}
              onSave={(nickname, avatar) => client.updateProfile(nickname, avatar)}
              onClose={() => setEditingMe(false)}
            />
          )}

          {choosingTopic && settings && (
            <TopicPicker
              value={settings.category}
              onPick={(next) => canEdit && client.configure({ ...settings, category: next })}
              onClose={() => setChoosingTopic(false)}
            />
          )}

          <div className="panel settings-panel" id="room-settings">
            <h2 className="section-title">Room Settings</h2>
            <div className="settings-list">
              <div className="setting-row">
                <Icon name="users" size={20} />
                <label htmlFor="max-players">Max Players</label>
                <SettingSelect
                  id="max-players"
                  label="Max Players"
                  value={String(room.settings.maxPlayers)}
                  disabled={!isHost}
                  options={CAPACITY_OPTIONS.map((n) => ({
                    value: String(n),
                    label: String(n),
                    disabled: n < room.players.length,
                  }))}
                  onChange={(value) => client.configureRoom({ maxPlayers: Number(value) })}
                />
              </div>
              <div className="setting-row">
                <Icon name="layers" size={20} />
                <label htmlFor="game">Game</label>
                <SettingSelect
                  id="game"
                  label="Game"
                  value={gameId}
                  disabled={!canEdit}
                  options={CATALOG.filter(isPlayable).map((g) => ({ value: g.id, label: g.name }))}
                  onChange={(value) => client.chooseGame(value)}
                />
              </div>
              {rounds && isRoundsGame(gameId) && (
                <RoundsSettingsRows
                  game={gameId}
                  settings={rounds}
                  players={connected.length}
                  editable={canEdit}
                  onChange={(next) => client.configure(next)}
                />
              )}
              {settings && (
                <QuizSettingsRows
                  settings={settings}
                  players={connected.length}
                  editable={canEdit}
                  onChange={(next) => client.configure(next)}
                />
              )}
              {connections && (
                <ConnectionsSettingsRows
                  settings={connections}
                  editable={isHost}
                  onChange={(next) => client.configure(next)}
                />
              )}
              {logic && (
                <LogicSettingsRows
                  settings={logic}
                  editable={isHost}
                  onChange={(next) => client.configure(next)}
                />
              )}
              {jigsaw && (
                <JigsawSettingsRows
                  settings={jigsaw}
                  editable={canEdit}
                  onChange={(next) => client.configure(next)}
                  onPickPhoto={photo.pick}
                />
              )}
              <div className="setting-row toggle-row">
                <Icon name="clock" size={20} />
                <span className="toggle-text">
                  <span id="late-join-label">Allow Late Join</span>
                  <span className="dim small">Players can join after the game starts</span>
                </span>
                <button
                  className="switch"
                  role="switch"
                  aria-checked={room.settings.lateJoin}
                  aria-labelledby="late-join-label"
                  disabled={!isHost}
                  onClick={() => client.configureRoom({ lateJoin: !room.settings.lateJoin })}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="panel room-card" aria-label="Room">
          <div className="code-box">
            <span className="code-label">Room Code</span>
            <strong className="room-code" translate="no">
              {room.code}
            </strong>
            <CopyButton text={room.code} />
          </div>
          <p className="dim small center">Share this code with your friends</p>
          <QrCode value={url} label="QR code that opens this room" />

          <div className="lobby-count">
            <span className="avatar-stack" aria-hidden="true">
              {connected.slice(0, 5).map((p) => (
                <Avatar key={p.id} id={p.avatar} name={p.nickname} size={40} />
              ))}
            </span>
            <span className="muted">
              {connected.length}/{room.settings.maxPlayers} players
            </span>
          </div>

          <ul className="player-list" aria-label="Players">
            {room.players.map((player) => (
              <li
                key={player.id}
                className={`${player.id === playerId ? "me" : ""}${player.connected ? "" : " offline"}`}
              >
                {player.id === playerId ? (
                  <button
                    className="player-me"
                    aria-label={`${player.nickname}: change your name or avatar`}
                    onClick={() => setEditingMe(true)}
                  >
                    <Avatar id={player.avatar} name={player.nickname} size={36} />
                    <span className="player-name">{player.nickname}</span>
                    <Icon name="pencil" size={16} />
                  </button>
                ) : (
                  <>
                    <Avatar id={player.avatar} name={player.nickname} size={36} />
                    <span className="player-name">{player.nickname}</span>
                  </>
                )}
                {player.id === room.hostId && (
                  <span className="host-badge">
                    <Icon name="crown" size={16} />
                    <span className="sr-only">Host</span>
                  </span>
                )}
                {player.id === playerId && <span className="dim small">You</span>}
                {!player.connected && (
                  <AnimatedBadge status="warning" size="sm" className="offline-badge">
                    Offline
                  </AnimatedBadge>
                )}
              </li>
            ))}
          </ul>

          <PingFriends code={room.code} />

          <div className="lobby-dock">
            {sittingOut && room.phase === "playing" ? (
              <p className="muted center sitting-out" role="status">
                You quit this game. The others are still playing; you’ll be in the next one.
              </p>
            ) : isHost && needMore > 0 ? (
              <p className="muted center need-more" role="status">
                Elimination needs at least {ELIMINATION_MIN_PLAYERS} players. Invite {needMore} more
                to start.
              </p>
            ) : isHost ? (
              <StartButton alone={alone} onStart={() => client.startGame()} />
            ) : (
              <p className="muted center">Waiting for the host to start the game.</p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

/**
 * Phones with touch get "slide to start" when others are waiting, so a stray tap can't start the
 * game for everyone. Alone, a stray tap costs nothing, so it's a plain button.
 */
const SLIDE_QUERY = "(max-width: 767px) and (pointer: coarse)";

function StartButton({ alone, onStart }: { alone: boolean; onStart: () => void }) {
  const slide = useMediaQuery(SLIDE_QUERY);
  const started = useRef(false);
  const start = () => {
    if (started.current) return;
    started.current = true;
    onStart();
    // If the server says no (say, a player left), the host can try again.
    setTimeout(() => (started.current = false), 1500);
  };

  if (!slide || alone) {
    return (
      <button className="btn btn-primary btn-block btn-start" onClick={start}>
        <Icon name="play" size={20} fill />
        {alone ? "Play solo" : "Start game"}
      </button>
    );
  }
  return (
    <SlideActionButton
      className="slide-start"
      thumbClassName="slide-start-thumb"
      fillClassName="slide-start-fill"
      completeLabel="Starting…"
      onComplete={start}
      // A screen reader's double-tap arrives as a click with no pointer behind it.
      onClick={(event) => {
        if (event.detail === 0) start();
      }}
    >
      Slide to start game
    </SlideActionButton>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Tooltip content={copied ? "Copied" : "Copy room code"}>
      <button
        className="icon-btn copy-btn"
        aria-label={copied ? "Copied" : "Copy room code"}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            reportInvite();
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            // Clipboard blocked; the code is on screen.
          }
        }}
      >
        <ActionSwapCascadeIcon value={copied ? "copied" : "copy"}>
          <Icon name={copied ? "check" : "copy"} size={26} />
        </ActionSwapCascadeIcon>
      </button>
    </Tooltip>
  );
}

function InviteButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const handleInvite = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: "Join my Whizard room", url });
        reportInvite();
      } else {
        await navigator.clipboard.writeText(url);
        reportInvite();
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // The share sheet was dismissed or the clipboard is blocked; the code is on screen anyway.
    }
  };

  return (
    <button className="bar-btn invite" onClick={handleInvite} aria-live="polite">
      <Icon name="invite" size={20} />
      <ActionSwapCascadeText value={copied ? "copied" : "invite"}>
        {copied ? "Link copied" : "Invite"}
      </ActionSwapCascadeText>
    </button>
  );
}
