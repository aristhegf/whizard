import { createContext, useContext, useState, type ReactNode } from "react";
import { HorizontalAlert } from "@/components/styled-alert";

/** Something to be sure about before it's done. */
export interface Confirmation {
  title: string;
  /** What it will mean, in a line. */
  text?: string;
  /** The button that goes ahead, such as "Quit". */
  yes: string;
  /**
   * A second, bigger thing that can be done instead, shown beside Cancel — the host
   * ending a game for everyone where everyone else is only offered quitting alone.
   */
  alt?: { label: string; run: () => void };
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
 * without asking), which left the button behind it doing nothing. Every confirmation on the site
 * comes through here, so they all share one look: the horizontal panel from `styled-alert`.
 */
function ConfirmDialog({ ask, onClose }: { ask: Confirmation; onClose: () => void }) {
  return (
    <HorizontalAlert
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={ask.title}
      description={ask.text ?? ""}
      confirmLabel={ask.yes}
      altLabel={ask.alt?.label}
      onAlt={ask.alt ? () => ask.alt!.run() : undefined}
      onConfirm={ask.run}
    />
  );
}
