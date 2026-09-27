import { MAX_PLAYERS, NICKNAME_MAX_LENGTH } from "@whizard/game-core";
import { useState, type FormEvent } from "react";
import { Notice } from "./Notice";
import type { RoomClient, RoomClientState, RoomSnapshot } from "./roomClient";
import { navigate, roomPath } from "./router";
import { loadNickname } from "./storage";
import { useRoom } from "./useRoom";

export function RoomScreen({ code }: { code: string }) {
  const { client, state } = useRoom(code);

  if (state.fatal) return <Notice message={state.fatal} />;

  if (state.playerId && state.room) {
    return <Lobby client={client} state={state} room={state.room} playerId={state.playerId} />;
  }

  return (
    <section className="card">
      <RoomCodeHeader code={code} />
      {state.joining && !state.joinError ? (
        <p className="status status-connecting" aria-live="polite">
          Joining…
        </p>
      ) : (
        <NicknameForm
          disabled={state.connection !== "open"}
          error={state.joinError}
          onSubmit={(nickname) => client.join(nickname)}
        />
      )}
      <ConnectionStatus state={state} />
    </section>
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
  const [nickname, setNickname] = useState(loadNickname);

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
          value={nickname}
          maxLength={NICKNAME_MAX_LENGTH}
          autoComplete="nickname"
          autoFocus
          onChange={(event) => setNickname(event.target.value)}
        />
        <button className="primary" type="submit" disabled={disabled || !nickname.trim()}>
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

  const handleLeave = () => {
    client.leave();
    navigate("/");
  };

  return (
    <section className="card">
      <RoomCodeHeader code={room.code} />
      <InviteButton code={room.code} />

      <div className="stack">
        <h2 className="section-title">
          Players{" "}
          <span className="count">
            {room.players.length}/{MAX_PLAYERS}
          </span>
        </h2>
        <ul className="players">
          {room.players.map((player) => (
            <li key={player.id} className={player.connected ? "" : "offline"}>
              <span className="nickname">{player.nickname}</span>
              {player.id === room.hostId && <span className="badge badge-host">Host</span>}
              {player.id === playerId && <span className="badge">You</span>}
              {!player.connected && <span className="badge badge-offline">Offline</span>}
            </li>
          ))}
        </ul>
      </div>

      <p className="hint">
        {isHost
          ? "You're the host. Choosing a game arrives with the quiz."
          : "Waiting for the host to start a game."}
      </p>

      <ConnectionStatus state={state} />
      <button onClick={handleLeave}>Leave room</button>
    </section>
  );
}

function RoomCodeHeader({ code }: { code: string }) {
  return (
    <div>
      <p className="label">Room code</p>
      <p className="room-code">{code}</p>
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
    <button onClick={handleInvite} aria-live="polite">
      {copied ? "Link copied" : "Invite friends"}
    </button>
  );
}

function ConnectionStatus({ state }: { state: RoomClientState }) {
  const text =
    state.connection === "open"
      ? `Connected${state.latencyMs === null ? "" : ` · ${state.latencyMs} ms`}`
      : state.connection === "connecting"
        ? "Connecting…"
        : "Reconnecting…";
  return (
    <p className={`status status-${state.connection}`} aria-live="polite">
      {text}
    </p>
  );
}
