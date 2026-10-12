import {
  BANK_CHOICE_MAX,
  BANK_EXPLANATION_MAX,
  BANK_LABEL_MAX,
  BANK_NAME_MAX,
  BANK_PROMPT_MAX,
  BANK_REFERENCE_MAX,
  type PlayerBank,
  type PlayerBankQuestion,
} from "@whizard/protocol";
import { useCallback, useState, type FormEvent, type ReactNode } from "react";
import { useAccount } from "./account";
import {
  addQuestion,
  createBank,
  deleteBank,
  deleteQuestion,
  editQuestion,
  fetchBank,
  fetchBanks,
  updateBank,
  type QuestionForm,
} from "./banks";
import { linkTo, navigate } from "./router";
import { TopLayout } from "./ui/Chrome";
import { errorText, useAction, useLoaded } from "./ui/common";
import { useConfirm } from "./ui/ConfirmDialog";
import { Loading } from "./ui/Loading";
import { useToast, useToastAction } from "./ui/toast";

/** Wraps a screen that needs an account, offering sign-in first. */
function SignedInOnly({
  title,
  next,
  message,
  children,
}: {
  title: string;
  next: string;
  message: string;
  children: () => ReactNode;
}) {
  const account = useAccount();
  return (
    <TopLayout active={null} className="account-page" column>
      {account.status === "loading" ? (
        <Loading />
      ) : account.user ? (
        children()
      ) : (
        <div className="screen">
          <header>
            <h1 className="page-title">{title}</h1>
            <p className="page-sub">{message}</p>
          </header>
          <a
            className="btn btn-primary btn-block"
            {...linkTo(`/account?next=${encodeURIComponent(next)}`)}
          >
            Sign in or create an account
          </a>
        </div>
      )}
    </TopLayout>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p className="error small" role="alert">
      {error}
    </p>
  ) : null;
}

/** A labelled form field, as the admin question form has it. */
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="form-field">
      <span className="form-label">{label}</span>
      {children}
      {hint && <span className="form-hint">{hint}</span>}
    </label>
  );
}

/** One bank as the list shows it: its name, labels and question count. */
function BankRow({ bank }: { bank: PlayerBank }) {
  const labels = [bank.exam, bank.subject].filter(Boolean).join(" · ");
  return (
    <li>
      <a className="person bank-link" {...linkTo(`/banks/${encodeURIComponent(bank.id)}`)}>
        <span className="person-name">{bank.name}</span>
        <span className="muted small">
          {labels && `${labels} · `}
          {bank.questionCount} {bank.questionCount === 1 ? "question" : "questions"}
        </span>
      </a>
    </li>
  );
}

// The list ----------------------------------------------------------------------------------------

/** `/banks`: every bank the player owns, with a form to make another. */
export function BanksScreen() {
  return (
    <SignedInOnly
      title="Question banks"
      next="/banks"
      message="Sign in to build your own question banks."
    >
      {() => <BankList />}
    </SignedInOnly>
  );
}

