import { useEffect, useRef, useState } from "react";
import type { LobbyLayout, LobbyPlayer, LobbySceneHandle } from "./lobbyScene";
import { useToyCanvas, type MakeScene } from "./useToyCanvas";

const OPENED_KEY = "whizard:roomOpened:";

/**
 * The first answer for each room, and when it was given. The lobby can show its phone layout for
 * a moment before its wide one, and both should get the same answer.
 */
const asked = new Map<string, { opening: boolean; at: number }>();

/**
 * Whether this is the room opening for this tab, so its burst plays once: not again on the way
 * back from a game, or after a reload.
 */
function isOpening(code: string): boolean {
  const first = asked.get(code);
  if (first) return first.opening && performance.now() - first.at < 3000;
  let opening = false;
  try {
    opening = sessionStorage.getItem(OPENED_KEY + code) !== "1";
    sessionStorage.setItem(OPENED_KEY + code, "1");
  } catch {
    // Without storage, no burst: better none than one every time.
  }
  asked.set(code, { opening, at: performance.now() });
  return opening;
}

/** The lobby's 3D scene on a canvas, kept up to date with who's in the room. */
function useLobbyScene(
  layout: LobbyLayout,
  roomCode: string,
  players: LobbyPlayer[],
  mascot?: { src: string; anchor: React.RefObject<HTMLElement | null> },
) {
  const latest = useRef(players);
  const [opening] = useState(() => isOpening(roomCode));
  useEffect(() => {
    latest.current = players;
  });

  const make: MakeScene<LobbySceneHandle> = (canvas, still, onReady) =>
    import("./lobbyScene").then(({ createLobbyScene }) =>
      createLobbyScene(canvas, {
        layout,
        mascot: mascot?.anchor.current
          ? { src: mascot.src, anchor: mascot.anchor.current }
          : undefined,
        players: latest.current,
        opening,
        reducedMotion: still,
        onReady,
      }),
    );
  const toys = useToyCanvas(make, `lobby:${layout}:${roomCode}`);
  const { scene } = toys;

  // Someone came or went: the scene drops them in or lets them go.
  const who = players.map((p) => `${p.id}:${p.name}`).join("|");
  useEffect(() => {
    scene.current?.setPlayers(latest.current);
  }, [who, scene]);

  return toys;
}

/**
 * Wide screens: the lobby's mascot, with everyone in the room as 3D toy blocks circling it. The
 * page's own picture keeps its place in the layout and shows where 3D can't run; the canvas
 * spreads over the room's header, behind its title and code.
 */
export function LobbyMascot({
  src,
  width,
  height,
  roomCode,
  players,
}: {
  src: string;
  width: number;
  height: number;
  roomCode: string;
  players: LobbyPlayer[];
}) {
  const anchor = useRef<HTMLImageElement>(null);
  const { ref, live } = useLobbyScene("ring", roomCode, players, { src, anchor });
  return (
    <>
      <img
        ref={anchor}
        className={live ? "lobby-mascot is-hidden" : "lobby-mascot"}
        src={src}
        width={width}
        height={height}
        alt=""
      />
      <div className={live ? "lobby-toys is-live" : "lobby-toys"} aria-hidden="true">
        <canvas ref={ref} />
      </div>
    </>
  );
}

/**
 * Phones: everyone in the room as 3D toy blocks, dropping into the lobby's spare space and lining
 * up there. Nothing at all where 3D can't run: the player list says who's here either way.
 */
export function LobbyFloor({ roomCode, players }: { roomCode: string; players: LobbyPlayer[] }) {
  const { ref, live } = useLobbyScene("floor", roomCode, players);
  return (
    <div className={live ? "lobby-floor is-live" : "lobby-floor"} aria-hidden="true">
      <canvas ref={ref} />
    </div>
  );
}
