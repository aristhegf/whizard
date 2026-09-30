import { TiltCard } from "@/components/motion/tilt-card";
import {
  DEFAULT_JIGSAW_SETTINGS,
  JIGSAW_LEVELS,
  JIGSAW_PICTURES,
  JIGSAW_THEMES,
  type JigsawLevel,
  type JigsawPictureId,
} from "@whizard/game-core";
import { useRef, useState } from "react";
import { levelName } from "../games/jigsaw/JigsawSettingsPanel";
import { setPendingPhoto } from "../games/jigsaw/PhotoCropper";
import { createFailed, TopLayout, startRoom } from "../ui/Chrome";
import { HeadingHint } from "../ui/HeadingHint";
import { Icon } from "../ui/Icon";

type Choice = JigsawPictureId | "random" | "photo";

/**
 * `/games/jigsaw`: pick the pieces and a picture (a surprise, your own photo, or one of ours by
 * theme), and a room opens with it.
 */
export function JigsawPage() {
  const [level, setLevel] = useState<JigsawLevel>(
    DEFAULT_JIGSAW_SETTINGS.level === "auto" ? "easy" : DEFAULT_JIGSAW_SETTINGS.level,
  );
  const [starting, setStarting] = useState<Choice | null>(null);
  const [error, setError] = useState<string | null>(null);

  const photoInput = useRef<HTMLInputElement>(null);

  const start = async (picture: Choice) => {
    setStarting(picture);
    setError(null);
    try {
      // Your own photo is framed and sent from the lobby, once the room exists.
      await startRoom(
        { picture: picture === "photo" ? "random" : picture, mode: "classic", level },
        "jigsaw",
      );
    } catch (e) {
      setError(createFailed(e));
      setStarting(null);
    }
  };

  return (
    <TopLayout active="games" className="topics-page" column>
      <header className="side-head">
        <div className="hint-row">
          <h1 className="page-title">Jigsaw Pictures</h1>
          <HeadingHint id="jigsaw" label="How jigsaw works">
            Everyone gets the same puzzle, and the fastest to finish wins. Up to Hard, tap two
            pieces to swap them; in Insane, drag them from the tray onto the picture. Pick Speed or
            Elimination in the room.
          </HeadingHint>
        </div>
      </header>

      <div className="chips" role="group" aria-label="Level">
        {JIGSAW_LEVELS.map((l) => (
          <button
            key={l.id}
            className="chip"
            aria-pressed={level === l.id}
            onClick={() => setLevel(l.id)}
          >
            {levelName(l.id)}
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
        <li>
          <TiltCard className="tilt tilt-topic" max={10}>
            <button
              className="picture-tile own-photo"
              disabled={starting !== null}
              onClick={() => photoInput.current?.click()}
            >
              <span className="picture-art">
                <Icon name="plusCircle" size={56} />
              </span>
              <span className="picture-name">
                {starting === "photo" ? "Starting…" : "Your photo"}
              </span>
            </button>
          </TiltCard>
          <input
            ref={photoInput}
            type="file"
            accept="image/*"
            hidden
            aria-label="Choose your photo"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              setPendingPhoto(file);
              void start("photo");
            }}
          />
        </li>
      </ul>

      {JIGSAW_THEMES.map((theme) => (
        <section key={theme.id} className="picture-theme" aria-labelledby={`theme-${theme.id}`}>
          <h2 className="section-title" id={`theme-${theme.id}`}>
            {theme.name}
          </h2>
          <ul className="picture-grid">
            {JIGSAW_PICTURES.filter((p) => p.theme === theme.id).map((p) => (
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
        </section>
      ))}
    </TopLayout>
  );
}
