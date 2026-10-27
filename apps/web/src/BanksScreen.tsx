import {
  BANK_CHOICE_MAX,
  BANK_EXPLANATION_MAX,
  BANK_LABEL_MAX,
  BANK_NAME_MAX,
  BANK_PROMPT_MAX,
  BANK_REFERENCE_MAX,
  type AccountUser,
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
  fetchPublicBanks,
  forkBank,
  patchBankImport,
  startBankImport,
  updateBank,
  type QuestionForm,
} from "./banks";
import { linkTo, navigate, roomPath } from "./router";
import { createGroupAssignment, fetchGroups } from "./social";
import { getBankMistakes } from "./storage";
import { CbtExamScreen } from "./games/quiz/CbtExamScreen";
import { TopLayout } from "./ui/Chrome";
import { errorText, useAction, useLoaded } from "./ui/common";
import { useConfirm } from "./ui/ConfirmDialog";
import { Loading } from "./ui/Loading";
import { Icon } from "./ui/Icon";
import { Avatar } from "./ui/Avatar";
import { parseDocxFile, parseDocumentToCsv } from "./documentImport";
import { useToast, useToastAction } from "./ui/toast";

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
  const mistakes = getBankMistakes(bank.id);
  return (
    <li>
      <a className="person bank-link" {...linkTo(`/banks/${encodeURIComponent(bank.id)}`)}>
        <span className="person-name">
          {bank.name}
          {bank.isPublic && <span className="bank-badge ready">Public</span>}
        </span>
        <span className="muted small">
          {labels && `${labels} · `}
          {bank.questionCount} {bank.questionCount === 1 ? "question" : "questions"}
          {mistakes.length > 0 && ` · ⚠️ ${mistakes.length} to review`}
        </span>
      </a>
    </li>
  );
}

const EXAM_PRESETS = ["JAMB", "WAEC", "NECO", "GMAT", "ICAN"] as const;

function CommunityBankRow({
  bank,
  onFork,
  busyFork,
}: {
  bank: PlayerBank;
  onFork: () => void;
  busyFork: boolean;
}) {
  const labels = [bank.exam, bank.subject].filter(Boolean).join(" · ");
  const owner =
    bank.ownerDisplayName || (bank.ownerUsername ? `@${bank.ownerUsername}` : "Creator");

  return (
    <li>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
        <Avatar
          id={bank.ownerAvatar}
          name={bank.ownerDisplayName || bank.ownerUsername || "Owner"}
          size={38}
        />
        <a
          className="person bank-link"
          style={{ flex: 1, minWidth: 0 }}
          {...linkTo(`/banks/${encodeURIComponent(bank.id)}`)}
        >
          <span className="person-name">{bank.name}</span>
          <span className="muted small">
            by {owner} · {bank.questionCount} {bank.questionCount === 1 ? "question" : "questions"}
            {labels && ` · ${labels}`}
          </span>
        </a>
      </div>
      <div className="row-actions">
        <button
          type="button"
          className="btn btn-small"
          disabled={busyFork}
          onClick={(e) => {
            e.preventDefault();
            onFork();
          }}
          title="Clone to your collection"
        >
          <Icon name="copy" /> {busyFork ? "Cloning…" : "Clone"}
        </button>
        <a
          className="btn btn-small btn-primary"
          {...linkTo(`/banks/${encodeURIComponent(bank.id)}`)}
          title="Practice with this bank"
        >
          <Icon name="play" />
        </a>
      </div>
    </li>
  );
}

