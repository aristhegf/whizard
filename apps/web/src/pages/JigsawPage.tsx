import { TiltCard } from "@/components/motion/tilt-card";
import {
  DEFAULT_JIGSAW_SETTINGS,
  JIGSAW_PICTURES,
  JIGSAW_SIZES,
  type JigsawPictureId,
  type JigsawSide,
} from "@whizard/game-core";
import { useState } from "react";
import { createFailed, SideLayout, startRoom } from "../ui/Chrome";
import { Icon } from "../ui/Icon";

type Choice = JigsawPictureId | "random";

/** `/games/jigsaw`: pick the pieces and a picture (or a surprise), and a room opens with it. */
export function JigsawPage() {
  const [side, setSide] = useState<JigsawSide>(DEFAULT_JIGSAW_SETTINGS.side);
  const [starting, setStarting] = useState<Choice | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = async (picture: Choice) => {
    setStarting(picture);
    setError(null);
    try {
      await startRoom({ picture, side }, "jigsaw");
    } catch (e) {
      setError(createFailed(e));
      setStarting(null);
    }
  };

  return (
    <SideLayout active="games" className="topics-page">
      <header className="side-head">
        <div>
          <h1 className="page-title">
            Jigsaw <span className="gradient-text">Pictures</span>
          </h1>
          <p className="page-sub">
            Everyone gets the same puzzle. Tap two pieces to swap them; the fastest to finish wins.
          </p>
        </div>
      </header>

      <div className="chips" role="group" aria-label="Pieces">
        {JIGSAW_SIZES.map((s) => (
          <button
            key={s.side}
            className="chip"
            aria-pressed={side === s.side}
            onClick={() => setSide(s.side)}
          >
            {s.name} · {s.side * s.side} pieces
          </button>
        ))}
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <ul className="picture-grid">
        <li>
          <TiltCard className="tilt tilt-topic" max={10}>
            <button
              className="picture-tile surprise"
              disabled={starting !== null}
              onClick={() => void start("random")}
            >
              <span className="picture-art">
                <Icon name="help" size={56} />
              </span>
              <span className="picture-name">
                {starting === "random" ? "Starting…" : "Surprise me"}
              </span>
            </button>
          </TiltCard>
        </li>
        {JIGSAW_PICTURES.map((p) => (
          <li key={p.id}>
            <TiltCard className="tilt tilt-topic" max={10}>
              <button
                className="picture-tile"
                disabled={starting !== null}
                onClick={() => void start(p.id)}
              >
                <span className="picture-art">
                  <img src={p.src} alt="" loading="lazy" />
                </span>
                <span className="picture-name">{starting === p.id ? "Starting…" : p.name}</span>
              </button>
            </TiltCard>
          </li>
        ))}
      </ul>
    </SideLayout>
  );
}
