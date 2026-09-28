import {
  MAX_PLAYERS,
  NICKNAME_MAX_LENGTH,
  QUIZ_CATEGORIES,
  type QuizView,
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
import { QuizScreen } from "./games/quiz/QuizScreen";
import { QuizSettingsRows, parseQuizSettings } from "./games/quiz/QuizSettingsPanel";
import { Notice } from "./Notice";
import type { RoomClient, RoomClientState, RoomSnapshot } from "./roomClient";
import { navigate, roomPath } from "./router";
import { loadAvatar, loadNickname } from "./storage";
import { Avatar, avatarUrl } from "./ui/Avatar";
import { Brand } from "./ui/Chrome";
import { useMediaQuery } from "./ui/common";
import { focusSetting, SettingSelect } from "./ui/SettingSelect";
import { useToast } from "./ui/toast";
import { Icon } from "./ui/Icon";
import { QrCode } from "./ui/QrCode";
import { reportInvite } from "./presence";
import { play } from "./sounds";
import { MuteButton } from "./ui/MuteButton";
import { useRoom } from "./useRoom";

export function RoomScreen({ code }: { code: string }) {
  const { client, state } = useRoom(code);
  useRoomToasts(state);

  if (state.fatal) return <Notice message={state.fatal} />;

  const room = state.room;
  const joined = !!(state.playerId && room);
  const inGame = joined && room!.phase !== "lobby" && !!state.game;

  const stage = inGame ? (state.game as QuizView).stage.kind : null;
  const midGame = room?.phase === "playing" && (stage === "question" || stage === "answer");

  const leave = (to: string) => {
    if (midGame && !window.confirm("Leave this game? You can’t rejoin it.")) return;
    client.leave();
    navigate(to);
  };

  return (
    <div className="page room-page">
      <h1 className="sr-only">Whizard room {code}</h1>
      {inGame ? (
        <QuizScreen
          view={state.game as QuizView}
          client={client}
          room={room!}
          playerId={state.playerId!}
          isHost={room!.hostId === state.playerId}
          latency={<Latency state={state} />}
          onQuit={() => leave("/")}
        />
      ) : joined ? (
        <Lobby
          client={client}
          state={state}
          room={room!}
          playerId={state.playerId!}
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
  const seen = useRef<{ players: Map<string, string>; hostId: string | null } | null>(null);
  const offline = useRef<string | null>(null);

  const { room, playerId, connection, notice } = state;

  // Something the server turned down, like starting a game without enough players.
  useEffect(() => {
    if (notice) toast.show({ title: notice, status: "error" });
  }, [notice, toast]);

  useEffect(() => {
    if (!room || !playerId) return;
    const players = new Map(room.players.map((p) => [p.id, p.nickname]));
    const before = seen.current;
    seen.current = { players, hostId: room.hostId };
    // The first snapshot after joining is just who's already here.
    if (!before) return;
    for (const [id, nickname] of players) {
      if (!before.players.has(id)) toast.show({ title: `${nickname} joined`, status: "info" });
    }
    for (const [id, nickname] of before.players) {
      if (!players.has(id)) toast.show({ title: `${nickname} left`, status: "neutral" });
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
  // null until they type, so the account name can fill in once it has loaded.
  const [typed, setTyped] = useState<string | null>(null);
  const nickname = typed ?? (loadNickname() || user?.displayName || "");
  const [picked, setPicked] = useState<string | null>(null);
  const avatar = picked ?? user?.avatar ?? loadAvatar() ?? AVATAR_IDS[0];
  const disabled = state.connection !== "open";

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (nickname.trim()) client.join(nickname, avatar);
  };

  return (
    <div className="join-screen">
      <header className="topnav">
        <Brand />
      </header>
      <img className="join-logo" src="/art/logo-lockup.webp" alt="" width={760} height={660} />
      <form className="panel join-card" onSubmit={handleSubmit}>
        <div className="code-box small-code">
          <span className="code-label">Room Code</span>
          <strong translate="no">{code}</strong>
        </div>
        {state.joining && !state.joinError ? (
          <p className="muted center" aria-live="polite">
            Joining…
          </p>
        ) : (
          <>
            <label className="label" htmlFor="nickname">
              Choose a nickname
            </label>
            <input
              id="nickname"
              name="nickname"
              value={nickname}
              maxLength={NICKNAME_MAX_LENGTH}
              autoComplete="nickname"
              autoFocus
              onChange={(event) => setTyped(event.target.value)}
            />
            <span className="label" id="avatar-label">
              Pick your avatar
            </span>
            <div className="avatar-picker" role="radiogroup" aria-labelledby="avatar-label">
              {AVATAR_IDS.map((id, i) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={avatar === id}
                  aria-label={`Avatar ${i + 1}`}
                  onClick={() => setPicked(id)}
                >
                  <img src={avatarUrl(id)} alt="" width={56} height={56} />
                </button>
              ))}
            </div>
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
  onLeave,
}: {
  client: RoomClient;
  state: RoomClientState;
  room: RoomSnapshot;
  playerId: string;
  onLeave: (to: string) => void;
}) {
  const isHost = room.hostId === playerId;
  const settings = parseQuizSettings(room.game.settings);
  const connected = room.players.filter((p) => p.connected);
  const alone = connected.length <= 1;
  const category = QUIZ_CATEGORIES.find((c) => c.id === settings?.category);
  const url = `${location.origin}${roomPath(room.code)}`;

  // A soft pop when someone new arrives in the lobby.
  const joined = useRef(connected.length);
  useEffect(() => {
    if (connected.length > joined.current) play("join");
    joined.current = connected.length;
  }, [connected.length]);

  return (
    <>
      <header className="room-bar">
        <button className="btn-link back-link" onClick={() => onLeave("/games")}>
          <Icon name="chevronLeft" size={20} />
          Back to Games
        </button>
        <Latency state={state} />
        <div className="room-actions">
          <InviteButton url={url} />
          {isHost && (
            <button
              className="bar-btn"
              onClick={() =>
                document.getElementById("room-settings")?.scrollIntoView({ behavior: "smooth" })
              }
            >
              <Icon name="settings" size={20} />
              <span>Settings</span>
            </button>
          )}
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
            <span className="summary-art">
              <img src="/art/games/quiz.webp" alt="" />
            </span>
            <div className="summary-text">
              <h2 className="summary-title">Quiz</h2>
              <span className="pill">{category?.name ?? "Quiz"}</span>
              {!isHost && settings && (
                <p className="summary muted small">
                  {settings.variant === "speed" ? "Speed" : "Classic"} quiz · {category?.name} ·{" "}
                  {settings.difficulty[0]!.toUpperCase() + settings.difficulty.slice(1)} ·{" "}
                  {settings.count} questions
                  {settings.variant === "speed" && ` · ${settings.timeLimitSeconds}s each`}
                </p>
              )}
            </div>
            {isHost && (
              <Tooltip content="Change topic">
                <button
                  className="icon-btn edit-btn"
                  aria-label="Change topic"
                  onClick={() => focusSetting("category")}
                >
                  <Icon name="pencil" size={20} />
                </button>
              </Tooltip>
            )}
          </div>

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
              {settings && (
                <QuizSettingsRows
                  settings={settings}
                  editable={isHost}
                  onChange={(next) => client.configure(next)}
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
                <Avatar id={player.avatar} name={player.nickname} size={36} />
                <span className="player-name">{player.nickname}</span>
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
            {isHost ? (
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

/** Phones with touch get "slide to start", so a stray tap can't start the game. */
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

  if (!slide) {
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
      {alone ? "Slide to play solo" : "Slide to start game"}
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
