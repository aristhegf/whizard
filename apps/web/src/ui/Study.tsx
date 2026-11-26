import type { FormEvent, ReactNode } from "react";
import { linkTo } from "../router";
import { Icon } from "./Icon";

/**
 * The small parts the study pages (banks, the exam, study groups, the dashboard) share, in the
 * night and purple look of the games. Their styles are in styles/study.css.
 */

/** "‹ Banks": the way back, at the top left. */
export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <a className="s-back" {...linkTo(to)}>
      <Icon name="chevronLeft" size={20} stroke={2.2} />
      {children}
    </a>
  );
}

/** The same, as a button, for a step inside one page (the exam's result, back to the bank). */
export function BackButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="s-back" onClick={onClick}>
      <Icon name="chevronLeft" size={20} stroke={2.2} />
      {children}
    </button>
  );
}

/** A form field with its label above it. */
export function Field({
  label,
  right = false,
  children,
}: {
  label: string;
  /** The correct answer, which wears green. */
  right?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={`s-field${right ? " right" : ""}`}>
      <span className="s-label">{label}</span>
      {children}
    </label>
  );
}

export function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p className="s-error" role="alert">
      {error}
    </p>
  ) : null;
}

/** "WAEC · Biology", leaving out what isn't there. */
export const dotted = (...parts: (string | null | undefined | false)[]) =>
  parts.filter(Boolean).join(" · ");

export const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** ✓ and ✗ before an answer, as the exam's result and a bank preview show them. */
export function Answer({
  kind,
  children,
}: {
  kind: "right" | "wrong" | "skipped";
  children: ReactNode;
}) {
  return (
    <span className={`s-answer ${kind}`}>
      {kind === "right" ? (
        <Icon name="check" size={16} stroke={2.6} />
      ) : kind === "wrong" ? (
        <Icon name="close" size={16} stroke={2.6} />
      ) : null}
      <span>
        <span className="sr-only">
          {kind === "right" ? "Right answer: " : kind === "wrong" ? "Your answer: " : ""}
        </span>
        {children}
      </span>
    </span>
  );
}

/** How many questions a room from a bank asks: the most of 20, 15, 10 or 5 that it can fill. */
export const roomCount = (questions: number) =>
  questions >= 20 ? 20 : questions >= 15 ? 15 : questions >= 10 ? 10 : 5;

/** The assignment form's own fields, shared by a bank and a study group. */
export function AssignFields({
  picker,
  target,
  onTarget,
  due,
  onDue,
  notes,
  onNotes,
  error,
  busy,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  picker: ReactNode;
  target: string;
  onTarget: (value: string) => void;
  due: string;
  onDue: (value: string) => void;
  notes: string;
  onNotes: (value: string) => void;
  error: string | null;
  busy: boolean;
  submitLabel: string;
  onSubmit: (event: FormEvent) => void;
  onCancel?: () => void;
}) {
  return (
    <form className="s-form" onSubmit={onSubmit}>
      {picker}
      <div className="s-pair">
        <Field label="Target score (%)">
          <input
            type="number"
            inputMode="numeric"
            min="1"
            max="100"
            placeholder="e.g. 80"
            value={target}
            onChange={(event) => onTarget(event.target.value)}
          />
        </Field>
        <Field label="Due date">
          <input type="date" value={due} onChange={(event) => onDue(event.target.value)} />
        </Field>
      </div>
      <Field label="Tutor notes">
        <textarea
          rows={2}
          maxLength={300}
          placeholder="e.g. Finish before Thursday’s class"
          value={notes}
          onChange={(event) => onNotes(event.target.value)}
        />
      </Field>
      <ErrorLine error={error} />
      <button type="submit" className="s-btn gold big block" disabled={busy}>
        {busy ? "Assigning…" : submitLabel}
      </button>
      {onCancel && (
        <button type="button" className="s-link" onClick={onCancel}>
          Cancel
        </button>
      )}
    </form>
  );
}
