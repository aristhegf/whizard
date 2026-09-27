import { QUIZ_CATEGORIES } from "@whizard/game-core";
import {
  REPORT_REASONS,
  type ReportAction,
  type ReportedQuestion,
  type ReportStatus,
} from "@whizard/protocol";
import { useEffect, useState } from "react";
import { decideReport, fetchAdminReports } from "../api";
import { timeAgo } from "../format";
import { useLoaded } from "../ui/common";

const STATUS: Record<ReportStatus, { label: string; hint: string }> = {
  open: { label: "In play", hint: "Fewer than 3 reports so far." },
  out: { label: "Out of play", hint: "3 people reported it, so it's left out of new games." },
  kept: { label: "Kept", hint: "Checked and kept as it is." },
  retired: { label: "Retired", hint: "Taken out of play by an admin." },
};

const reasonLabel = (id: string) => REPORT_REASONS.find((r) => r.id === id)?.label ?? id;
const topicName = (id: string) => QUIZ_CATEGORIES.find((c) => c.id === id)?.name ?? id;

type Filter = "check" | "decided" | "all";

/** Reported questions, with keep, retire and reopen. Only the current wording is listed. */
export function Reports({ onOpenReports }: { onOpenReports: (count: number) => void }) {
  const { data, error, reload } = useLoaded(fetchAdminReports);
  const [filter, setFilter] = useState<Filter>("check");
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const toCheck = (q: ReportedQuestion) => q.status === "open" || q.status === "out";
  useEffect(() => {
    if (data) onOpenReports(data.filter(toCheck).length);
  }, [data, onOpenReports]);

  const act = async (questionId: string, action: ReportAction) => {
    setBusy(questionId);
    setFailed(null);
    try {
      await decideReport(questionId, action);
      reload();
    } catch {
      setFailed(questionId);
    } finally {
      setBusy(null);
    }
  };

  const shown = (data ?? []).filter((q) =>
    filter === "all" ? true : filter === "check" ? toCheck(q) : !toCheck(q),
  );

  return (
    <section className="panel admin-panel reports" aria-label="Reported questions">
      <div className="admin-panel-head">
        <h2>Reported questions</h2>
        <div className="range-switch admin-switch" role="group" aria-label="Show">
          {(
            [
              ["check", "To check"],
              ["decided", "Decided"],
              ["all", "All"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className="admin-note">
        Three reports take a question out of new games straight away. Keep puts it back as it is;
        retire takes it out for good. Editing a question in the bank gives it a clean slate.
      </p>

      {error && !data && (
        <p className="error" role="alert">
          Couldn’t load the reports. {error}
        </p>
      )}
      {data && shown.length === 0 && (
        <p className="admin-empty">
          {filter === "check" ? "Nothing to check. Nice." : "No reported questions here."}
        </p>
      )}

      <ul className="report-list">
        {shown.map((q) => (
          <li key={q.questionId} className="report-item">
            <div className="report-main">
              <p className="report-meta">
                <span className="pill">{topicName(q.category)}</span>
                <span className="pill">{q.difficulty}</span>
                <span className="dim">
                  {q.questionId} · last reported {timeAgo(q.lastReportedAt)}
                </span>
              </p>
              <p className="report-prompt">{q.prompt}</p>
              <p className="report-answer">✓ {q.answer}</p>
              <p className="report-reasons">
                {Object.entries(q.reasons).map(([reason, count]) => (
                  <span key={reason} className="reason-chip">
                    {reasonLabel(reason)} ×{count}
                  </span>
                ))}
              </p>
            </div>
            <div className="report-side">
              <span className={`status-pill status-${q.status}`} title={STATUS[q.status].hint}>
                {STATUS[q.status].label}
              </span>
              <span className="report-count">
                {q.reports} {q.reports === 1 ? "report" : "reports"}
              </span>
              <div className="report-actions">
                {q.status === "kept" || q.status === "retired" ? (
                  <button
                    className="btn btn-small"
                    disabled={busy === q.questionId}
                    onClick={() => void act(q.questionId, "reopen")}
                  >
                    Reopen
                  </button>
                ) : (
                  <>
                    <button
                      className="btn btn-small"
                      disabled={busy === q.questionId}
                      onClick={() => void act(q.questionId, "keep")}
                    >
                      Keep
                    </button>
                    <button
                      className="btn btn-small btn-danger"
                      disabled={busy === q.questionId}
                      onClick={() => void act(q.questionId, "retire")}
                    >
                      Retire
                    </button>
                  </>
                )}
              </div>
              {failed === q.questionId && (
                <p className="error small" role="alert">
                  Couldn’t save that. Try again.
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
