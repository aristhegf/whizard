import { useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import { drawShareCard, type ShareCard } from "./shareCard";

const FILE_NAME = "whizard-results.png";

type Picture =
  { status: "drawing" } | { status: "ready"; url: string; file: File } | { status: "failed" };

/**
 * Sharing a finished game as a picture: `open()` draws the 9:16 card and shows it, with Share
 * (on phones that can share files) and Download. Put `dialog` anywhere on the results screen.
 */
export function useShareResults(card: ShareCard, text: string) {
  const ref = useRef<HTMLDialogElement>(null);
  const [picture, setPicture] = useState<Picture | null>(null);

  const close = () => {
    ref.current?.close();
    if (picture?.status === "ready") URL.revokeObjectURL(picture.url);
    setPicture(null);
  };

  const open = () => {
    setPicture({ status: "drawing" });
    ref.current?.showModal();
    drawShareCard(card, location.origin)
      .then((blob) => {
        const file = new File([blob], FILE_NAME, { type: "image/png" });
        setPicture({ status: "ready", url: URL.createObjectURL(blob), file });
      })
      .catch(() => setPicture({ status: "failed" }));
  };

  const ready = picture?.status === "ready" ? picture : null;
  const canShareFile = !!ready && !!navigator.canShare?.({ files: [ready.file] });

  const share = async () => {
    if (!ready) return;
    try {
      await navigator.share({ files: [ready.file], title: "Whizard", text });
    } catch {
      // Dismissed, or the share sheet isn't available after all.
    }
  };

  const dialog = (
    <dialog
      ref={ref}
      className="share-dialog panel"
      aria-labelledby="share-title"
      onClose={() => picture && close()}
      onClick={(event) => {
        // A click on the backdrop closes it.
        if (event.target === ref.current) close();
      }}
    >
      <div className="share-head">
        <h2 className="section-title" id="share-title">
          Share your results
        </h2>
        <button className="icon-btn" aria-label="Close" onClick={close}>
          <Icon name="close" size={24} />
        </button>
      </div>
      <div className="share-preview">
        {ready ? (
          <img src={ready.url} alt="Your game results, with a QR code to play on Whizard" />
        ) : picture?.status === "failed" ? (
          <p className="error" role="alert">
            Couldn’t make the picture. Try again.
          </p>
        ) : (
          <p className="muted" role="status">
            Making your picture…
          </p>
        )}
      </div>
      <div className="share-actions">
        {canShareFile && (
          <button className="btn btn-primary" onClick={() => void share()}>
            <Icon name="share" size={20} />
            Share
          </button>
        )}
        {ready && (
          <a
            className={`btn${canShareFile ? "" : " btn-primary"}`}
            href={ready.url}
            download={FILE_NAME}
          >
            Download
          </a>
        )}
      </div>
    </dialog>
  );

  return { open, dialog };
}
