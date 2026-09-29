import { normalizeRoomCode, ROOM_CODE_LENGTH } from "@whizard/game-core";
import { useState, type FormEvent } from "react";
import { fetchRoomStatus } from "../api";
import { navigate, roomPath } from "../router";
import { loadSession } from "../storage";
import { useShakeOnError } from "./errorShake";
import { Icon } from "./Icon";

/** Why a room code can't be used right now, or null if it can. Asks the server. */
async function codeProblem(code: string): Promise<string | null> {
  const status = await fetchRoomStatus(code);
  if (!status) return "No room has that code. Check it, or ask the host for a new one.";
  // Someone who's already in the room can always go back to it.
  if (loadSession(code)) return null;
  // A game already running is fine: without late join, they wait in the room for the next one.
  if (status.full) return "That room is full.";
  return null;
}

/** "Join room": type a code and go straight to that room, or hear why not. */
export function JoinRoomBox() {
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [checking, setChecking] = useState(false);
  const [code, setCode] = useState("");
  const { ref, isError, message } = useShakeOnError<HTMLInputElement>(error, attempt);

  const fail = (message: string) => {
    setError(message);
    setAttempt((n) => n + 1);
  };

  const join = async (event: FormEvent) => {
    event.preventDefault();
    if (checking) return;
    const normalized = normalizeRoomCode(code);
    if (!normalized) return fail(`Room codes are ${ROOM_CODE_LENGTH} letters and numbers.`);
    setChecking(true);
    try {
      const problem = await codeProblem(normalized);
      if (problem) fail(problem);
      else navigate(roomPath(normalized));
    } catch {
      fail("Couldn’t check that code. Check your connection and try again.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className={`join-room${isError ? " is-error" : ""}`}>
      <form className="join-room-form" onSubmit={(event) => void join(event)}>
        <label className="join-room-label" htmlFor="join-room-code">
          <Icon name="invite" size={20} />
          <span>Join room</span>
        </label>
        <input
          ref={ref}
          id="join-room-code"
          className={`join-room-input${isError ? " is-error" : ""}`}
          name="code"
          aria-label="Room code"
          aria-invalid={isError}
          aria-describedby="join-room-error"
          placeholder="Enter code…"
          value={code}
          maxLength={ROOM_CODE_LENGTH + 4}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            setCode(event.target.value);
            setError(null);
          }}
        />
        <button
          className="join-room-go"
          type="submit"
          aria-label="Join"
          aria-busy={checking}
          disabled={checking}
        >
          <Icon name="arrowRight" size={20} stroke={2.6} />
        </button>
      </form>
      <p id="join-room-error" className="join-room-error" role="alert">
        {message}
      </p>
    </div>
  );
}
