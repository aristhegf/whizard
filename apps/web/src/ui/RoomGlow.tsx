import type { CSSProperties } from "react";
import { CATALOG } from "../catalog";

/**
 * The room's light: a soft glow from the top of the screen in a game's own colour, behind
 * everything. It eases from one game's colour to the next, so the Games page lights up in the
 * colours of the game you're looking at, and a lobby in the colours of the game it's playing.
 */
export function RoomGlow({ game }: { game: string | null | undefined }) {
  const entry = game ? CATALOG.find((g) => g.id === game || g.starts === game) : undefined;
  const style = entry ? ({ "--glow": entry.colors[0] } as CSSProperties) : undefined;
  return <div className="room-glow" style={style} aria-hidden="true" />;
}
