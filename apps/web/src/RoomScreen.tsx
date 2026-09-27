import { NICKNAME_MAX_LENGTH, type QuizView } from "@whizard/game-core";
import { useState, type FormEvent } from "react";
import { useAccount } from "./account";
import { QuizScreen } from "./games/quiz/QuizScreen";
import { QuizSettingsPanel, parseQuizSettings } from "./games/quiz/QuizSettingsPanel";
import { Notice } from "./Notice";
import type { RoomClient, RoomClientState, RoomSnapshot } from "./roomClient";
import { navigate, roomPath } from "./router";
import { loadNickname } from "./storage";
import { useRoom } from "./useRoom";

export function RoomScreen({ code }: { code: string }) {
  const { client, state } = useRoom(code);

  if (state.fatal) return <Notice message={state.fatal} />;

  const joined = state.playerId && state.room;
  const inGame = joined && state.room!.phase !== "lobby" && state.game;

  return (
    <>
      <h1 className="sr-only">Whizard room {code}</h1>
      <TopBar state={state} client={client} canLeave={!!joined} inGame={!!inGame} />
      {inGame ? (
        <QuizScreen
          view={state.game as QuizView}
          client={client}
          playerId={state.playerId!}
          isHost={state.room!.hostId === state.playerId}
          usernames={state.room!.players.flatMap((p) => (p.username ? [p.username] : []))}
        />
      ) : joined ? (
        <Lobby client={client} state={state} room={state.room!} playerId={state.playerId!} />
      ) : (
        <div className="screen">
          <RoomCode code={code} />
          {state.joining && !state.joinError ? (
            <p className="muted" aria-live="polite">
              Joining…
            </p>
          ) : (
            <NicknameForm
              disabled={state.connection !== "open"}
              error={state.joinError}
              onSubmit={(nickname) => client.join(nickname)}
            />
          )}
        </div>
      )}
    </>
  );
}

function TopBar({
  state,
  client,
  canLeave,
  inGame,
}: {
  state: RoomClientState;
  client: RoomClient;
  canLeave: boolean;
  inGame: boolean;
}) {
  const connected = state.connection === "open";
  return (
    <header className="topbar">
      <a
        className="brand"
        translate="no"
        href="/"
        onClick={(event) => {
          event.preventDefault();
          navigate("/");
        }}
      >
        Whizard
      </a>
      <span className={`net${connected ? "" : " warn"}`} aria-live="polite">
        {connected
          ? state.latencyMs === null
            ? "Connected"
            : `${state.latencyMs}\u00a0ms`
          : state.connection === "connecting"
            ? "Connecting…"
            : "Reconnecting…"}
      </span>
      {canLeave && (
        <button
          className="btn-link"
          onClick={() => {
            if (inGame && !window.confirm("Leave this game? You can’t rejoin it.")) return;
            client.leave();
            navigate("/");
          }}
        >
          Leave
        </button>
      )}
    </header>
  );
}

function NicknameForm({
  disabled,
  error,
  onSubmit,
}: {
  disabled: boolean;
  error: string | null;
  onSubmit: (nickname: string) => void;
}) {
  const account = useAccount();
  const accountName = account.status === "ready" ? account.user?.displayName : undefined;
  // null until they type, so the account name can fill in once it has loaded.
  const [typed, setTyped] = useState<string | null>(null);
  const nickname = typed ?? (loadNickname() || accountName || "");

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (nickname.trim()) onSubmit(nickname);
  };

  return (
    <form className="stack" onSubmit={handleSubmit}>
      <label className="label" htmlFor="nickname">
        Choose a nickname
      </label>
      <div className="inline-form">
        <input
          id="nickname"
          name="nickname"
          value={nickname}
          maxLength={NICKNAME_MAX_LENGTH}
          autoComplete="nickname"
          autoFocus
          onChange={(event) => setTyped(event.target.value)}
        />
        <button className="btn btn-primary" type="submit" disabled={disabled || !nickname.trim()}>
          Join
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function Lobby({
  client,
  state,
  room,
  playerId,
}: {
  client: RoomClient;
  state: RoomClientState;
  room: RoomSnapshot;
  playerId: string;
}) {
  const isHost = room.hostId === playerId;
  const settings = parseQuizSettings(room.game.settings);
  const alone = room.players.filter((p) => p.connected).length <= 1;

  return (
    <div className="screen">
      <div className="code-row">
        <RoomCode code={room.code} />
        <InviteButton code={room.code} />
      </div>

      <ul className="chips" aria-label="Players">
        {room.players.map((player) => (
          <li
            key={player.id}
            className={`chip${player.id === playerId ? " me" : ""}${player.connected ? "" : " offline"}`}
          >
            {player.id === room.hostId && (
              <span className="crown" aria-hidden="true">
                ★
              </span>
            )}
            {player.nickname}
            {player.id === room.hostId && <span className="sr-only">Host</span>}
            {player.id === playerId && <span className="muted small">You</span>}
            {!player.connected && <span className="muted small">Offline</span>}
          </li>
        ))}
      </ul>

      {settings && (
        <QuizSettingsPanel
          settings={settings}
          editable={isHost}
          onChange={(next) => client.configure(next)}
        />
      )}

      <div className="dock">
        {state.notice && (
          <p className="error small" role="alert">
            {state.notice}
          </p>
        )}
        {isHost ? (
          <button className="btn btn-primary" onClick={() => client.startGame()}>
            {alone ? "Play solo" : "Start game"}
          </button>
        ) : (
          <p className="muted center">Waiting for the host to start the game.</p>
        )}
      </div>
    </div>
  );
}

function RoomCode({ code }: { code: string }) {
  return (
    <div>
      <p className="label">Room code</p>
      <p className="room-code" translate="no">
        {code}
      </p>
    </div>
  );
}

function InviteButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleInvite = async () => {
    const url = `${location.origin}${roomPath(code)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Join my Whizard room", url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // The share sheet was dismissed or the clipboard is blocked; the code is on screen anyway.
    }
  };

  return (
    <button className="btn" onClick={handleInvite} aria-live="polite">
      {copied ? "Link copied" : "Invite"}
    </button>
  );
}
