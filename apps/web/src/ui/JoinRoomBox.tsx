import { normalizeRoomCode, ROOM_CODE_LENGTH } from "@whizard/game-core";
import { useEffect, useState, type FormEvent } from "react";
import { fetchRoomStatus } from "../api";
import { usePrefersStill } from "../display";
import { navigate, roomPath } from "../router";
import { loadSession } from "../storage";
import { useShakeOnError } from "./errorShake";
import { Icon } from "./Icon";

/** Made-up codes in the real alphabet, shown typing themselves into the empty box. */
const EXAMPLE_CODES = ["K7QX2M", "B4TZ9W", "HN3PRQ", "W8DKJ5", "QZ2MVA"];
const TYPE_MS = 140;
const HOLD_MS = 1400;
const ERASE_MS = 45;
const REST_MS = 500;

/** A code typed out letter by letter behind a blinking caret, held, erased, then the next. */
function TypedCodes() {
  const [text, setText] = useState("");

  useEffect(() => {
    let which = 0;
    let length = 0;
    let timer: ReturnType<typeof setTimeout>;
    const type = () => {
      const word = EXAMPLE_CODES[which % EXAMPLE_CODES.length]!;
      setText(word.slice(0, ++length));
      timer = length < word.length ? setTimeout(type, TYPE_MS) : setTimeout(erase, HOLD_MS);
    };
    const erase = () => {
      const word = EXAMPLE_CODES[which % EXAMPLE_CODES.length]!;
      setText(word.slice(0, --length));
      if (length > 0) timer = setTimeout(erase, ERASE_MS);
      else {
        which += 1;
        timer = setTimeout(type, REST_MS);
      }
    };
    timer = setTimeout(type, REST_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <span className="join-room-demo" aria-hidden="true">
      {text}
      <span className="join-room-caret" />
    </span>
  );
}

/** Why a room code can't be used right now, or null if it can. Asks the server. */
async function codeProblem(code: string): Promise<string | null> {
  const status = await fetchRoomStatus(code);
  if (!status) return "No room with that code";
  // Someone who's already in the room can always go back to it.
  if (loadSession(code)) return null;
  // A game already running is fine: without late join, they wait in the room for the next one.
  if (status.full) return "That room is full";
  return null;
}

/** "Join room": type a code and go straight to that room, or hear why not. */
export function JoinRoomBox() {
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [checking, setChecking] = useState(false);
  const [code, setCode] = useState("");
  const [focused, setFocused] = useState(false);
  const still = usePrefersStill();
  // Example codes type themselves into the empty box, until someone starts using it.
  const demo = !code && !focused && !still;
  const { ref, isError, message } = useShakeOnError<HTMLFormElement>(error, attempt);
  // The last code the server said can be joined; the button goes green while it's the one typed.
  const [joinable, setJoinable] = useState<string | null>(null);
  const typed = normalizeRoomCode(code);
  const isReady = !!typed && typed === joinable;

  useEffect(() => {
    if (!typed) return;
    let stale = false;
    const timer = setTimeout(() => {
      codeProblem(typed)
        .then((problem) => {
          if (!stale && !problem) setJoinable(typed);
        })
        .catch(() => undefined);
    }, 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [typed]);

  const fail = (message: string) => {
    setError(message);
    setAttempt((n) => n + 1);
  };

  const join = async (event: FormEvent) => {
    event.preventDefault();
    if (checking) return;
    const normalized = normalizeRoomCode(code);
    if (!normalized) return fail(`Codes are ${ROOM_CODE_LENGTH} letters and numbers`);
    setChecking(true);
    try {
      const problem = await codeProblem(normalized);
      if (problem) fail(problem);
      else navigate(roomPath(normalized));
    } catch {
      fail("Couldn’t check. Try again");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className={`join-room${isError ? " is-error" : ""}`}>
      <form
        ref={ref}
        className={`join-room-form t-input${isError ? " is-error" : ""}`}
        onSubmit={(event) => void join(event)}
      >
        <span className="join-room-field">
          <input
            id="join-room-code"
            className="join-room-input"
            name="code"
            aria-label="Room code"
            aria-invalid={isError}
            aria-describedby="join-room-error"
            placeholder={demo ? "" : "Room code…"}
            value={code}
            maxLength={ROOM_CODE_LENGTH + 4}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onChange={(event) => {
              setCode(event.target.value);
              setError(null);
            }}
          />
          {demo && <TypedCodes />}
        </span>
        <button
          className={`join-room-go${isReady ? " is-ready" : ""}`}
          type="submit"
          aria-label="Join"
          aria-busy={checking}
          disabled={checking}
        >
          <Icon name="arrowRight" size={18} stroke={2.6} />
        </button>
      </form>
      <p id="join-room-error" className="join-room-error" role="alert">
        {isError && (
          <>
            <Icon name="alert" size={14} stroke={2.4} />
            {message}
          </>
        )}
      </p>
    </div>
  );
}
