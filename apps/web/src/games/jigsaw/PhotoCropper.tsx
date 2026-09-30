import { PHOTO_MAX_ASPECT } from "@whizard/game-core";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { Icon } from "../../ui/Icon";

/** The side of a square that's sent: sharp enough for 36 pieces, small enough to send fast. */
const OUTPUT_SIZE = 800;
/** The long side of a photo in its own shape, for Insane's hundred pieces. */
const OUTPUT_LONG_SIDE = 1200;
/** The frame can shrink to this share of the biggest that fits, and no smaller. */
const MIN_FRAME = 0.3;

/** The part of the photo to use, in the photo's own pixels. */
interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A square, or the photo's own shape (kept between 1:2 and 2:1) for Insane. */
export type PhotoShape = "square" | "own";

/** A photo chosen on the Jigsaw page, waiting for its room to open. */
let pending: File | null = null;
export const setPendingPhoto = (file: File) => {
  pending = file;
};
export const pendingPhoto = () => pending;
export const clearPendingPhoto = () => {
  pending = null;
};

/** Cuts the frame out of the photo and makes it a JPEG. */
async function crop(image: HTMLImageElement, frame: Frame): Promise<Blob> {
  const square = Math.abs(frame.width - frame.height) < 1;
  const scale = Math.min(
    1,
    (square ? OUTPUT_SIZE : OUTPUT_LONG_SIDE) / Math.max(frame.width, frame.height),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(frame.width * scale);
  canvas.height = Math.round(frame.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser can’t crop photos.");
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    frame.x,
    frame.y,
    frame.width,
    frame.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  for (const quality of [0.86, 0.72, 0.6]) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (blob && blob.size < 550 * 1024) return blob;
  }
  throw new Error("That photo is too detailed to send. Try another.");
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** The biggest frame of this shape that fits the photo. */
function biggest(image: HTMLImageElement, shape: PhotoShape): { width: number; height: number } {
  const w = image.naturalWidth;
  const h = image.naturalHeight;
  const aspect = shape === "square" ? 1 : clamp(w / h, 1 / PHOTO_MAX_ASPECT, PHOTO_MAX_ASPECT);
  const width = Math.min(w, h * aspect);
  return { width, height: width / aspect };
}

/**
 * Picks the part of a photo that becomes the jigsaw: the whole photo shows, with a frame the host
 * drags into place and sizes with a slider. The frame is square, or for Insane the photo's own
 * shape, starting with all of it. Nothing is cropped until they say so.
 */
export function PhotoCropper({
  file,
  shape = "square",
  onUse,
  onCancel,
}: {
  file: File;
  shape?: PhotoShape;
  /** Sends the cropped photo and its width over height; rejects with a message if it didn't work. */
  onUse: (photo: Blob, aspect: number) => Promise<void>;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const drag = useRef<{ x: number; y: number; frame: Frame; scale: number } | null>(null);
  const shown = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
    const url = URL.createObjectURL(file);
    const img = new Image();
    let live = true;
    img.onload = () => {
      if (!live) return;
      setImage(img);
      // Start with the biggest frame that fits, in the middle.
      const { width, height } = biggest(img, shape);
      setFrame({
        x: (img.naturalWidth - width) / 2,
        y: (img.naturalHeight - height) / 2,
        width,
        height,
      });
    };
    img.onerror = () => {
      if (live) setError("That file isn’t a photo this browser can open.");
    };
    img.src = url;
    return () => {
      live = false;
      // The photo stays in memory for cropping; only the address is let go, once it has loaded.
      if (img.complete) URL.revokeObjectURL(url);
      else img.addEventListener("load", () => URL.revokeObjectURL(url), { once: true });
    };
  }, [file, shape]);

  const most = image ? biggest(image, shape) : { width: 1, height: 1 };
  const place = (next: Frame): Frame => {
    if (!image) return next;
    const share = clamp(next.width / most.width, MIN_FRAME, 1);
    const width = most.width * share;
    const height = most.height * share;
    return {
      width,
      height,
      x: clamp(next.x, 0, image.naturalWidth - width),
      y: clamp(next.y, 0, image.naturalHeight - height),
    };
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!frame || !image || !shown.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      frame,
      scale: image.naturalWidth / shown.current.clientWidth,
    };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start) return;
    setFrame(
      place({
        ...start.frame,
        x: start.frame.x + (event.clientX - start.x) * start.scale,
        y: start.frame.y + (event.clientY - start.y) * start.scale,
      }),
    );
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  // Resizing keeps the frame's middle where it was.
  const resize = (share: number) => {
    if (!frame) return;
    const width = most.width * share;
    const height = most.height * share;
    const middle = { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
    setFrame(place({ width, height, x: middle.x - width / 2, y: middle.y - height / 2 }));
  };

  const nudge = (dx: number, dy: number) => {
    if (!frame) return;
    const step = Math.min(frame.width, frame.height) * 0.05;
    setFrame(place({ ...frame, x: frame.x + dx * step, y: frame.y + dy * step }));
  };

  const use = async () => {
    if (!image || !frame) return;
    setSending(true);
    setError(null);
    try {
      await onUse(await crop(image, frame), frame.width / frame.height);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That photo didn’t work. Try another.");
      setSending(false);
    }
  };

  const box =
    image && frame
      ? ({
          left: `${(frame.x / image.naturalWidth) * 100}%`,
          top: `${(frame.y / image.naturalHeight) * 100}%`,
          width: `${(frame.width / image.naturalWidth) * 100}%`,
          height: `${(frame.height / image.naturalHeight) * 100}%`,
        } satisfies CSSProperties)
      : undefined;

  return (
    <dialog
      ref={dialog}
      className="photo-cropper"
      aria-labelledby="photo-cropper-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!sending) onCancel();
      }}
    >
      <h2 id="photo-cropper-title" className="section-title">
        Frame your jigsaw
      </h2>
      <p className="muted small">
        {shape === "square"
          ? "Drag the square over the part of the photo you want."
          : "Insane keeps your photo’s shape. Use all of it, or drag and size the frame."}{" "}
        Everyone in the room will see it.
      </p>

      <div className="photo-stage">
        {image ? (
          <div className="photo-shown" ref={shown}>
            <img src={image.src} alt="Your photo" draggable={false} />
            {box && (
              <div
                className="photo-frame"
                style={box}
                role="slider"
                tabIndex={0}
                aria-label={`The ${shape === "square" ? "square" : "part"} to use. Drag it, or use the arrow keys.`}
                aria-valuetext="Frame position"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onKeyDown={(event) => {
                  const moves: Record<string, [number, number]> = {
                    ArrowLeft: [-1, 0],
                    ArrowRight: [1, 0],
                    ArrowUp: [0, -1],
                    ArrowDown: [0, 1],
                  };
                  const move = moves[event.key];
                  if (!move) return;
                  event.preventDefault();
                  nudge(...move);
                }}
              >
                <span className="photo-grid" aria-hidden="true" />
              </div>
            )}
          </div>
        ) : (
          !error && <p className="muted">Opening your photo…</p>
        )}
      </div>

      {image && frame && (
        <label className="photo-size">
          <span className="small">Size</span>
          <input
            type="range"
            min={MIN_FRAME}
            max={1}
            step={0.01}
            value={frame.width / most.width}
            onChange={(event) => resize(Number(event.target.value))}
          />
        </label>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="photo-actions">
        <button className="btn" disabled={sending} onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={!frame || sending} onClick={() => void use()}>
          <Icon name="check" size={20} stroke={2.4} />
          {sending ? "Sending…" : "Use this photo"}
        </button>
      </div>
    </dialog>
  );
}
