import {
  BANK_CHOICE_MAX,
  BANK_EXPLANATION_MAX,
  BANK_LABEL_MAX,
  BANK_NAME_MAX,
  BANK_PROMPT_MAX,
  BANK_REFERENCE_MAX,
  type BankImportRow,
  type PlayerBank,
  type PlayerBankImport,
  type PlayerBankQuestion,
} from "@whizard/protocol";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { ApiError, useAccount } from "./account";
import { createRoom } from "./api";
import {
  addQuestion,
  allBanksExportHref,
  answerBankImport,
  bankExportHref,
  bulkDeleteQuestions,
  commitBankImport,
  createBank,
  deleteBank,
  deleteQuestion,
  discardBankImport,
  editQuestion,
  fetchBank,
  fetchBankDuplicates,
  fetchBanks,
  fetchImportDraft,
  patchBankImport,
  startBankImport,
  updateBank,
  type QuestionForm,
} from "./banks";
import { linkTo, navigate, roomPath } from "./router";
import { TopLayout } from "./ui/Chrome";
import { errorText, useAction, useLoaded } from "./ui/common";
import { useConfirm } from "./ui/ConfirmDialog";
import { Loading } from "./ui/Loading";
import { Icon } from "./ui/Icon";
import { parseDocxFile, parseDocumentToCsv } from "./documentImport";
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 id="your-banks-title" className="section-title">
            Your banks
          </h2>
          {banks.data && banks.data.length > 0 && (
            <a className="btn btn-small" href={allBanksExportHref} download>
              Export all banks
            </a>
          )}
        </div>
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
  const [isPublic, setIsPublic] = useState(loaded?.isPublic ?? false);
  const [seeded, setSeeded] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const save = useAction(setSaveError);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [duplicates, setDuplicates] = useState<
    { questionId: string; prompt: string; otherBankId: string; otherBankName: string }[]
  >([]);
  const [selectedQIds, setSelectedQIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [practicing, setPracticing] = useState(false);

  const handlePractice = async () => {
    if (!loaded || loaded.questionCount === 0 || practicing) return;
    setPracticing(true);
    try {
      const count =
        loaded.questionCount >= 20
          ? 20
          : loaded.questionCount >= 15
            ? 15
            : loaded.questionCount >= 10
              ? 10
              : 5;
      const code = await createRoom(
        {
          bankId: id,
          bankName: loaded.name,
          category: "general-knowledge",
          difficulty: "easy",
          count,
        },
        "quiz",
      );
      navigate(roomPath(code));
    } catch (e) {
      setPracticing(false);
      toast.show({ title: errorText(e), status: "error" });
    }
  };

  if (loaded && !seeded) {
    setName(loaded.name);
    setExam(loaded.exam ?? "");
    setSubject(loaded.subject ?? "");
    setIsPublic(loaded.isPublic ?? false);
    setSeeded(true);
  }

  const reload = () => bank.reload();

  useEffect(() => {
    let live = true;
    fetchBankDuplicates(id)
      .then((found) => {
        if (live) setDuplicates(found);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [id, loaded?.questionCount]);

  const handleSave = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || save.busy) return;
    void save.run(async () => {
      await updateBank(id, {
        name: trimmed,
        exam: exam.trim() || null,
        subject: subject.trim() || null,
        isPublic,
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

  const toggleSelectAll = (checked: boolean) => {
    if (checked && loaded) {
      setSelectedQIds(new Set(loaded.questions.map((q) => q.id)));
    } else {
      setSelectedQIds(new Set());
    }
  };

  const toggleSelectQ = (questionId: string, checked: boolean) => {
    setSelectedQIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(questionId);
      else next.delete(questionId);
      return next;
    });
  };

  const confirmBulkDelete = () => {
    if (selectedQIds.size === 0) return;
    ask({
      title: `Delete ${selectedQIds.size} ${selectedQIds.size === 1 ? "question" : "questions"}?`,
      text: "These questions will be permanently removed from this bank.",
      yes: `Delete ${selectedQIds.size} questions`,
      run: () => {
        setBulkBusy(true);
        bulkDeleteQuestions(id, [...selectedQIds]).then(
          () => {
            setSelectedQIds(new Set());
            setBulkBusy(false);
            toast.show({ title: "Questions deleted", status: "success" });
            reload();
          },
          (e: unknown) => {
            setBulkBusy(false);
            toast.show({ title: errorText(e), status: "error" });
          },
        );
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
          <section className="bank-practice-card" aria-label="Practice">
            <div className="bank-practice-content">
              <div>
                <h2 className="section-title" style={{ margin: 0 }}>
                  Practice with this bank
                </h2>
                <p className="small muted" style={{ margin: "4px 0 0" }}>
                  {detail.questionCount === 0
                    ? "Add or import questions below to start practicing."
                    : `${detail.questionCount} ${detail.questionCount === 1 ? "question" : "questions"} ready. Practice solo or share the room code with friends.`}
                </p>
              </div>
              <div className="bank-practice-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={detail.questionCount === 0 || practicing}
                  onClick={() => void handlePractice()}
                >
                  <Icon name="play" /> Practice solo
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={detail.questionCount === 0 || practicing}
                  onClick={() => void handlePractice()}
                >
                  <Icon name="users" /> Play with friends
                </button>
              </div>
            </div>
          </section>

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
              <label
                className="form-field"
                style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(event) => setIsPublic(event.target.checked)}
                />
                <span className="small">
                  Public bank (anyone with the link can view and practice)
                </span>
              </label>
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

          {duplicates.length > 0 && (
            <details
              className="muted small"
              style={{
                padding: "10px 14px",
                background: "rgb(245 158 11 / 10%)",
                borderRadius: "var(--radius)",
                border: "1px solid rgb(245 158 11 / 30%)",
              }}
            >
              <summary style={{ cursor: "pointer", color: "#fcd34d", fontWeight: 600 }}>
                ⚠️ {duplicates.length} {duplicates.length === 1 ? "question" : "questions"} in this
                bank also exist in other banks
              </summary>
              <ul style={{ margin: "8px 0 4px", paddingLeft: 20 }}>
                {duplicates.map((d) => (
                  <li key={d.questionId}>
                    “{d.prompt}” (also in{" "}
                    <a
                      className="btn-link"
                      {...linkTo(`/banks/${encodeURIComponent(d.otherBankId)}`)}
                    >
                      {d.otherBankName}
                    </a>
                    )
                  </li>
                ))}
              </ul>
            </details>
          )}

          <section className="stack" aria-labelledby="import-export-title">
            <h2 id="import-export-title" className="section-title">
              Import &amp; export
            </h2>
            <p className="muted small">
              Take this bank out as a CSV, or bring questions in from a CSV, Word document (.docx),
              or text file. Questions, options, and answer keys are detected automatically.
            </p>
            <div className="row-actions">
              <a className="btn" href={bankExportHref(id)} download>
                Export CSV
              </a>
              {importOpen ? null : (
                <button className="btn" type="button" onClick={() => setImportOpen(true)}>
                  Import questions
                </button>
              )}
            </div>
          </section>

          {importOpen && (
            <ImportPanel
              bankId={id}
              onDone={() => {
                setImportOpen(false);
                reload();
              }}
            />
          )}

          <section className="stack" aria-labelledby="questions-title">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <h2 id="questions-title" className="section-title">
                Questions ({detail.questions.length})
              </h2>
              {detail.questions.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <label
                    className="small muted"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={
                        selectedQIds.size > 0 && selectedQIds.size === detail.questions.length
                      }
                      onChange={(e) => toggleSelectAll(e.target.checked)}
                    />
                    Select all
                  </label>
                  {selectedQIds.size > 0 && (
                    <button
                      className="btn btn-small danger"
                      type="button"
                      disabled={bulkBusy}
                      onClick={confirmBulkDelete}
                    >
                      Delete {selectedQIds.size} selected
                    </button>
                  )}
                </div>
              )}
            </div>
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
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                            <input
                              type="checkbox"
                              checked={selectedQIds.has(question.id)}
                              onChange={(e) => toggleSelectQ(question.id, e.target.checked)}
                              style={{ marginTop: 3 }}
                            />
                            <div>
                              <span className="person-name">
                                {question.prompt}
                                {question.source === "ai" && <span className="bank-badge">AI</span>}
                              </span>
                              <span className="muted small">Correct: {question.choices[0]}</span>
                            </div>
                          </div>
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

// The import panel -------------------------------------------------------------------------------

const CSV_TEMPLATE =
  "question,option1,option2,option3,option4,answer,explanation,reference\n" +
  '"Which planet is known as the Red Planet?","Mars","Venus","Jupiter","Mercury","Mars","Mars appears reddish due to iron oxide on its surface.",""\n' +
  '"What is the chemical symbol for water?","H2O","CO2","O2","NaCl","H2O","Water consists of two hydrogen atoms and one oxygen atom.",""\n' +
  '"What is the largest ocean on Earth?","Pacific","Atlantic","Indian","Arctic","Pacific","The Pacific Ocean is the largest and deepest ocean.",""\n';

function downloadCsvTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", "whizard-bank-template.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * A staged CSV import under review: counts at the top, the rows still needing a person below,
 * and the buttons that answer, accept or commit them. Nothing here reaches the bank until the
 * owner confirms, and the AI runs server-side in batches while this screen watches the counts.
 */
function ImportPanel({ bankId, onDone }: { bankId: string; onDone: () => void }) {
  const [draft, setDraft] = useState<PlayerBankImport | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [fileBusy, setFileBusy] = useState(false);
  const [patchBusy, setPatchBusy] = useState(false);
  const [commitBusy, setCommitBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const aiBusy = useRef(false);
  const retryAttempts = useRef(0);
  const [aiStopped, setAiStopped] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [aiTick, setAiTick] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkAnswer, setBulkAnswer] = useState(0);
  const [bulkExplanation, setBulkExplanation] = useState("");
  const toast = useToast();
  const ask = useConfirm();
  const action = useToastAction();

  // Pick up an import that was already started for this bank, so a refresh doesn't lose it.
  useEffect(() => {
    let live = true;
    fetchImportDraft(bankId).then(
      (found) => live && setDraft(found),
      (e: unknown) => live && setError(errorText(e)),
    );
    return () => {
      live = false;
    };
  }, [bankId]);

  // Ask the AI for the next batch while some rows are still waiting on an answer. The in-flight
  // call is kept in a ref, so a re-render mid-call can't start a second one.
  useEffect(() => {
    if (!draft || draft.counts.pending === 0 || aiStopped || aiBusy.current) return;
    let live = true;
    aiBusy.current = true;
    answerBankImport(bankId, draft.id).then(
      (next) => {
        aiBusy.current = false;
        retryAttempts.current = 0;
        if (!live) return;
        setDraft(next);
        setAiNote(null);
      },
      (e: unknown) => {
        aiBusy.current = false;
        if (!live) return;
        if (e instanceof ApiError && e.code === "ai_busy") {
          retryAttempts.current += 1;
          const delay = Math.min(
            30000,
            Math.round(
              4000 * Math.pow(1.5, Math.min(retryAttempts.current, 5)) + Math.random() * 3000,
            ),
          );
          setAiNote(`The answer service is busy — retrying in ${Math.round(delay / 1000)}s.`);
          window.setTimeout(() => {
            if (live) setAiTick((tick) => tick + 1);
          }, delay);
        } else {
          setAiStopped(true);
          setAiNote(errorText(e));
        }
      },
    );
    return () => {
      live = false;
    };
  }, [draft, bankId, aiStopped, aiTick]);

  const processFile = (file: File) => {
    setFileBusy(true);
    setError(null);
    const parsePromise = (async () => {
      const name = file.name.toLowerCase();
      if (name.endsWith(".docx") || name.endsWith(".doc")) return parseDocxFile(file);
      if (name.endsWith(".txt")) return parseDocumentToCsv(await file.text());
      return file.text();
    })();
    parsePromise.then(
      (csv) => {
        startBankImport(bankId, csv).then(
          (imported) => {
            setDraft(imported);
            setFileBusy(false);
            setAiStopped(false);
            setAiNote(null);
            setSelected(new Set());
            setBulkExplanation("");
          },
          (e: unknown) => {
            setFileBusy(false);
            setError(errorText(e));
          },
        );
      },
      (err: unknown) => {
        setFileBusy(false);
        setError(errorText(err));
      },
    );
  };

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) processFile(file);
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!fileBusy) setDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);
    if (fileBusy) return;
    const file = event.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const applyPatch = (patch: Parameters<typeof patchBankImport>[2]) => {
    if (!draft || patchBusy) return;
    setPatchBusy(true);
    patchBankImport(bankId, draft.id, patch).then(
      (next) => {
        setDraft(next);
        setPatchBusy(false);
        setSelected(new Set());
      },
      (e: unknown) => {
        setPatchBusy(false);
        setError(errorText(e));
      },
    );
  };

  const flagged = draft?.flagged ?? [];
  const aiFlagged = flagged.filter((row) => row.source === "ai" && row.review);

  const applyBulk = () => {
    const explanation = bulkExplanation.trim() || "Imported without an explanation.";
    applyPatch({
      set: [...selected].map((idx) => ({ idx, answerIndex: bulkAnswer, explanation })),
    });
  };

  const confirmCommit = () => {
    if (!draft) return;
    ask({
      title: "Add these questions?",
      text: `${draft.counts.total} questions go into this bank. They stay in the file’s order.`,
      yes: `Add ${draft.counts.total} questions`,
      run: () => {
        setCommitBusy(true);
        commitBankImport(bankId, draft.id).then(
          (added) => {
            toast.show({
              title: `${added} ${added === 1 ? "question" : "questions"} added`,
              status: "success",
            });
            onDone();
          },
          (e: unknown) => {
            setCommitBusy(false);
            setError(errorText(e));
          },
        );
      },
    });
  };

  const confirmDiscard = () => {
    if (!draft) return;
    ask({
      title: "Discard this import?",
      text: "The staged questions are thrown away. The bank itself isn’t touched.",
      yes: "Discard import",
      run: () => {
        void action.run(async () => {
          await discardBankImport(bankId, draft.id);
          onDone();
        });
      },
    });
  };

  if (draft === undefined) {
    return (
      <section className="stack" aria-label="Import CSV">
        <Loading />
      </section>
    );
  }

  const counts = draft?.counts;
  const answeredCount = counts ? counts.total - counts.pending : 0;
  const progressPct =
    counts && counts.total > 0 ? Math.round((answeredCount / counts.total) * 100) : 0;

  return (
    <section className="stack" aria-labelledby="import-title">
      <h3 id="import-title" className="section-title">
        Import questions
      </h3>
      <div
        className={`import-dropzone${dragging ? " dragging" : ""}`}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <label className="form-field" style={{ margin: 0 }}>
          <span className="form-label">CSV or Word document (.docx)</span>
          <input
            type="file"
            accept=".csv,.docx,.doc,.txt,text/csv,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
            onChange={handleFile}
            disabled={fileBusy}
          />
          <span className="form-hint">
            {draft
              ? "Choosing or dropping a file replaces the import you have going for this bank."
              : "Drag and drop your CSV or Word document (.docx) here, or click to choose one. Multiple-choice questions and answers are detected automatically."}
          </span>
        </label>
        <div>
          <button
            type="button"
            className="btn-link small"
            onClick={downloadCsvTemplate}
            style={{ padding: 0 }}
          >
            Download sample CSV template
          </button>
        </div>
      </div>

      {draft && counts ? (
        <>
          <div
            className="import-progress-container"
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Import progress"
          >
            <div className="import-progress-track">
              <div className="import-progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <p className="muted small" style={{ margin: 0 }}>
              {counts.pending > 0
                ? `Answering questions with AI… ${answeredCount} of ${counts.total} ready (${progressPct}%)`
                : `All ${counts.total} questions answered (100%)`}
            </p>
          </div>

          <p className="muted small" data-testid="import-counts">
            {counts.total} rows · {counts.ready} ready · {counts.withKey} from your answer key ·{" "}
            {counts.aiAnswered} from the AI · {counts.needsReview} need review
          </p>
          {aiNote && (
            <p className="muted small" role="status">
              {aiNote}
            </p>
          )}
          {draft.invalid && draft.invalid.count > 0 && (
            <details>
              <summary>
                {draft.invalid.count} {draft.invalid.count === 1 ? "row" : "rows"} couldn’t be read
              </summary>
              <ul className="people">
                {draft.invalid.notes.map((note) => (
                  <li key={note.row} className="small">
                    Line {note.row}: {note.message}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {counts.needsReview > 0 ? (
            <>
              {aiFlagged.length > 0 && (
                <button
                  className="btn"
                  type="button"
                  disabled={patchBusy}
                  onClick={() => applyPatch({ acceptAi: true })}
                >
                  Accept the AI’s {aiFlagged.length} flagged{" "}
                  {aiFlagged.length === 1 ? "answer" : "answers"}
                </button>
              )}
              <div className="form-row two">
                <Field label="Answer for the rows you tick">
                  <select
                    value={bulkAnswer}
                    onChange={(event) => setBulkAnswer(Number(event.target.value))}
                  >
                    <option value={0}>Option 1</option>
                    <option value={1}>Option 2</option>
                    <option value={2}>Option 3</option>
                    <option value={3}>Option 4</option>
                  </select>
                </Field>
                <Field label="Explanation for those rows">
                  <input
                    placeholder="Imported without an explanation."
                    maxLength={BANK_EXPLANATION_MAX}
                    value={bulkExplanation}
                    onChange={(event) => setBulkExplanation(event.target.value)}
                  />
                </Field>
              </div>
              <ul className="people">
                {flagged.map((row) => (
                  <li key={row.idx}>
                    <ImportFlaggedRow
                      row={row}
                      disabled={patchBusy}
                      selected={selected.has(row.idx)}
                      onSelected={(on) =>
                        setSelected((all) => {
                          const next = new Set(all);
                          if (on) next.add(row.idx);
                          else next.delete(row.idx);
                          return next;
                        })
                      }
                      onSave={(change) =>
                        patchBankImport(bankId, draft.id, { set: [change] }).then((next) => {
                          setDraft(next);
                          setSelected((all) => {
                            const rest = new Set(all);
                            rest.delete(change.idx);
                            return rest;
                          });
                        })
                      }
                    />
                  </li>
                ))}
              </ul>
              <div className="row-actions">
                <button
                  className="btn"
                  type="button"
                  disabled={patchBusy || selected.size === 0}
                  onClick={applyBulk}
                >
                  Set {selected.size} {selected.size === 1 ? "row" : "rows"} to that answer
                </button>
              </div>
            </>
          ) : (
            <p className="muted">Every row is ready to import.</p>
          )}

          <ErrorLine error={error} />
          <div className="row-actions">
            <button
              className="btn btn-primary"
              type="button"
              disabled={commitBusy || patchBusy || counts.pending > 0 || counts.needsReview > 0}
              onClick={confirmCommit}
            >
              {commitBusy
                ? "Adding…"
                : `Add ${counts.total} ${counts.total === 1 ? "question" : "questions"} to the bank`}
            </button>
            <button
              className="btn-link danger"
              type="button"
              disabled={commitBusy || action.busy}
              onClick={confirmDiscard}
            >
              Discard import
            </button>
          </div>
        </>
      ) : (
        <ErrorLine error={error} />
      )}
    </section>
  );
}

/** One row in the review list: the question, why it's here, and the four options to pick from. */
function ImportFlaggedRow({
  row,
  disabled,
  selected,
  onSelected,
  onSave,
}: {
  row: BankImportRow;
  disabled: boolean;
  selected: boolean;
  onSelected: (on: boolean) => void;
  onSave: (change: { idx: number; answerIndex: number; explanation: string }) => Promise<void>;
}) {
  const [answerIndex, setAnswerIndex] = useState(row.answerIndex ?? 0);
  const [explanation, setExplanation] = useState(row.explanation);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    if (busy) return;
    const clean = explanation.trim();
    if (!clean) {
      setError("Add a short explanation with the answer.");
      return;
    }
    setBusy(true);
    setError(null);
    onSave({ idx: row.idx, answerIndex, explanation: clean }).catch((e: unknown) => {
      setBusy(false);
      setError(errorText(e));
    });
  };

  return (
    <div className="bank-q">
      <label className="form-field">
        <span className="form-label">
          <input
            type="checkbox"
            checked={selected}
            disabled={disabled || busy}
            onChange={(event) => onSelected(event.target.checked)}
          />{" "}
          Line {row.row}: {row.prompt}
          {row.source === "ai" && <span className="bank-badge">AI Suggested</span>}
          {row.source === "key" && <span className="bank-badge ready">Keyed</span>}
        </span>
      </label>
      {row.review && (
        <p className="muted small" role="status">
          <span className="bank-badge warning">Needs review</span> {row.review}
        </p>
      )}
      {row.aiExplanation && <p className="muted small">AI explanation: {row.aiExplanation}</p>}
      <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
        <legend className="form-label">Correct answer</legend>
        {row.choices.map((choice, index) => (
          <label key={index} className="small">
            <input
              type="radio"
              name={`import-row-${row.idx}`}
              value={index}
              checked={answerIndex === index}
              disabled={disabled || busy}
              onChange={() => setAnswerIndex(index)}
            />{" "}
            {choice}
          </label>
        ))}
      </fieldset>
      <Field label="Explanation">
        <input
          maxLength={BANK_EXPLANATION_MAX}
          value={explanation}
          disabled={disabled || busy}
          onChange={(event) => {
            setExplanation(event.target.value);
            setError(null);
          }}
        />
      </Field>
      <ErrorLine error={error} />
      <div className="row-actions">
        <button className="btn btn-small" type="button" disabled={disabled || busy} onClick={save}>
          {busy ? "Saving…" : "Save answer"}
        </button>
      </div>
    </div>
  );
}
