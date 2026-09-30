import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

/** Something to be sure about before it's done. */
export interface Confirmation {
  title: string;
  /** What it will mean, in a line. */
  text?: string;
  /** The button that goes ahead, such as "Quit". */
  yes: string;
  run: () => void;
}

const ConfirmContext = createContext<(ask: Confirmation) => void>(() => {});

/** Holds the one "Are you sure?" dialog for the app; {@link useConfirm} opens it from anywhere. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [asking, setAsking] = useState<Confirmation | null>(null);
  return (
    <ConfirmContext.Provider value={setAsking}>
      {children}
      {asking && <ConfirmDialog ask={asking} onClose={() => setAsking(null)} />}
    </ConfirmContext.Provider>
  );
}

/** Asks before doing something that's hard to take back; `run` happens only on a yes. */
export const useConfirm = () => useContext(ConfirmContext);

/**
 * "Are you sure?", as one of Whizard's own dialogs rather than the browser's. The browser's box
 * isn't shown everywhere (apps that embed a browser often leave it out, and it then answers "no"
 * without asking), which left the button behind it doing nothing.
 */
function ConfirmDialog({ ask, onClose }: { ask: Confirmation; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="app-dialog confirm-dialog"
      role="alertdialog"
      aria-labelledby="confirm-title"
      aria-describedby={ask.text ? "confirm-text" : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A tap on the dimmed backdrop is a no.
        if (event.target === dialog.current) onClose();
      }}
    >
      <h2 id="confirm-title" className="section-title">
        {ask.title}
      </h2>
      {ask.text && (
        <p id="confirm-text" className="muted">
          {ask.text}
        </p>
      )}
      <div className="dialog-actions">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn btn-gold"
          onClick={() => {
            onClose();
            ask.run();
          }}
        >
          {ask.yes}
        </button>
      </div>
    </dialog>
  );
}
