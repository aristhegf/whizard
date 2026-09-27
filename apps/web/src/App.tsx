import { normalizeRoomCode, ROOM_CODE_LENGTH } from "@whizard/game-core";
import { useState, type FormEvent } from "react";
import { useAccount } from "./account";
import { AccountScreen } from "./AccountScreen";
import { createRoom } from "./api";
import { AddFriendScreen, FriendsScreen, GroupScreen } from "./FriendsScreen";
import { Notice } from "./Notice";
import { PrivacyScreen } from "./PrivacyScreen";
import { RoomScreen } from "./RoomScreen";
import { linkTo, navigate, roomPath, useRoute } from "./router";

export function App() {
  const route = useRoute();
  return (
    <main className="shell">
      {route.name === "room" ? (
        <RoomRoute code={route.code} />
      ) : route.name === "account" ? (
        <AccountScreen />
      ) : route.name === "friends" ? (
        <FriendsScreen />
      ) : route.name === "add" ? (
        <AddFriendScreen key={route.username} username={route.username} />
      ) : route.name === "group" ? (
        <GroupScreen key={route.id} id={route.id} />
      ) : route.name === "privacy" ? (
        <PrivacyScreen />
      ) : (
        <HomeScreen />
      )}
    </main>
  );
}

function AccountLink() {
  const account = useAccount();
  if (account.status === "loading") return <span className="account-link" />;
  return (
    <>
      {account.user && (
        <a className="account-link plain" {...linkTo("/friends")}>
          Friends
        </a>
      )}
      <a className="account-link" {...linkTo("/account")}>
        {account.user ? account.user.displayName : "Sign in"}
      </a>
    </>
  );
}

function RoomRoute({ code }: { code: string }) {
  const normalized = normalizeRoomCode(code);
  if (!normalized) return <Notice message="That isn’t a valid room link." />;
  return <RoomScreen key={normalized} code={normalized} />;
}

function HomeScreen() {
  const [joinInput, setJoinInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<"friends" | "solo" | null>(null);

  const handleCreate = async (mode: "friends" | "solo") => {
    setCreating(mode);
    setError(null);
    try {
      navigate(roomPath(await createRoom()));
    } catch {
      setError("Couldn’t create a room. Check your connection and try again.");
      setCreating(null);
    }
  };

  const handleJoin = (event: FormEvent) => {
    event.preventDefault();
    const code = normalizeRoomCode(joinInput);
    if (code) navigate(roomPath(code));
    else setError(`Room codes are ${ROOM_CODE_LENGTH} letters and numbers.`);
  };

  return (
    <div className="screen">
      <nav className="home-top" aria-label="Account">
        <AccountLink />
      </nav>
      <header className="hero">
        <h1 className="wordmark" translate="no">
          Whizard<span className="spark">.</span>
        </h1>
        <p>Quick quiz games with friends, wherever they are.</p>
      </header>

      <div className="stack">
        <button
          className="btn btn-primary"
          onClick={() => handleCreate("friends")}
          disabled={!!creating}
        >
          {creating === "friends" ? "Creating…" : "Play with friends"}
        </button>
        <button className="btn" onClick={() => handleCreate("solo")} disabled={!!creating}>
          {creating === "solo" ? "Setting up…" : "Play solo"}
        </button>
      </div>

      <div className="or">or join a room</div>

      <form className="inline-form" onSubmit={handleJoin}>
        <input
          className="code-input"
          name="code"
          aria-label="Room code"
          placeholder="Room code, e.g. K7QX2M"
          value={joinInput}
          maxLength={ROOM_CODE_LENGTH + 4}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setJoinInput(event.target.value)}
        />
        <button className="btn" type="submit">
          Join
        </button>
      </form>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
