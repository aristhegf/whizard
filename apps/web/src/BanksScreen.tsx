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
  type PlayerBankDetail,
  type PlayerBankImport,
  type PlayerBankQuestion,
} from "@whizard/protocol";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type MouseEvent,
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
import { linkTo, navigate, roomPath, useSearchParam } from "./router";
import { createGroupAssignment, fetchGroups } from "./social";
import { getBankMistakes } from "./storage";
import { CbtExamScreen } from "./games/quiz/CbtExamScreen";
import { BottomSheet } from "./ui/BottomSheet";
import { TopLayout } from "./ui/Chrome";
import { errorText, useAction, useLoaded } from "./ui/common";
import { useConfirm } from "./ui/ConfirmDialog";
import { Loading } from "./ui/Loading";
import { Icon } from "./ui/Icon";
import {
  AssignFields,
  Answer,
  BackLink,
  ErrorLine,
  Field,
  dotted,
  plural,
  roomCount,
} from "./ui/Study";
import { parseDocxFile, parseDocumentToCsv } from "./documentImport";
import { useToast, useToastAction } from "./ui/toast";

const bankPath = (id: string) => `/banks/${encodeURIComponent(id)}`;

const EXAM_PRESETS = ["JAMB", "WAEC", "NECO", "GMAT", "ICAN"] as const;

/** "by Ada", for a bank someone else made. */
const ownerName = (bank: PlayerBank) =>
  bank.ownerDisplayName || (bank.ownerUsername ? `@${bank.ownerUsername}` : "its creator");

/** One bank in a list: its name, its labels under it, its question count on the right. */
function BankRow({ bank, community = false }: { bank: PlayerBank; community?: boolean }) {
  const mistakes = community ? 0 : getBankMistakes(bank.id).length;
  const sub = dotted(
    community && `by ${ownerName(bank)}`,
    bank.exam,
    bank.subject,
    !community && bank.isPublic && "Public",
    mistakes > 0 && `${mistakes} to review`,
  );
  return (
    <li>
      <a className="s-row" {...linkTo(bankPath(bank.id))}>
        <span className="s-row-main">
          <span className="s-row-name">{bank.name}</span>
          {sub && <span className="s-row-sub">{sub}</span>}
        </span>
        <span className="s-row-count">
          {bank.questionCount}
          <span className="sr-only"> {bank.questionCount === 1 ? "question" : "questions"}</span>
        </span>
      </a>
    </li>
  );
}

// The list ----------------------------------------------------------------------------------------

/** `/banks`: your question banks, and the community's. `?new=1` makes a new one. */
export function BanksScreen() {
  const account = useAccount();
  const making = useSearchParam("new") === "1";
  const importAfter = useSearchParam("import") === "1";
  const [tab, setTab] = useState<"mine" | "community">(() =>
    new URLSearchParams(location.search).get("tab") === "community" ? "community" : "mine",
  );
  const user = account.status === "ready" ? account.user : null;

  if (making && user) {
    return (
      <TopLayout active={null} className="study-page" column>
        <NewBank importAfter={importAfter} />
      </TopLayout>
    );
  }

  return (
    <TopLayout active={null} className="study-page" column>
      <div className="study">
        <div className="study-head">
          <h1 className="study-title">Question banks</h1>
          {user && (
            <a className="s-btn gold" {...linkTo("/banks?new=1")}>
              <Icon name="plus" size={18} stroke={2.4} />
              New bank
            </a>
          )}
        </div>

        <div className="s-seg" role="group" aria-label="Which banks">
          <button type="button" aria-pressed={tab === "mine"} onClick={() => setTab("mine")}>
            Mine
          </button>
          <button
            type="button"
            aria-pressed={tab === "community"}
            onClick={() => setTab("community")}
          >
            Community
          </button>
        </div>

        {tab === "community" ? (
          <CommunityBanks />
        ) : account.status === "loading" ? (
          <Loading />
        ) : user ? (
          <MyBanks />
        ) : (
          <>
            <p className="study-note">Sign in to make banks of your own.</p>
            <a className="s-btn gold big block" {...linkTo("/account?next=/banks")}>
              Sign in or create an account
            </a>
          </>
        )}
      </div>
    </TopLayout>
  );
}

function MyBanks() {
  const banks = useLoaded(fetchBanks);
  return (
    <>
      <ErrorLine error={banks.error} />
      {banks.data === null ? (
        banks.error ? null : (
          <Loading />
        )
      ) : banks.data.length === 0 ? (
        <p className="s-empty">No banks yet.</p>
      ) : (
        <ul className="s-list" aria-label="Your banks">
          {banks.data.map((bank) => (
            <BankRow key={bank.id} bank={bank} />
          ))}
        </ul>
      )}
      <div className="s-actions">
        <a className="s-link" {...linkTo("/banks?new=1&import=1")}>
          <Icon name="upload" size={18} />
          Import a Word, CSV or text file
        </a>
        {banks.data && banks.data.length > 0 && (
          <a className="s-link" href={allBanksExportHref} download>
            Export all as CSV
          </a>
        )}
      </div>
    </>
  );
}

