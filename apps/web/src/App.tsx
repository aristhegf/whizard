import { normalizeRoomCode, ROOM_CODE_LENGTH } from "@whizard/game-core";
import { useState, type FormEvent } from "react";
import { createRoom } from "./api";
import { Notice } from "./Notice";
import { navigate, roomPath, useRoute } from "./router";
import { RoomScreen } from "./RoomScreen";

export function App() {
  const route = useRoute();

  return (
    <main className="shell">
      <header className="brand">
        <a href="/" onClick={(event) => (event.preventDefault(), navigate("/"))}>
          <h1>Whizard</h1>
        </a>
        <p>Play quiz games with friends, wherever they are.</p>
      </header>
      {route.name === "room" ? <RoomRoute code={route.code} /> : <HomeScreen />}
    </main>
  );
}

function RoomRoute({ code }: { code: string }) {
  const normalized = normalizeRoomCode(code);
  if (!normalized) return <Notice message="That isn't a valid room link." />;
  return <RoomScreen key={normalized} code={normalized} />;
}

function HomeScreen() {
  const [joinInput, setJoinInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      navigate(roomPath(await createRoom()));
    } catch {
      setError("Couldn't create a room. Check your connection and try again.");
      setCreating(false);
    }
  };

  const handleJoin = (event: FormEvent) => {
    event.preventDefault();
    const code = normalizeRoomCode(joinInput);
    if (code) navigate(roomPath(code));
    else setError(`Room codes are ${ROOM_CODE_LENGTH} letters and numbers.`);
  };

  return (
    <section className="card">
      <button className="primary" onClick={handleCreate} disabled={creating}>
        {creating ? "Creating…" : "Create a room"}
      </button>
      <div className="divider">or join one</div>
      <form className="inline-form" onSubmit={handleJoin}>
        <input
          className="code-input"
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