function BankList() {
  const banks = useLoaded(fetchBanks);
  const [name, setName] = useState("");
  const [exam, setExam] = useState("");
  const [subject, setSubject] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const create = useAction(setCreateError);

  const handleCreate = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || create.busy) return;
    void create.run(async () => {
      const bank = await createBank({
        name: trimmed,
        exam: exam.trim() || null,
        subject: subject.trim() || null,
      });
      navigate(`/banks/${encodeURIComponent(bank.id)}`);
    });
  };

  return (
    <div className="screen">
      <h1 className="page-title">Question banks</h1>

      <section className="stack" aria-label="New bank">
        <h2 className="section-title">Start a bank</h2>
        <form className="question-form" onSubmit={handleCreate}>
          <Field label="Name" hint="What are these questions for?">
            <input
              autoFocus
              placeholder="e.g. Biology jumpstart"
              maxLength={BANK_NAME_MAX}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setCreateError(null);
              }}
            />
          </Field>
          <div className="form-row two">
            <Field label="Exam" hint="Optional">
              <input
                placeholder="e.g. WAEC"
                maxLength={BANK_LABEL_MAX}
                value={exam}
                onChange={(event) => setExam(event.target.value)}
              />
            </Field>
            <Field label="Subject" hint="Optional">
              <input
                placeholder="e.g. Biology"
                maxLength={BANK_LABEL_MAX}
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
              />
            </Field>
          </div>
          <ErrorLine error={createError} />
          <button className="btn btn-primary" type="submit" disabled={create.busy || !name.trim()}>
            {create.busy ? "Creating…" : "Create a bank"}
          </button>
        </form>
      </section>

      <ErrorLine error={banks.error} />

      <section className="stack" aria-labelledby="your-banks-title">
        <h2 id="your-banks-title" className="section-title">
          Your banks
        </h2>
        {banks.data === null ? (
          banks.error ? null : (
            <Loading />
          )
        ) : banks.data.length === 0 ? (
          <p className="muted">No banks yet. Make one above.</p>
        ) : (
          <ul className="people">
            {banks.data.map((bank) => (
              <BankRow key={bank.id} bank={bank} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// The bank ----------------------------------------------------------------------------------------

/** `/banks/:id`: one bank, its questions, and the forms that change them. */
export function BankScreen({ id }: { id: string }) {
  return (
    <SignedInOnly
      title="Question banks"
      next={`/banks/${encodeURIComponent(id)}`}
      message="Sign in to see your question banks."
    >
      {() => <BankDetail id={id} />}
    </SignedInOnly>
  );
}

function BankDetail({ id }: { id: string }) {
  const load = useCallback(() => fetchBank(id), [id]);
  const bank = useLoaded(load);
  const toast = useToast();
  const action = useToastAction();
  const ask = useConfirm();

  // The details form starts from the bank as it loads, then follows the person's typing.
  const loaded = bank.data;
  const [name, setName] = useState(loaded?.name ?? "");
  const [exam, setExam] = useState(loaded?.exam ?? "");
  const [subject, setSubject] = useState(loaded?.subject ?? "");
  const [seeded, setSeeded] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const save = useAction(setSaveError);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  if (loaded && !seeded) {
    setName(loaded.name);
    setExam(loaded.exam ?? "");
    setSubject(loaded.subject ?? "");
    setSeeded(true);
  }

  const reload = () => bank.reload();

  const handleSave = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || save.busy) return;
    void save.run(async () => {
      await updateBank(id, {
        name: trimmed,
        exam: exam.trim() || null,
        subject: subject.trim() || null,
      });
      toast.show({ title: "Bank saved", status: "success" });
      reload();
    });
  };

  const confirmDeleteBank = () => {
    ask({
      title: "Delete this bank?",
      text: "Its questions go too. This can’t be undone.",
      yes: "Delete bank",
      run: () => {
        void action.run(async () => {
          await deleteBank(id);
          navigate("/banks");
        });
      },
    });
  };

  const handleAdd = (input: QuestionForm) =>
    addQuestion(id, input).then(() => {
      setAdding(false);
      reload();
    });

  const handleEdit = (questionId: string, input: QuestionForm) =>
    editQuestion(id, questionId, input).then(() => {
      setEditingId(null);
      reload();
    });

  const confirmDeleteQuestion = (question: PlayerBankQuestion) => {
    ask({
      title: "Delete this question?",
      text: question.prompt,
      yes: "Delete question",
      run: () => {
        void action.run(() => deleteQuestion(id, question.id).then(reload));
      },
    });
  };

  const detail = bank.data;

  return (
    <div className="screen">
      <a className="btn-link" {...linkTo("/banks")}>
        ← All banks
      </a>
      <h1 className="page-title">{detail?.name ?? "Question bank"}</h1>

      <ErrorLine error={bank.error} />

      {!detail ? (
        bank.error ? null : (
          <Loading />
        )
      ) : (
        <>
          <section className="stack" aria-label="Bank details">
            <h2 className="section-title">Bank details</h2>
            <form className="question-form" onSubmit={handleSave}>
              <Field label="Name">
                <input
                  maxLength={BANK_NAME_MAX}
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setSaveError(null);
                  }}
                />
              </Field>
              <div className="form-row two">
                <Field label="Exam" hint="Optional">
                  <input
                    maxLength={BANK_LABEL_MAX}
                    value={exam}
                    onChange={(event) => setExam(event.target.value)}
                  />
                </Field>
                <Field label="Subject" hint="Optional">
                  <input
                    maxLength={BANK_LABEL_MAX}
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                  />
                </Field>
              </div>
              <ErrorLine error={saveError} />
              <div className="row-actions">
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={save.busy || !name.trim()}
                >
                  {save.busy ? "Saving…" : "Save"}
                </button>
                <button
                  className="btn-link danger"
                  type="button"
                  disabled={action.busy}
                  onClick={confirmDeleteBank}
                >
                  Delete bank
                </button>
              </div>
            </form>
          </section>

          <section className="stack" aria-labelledby="questions-title">
            <h2 id="questions-title" className="section-title">
              Questions ({detail.questions.length})
            </h2>
            {detail.questions.length === 0 && !adding && (
              <p className="muted">No questions yet. Add the first one.</p>
            )}
            {detail.questions.length > 0 && (
              <ul className="people">
                {detail.questions.map((question) => (
                  <li key={question.id}>
                    {editingId === question.id ? (
                      <div className="bank-q">
                        <QuestionFields
                          initial={question}
                          submitLabel="Save question"
                          onSubmit={(input) => handleEdit(question.id, input)}
                          onCancel={() => setEditingId(null)}
                        />
                      </div>
                    ) : (
                      <>
                        <div className="person bank-q">
                          <span className="person-name">{question.prompt}</span>
                          <span className="muted small">Correct: {question.choices[0]}</span>
                        </div>
                        <div className="row-actions">
                          <button
                            className="btn btn-small"
                            disabled={action.busy}
                            onClick={() => setEditingId(question.id)}
                          >
                            Edit
                          </button>
                          <button
                            className="btn-link"
                            disabled={action.busy}
                            onClick={() => confirmDeleteQuestion(question)}
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {adding ? (
              <QuestionFields
                submitLabel="Add question"
                onSubmit={handleAdd}
                onCancel={() => setAdding(false)}
              />
            ) : (
              <button className="btn" type="button" onClick={() => setAdding(true)}>
                Add a question
              </button>
            )}
          </section>
        </>
      )}
    </div>
  );
}

// The question form -------------------------------------------------------------------------------

/**
 * One question, as the server accepts it: four answers, the first correct — the shipped bank's
 * shape, until gate G1 widens it. It keeps its own busy and error state, so it can sit in the
 * list beside the bank's other forms.
 */
function QuestionFields({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: PlayerBankQuestion;
  submitLabel: string;
  onSubmit: (input: QuestionForm) => Promise<void>;
  onCancel: () => void;
}) {
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [choices, setChoices] = useState<string[]>(initial?.choices ?? ["", "", "", ""]);
  const [explanation, setExplanation] = useState(initial?.explanation ?? "");
  const [reference, setReference] = useState(initial?.reference ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handle = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!prompt.trim() || choices.some((choice) => !choice.trim()) || !explanation.trim()) {
      setError("Fill in the question, all four answers and the explanation.");
      return;
    }
    setBusy(true);
    setError(null);
    onSubmit({
      prompt: prompt.trim(),
      choices: choices.map((choice) => choice.trim()),
      explanation: explanation.trim(),
      reference: reference.trim() || null,
    }).catch((e: unknown) => {
      setBusy(false);
      setError(errorText(e));
    });
  };

  const setChoice = (index: number, value: string) =>
    setChoices((all) => all.map((choice, i) => (i === index ? value : choice)));

  return (
    <form className="question-form" onSubmit={handle}>
      <Field label="Question">
        <input
          placeholder="e.g. Which planet is known as the Red Planet?"
          maxLength={BANK_PROMPT_MAX}
          value={prompt}
          onChange={(event) => {
            setPrompt(event.target.value);
            setError(null);
          }}
        />
      </Field>

      <div className="form-row two">
        {choices.map((choice, index) => (
          <Field
            key={index}
            label={index === 0 ? "Correct answer" : `Wrong answer ${index}`}
            hint={index === 0 ? "The first answer is the right one." : undefined}
          >
            <input
              maxLength={BANK_CHOICE_MAX}
              value={choice}
              onChange={(event) => setChoice(index, event.target.value)}
            />
          </Field>
        ))}
      </div>

      <Field label="Explanation">
        <input
          placeholder="Why that’s the answer"
          maxLength={BANK_EXPLANATION_MAX}
          value={explanation}
          onChange={(event) => {
            setExplanation(event.target.value);
            setError(null);
          }}
        />
      </Field>

      <Field label="Reference" hint="Optional — e.g. John 3:16">
        <input
          maxLength={BANK_REFERENCE_MAX}
          value={reference}
          onChange={(event) => setReference(event.target.value)}
        />
      </Field>

      <ErrorLine error={error} />
      <div className="row-actions">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </button>
        <button
          className="btn-link"
          type="button"
          disabled={busy}
          onClick={() => {
            setError(null);
            onCancel();
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