function CommunityBanks() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [exam, setExam] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(
    () => fetchPublicBanks({ search: debounced.trim() || undefined, exam: exam || undefined }),
    [debounced, exam],
  );
  const banks = useLoaded(load);

  return (
    <>
      <label className="s-search">
        <span className="sr-only">Search community banks</span>
        <Icon name="search" size={18} />
        <input
          type="search"
          placeholder="Search by name, exam or subject"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      <div className="s-chips" role="group" aria-label="Exam">
        {["", ...EXAM_PRESETS].map((preset) => (
          <button
            key={preset || "all"}
            type="button"
            className="s-chip"
            aria-pressed={exam === preset}
            onClick={() => setExam(preset)}
          >
            {preset || "All"}
          </button>
        ))}
      </div>
      <ErrorLine error={banks.error} />
      {banks.data === null ? (
        banks.error ? null : (
          <Loading />
        )
      ) : banks.data.length === 0 ? (
        <p className="s-empty">
          {search || exam ? "No public banks match." : "No public banks yet."}
        </p>
      ) : (
        <ul className="s-list" aria-label="Community banks">
          {banks.data.map((bank) => (
            <BankRow key={bank.id} bank={bank} community />
          ))}
        </ul>
      )}
    </>
  );
}

/** `/banks?new=1`: a name and two labels, then the bank (or its import, from the import link). */
function NewBank({ importAfter }: { importAfter: boolean }) {
  const [name, setName] = useState("");
  const [exam, setExam] = useState("");
  const [subject, setSubject] = useState("");
  const [error, setError] = useState<string | null>(null);
  const create = useAction(setError);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || create.busy) return;
    void create.run(async () => {
      const bank = await createBank({
        name: trimmed,
        exam: exam.trim() || null,
        subject: subject.trim() || null,
      });
      navigate(`${bankPath(bank.id)}${importAfter ? "?view=import" : ""}`, { replace: true });
    });
  };

  return (
    <div className="study">
      <div className="study-top">
        <BackLink to="/banks">Banks</BackLink>
      </div>
      <h1 className="study-title">{importAfter ? "Import into a new bank" : "New bank"}</h1>
      <form className="s-form" onSubmit={submit}>
        <Field label="Name">
          <input
            autoFocus
            required
            placeholder="e.g. Biology jumpstart"
            maxLength={BANK_NAME_MAX}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
          />
        </Field>
        <div className="s-pair">
          <Field label="Exam">
            <input
              placeholder="e.g. WAEC"
              maxLength={BANK_LABEL_MAX}
              value={exam}
              onChange={(event) => setExam(event.target.value)}
            />
          </Field>
          <Field label="Subject">
            <input
              placeholder="e.g. Biology"
              maxLength={BANK_LABEL_MAX}
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            />
          </Field>
        </div>
        <ErrorLine error={error} />
        <button
          className="s-btn gold big block"
          type="submit"
          disabled={create.busy || !name.trim()}
        >
          {create.busy ? "Creating…" : importAfter ? "Create and import" : "Create bank"}
        </button>
      </form>
    </div>
  );
}

// The bank ----------------------------------------------------------------------------------------

/**
 * `/banks/:id`: one bank. Its own focused views sit on the same address: `?q=new` or `?q=<id>`
 * edits a question, `?view=details` the bank's name and labels, `?view=import` brings a file in
 * and `?view=assign` sets it for a study group.
 */
export function BankScreen({ id }: { id: string }) {
  const account = useAccount();
  return (
    <TopLayout active={null} className="study-page" column>
      {account.status === "loading" ? (
        <Loading />
      ) : (
        <BankDetail id={id} accountUser={account.user} />
      )}
    </TopLayout>
  );
}

/** `/banks/:id/exam`: the timed exam (CBT practice) for a bank. */
export function BankExamScreen({ id }: { id: string }) {
  const load = useCallback(() => fetchBank(id), [id]);
  const bank = useLoaded(load);

  if (!bank.data) {
    return (
      <TopLayout active={null} className="study-page" column>
        {bank.error ? (
          <div className="study">
            <div className="study-top">
              <BackLink to={bankPath(id)}>Bank</BackLink>
            </div>
            <h1 className="study-title">Timed exam</h1>
            <ErrorLine error={bank.error} />
          </div>
        ) : (
          <Loading />
        )}
      </TopLayout>
    );
  }

  return <CbtExamScreen bank={bank.data} onExit={() => navigate(bankPath(id))} />;
}