function CommunityBanksList({ accountUser }: { accountUser: AccountUser | null }) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [exam, setExam] = useState("");
  const [busyForkId, setBusyForkId] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(
    () =>
      fetchPublicBanks({
        search: debouncedSearch.trim() || undefined,
        exam: exam || undefined,
      }),
    [debouncedSearch, exam],
  );

  const publicBanks = useLoaded(load);
  const banks = publicBanks.data;
  const loading = banks === null && !publicBanks.error;

  const handleFork = async (bank: PlayerBank) => {
    if (!accountUser) {
      navigate(`/account?next=${encodeURIComponent("/banks?tab=community")}`);
      return;
    }
    if (busyForkId) return;
    setBusyForkId(bank.id);
    try {
      const forked = await forkBank(bank.id);
      toast.show({
        title: `Cloned "${forked.name}" to your collection!`,
        status: "success",
      });
      navigate(`/banks/${encodeURIComponent(forked.id)}`);
    } catch (e) {
      setBusyForkId(null);
      toast.show({ title: errorText(e), status: "error" });
    }
  };

  return (
    <section className="stack" aria-label="Community question banks">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ position: "relative" }}>
          <input
            style={{ width: "100%", paddingLeft: 38 }}
            placeholder="Search community banks by title, exam, or subject…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--muted)",
              pointerEvents: "none",
              display: "flex",
              alignItems: "center",
            }}
          >
            <Icon name="search" />
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <span className="small muted">Exam:</span>
          <button
            type="button"
            className={`btn btn-small ${!exam ? "btn-primary" : ""}`}
            style={{ padding: "4px 10px", fontSize: "0.8rem", minHeight: 28 }}
            onClick={() => setExam("")}
          >
            All
          </button>
          {EXAM_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className={`btn btn-small ${exam === preset ? "btn-primary" : ""}`}
              style={{ padding: "4px 10px", fontSize: "0.8rem", minHeight: 28 }}
              onClick={() => setExam(exam === preset ? "" : preset)}
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      <ErrorLine error={publicBanks.error} />

      {loading ? (
        <Loading />
      ) : banks && banks.length === 0 ? (
        <div style={{ textAlign: "center", padding: "32px 16px" }}>
          <p className="muted">
            {search || exam
              ? "No community question banks found matching your search."
              : 'No public question banks published yet. Be the first to share one by checking "Public bank" in your bank details!'}
          </p>
        </div>
      ) : (
        <ul className="people">
          {banks?.map((bank) => (
            <CommunityBankRow
              key={bank.id}
              bank={bank}
              onFork={() => void handleFork(bank)}
              busyFork={busyForkId === bank.id}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

// The list ----------------------------------------------------------------------------------------

/** `/banks`: personal question banks, plus discovery of community banks. */
export function BanksScreen() {
  const account = useAccount();
  const [tab, setTab] = useState<"mine" | "community">(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("tab") === "community") return "community";
    }
    return "mine";
  });

  return (
    <TopLayout active={null} className="account-page" column>
      <div className="screen">
        <header>
          <h1 className="page-title">Question banks</h1>
          <p className="page-sub">
            Create your own study banks, or explore and clone public community banks.
          </p>
        </header>

        <div
          className="segmented"
          role="group"
          aria-label="Question bank view"
          style={{ margin: "16px 0 24px" }}
        >
          <button type="button" aria-pressed={tab === "mine"} onClick={() => setTab("mine")}>
            My banks
          </button>
          <button
            type="button"
            aria-pressed={tab === "community"}
            onClick={() => setTab("community")}
          >
            Community
          </button>
        </div>

        {tab === "mine" ? (
          account.status === "loading" ? (
            <Loading />
          ) : account.user ? (
            <BankList />
          ) : (
            <div className="stack" style={{ textAlign: "center", padding: "32px 16px" }}>
              <h2 className="section-title">Build your own banks</h2>
              <p className="muted" style={{ maxWidth: 440, margin: "0 auto 16px" }}>
                Sign in with a fast passkey to build, import, and manage your personal question
                banks for solo practice and multiplayer rooms.
              </p>
              <a
                className="btn btn-primary"
                style={{ margin: "0 auto" }}
                {...linkTo("/account?next=/banks")}
              >
                Sign in or create an account
              </a>
            </div>
          )
        ) : (
          <CommunityBanksList accountUser={account.status === "ready" ? account.user : null} />
        )}
      </div>
    </TopLayout>
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
    <>
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
    </>
  );
}

// The bank ----------------------------------------------------------------------------------------

/** `/banks/:id`: one bank, its questions, and the forms that change them. */
export function BankScreen({ id }: { id: string }) {
  const account = useAccount();
  if (account.status === "loading") {
    return (
      <TopLayout active={null} className="account-page" column>
        <Loading />
      </TopLayout>
    );
  }
  return (
    <TopLayout active={null} className="account-page" column>
      <BankDetail id={id} accountUser={account.user} />
    </TopLayout>
  );
}

/** `/banks/:id/exam`: timed exam simulation mode (CBT practice) for a question bank. */
export function BankExamScreen({ id }: { id: string }) {
  const load = useCallback(() => fetchBank(id), [id]);
  const bank = useLoaded(load);

  if (bank.error) {
    return (
      <TopLayout active={null} className="account-page" column>
        <div className="screen">
          <a className="btn-link" {...linkTo(`/banks/${encodeURIComponent(id)}`)}>
            ← Back to bank
          </a>
          <h1 className="page-title">Exam simulation</h1>
          <p className="page-sub">Could not load this question bank for exam simulation.</p>
          <ErrorLine error={bank.error} />
        </div>
      </TopLayout>
    );
  }

  if (!bank.data) {
    return (
      <TopLayout active={null} className="account-page" column>
        <Loading />
      </TopLayout>
    );
  }

  return (
    <CbtExamScreen bank={bank.data} onExit={() => navigate(`/banks/${encodeURIComponent(id)}`)} />
  );
}

function BankDetail({ id, accountUser }: { id: string; accountUser: AccountUser | null }) {
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
  const [forking, setForking] = useState(false);

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

  const handleFork = async () => {
    if (!accountUser) {
      navigate(`/account?next=${encodeURIComponent(`/banks/${encodeURIComponent(id)}`)}`);
      return;
    }
    if (forking) return;
    setForking(true);
    try {
      const forked = await forkBank(id);
      toast.show({
        title: `Cloned "${forked.name}" to your collection!`,
        status: "success",
      });
      navigate(`/banks/${encodeURIComponent(forked.id)}`);
    } catch (e) {
      setForking(false);
      toast.show({ title: errorText(e), status: "error" });
    }
  };

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignGroupId, setAssignGroupId] = useState("");
  const [assignTargetScore, setAssignTargetScore] = useState("");
  const [assignDueDate, setAssignDueDate] = useState("");
  const [assignNotes, setAssignNotes] = useState("");
  const [assigning, setAssigning] = useState(false);
  const myGroups = useLoaded(fetchGroups);

  const handleAssignToGroup = async (event: FormEvent) => {
    event.preventDefault();
    if (!assignGroupId) {
      toast.show({ title: "Please select a group.", status: "error" });
      return;
    }
    setAssigning(true);
    try {
      const parsedTarget = assignTargetScore ? parseInt(assignTargetScore, 10) : null;
      const parsedDue = assignDueDate ? new Date(`${assignDueDate}T23:59:59`).getTime() : null;
      await createGroupAssignment(assignGroupId, {
        bankId: id,
        targetScore: parsedTarget && !isNaN(parsedTarget) ? parsedTarget : null,
        dueAt: parsedDue && !isNaN(parsedDue) ? parsedDue : null,
        notes: assignNotes.trim() || null,
      });
      setShowAssignModal(false);
      setAssigning(false);
      setAssignGroupId("");
      setAssignTargetScore("");
      setAssignDueDate("");
      setAssignNotes("");
      toast.show({ title: "Assigned bank to group!", status: "success" });
    } catch (e) {
      setAssigning(false);
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
    if (loaded && loaded.isOwner !== false) {
      fetchBankDuplicates(id)
        .then((found) => {
          if (live) setDuplicates(found);
        })
        .catch(() => {});
    }
    return () => {
      live = false;
    };
  }, [id, loaded]);

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

  if (bank.error && !accountUser) {
    return (
      <div className="screen">
        <header>
          <h1 className="page-title">Question bank</h1>
          <p className="page-sub">
            This question bank is private or does not exist. Sign in to access your personal banks.
          </p>
        </header>
        <a
          className="btn btn-primary btn-block"
          {...linkTo(`/account?next=${encodeURIComponent(`/banks/${encodeURIComponent(id)}`)}`)}
        >
          Sign in or create an account
        </a>
      </div>
    );
  }

  const isOwner = detail?.isOwner !== false;

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
          {!isOwner && (
            <div
              className="community-banner"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 12,
                padding: "14px 18px",
                background: "var(--panel)",
                border: "1.5px solid var(--line)",
                borderRadius: "var(--radius)",
                marginBottom: 20,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Avatar
                  id={detail.ownerAvatar}
                  name={detail.ownerDisplayName || detail.ownerUsername || "Creator"}
                  size={38}
                />
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 800 }}>
                      {detail.ownerDisplayName ||
                        (detail.ownerUsername ? `@${detail.ownerUsername}` : "Creator")}
                    </span>
                    <span className="bank-badge ready">Public Bank</span>
                    {detail.exam && <span className="bank-badge">{detail.exam}</span>}
                    {detail.subject && <span className="bank-badge">{detail.subject}</span>}
                  </div>
                  <span className="muted small">
                    Community question bank shared with all Whizard players
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={forking}
                onClick={() => void handleFork()}
              >
                <Icon name="copy" /> {forking ? "Cloning…" : "Clone to my collection"}
              </button>
            </div>
          )}

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
                {getBankMistakes(id).length > 0 && (
                  <p
                    className="small"
                    style={{ margin: "4px 0 0", color: "#ff9aaa", fontWeight: 700 }}
                  >
                    ⚠️ {getBankMistakes(id).length}{" "}
                    {getBankMistakes(id).length === 1 ? "question" : "questions"} marked for mistake
                    review from recent solo practice.
                  </p>
                )}
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
                  className="btn btn-cbt"
                  disabled={detail.questionCount === 0}
                  onClick={() => navigate(`/banks/${encodeURIComponent(id)}/exam`)}
                >
                  <Icon name="clock" /> Timed CBT Exam
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={detail.questionCount === 0 || practicing}
                  onClick={() => void handlePractice()}
                >
                  <Icon name="users" /> Play with friends
                </button>
                {accountUser && (
                  <button
                    type="button"
                    className="btn"
                    disabled={detail.questionCount === 0}
                    onClick={() => setShowAssignModal(true)}
                  >
                    <Icon name="link" /> Assign to Study Group
                  </button>
                )}
              </div>
            </div>
          </section>

          {showAssignModal && (
            <section
              className="stack"
              aria-label="Assign to Study Group"
              style={{ border: "2px solid #8b5cf6" }}
            >
              <div
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
              >
                <h2 className="section-title" style={{ margin: 0 }}>
                  Assign to Study Group
                </h2>
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => setShowAssignModal(false)}
                >
                  Cancel
                </button>
              </div>
              <form onSubmit={handleAssignToGroup} className="question-form">
                <div className="setting">
                  <label className="setting-name" htmlFor="select-group">
                    Group
                  </label>
                  <select
                    id="select-group"
                    required
                    value={assignGroupId}
                    onChange={(e) => setAssignGroupId(e.target.value)}
                  >
                    <option value="">Select study group…</option>
                    {myGroups.data?.groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({g.members.length} members)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="setting">
                  <label className="setting-name" htmlFor="target-score">
                    Target score (%)
                  </label>
                  <input
                    id="target-score"
                    type="number"
                    min="1"
                    max="100"
                    placeholder="e.g. 80"
                    value={assignTargetScore}
                    onChange={(e) => setAssignTargetScore(e.target.value)}
                  />
                </div>
                <div className="setting">
                  <label className="setting-name" htmlFor="due-date">
                    Due date
                  </label>
                  <input
                    id="due-date"
                    type="date"
                    value={assignDueDate}
                    onChange={(e) => setAssignDueDate(e.target.value)}
                  />
                </div>
                <div className="setting">
                  <label className="setting-name" htmlFor="assign-notes">
                    Notes
                  </label>
                  <textarea
                    id="assign-notes"
                    maxLength={300}
                    rows={2}
                    placeholder="Instructions for students (e.g. Complete before Thursday class)"
                    value={assignNotes}
                    onChange={(e) => setAssignNotes(e.target.value)}
                  />
                </div>
                <div className="link-row" style={{ marginTop: 14 }}>
                  <button type="submit" className="btn btn-primary" disabled={assigning}>
                    {assigning ? "Assigning…" : "Assign bank to group"}
                  </button>
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => setShowAssignModal(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </section>
          )}

          {isOwner ? (
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
                      className="btn"
                      type="button"
                      disabled={forking}
                      onClick={() => void handleFork()}
                      title="Make an independent copy of this bank"
                    >
                      <Icon name="copy" /> {forking ? "Duplicating…" : "Duplicate bank"}
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
                    ⚠️ {duplicates.length} {duplicates.length === 1 ? "question" : "questions"} in
                    this bank also exist in other banks
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
                  Take this bank out as a CSV, or bring questions in from a CSV, Word document
                  (.docx), or text file. Questions, options, and answer keys are detected
                  automatically.
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
                                    {question.source === "ai" && (
                                      <span className="bank-badge">AI</span>
                                    )}
                                  </span>
                                  <span className="muted small">
                                    Correct: {question.choices[0]}
                                  </span>
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
          ) : (
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
                <button
                  type="button"
                  className="btn btn-small"
                  disabled={forking}
                  onClick={() => void handleFork()}
                >
                  <Icon name="copy" /> {forking ? "Cloning…" : "Clone bank"}
                </button>
              </div>
              {detail.questions.length === 0 ? (
                <p className="muted">This bank has no questions yet.</p>
              ) : (
                <ul className="people">
                  {detail.questions.map((question, idx) => (
                    <li key={question.id} style={{ alignItems: "flex-start", padding: "14px 0" }}>
                      <div className="bank-q" style={{ gap: 6 }}>
                        <span className="person-name" style={{ fontSize: "1rem" }}>
                          {idx + 1}. {question.prompt}
                          {question.source === "ai" && <span className="bank-badge">AI</span>}
                        </span>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 4,
                            marginTop: 4,
                          }}
                        >
                          {question.choices.map((choice, cIdx) => (
                            <div
                              key={cIdx}
                              className="small"
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                color: cIdx === 0 ? "#34d399" : "var(--muted)",
                                fontWeight: cIdx === 0 ? 700 : 400,
                              }}
                            >
                              <span
                                style={{
                                  display: "inline-grid",
                                  placeItems: "center",
                                  width: 20,
                                  height: 20,
                                  borderRadius: "50%",
                                  fontSize: "0.75rem",
                                  background: cIdx === 0 ? "rgb(16 185 129 / 20%)" : "var(--field)",
                                  border: `1px solid ${cIdx === 0 ? "#10b981" : "var(--line)"}`,
                                  color: cIdx === 0 ? "#34d399" : "inherit",
                                  flexShrink: 0,
                                }}
                              >
                                {String.fromCharCode(65 + cIdx)}
                              </span>
                              <span>{choice}</span>
                              {cIdx === 0 && (
                                <span className="bank-badge ready" style={{ marginLeft: 4 }}>
                                  Correct
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                        {question.explanation && (
                          <p
                            className="muted small"
                            style={{ margin: "6px 0 0", fontStyle: "italic" }}
                          >
                            💡 {question.explanation}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {detail.questions.length > 5 && (
                <div style={{ marginTop: 16, textAlign: "center" }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={forking}
                    onClick={() => void handleFork()}
                  >
                    <Icon name="copy" /> {forking ? "Cloning…" : "Clone to my collection"}
                  </button>
                </div>
              )}
            </section>
          )}
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
  const account = useAccount();
  const isPro = account.status === "ready" && Boolean(account.user?.isPro);
  const [showProModal, setShowProModal] = useState(false);
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
    if (!isPro) {
      setShowProModal(true);
      return;
    }
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
            if (e instanceof ApiError && e.code === "pro_required") {
              setShowProModal(true);
            } else {
              setError(errorText(e));
            }
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
      <h3
        id="import-title"
        className="section-title"
        style={{ display: "flex", alignItems: "center", gap: 8 }}
      >
        Import questions
        {!isPro && (
          <span className="plan-badge" style={{ fontSize: "0.75rem", padding: "2px 8px" }}>
            <Icon name="crown" size={14} fill /> Pro
          </span>
        )}
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
      {showProModal && (
        <div
          className="dialog-backdrop"
          onClick={() => setShowProModal(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 16,
          }}
        >
          <div
            className="dialog panel"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 460, width: "100%", padding: 24, textAlign: "center" }}
          >
            <div
              style={{
                display: "inline-flex",
                padding: 12,
                borderRadius: "50%",
                background: "rgb(255 215 0 / 15%)",
                color: "var(--gold)",
                marginBottom: 12,
              }}
            >
              <Icon name="crown" size={32} fill />
            </div>
            <h3 style={{ margin: "0 0 8px" }}>Word & CSV Import is a Pro Feature</h3>
            <p className="muted" style={{ margin: "0 0 16px", fontSize: "0.95rem" }}>
              Upgrade to Whizard Pro to automatically extract questions from Word documents (.docx,
              .doc, .txt) and CSV files.
            </p>
            <p className="small muted" style={{ margin: "0 0 20px" }}>
              Free accounts can author unlimited questions manually in your banks.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <a className="btn btn-gold btn-block" {...linkTo("/pricing")}>
                View Pro Plans (₦5,000 / $5 / mo)
              </a>
              <button
                type="button"
                className="btn btn-block"
                onClick={() => setShowProModal(false)}
              >
                Continue Authoring Manually
              </button>
            </div>
          </div>
        </div>
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
