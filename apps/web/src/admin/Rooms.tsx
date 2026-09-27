import { QUIZ_CATEGORIES } from "@whizard/game-core";
import type { LiveRoom } from "@whizard/protocol";
import { useState } from "react";
import { closeRoom, fetchAdminRooms } from "../api";
import { CATALOG, TOPIC_STYLES } from "../catalog";
import { formatNumber, timeAgo } from "../format";
import { KpiTiles, PanelHead, useRefreshing } from "./parts";

const REFRESH_MS = 10_000;

const PHASES: Record<LiveRoom["phase"], { label: string; tone: string }> = {
  lobby: { label: "Waiting", tone: "status-open" },
  playing: { label: "Playing", tone: "status-kept" },
  finished: { label: "Results", tone: "status-retired" },
};

const LEVELS: Record<string, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };

function roomTitle(room: LiveRoom): string {
  if (room.game === "quiz") {
    const topic = QUIZ_CATEGORIES.find((c) => c.id === room.topic)?.name ?? "Quiz";
    return `${topic} Quiz`;
  }
  return CATALOG.find((g) => g.id === room.game)?.name ?? room.game;
}

/** `/admin/rooms`: rooms open right now, updated every few seconds. */
export function Rooms() {
  const { data, error, reload } = useRefreshing(fetchAdminRooms, REFRESH_MS);
  const t = data?.totals;
  return (
    <div className={data ? "admin-grid" : "admin-grid loading"}>
      <KpiTiles
        tiles={[
          {
            tone: "purple",
            icon: "door",
            label: "Open Rooms",
            value: t ? formatNumber(t.open) : "–",
            note: "right now",
          },
          {
            tone: "blue",
            icon: "clock",
            label: "Waiting",
            value: t ? formatNumber(t.waiting) : "–",
            note: "in the lobby",
          },
          {
            tone: "orange",
            icon: "games",
            label: "Playing",
            value: t ? formatNumber(t.playing) : "–",
            note: "a game in progress",
          },
          {
            tone: "green",
            icon: "users",
            label: "Players Online",
            value: t ? formatNumber(t.online) : "–",
            note: "connected to a room",
          },
        ]}
      />

      <section className="panel admin-panel span-12" aria-labelledby="rooms-list-title">
        <PanelHead
          id="rooms-list-title"
          icon="door"
          title="Open Rooms"
          subtitle="Games in progress first. Updates every 10 seconds."
        />
        {error && !data && (
          <p className="error" role="alert">
            Couldn’t load the rooms. {error}
          </p>
        )}
        {data && data.rooms.length === 0 && <p className="admin-empty">No rooms open right now.</p>}
        <ul className="room-list">
          {(data?.rooms ?? []).map((room) => (
            <RoomRow key={room.code} room={room} onClosed={reload} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function RoomRow({ room, onClosed }: { room: LiveRoom; onClosed: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const art =
    room.game === "quiz"
      ? TOPIC_STYLES[room.topic as keyof typeof TOPIC_STYLES]?.art
      : CATALOG.find((g) => g.id === room.game)?.art;
  const phase = PHASES[room.phase];

  const close = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await closeRoom(room.code);
      onClosed();
    } catch {
      setFailed(true);
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <li className="room-row">
      <span className="rank-art">{art && <img src={art} alt="" loading="lazy" />}</span>
      <span className="room-name">
        <strong>{roomTitle(room)}</strong>
        <span>
          <code>{room.code}</code>
          {room.difficulty && ` · ${LEVELS[room.difficulty] ?? room.difficulty}`}
          {room.questions && ` · ${room.questions} questions`}
        </span>
      </span>
      <span className={`status-pill ${phase.tone}`}>{phase.label}</span>
      <span className="room-players">
        {room.players === 0 ? (
          <span>Empty</span>
        ) : (
          <>
            <strong>
              {room.online} / {room.players}
            </strong>
            <span>online</span>
          </>
        )}
      </span>
      <span className="room-nicknames" title={room.nicknames.join(", ")}>
        {room.nicknames.slice(0, 6).map((n, i) => (
          <span key={`${n}-${i}`} className={n === room.host ? "reason-chip host" : "reason-chip"}>
            {n}
          </span>
        ))}
        {room.nicknames.length > 6 && (
          <span className="reason-chip">+{room.nicknames.length - 6}</span>
        )}
      </span>
      <span className="room-age">
        opened {timeAgo(room.createdAt)}
        <br />
        active {timeAgo(room.updatedAt)}
      </span>
      <div className="user-actions">
        {confirming ? (
          <>
            <button
              className="btn btn-small btn-danger"
              disabled={busy}
              onClick={() => void close()}
            >
              Close {room.code}
            </button>
            <button className="btn btn-small" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button className="btn btn-small" onClick={() => setConfirming(true)}>
            Close room
          </button>
        )}
      </div>
      {failed && (
        <p className="error small user-error" role="alert">
          Couldn’t close the room. Try again.
        </p>
      )}
    </li>
  );
}