/**
 * Set when the bank opens one of its own views, so leaving the view can step back through the
 * browser's history rather than piling up a second copy of the bank behind it.
 */
let openedFromBank = false;

function BankDetail({ id, accountUser }: { id: string; accountUser: AccountUser | null }) {
  const load = useCallback(() => fetchBank(id), [id]);
  const bank = useLoaded(load);
  const q = useSearchParam("q");
  const view = useSearchParam("view");

  const open = (search: string) => {
    openedFromBank = true;
    navigate(`${bankPath(id)}${search}`);
  };
  const leave = () => {
    bank.reload();
    if (openedFromBank) {
      openedFromBank = false;
      history.back();
    } else {
      navigate(bankPath(id), { replace: true });
    }
  };

  const detail = bank.data;

  if (!detail) {
    if (!bank.error) return <Loading />;
    return (
      <div className="study">
        <div className="study-top">
          <BackLink to="/banks">Banks</BackLink>
        </div>
        <h1 className="study-title">Question bank</h1>
        {accountUser ? (
          <ErrorLine error={bank.error} />
        ) : (
          <>
            <p className="study-note">This bank is private. Sign in if it’s yours.</p>
            <a
              className="s-btn gold big block"
              {...linkTo(`/account?next=${encodeURIComponent(bankPath(id))}`)}
            >
              Sign in or create an account
            </a>
          </>
        )}
      </div>
    );
  }

  const isOwner = detail.isOwner !== false;
  const back = (
    <div className="study-top">
      <a
        className="s-back"
        href={bankPath(id)}
        onClick={(event: MouseEvent) => {
          event.preventDefault();
          leave();
        }}
      >
        <Icon name="chevronLeft" size={20} stroke={2.2} />
        {detail.name}
      </a>
    </div>
  );

  if (isOwner && q) {
    return <QuestionView bank={detail} questionId={q} back={back} onLeave={leave} />;
  }
  if (isOwner && view === "details") {
    return <DetailsView bank={detail} back={back} onLeave={leave} />;
  }
  if (isOwner && view === "import") {
    return (
      <div className="study">
        {back}
        <ImportHeading />
        <ImportPanel bankId={id} onDone={leave} />
      </div>
    );
  }
  if (accountUser && view === "assign") {
    return <AssignView bank={detail} back={back} onLeave={leave} />;
  }
  return (
    <BankHome
      bank={detail}
      isOwner={isOwner}
      signedIn={Boolean(accountUser)}
      onOpen={open}
      onChanged={() => bank.reload()}
    />
  );
}

