import { useEffect, useState } from "react";
import { fetchRoomStatus, type RoomStatus } from "../api";
import { linkTo, roomPath } from "../router";
import { clearSession, latestSession } from "../storage";
import { Icon } from "./Icon";

/**
 * A bar on every page but the room itself while this browser's last room is still open, so a
 * player who tapped back by mistake can go straight back in without rejoining.
 */
export function ReturnToRoom({ page }: { page: string }) {
  const [room, setRoom] = useState<RoomStatus | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    const session = latestSession();
    if (!session) return;
    let live = true;
    fetchRoomStatus(session.code).then(
      (status) => {
        if (!live) return;
        if (!status) clearSession(session.code);
        setRoom(status);
      },
      () => live && setRoom(null),
    );
    return () => {
      live = false;
    };
  }, [page]);

  // The session goes when the player leaves the room for good, so the bar goes with it.
  if (!room || dismissed === room.code || latestSession()?.code !== room.code) return null;
  const text =
    room.phase === "playing"
      ? `Your game in room ${room.code} is still going`
      : `Your room ${room.code} is still open`;

  return (
    <div className="return-bar" role="region" aria-label="Your room">
      <span className="return-text">{text}</span>
      <a className="btn btn-small btn-gold" {...linkTo(roomPath(room.code))}>
        Return
      </a>
      <button className="icon-btn" aria-label="Hide" onClick={() => setDismissed(room.code)}>
        <Icon name="close" size={20} />
      </button>
    </div>
  );
}
