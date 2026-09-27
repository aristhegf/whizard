import { normalizeRoomCode, ROOM_CODE_LENGTH } from "@whizard/game-core";
import { useState, type FormEvent } from "react";
import { createRoom } from "./api";
import { useRoomConnection } from "./useRoomConnection";

export function App() {
  const [roomCode, setRoomCode] = useState<string | null>(null);

  return (
    <main className="shell">
      <header className="brand">
        <h1>Whizard</h1>
        <p>Play quiz games with friends, wherever they are.</p>
      </header>
      {roomCode ? (
        <RoomScreen code={roomCode} onLeave={() => setRoomCode(null)} />
      ) : (
        <HomeScreen onEnterRoom={setRoomCode} />
      )}
    </main>
  );
}

function HomeScreen({ onEnterRoom }: { onEnterRoom: (code: string) => void }) {
  const [joinInput, setJoinInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      onEnterRoom(await createRoom());
    } catch {
      setError("Couldn't create a room. Check your connection and try again.");
      setCreating(false);
    }
  };

  const handleJoin = (event: FormEvent) => {
    event.preventDefault();
    const code = normalizeRoomCode(joinInput);
    if (code) onEnterRoom(code);
    else setError(`Room codes are ${ROOM_CODE_LENGTH} letters and numbers.`);
  };

  return (
    <section className="card">
      <button className="primary" onClick={handleCreate} disabled={creating}>
        {creating ? "Creating…" : "Create a room"}
      </button>
      <div className="divider">or join one</div>
      <form className="join" onSubmit={handleJoin}>
        <input
          aria-label="Room code"
          placeholder="Room code"
          value={joinInput}
          maxLength={ROOM_CODE_LENGTH + 4}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setJoinInput(event.target.value)}
        />
        <button type="submit">Join</button>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function RoomScreen({ code, onLeave }: { code: string; onLeave: () => void }) {
  const connection = useRoomConnection(code);

  return (
    <section className="card">
      <p className="label">Room code</p>
      <p className="room-code">{code}</p>
      <p className={`status status-${connection.status}`} aria-live="polite">
        {connection.status === "connected"
          ? `Connected${connection.latencyMs === null ? "" : ` · ${connection.latencyMs} ms`}`
          : connection.status === "connecting"
            ? "Connecting…"
            : "Reconnecting…"}
      </p>
      <button onClick={onLeave}>Leave room</button>
    </section>
  );
}