function BankHome({
  bank,
  isOwner,
  signedIn,
  onOpen,
  onChanged,
}: {
  bank: PlayerBankDetail;
  isOwner: boolean;
  signedIn: boolean;
  onOpen: (search: string) => void;
  onChanged: () => void;
}) {
  const id = bank.id;
  const toast = useToast();
  const action = useToastAction();
  const ask = useConfirm();
  const [practising, setPractising] = useState(false);
  const [forking, setForking] = useState(false);
  const [sheet, setSheet] = useState(false);
  /** What to do once the sheet has slid away, so a dialog never opens under it. */
  const afterSheet = useRef<(() => void) | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [duplicates, setDuplicates] = useState<
    { questionId: string; prompt: string; otherBankId: string; otherBankName: string }[]
  >([]);

  useEffect(() => {
    let live = true;
    if (isOwner) {
      fetchBankDuplicates(id).then(
        (found) => live && setDuplicates(found),
        () => {},
      );
    }
    return () => {
      live = false;
    };
  }, [id, isOwner, bank]);

  const count = bank.questions.length;
  const mistakes = getBankMistakes(id).length;

  // Solo practice and playing with friends both open a quiz room from the bank: alone, you play
  // solo from its lobby; with friends, you share its code.
  const practise = async () => {
    if (count === 0 || practising) return;
    setPractising(true);
    try {
      const code = await createRoom(
        {
          bankId: id,
          bankName: bank.name,
          category: "general-knowledge",
          difficulty: "easy",
          count: roomCount(bank.questionCount),
        },
        "quiz",
      );
      navigate(roomPath(code));
    } catch (e) {
      setPractising(false);
      toast.show({ title: errorText(e), status: "error" });
    }
  };

  const fork = async () => {
    if (!signedIn) {
      navigate(`/account?next=${encodeURIComponent(bankPath(id))}`);
      return;
    }
    if (forking) return;
    setForking(true);
    try {
      const forked = await forkBank(id);
      toast.show({ title: `Copied as “${forked.name}”`, status: "success" });
      navigate(bankPath(forked.id));
    } catch (e) {
      setForking(false);
      toast.show({ title: errorText(e), status: "error" });
    }
  };

  const togglePublic = () =>
    void action.run(async () => {
      await updateBank(id, { isPublic: !bank.isPublic });
      toast.show({
        title: bank.isPublic ? "Only you can see this bank now" : "Anyone can find this bank now",
        status: "success",
      });
      onChanged();
    });

  const confirmDeleteBank = () =>
    ask({
      title: "Delete this bank?",
      text: "Its questions go too. This can’t be undone.",
      yes: "Delete bank",
      tone: "danger",
      run: () => {
        void action.run(async () => {
          await deleteBank(id);
          navigate("/banks");
        });
      },
    });

  const confirmBulkDelete = () => {
    if (selected.size === 0) return;
    const n = plural(selected.size, "question");
    ask({
      title: `Delete ${n}?`,
      text: "They’re gone for good.",
      yes: `Delete ${n}`,
      tone: "danger",
      run: () => {
        setBulkBusy(true);
        bulkDeleteQuestions(id, [...selected]).then(
          () => {
            setSelected(new Set());
            setSelecting(false);
            setBulkBusy(false);
            toast.show({ title: "Questions deleted", status: "success" });
            onChanged();
          },
          (e: unknown) => {
            setBulkBusy(false);
            toast.show({ title: errorText(e), status: "error" });
          },
        );
      },
    });
  };

  /** A choice in the ⋯ sheet: it slides away, then the choice happens. */
  const choose = (close: () => void, then: () => void) => () => {
    afterSheet.current = then;
    close();
  };

  return (
    <div className="study">
      <div className="study-top">
        <BackLink to="/banks">Banks</BackLink>
        {isOwner && (
          <button
            type="button"
            className="s-icon-btn"
            aria-label="More"
            aria-haspopup="dialog"
            onClick={() => setSheet(true)}
          >
            <Icon name="more" size={22} />
          </button>
        )}
      </div>

      <div>
        <h1 className="study-title">{bank.name}</h1>
        <p className="study-meta">
          {dotted(
            !isOwner && `by ${ownerName(bank)}`,
            bank.exam,
            bank.subject,
            plural(count, "question"),
            mistakes > 0 && `${mistakes} to review`,
          )}
        </p>
      </div>

      <div className="s-play">
        <button
          type="button"
          className="s-btn gold big"
          disabled={count === 0 || practising}
          onClick={() => void practise()}
        >
          <Icon name="play" size={20} fill />
          Practise
        </button>
        <button
          type="button"
          className="s-btn"
          disabled={count === 0}
          onClick={() => navigate(`${bankPath(id)}/exam`)}
        >
          <Icon name="clock" size={18} />
          Timed exam
        </button>
        <button
          type="button"
          className="s-btn"
          disabled={count === 0 || practising}
          onClick={() => void practise()}
        >
          <Icon name="users" size={18} />
          With friends
        </button>
      </div>

      {!isOwner && (
        <button
          type="button"
          className="s-link"
          disabled={forking}
          onClick={() => void fork()}
          style={{ alignSelf: "flex-start" }}
        >
          <Icon name="copy" size={18} />
          {forking ? "Copying…" : "Copy to my banks"}
        </button>
      )}

      <div className="study-section-head">
        <h2 className="study-h2" id="questions-title">
          Questions
        </h2>
        {isOwner &&
          (selecting ? (
            <button
              type="button"
              className="s-link"
              onClick={() => {
                setSelecting(false);
                setSelected(new Set());
              }}
            >
              Done
            </button>
          ) : (
            <button
              type="button"
              className="s-link gold"
              aria-label="Add a question"
              onClick={() => onOpen("?q=new")}
            >
              Add
            </button>
          ))}
      </div>

      {count === 0 ? (
        <div>
          <p className="s-empty">No questions yet.</p>
          {isOwner && (
            <button type="button" className="s-link" onClick={() => onOpen("?view=import")}>
              <Icon name="upload" size={18} />
              Import a Word, CSV or text file
            </button>
          )}
        </div>
      ) : !isOwner ? (
        <ol className="s-list" aria-labelledby="questions-title">
          {bank.questions.map((question, index) => (
            <li key={question.id} className="s-card">
              <span className="s-row s-q" style={{ padding: 0, background: "none" }}>
                <span className="s-q-num">{index + 1}</span>
                <span className="s-q-text">{question.prompt}</span>
              </span>
              <span className="s-indent">
                <Answer kind="right">{question.choices[0]}</Answer>
              </span>
            </li>
          ))}
        </ol>
      ) : selecting ? (
        <>
          <label className="s-check">
            <input
              type="checkbox"
              checked={selected.size === count}
              onChange={(event) =>
                setSelected(
                  event.target.checked ? new Set(bank.questions.map((x) => x.id)) : new Set(),
                )
              }
            />
            Select all
          </label>
          <ol className="s-list" aria-labelledby="questions-title">
            {bank.questions.map((question, index) => (
              <li key={question.id}>
                <label className="s-row s-q">
                  <input
                    type="checkbox"
                    checked={selected.has(question.id)}
                    onChange={(event) =>
                      setSelected((all) => {
                        const next = new Set(all);
                        if (event.target.checked) next.add(question.id);
                        else next.delete(question.id);
                        return next;
                      })
                    }
                  />
                  <span className="s-q-num" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span className="s-q-text">{question.prompt}</span>
                </label>
              </li>
            ))}
          </ol>
          <button
            type="button"
            className="s-btn bad block"
            disabled={bulkBusy || selected.size === 0}
            onClick={confirmBulkDelete}
          >
            {selected.size === 0
              ? "Delete questions"
              : `Delete ${plural(selected.size, "question")}`}
          </button>
        </>
      ) : (
        <ol className="s-list" aria-labelledby="questions-title">
          {bank.questions.map((question, index) => (
            <li key={question.id}>
              <a
                className="s-row s-q"
                href={`${bankPath(id)}?q=${encodeURIComponent(question.id)}`}
                onClick={(event) => {
                  if (event.metaKey || event.ctrlKey) return;
                  event.preventDefault();
                  onOpen(`?q=${encodeURIComponent(question.id)}`);
                }}
              >
                <span className="s-q-num" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="s-q-text">
                  {question.prompt}
                  {question.source === "ai" && <span className="s-tag">AI</span>}
                </span>
              </a>
            </li>
          ))}
        </ol>
      )}

      {duplicates.length > 0 && (
        <details className="s-dupes">
          <summary className="s-link">
            {plural(duplicates.length, "question")} also in your other banks
          </summary>
          <ul className="s-list">
            {duplicates.map((d) => (
              <li key={`${d.questionId}-${d.otherBankId}`} className="s-card">
                <span>{d.prompt}</span>
                <a className="s-row-sub" {...linkTo(bankPath(d.otherBankId))}>
                  Also in {d.otherBankName}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}

      {sheet && (
        <BottomSheet
          labelledBy="bank-sheet-title"
          className="s-sheet"
          onClose={() => {
            setSheet(false);
            const then = afterSheet.current;
            afterSheet.current = null;
            then?.();
          }}
          header={() => (
            <h2 id="bank-sheet-title" className="s-sheet-title">
              {bank.name}
            </h2>
          )}
        >
          {(close) => (
            <div className="s-sheet-list">
              <button
                type="button"
                className="s-sheet-item"
                onClick={choose(close, () => onOpen("?view=details"))}
              >
                Edit details
              </button>
              <button
                type="button"
                className="s-sheet-item"
                onClick={choose(close, () => onOpen("?view=import"))}
              >
                Import questions
              </button>
              {count > 0 && (
                <button
                  type="button"
                  className="s-sheet-item"
                  onClick={choose(close, () => setSelecting(true))}
                >
                  Select questions
                </button>
              )}
              {count > 0 && (
                <button
                  type="button"
                  className="s-sheet-item"
                  onClick={choose(close, () => onOpen("?view=assign"))}
                >
                  Assign to a study group
                </button>
              )}
              <a className="s-sheet-item" href={bankExportHref(id)} download onClick={close}>
                Export CSV
              </a>
              <button
                type="button"
                className="s-sheet-item"
                disabled={action.busy}
                onClick={choose(close, togglePublic)}
              >
                {bank.isPublic ? "Make private" : "Make public"}
              </button>
              <button
                type="button"
                className="s-sheet-item"
                disabled={forking}
                onClick={choose(close, () => void fork())}
              >
                Duplicate
              </button>
              <button
                type="button"
                className="s-sheet-item bad"
                disabled={action.busy}
                onClick={choose(close, confirmDeleteBank)}
              >
                Delete bank
              </button>
            </div>
          )}
        </BottomSheet>
      )}
    </div>
  );
}

/** `?view=details`: the bank's name and labels, on their own. */
function DetailsView({
  bank,
  back,
  onLeave,
}: {
  bank: PlayerBankDetail;
  back: ReactNode;
  onLeave: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(bank.name);
  const [exam, setExam] = useState(bank.exam ?? "");
  const [subject, setSubject] = useState(bank.subject ?? "");
  const [error, setError] = useState<string | null>(null);
  const save = useAction(setError);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || save.busy) return;
    void save.run(async () => {
      await updateBank(bank.id, {
        name: trimmed,
        exam: exam.trim() || null,
        subject: subject.trim() || null,
      });
      toast.show({ title: "Bank saved", status: "success" });
      onLeave();
    });
  };

  return (
    <div className="study">
      {back}
      <h1 className="study-title">Bank details</h1>
      <form className="s-form" onSubmit={submit}>
        <Field label="Name">
          <input
            required
            maxLength={BANK_NAME_MAX}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
          />
        </Field>
        <div className="s-pair">
          <Field label="Exam">
            <input
              placeholder="e.g. WAEC"
              maxLength={BANK_LABEL_MAX}
              value={exam}
              onChange={(event) => setExam(event.target.value)}
            />
          </Field>
          <Field label="Subject">
            <input
              placeholder="e.g. Biology"
              maxLength={BANK_LABEL_MAX}
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            />
          </Field>
        </div>
        <ErrorLine error={error} />
        <button className="s-btn gold big block" type="submit" disabled={save.busy || !name.trim()}>
          {save.busy ? "Saving…" : "Save"}
        </button>
      </form>
    </div>
  );
}

/** `?q=new` or `?q=<id>`: one question, on its own. */
function QuestionView({
  bank,
  questionId,
  back,
  onLeave,
}: {
  bank: PlayerBankDetail;
  questionId: string;
  back: ReactNode;
  onLeave: () => void;
}) {
  const ask = useConfirm();
  const action = useToastAction();
  const isNew = questionId === "new";
  const index = bank.questions.findIndex((x) => x.id === questionId);
  const question = index >= 0 ? bank.questions[index] : undefined;

  if (!isNew && !question) {
    return (
      <div className="study">
        {back}
        <h1 className="study-title">Question</h1>
        <p className="s-empty">This question isn’t in the bank any more.</p>
      </div>
    );
  }

  return (
    <div className="study">
      {back}
      <h1 className="study-title">{isNew ? "New question" : `Question ${index + 1}`}</h1>
      <QuestionFields
        key={questionId}
        initial={question}
        submitLabel={isNew ? "Add question" : "Save question"}
        onSubmit={(input) =>
          (question ? editQuestion(bank.id, question.id, input) : addQuestion(bank.id, input)).then(
            onLeave,
          )
        }
        onCancel={onLeave}
        onDelete={
          question &&
          (() =>
            ask({
              title: "Delete this question?",
              text: question.prompt,
              yes: "Delete question",
              tone: "danger",
              run: () => {
                void action.run(() => deleteQuestion(bank.id, question.id).then(onLeave));
              },
            }))
        }
      />
    </div>
  );
}

/**
 * One question, as the server takes it: four answers, the first correct. It keeps its own busy
 * and error state.
 */
function QuestionFields({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  onDelete,
}: {
  initial?: PlayerBankQuestion;
  submitLabel: string;
  onSubmit: (input: QuestionForm) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
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
    <form className="s-form" onSubmit={handle}>
      <Field label="Question">
        <textarea
          rows={3}
          placeholder="e.g. Which planet is known as the Red Planet?"
          maxLength={BANK_PROMPT_MAX}
          value={prompt}
          onChange={(event) => {
            setPrompt(event.target.value);
            setError(null);
          }}
        />
      </Field>

      <div className="s-pair stack-narrow">
        {choices.map((choice, index) => (
          <Field
            key={index}
            right={index === 0}
            label={index === 0 ? "Correct answer" : `Wrong answer ${index}`}
          >
            <input
              maxLength={BANK_CHOICE_MAX}
              value={choice}
              onChange={(event) => {
                setChoice(index, event.target.value);
                setError(null);
              }}
            />
          </Field>
        ))}
      </div>

      <Field label="Explanation">
        <textarea
          rows={2}
          placeholder="Why that’s the answer"
          maxLength={BANK_EXPLANATION_MAX}
          value={explanation}
          onChange={(event) => {
            setExplanation(event.target.value);
            setError(null);
          }}
        />
      </Field>

      <Field label="Reference">
        <input
          placeholder="e.g. John 3:16"
          maxLength={BANK_REFERENCE_MAX}
          value={reference}
          onChange={(event) => setReference(event.target.value)}
        />
      </Field>

      <ErrorLine error={error} />
      <button className="s-btn gold big block" type="submit" disabled={busy}>
        {busy ? "Saving…" : submitLabel}
      </button>
      <div className="s-actions" style={{ justifyContent: "space-between" }}>
        <button
          className="s-link"
          type="button"
          disabled={busy}
          onClick={() => {
            setError(null);
            onCancel();
          }}
        >
          Cancel
        </button>
        {onDelete && (
          <button className="s-link bad" type="button" disabled={busy} onClick={onDelete}>
            Delete question
          </button>
        )}
      </div>
    </form>
  );
}

/** `?view=assign`: sets the bank for one of your study groups, with a target and a due date. */
function AssignView({
  bank,
  back,
  onLeave,
}: {
  bank: PlayerBankDetail;
  back: ReactNode;
  onLeave: () => void;
}) {
  const toast = useToast();
  const groups = useLoaded(fetchGroups);
  const [groupId, setGroupId] = useState("");
  const [target, setTarget] = useState("");
  const [due, setDue] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const assign = useAction(setError);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!groupId) {
      setError("Pick a group.");
      return;
    }
    void assign.run(async () => {
      const parsedTarget = target ? parseInt(target, 10) : null;
      const parsedDue = due ? new Date(`${due}T23:59:59`).getTime() : null;
      await createGroupAssignment(groupId, {
        bankId: bank.id,
        targetScore: parsedTarget && !isNaN(parsedTarget) ? parsedTarget : null,
        dueAt: parsedDue && !isNaN(parsedDue) ? parsedDue : null,
        notes: notes.trim() || null,
      });
      toast.show({ title: "Assigned to the group", status: "success" });
      onLeave();
    });
  };

  return (
    <div className="study">
      {back}
      <h1 className="study-title">Assign to a study group</h1>
      <ErrorLine error={groups.error} />
      {!groups.data ? (
        groups.error ? null : (
          <Loading />
        )
      ) : groups.data.groups.length === 0 ? (
        <>
          <p className="s-empty">You’re not in a study group yet.</p>
          <a className="s-link" {...linkTo("/friends")}>
            Make one on the Friends page
          </a>
        </>
      ) : (
        <AssignFields
          picker={
            <Field label="Group">
              <select
                id="select-group"
                value={groupId}
                onChange={(event) => {
                  setGroupId(event.target.value);
                  setError(null);
                }}
              >
                <option value="">Choose a group</option>
                {groups.data.groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </Field>
          }
          target={target}
          onTarget={setTarget}
          due={due}
          onDue={setDue}
          notes={notes}
          onNotes={setNotes}
          error={error}
          busy={assign.busy}
          submitLabel="Assign"
          onSubmit={submit}
        />
      )}
    </div>
  );
}

// Import -----------------------------------------------------------------------------------------

function ImportHeading() {
  const account = useAccount();
  const isPro = account.status === "ready" && Boolean(account.user?.isPro);
  return (
    <h1 className="study-title">
      Import questions{" "}
      {!isPro && (
        <span className="s-pro">
          <Icon name="crown" size={14} fill /> Pro
        </span>
      )}
    </h1>
  );
}

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
 * A staged import under review: progress at the top, the rows still needing a person below, and
 * the buttons that answer, accept or commit them. Nothing reaches the bank until the owner
 * confirms, and the AI runs server-side in batches while this screen watches the counts.
 */
function ImportPanel({ bankId, onDone }: { bankId: string; onDone: () => void }) {
  const account = useAccount();
  const isPro = account.status === "ready" && Boolean(account.user?.isPro);
  const [showPro, setShowPro] = useState(false);
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
      setShowPro(true);
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
              setShowPro(true);
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

  const handleDragOver = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!fileBusy) setDragging(true);
  };

  const handleDragLeave = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);
  };

  const handleDrop = (event: DragEvent) => {
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
      text: `${draft.counts.total} questions go into this bank, in the file’s order.`,
      yes: `Add ${draft.counts.total} questions`,
      tone: "gold",
      run: () => {
        setCommitBusy(true);
        commitBankImport(bankId, draft.id).then(
          (added) => {
            toast.show({ title: `${plural(added, "question")} added`, status: "success" });
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
      text: "The staged questions are thrown away. The bank isn’t touched.",
      yes: "Discard import",
      tone: "danger",
      run: () => {
        void action.run(async () => {
          await discardBankImport(bankId, draft.id);
          onDone();
        });
      },
    });
  };

  if (draft === undefined) return <Loading />;

  const counts = draft?.counts;
  const answeredCount = counts ? counts.total - counts.pending : 0;
  const progressPct =
    counts && counts.total > 0 ? Math.round((answeredCount / counts.total) * 100) : 0;

  return (
    <>
      <label
        className={`s-drop${dragging ? " dragging" : ""}`}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <Icon name="upload" size={28} />
        <strong>
          {fileBusy
            ? "Reading the file…"
            : draft
              ? "Choose another file"
              : "Choose a Word, CSV or text file"}
        </strong>
        <span className="study-note">
          {draft ? "It replaces the import below." : "or drop it here"}
        </span>
        <input
          type="file"
          accept=".csv,.docx,.doc,.txt,text/csv,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
          onChange={handleFile}
          disabled={fileBusy}
        />
      </label>
      <button
        type="button"
        className="s-link"
        onClick={downloadCsvTemplate}
        style={{ alignSelf: "flex-start" }}
      >
        Download a sample CSV
      </button>

      {draft && counts ? (
        <>
          <div
            className="s-progress"
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Questions answered"
          >
            <span style={{ width: `${progressPct}%` }} />
          </div>
          <p className="study-note">
            {counts.pending > 0
              ? `Answering with AI… ${answeredCount} of ${counts.total}`
              : `${plural(counts.total, "question")} answered`}
          </p>
          <p className="study-note" data-testid="import-counts">
            {counts.total} rows · {counts.ready} ready · {counts.withKey} from your answer key ·{" "}
            {counts.aiAnswered} from the AI · {counts.needsReview} need review
          </p>
          {aiNote && (
            <p className="study-note" role="status">
              {aiNote}
            </p>
          )}
          {draft.invalid && draft.invalid.count > 0 && (
            <details className="s-dupes">
              <summary className="s-link">
                {plural(draft.invalid.count, "row")} couldn’t be read
              </summary>
              <ul className="s-list">
                {draft.invalid.notes.map((note) => (
                  <li key={note.row} className="s-card">
                    Line {note.row}: {note.message}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {counts.needsReview > 0 ? (
            <>
              <div className="study-section-head">
                <h2 className="study-h2">To answer</h2>
                {aiFlagged.length > 0 && (
                  <button
                    className="s-link gold"
                    type="button"
                    disabled={patchBusy}
                    onClick={() => applyPatch({ acceptAi: true })}
                  >
                    Accept the AI’s {aiFlagged.length}
                  </button>
                )}
              </div>
              <ul className="s-list">
                {flagged.map((row) => (
                  <li key={row.idx} className="s-card">
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
              <div className="s-card">
                <div className="s-pair stack-narrow">
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
                <button
                  className="s-btn"
                  type="button"
                  disabled={patchBusy || selected.size === 0}
                  onClick={applyBulk}
                >
                  Set {plural(selected.size, "row")} to that answer
                </button>
              </div>
            </>
          ) : (
            <p className="s-empty">Every row is ready to import.</p>
          )}

          <ErrorLine error={error} />
          <button
            className="s-btn gold big block"
            type="button"
            disabled={commitBusy || patchBusy || counts.pending > 0 || counts.needsReview > 0}
            onClick={confirmCommit}
          >
            {commitBusy ? "Adding…" : `Add ${plural(counts.total, "question")} to the bank`}
          </button>
          <button
            className="s-link bad"
            type="button"
            disabled={commitBusy || action.busy}
            onClick={confirmDiscard}
            style={{ alignSelf: "center" }}
          >
            Discard import
          </button>
        </>
      ) : (
        <ErrorLine error={error} />
      )}
      {showPro && <ProDialog onClose={() => setShowPro(false)} />}
    </>
  );
}

/** Importing is for Pro: where to get it, or carry on by hand. */
function ProDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="s-dialog"
      aria-labelledby="pro-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
    >
      <h2 id="pro-title">Importing is a Pro feature</h2>
      <p>
        Pro reads Word, CSV and text files straight into your bank. You can still add questions by
        hand.
      </p>
      <div className="s-actions">
        <a className="s-btn gold big" {...linkTo("/pricing")}>
          See Pro plans
        </a>
        <button type="button" className="s-btn" onClick={onClose}>
          Not now
        </button>
      </div>
    </dialog>
  );
}

/** One row to answer: the question, why it's here, and the four options to pick from. */
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
    <>
      <label className="s-check" style={{ alignItems: "flex-start", minHeight: 0 }}>
        <input
          type="checkbox"
          checked={selected}
          disabled={disabled || busy}
          onChange={(event) => onSelected(event.target.checked)}
          style={{ marginTop: 1 }}
        />
        <span>
          <span className="s-q-num">{row.row}</span> {row.prompt}
          {row.source === "ai" && <span className="s-tag">AI</span>}
          {row.source === "key" && <span className="s-tag">Key</span>}
        </span>
      </label>
      {row.review && (
        <p className="s-card-why" role="status">
          {row.review}
        </p>
      )}
      {row.aiExplanation && <p className="s-card-why">AI: {row.aiExplanation}</p>}
      <fieldset className="s-options">
        <legend className="s-label" style={{ marginBottom: 6 }}>
          Correct answer
        </legend>
        {row.choices.map((choice, index) => (
          <label key={index} className="s-option">
            <input
              type="radio"
              name={`import-row-${row.idx}`}
              value={index}
              checked={answerIndex === index}
              disabled={disabled || busy}
              onChange={() => setAnswerIndex(index)}
            />
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
      <button
        className="s-btn small"
        type="button"
        disabled={disabled || busy}
        onClick={save}
        style={{ alignSelf: "flex-start" }}
      >
        {busy ? "Saving…" : "Save answer"}
      </button>
    </>
  );
}
