import {
  PAYMENT_METHODS,
  PRO_DURATIONS,
  PRO_MONTHLY_PRICE,
  type AdminPayments,
  type PaymentMethod,
} from "@whizard/protocol";
import { useState } from "react";
import { endPro, fetchAdminPayments, giveProFree, recordPayment } from "../api";
import { formatNumber } from "../format";
import { Avatar } from "../ui/Avatar";
import { useLoaded } from "../ui/common";
import { KpiTiles, PanelHead } from "./parts";

const naira = (amount: number) => `₦${formatNumber(amount)}`;

const METHODS: Record<PaymentMethod, string> = {
  transfer: "Bank transfer",
  cash: "Cash",
  other: "Other",
};

const durationName = (months: number) =>
  months === 0 ? "No end" : months === 1 ? "1 month" : `${months} months`;

const day = (at: number) =>
  new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** `/admin/payments`: Pro members, and payments recorded by hand until checkout exists. */
export function Payments() {
  const { data, error, reload } = useLoaded(fetchAdminPayments);
  if (error && !data) {
    return (
      <p className="error" role="alert">
        Couldn’t load payments. {error}
      </p>
    );
  }
  const t = data?.totals;
  return (
    <div className={data ? "admin-grid" : "admin-grid loading"}>
      <KpiTiles
        tiles={[
          {
            tone: "purple",
            icon: "crown",
            label: "Pro Members",
            value: t ? formatNumber(t.members) : "–",
            note: "with Pro right now",
          },
          {
            tone: "green",
            icon: "wallet",
            label: "Last 30 Days",
            value: t ? naira(t.last30) : "–",
            note: "payments recorded",
          },
          {
            tone: "blue",
            icon: "chart",
            label: "All Time",
            value: t ? naira(t.allTime) : "–",
            note: "payments recorded",
          },
          {
            tone: "orange",
            icon: "clock",
            label: "Ending Soon",
            value: t ? formatNumber(t.endingSoon) : "–",
            note: "Pro ends within 7 days",
          },
        ]}
      />

      <section className="panel admin-panel span-8" aria-labelledby="payments-title">
        <PanelHead
          id="payments-title"
          icon="wallet"
          title="Payments"
          subtitle="Newest first. No card checkout is connected yet, so payments are recorded here."
        />
        {data && data.payments.length === 0 && <p className="admin-empty">No payments yet.</p>}
        <ul className="payment-list">
          {(data?.payments ?? []).map((p) => (
            <li key={p.id} className="payment-row">
              <span className="name-text">
                <strong>@{p.username}</strong>
                <span>
                  {METHODS[p.method]} · {durationName(p.months)}
                  {p.note && ` · ${p.note}`}
                </span>
              </span>
              <strong className="payment-amount">{naira(p.amount)}</strong>
              <span className="room-age">
                {day(p.paidAt)}
                <br />
                {p.recordedBy ? `by @${p.recordedBy}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div className="span-4 editor-side">
        <RecordPayment onDone={reload} />
        <GivePro onDone={reload} />
      </div>

      <Members data={data} onChange={reload} />
    </div>
  );
}

function RecordPayment({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState("");
  const [months, setMonths] = useState(1);
  const [amount, setAmount] = useState(String(PRO_MONTHLY_PRICE));
  const [method, setMethod] = useState<PaymentMethod>("transfer");
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setProblem(null);
    setSaved(null);
    try {
      await recordPayment({
        username: username.trim().replace(/^@/, ""),
        amount: Number(amount.replace(/[^0-9]/g, "")),
        months,
        method,
        note: note.trim() || null,
      });
      setSaved(
        `Recorded. @${username.trim().replace(/^@/, "")} has Pro for ${durationName(months)} more.`,
      );
      setUsername("");
      setNote("");
      onDone();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Couldn’t record that.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel admin-panel" aria-labelledby="record-title">
      <PanelHead id="record-title" icon="plus" title="Record a Payment" />
      <form
        className="question-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="form-field">
          <span className="form-label">Username</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <div className="form-row two">
          <label className="form-field">
            <span className="form-label">Pro for</span>
            <select
              value={months}
              onChange={(e) => {
                const next = Number(e.target.value);
                setMonths(next);
                setAmount(String(next * PRO_MONTHLY_PRICE));
              }}
            >
              {PRO_DURATIONS.filter((m) => m > 0).map((m) => (
                <option key={m} value={m}>
                  {durationName(m)}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span className="form-label">Amount (₦)</span>
            <input
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </label>
        </div>
        <label className="form-field">
          <span className="form-label">Paid by</span>
          <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {METHODS[m]}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span className="form-label">Note (optional)</span>
          <input
            value={note}
            maxLength={120}
            placeholder="e.g. transfer reference"
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        {problem && (
          <p className="error small" role="alert">
            {problem}
          </p>
        )}
        {saved && (
          <p className="form-saved small" role="status">
            {saved}
          </p>
        )}
        <div className="form-actions">
          <button className="btn btn-small btn-primary" disabled={busy}>
            Record payment
          </button>
        </div>
      </form>
    </section>
  );
}

function GivePro({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState("");
  const [months, setMonths] = useState(1);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const submit = async () => {
    setProblem(null);
    setSaved(null);
    const name = username.trim().replace(/^@/, "");
    try {
      await giveProFree(name, months);
      setSaved(`@${name} has Pro for free: ${durationName(months).toLowerCase()}.`);
      setUsername("");
      onDone();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Couldn’t give Pro.");
    }
  };
  return (
    <section className="panel admin-panel" aria-labelledby="give-title">
      <PanelHead id="give-title" icon="crown" title="Give Pro for Free" />
      <form
        className="question-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="form-row two">
          <label className="form-field">
            <span className="form-label">Username</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} required />
          </label>
          <label className="form-field">
            <span className="form-label">For</span>
            <select value={months} onChange={(e) => setMonths(Number(e.target.value))}>
              {PRO_DURATIONS.map((m) => (
                <option key={m} value={m}>
                  {durationName(m)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {problem && (
          <p className="error small" role="alert">
            {problem}
          </p>
        )}
        {saved && (
          <p className="form-saved small" role="status">
            {saved}
          </p>
        )}
        <div className="form-actions">
          <button className="btn btn-small">Give Pro</button>
        </div>
      </form>
    </section>
  );
}

function Members({ data, onChange }: { data: AdminPayments | null; onChange: () => void }) {
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <section className="panel admin-panel span-12" aria-labelledby="members-title">
      <PanelHead
        id="members-title"
        icon="crown"
        title="Pro Members"
        subtitle="Ending soonest first. More paid time is added after what's left."
      />
      {data && data.members.length === 0 && <p className="admin-empty">Nobody has Pro yet.</p>}
      {problem && (
        <p className="error small" role="alert">
          {problem}
        </p>
      )}
      <ul className="user-list">
        {(data?.members ?? []).map((m) => (
          <li key={m.userId} className="member-row">
            <Avatar id={m.avatar} name={m.username} size={40} />
            <span className="user-name">
              <strong>{m.displayName}</strong>
              <span>@{m.username}</span>
            </span>
            <span className={`status-pill ${m.source === "paid" ? "status-kept" : "status-admin"}`}>
              {m.source === "paid" ? "Paid" : "Free"}
            </span>
            <span className="room-age">
              since {day(m.since)}
              <br />
              {m.until === null ? "no end" : `until ${day(m.until)} (${timeUntil(m.until)})`}
            </span>
            <button
              className="btn btn-small btn-danger"
              onClick={() =>
                void endPro(m.userId).then(onChange, (e: unknown) =>
                  setProblem(e instanceof Error ? e.message : "Couldn’t end Pro."),
                )
              }
            >
              End Pro
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function timeUntil(at: number): string {
  const days = Math.ceil((at - Date.now()) / (24 * 60 * 60 * 1000));
  return days <= 1 ? "a day left" : `${days} days left`;
}
