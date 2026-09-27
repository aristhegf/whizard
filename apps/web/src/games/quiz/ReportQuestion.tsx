import { REPORT_REASONS, type ReportReason } from "@whizard/protocol";
import { useId, useState, type FormEvent } from "react";
import { reportQuestion } from "../../api";

/** A small "Report" link under a reviewed question, opening a choice of reasons. */
export function ReportQuestion({ questionId }: { questionId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const name = useId();

  if (state === "sent") {
    return (
      <p className="report-done" role="status">
        Thanks for the report. We’ll check this question.
      </p>
    );
  }
  if (!open) {
    return (
      <button className="btn-link report-link" onClick={() => setOpen(true)}>
        Report this question
      </button>
    );
  }

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!reason) return;
    setState("sending");
    try {
      await reportQuestion(questionId, reason);
      setState("sent");
    } catch {
      setState("failed");
    }
  };

  return (
    <form className="report-form" onSubmit={(event) => void send(event)}>
      <fieldset>
        <legend>What’s wrong with it?</legend>
        {REPORT_REASONS.map((r) => (
          <label key={r.id} className="report-reason">
            <input
              type="radio"
              name={name}
              value={r.id}
              checked={reason === r.id}
              onChange={() => setReason(r.id)}
            />
            {r.label}
          </label>
        ))}
      </fieldset>
      {state === "failed" && (
        <p className="error" role="alert">
          Couldn’t send the report. Check your connection and try again.
        </p>
      )}
      <div className="report-actions">
        <button className="btn btn-small" type="submit" disabled={!reason || state === "sending"}>
          {state === "sending" ? "Sending…" : "Send report"}
        </button>
        <button className="btn-link" type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
