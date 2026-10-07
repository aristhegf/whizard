import { QUIZ_CATEGORIES } from "@whizard/game-core";
import {
  QUESTION_FILTERS,
  QUESTION_SORTS,
  type AdminQuestionDetail,
  type AdminQuestionList,
  type QuestionFilter,
  type QuestionInput,
  type QuestionSort,
  type ReportAction,
} from "@whizard/protocol";
import { useEffect, useState, type ReactNode } from "react";
import {
  addQuestion,
  decideReport,
  fetchAdminQuestion,
  fetchAdminQuestions,
  revertQuestion,
  saveQuestion,
} from "../api";
import { formatNumber, formatPercent } from "../format";
import { linkTo, navigate } from "../router";
import { Icon } from "../ui/Icon";
import { PanelHead, StatBox } from "./parts";
import {
  answersOf,
  editPath,
  LEVEL_NAMES,
  LEVELS,
  ORIGIN,
  PLAY,
  rightShare,
  topicArt,
  topicName,
} from "./questionParts";

// The same limits the bank's own checks use.
const PROMPT_MAX = 120;
const CHOICE_MAX = 40;
const EXPLANATION_MAX = 160;

const FILTER_LABELS: Record<QuestionFilter, string> = {
  all: "All",
  added: "Added",
  edited: "Edited",
  out: "Out of play",
};

const SORT_LABELS: Record<QuestionSort, string> = {
  id: "By ID",
  hardest: "Hardest first",
  played: "Most played",
};

/** `/admin/content`, and `/admin/content/:id` or `/admin/content/new` for the editor. */
export function Content({ item }: { item: string | null }) {
  return item ? <Editor key={item} id={item === "new" ? null : item} /> : <Browser />;
}

// Browsing --------------------------------------------------------------------------------------

function Browser() {
  const initial = new URLSearchParams(location.search);
  const [category, setCategory] = useState(initial.get("category") ?? "");
  const [difficulty, setDifficulty] = useState(initial.get("difficulty") ?? "");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<QuestionFilter>("all");
  const [sort, setSort] = useState<QuestionSort>("id");
  const [pages, setPages] = useState(1);
  const [data, setData] = useState<AdminQuestionList | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim().toLowerCase()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        let all: AdminQuestionList | null = null;
        for (let page = 0; page < pages && (!all || all.more); page++) {
          const next = await fetchAdminQuestions({
            category,
            difficulty,
            q: search,
            filter,
            sort,
            offset: all?.questions.length ?? 0,
          });
          all = all ? { ...next, questions: [...all.questions, ...next.questions] } : next;
        }
        if (live) {
          setData(all);
          setError(null);
        }
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      live = false;
    };
  }, [category, difficulty, search, filter, sort, pages]);

  const reset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPages(1);
    };

  return (
    <div className={data ? "admin-grid" : "admin-grid loading"}>
      <section className="panel admin-panel span-12" aria-labelledby="content-title">
        <PanelHead
          id="content-title"
          icon="layers"
          title="Question Bank"
          subtitle={data ? `${formatNumber(data.total)} questions` : "Loading…"}
        >
          <a
            className="btn btn-small btn-primary admin-head-action"
            {...linkTo("/admin/content/new")}
          >
            <Icon name="plus" size={18} />
            Add a question
          </a>
        </PanelHead>

        <div className="content-tools">
          <label className="admin-search">
            <span className="sr-only">Search questions</span>
            <input
              type="search"
              placeholder="Search questions, answers or IDs"
              value={query}
              onChange={(e) => reset(setQuery)(e.target.value)}
            />
          </label>
          <label>
            <span className="sr-only">Topic</span>
            <select value={category} onChange={(e) => reset(setCategory)(e.target.value)}>
              <option value="">All topics</option>
              {QUIZ_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Level</span>
            <select value={difficulty} onChange={(e) => reset(setDifficulty)(e.target.value)}>
              <option value="">All levels</option>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {LEVEL_NAMES[l]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Order</span>
            <select value={sort} onChange={(e) => reset(setSort)(e.target.value as QuestionSort)}>
              {QUESTION_SORTS.map((s) => (
                <option key={s} value={s}>
                  {SORT_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="range-switch admin-switch content-filter" role="group" aria-label="Show">
          {QUESTION_FILTERS.map((f) => (
            <button key={f} aria-pressed={filter === f} onClick={() => reset(setFilter)(f)}>
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>

        {error && !data && (
          <p className="error" role="alert">
            Couldn’t load the questions. {error}
          </p>
        )}
        {data && data.questions.length === 0 && <p className="admin-empty">No questions match.</p>}
        <ul className="content-list">
          {(data?.questions ?? []).map((q) => {
            const share = rightShare(q);
            return (
              <li key={q.id}>
                <a className="content-row" {...linkTo(editPath(q.id))}>
                  <span className="rank-art">
                    {topicArt(q.category) && (
                      <img src={topicArt(q.category)} alt="" loading="lazy" />
                    )}
                  </span>
                  <span className="content-text">
                    <strong>{q.prompt}</strong>
                    <span className="report-answer">✓ {q.choices[0]}</span>
                    <span className="content-meta">
                      {q.id} · {topicName(q.category)} · {LEVEL_NAMES[q.difficulty]} · {q.topic}
                    </span>
                  </span>
                  <span className="content-share">
                    {share === null ? "–" : formatPercent(share)}
                    <span>{formatNumber(answersOf(q))} answers</span>
                  </span>
                  <span className="content-status">
                    {ORIGIN[q.origin] && (
                      <span className="status-pill status-admin">{ORIGIN[q.origin]}</span>
                    )}
                    <span className={`status-pill ${PLAY[q.play].tone}`}>{PLAY[q.play].label}</span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
        {data?.more && (
          <button className="btn admin-load-more" onClick={() => setPages((p) => p + 1)}>
            Show more
          </button>
        )}
      </section>
    </div>
  );
}

// Editing ---------------------------------------------------------------------------------------

const EMPTY: QuestionInput = {
  topic: "",
  difficulty: "easy",
  prompt: "",
  choices: ["", "", "", ""],
  explanation: "",
  reference: null,
};

/** Categories whose questions must say where the answer can be checked. */
const REQUIRED_REFERENCE: Record<string, { label: string; hint: string }> = {
  bible: { label: "Verse reference", hint: "Required for Bible questions, e.g. John 3:16" },
  quran: {
    label: "Reference (surah and ayah)",
    hint: "Required for Quran questions, e.g. Al-Baqarah 2:255",
  },
};

function Editor({ id }: { id: string | null }) {
  const [detail, setDetail] = useState<AdminQuestionDetail | null>(null);
  const [category, setCategory] = useState<string>(QUIZ_CATEGORIES[0]!.id);
  const [form, setForm] = useState<QuestionInput>(EMPTY);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!id) return;
    let live = true;
    fetchAdminQuestion(id).then(
      (q) => {
        if (!live) return;
        setDetail(q);
        setCategory(q.category);
        setForm({
          topic: q.topic,
          difficulty: q.difficulty,
          prompt: q.prompt,
          choices: [...q.choices],
          explanation: q.explanation,
          reference: q.reference,
        });
      },
      (e: unknown) => live && setLoadError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      live = false;
    };
  }, [id, version]);

  const set = <K extends keyof QuestionInput>(key: K, value: QuestionInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(null);
  };
  const setChoice = (index: number, value: string) =>
    set(
      "choices",
      form.choices.map((c, i) => (i === index ? value : c)),
    );

  const submit = async () => {
    setSaving(true);
    setProblem(null);
    try {
      if (id) {
        await saveQuestion(id, form);
        setSaved("Saved. New games use it within a minute.");
        setVersion((v) => v + 1);
      } else {
        const { id: newId } = await addQuestion({ ...form, category });
        navigate(editPath(newId));
      }
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const act = async (run: () => Promise<unknown>, message: string, after?: () => void) => {
    setProblem(null);
    try {
      await run();
      setSaved(message);
      if (after) after();
      else setVersion((v) => v + 1);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    }
  };
  const decide = (action: ReportAction, message: string) =>
    act(() => decideReport(id!, action), message);

  if (loadError) {
    return (
      <p className="error" role="alert">
        Couldn’t load that question. {loadError}
      </p>
    );
  }
  if (id && !detail) return <p className="admin-loading">Loading…</p>;

  const reference = REQUIRED_REFERENCE[category];
  return (
    <div className="admin-grid">
      <section className="panel admin-panel span-8" aria-labelledby="editor-title">
        <PanelHead
          id="editor-title"
          icon={id ? "layers" : "plus"}
          title={id ? "Edit Question" : "Add a Question"}
          subtitle={
            id
              ? `${id} · ${topicName(category)}`
              : "Checked the same way as the questions that ship with Whizard."
          }
        >
          <a className="admin-more" {...linkTo("/admin/content")}>
            All questions
          </a>
        </PanelHead>

        <form
          className="question-form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="form-row">
            <Field label="Topic">
              {id ? (
                <input value={topicName(category)} disabled />
              ) : (
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {QUIZ_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Level">
              <select value={form.difficulty} onChange={(e) => set("difficulty", e.target.value)}>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {LEVEL_NAMES[l]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Sub-topic" hint="e.g. Genesis, Rivers, Afrobeats">
              <input
                value={form.topic}
                maxLength={40}
                onChange={(e) => set("topic", e.target.value)}
                required
              />
            </Field>
          </div>

          <Field label="Question" count={[form.prompt.length, PROMPT_MAX]}>
            <textarea
              value={form.prompt}
              rows={2}
              maxLength={PROMPT_MAX}
              onChange={(e) => set("prompt", e.target.value)}
              required
            />
          </Field>

          <div className="form-row two">
            {form.choices.map((choice, i) => (
              <Field
                key={i}
                label={i === 0 ? "Correct answer" : `Wrong answer ${i}`}
                tone={i === 0 ? "right" : undefined}
                count={[choice.length, CHOICE_MAX]}
              >
                <input
                  value={choice}
                  maxLength={CHOICE_MAX}
                  onChange={(e) => setChoice(i, e.target.value)}
                  required
                />
              </Field>
            ))}
          </div>

          <Field
            label="Explanation"
            hint="Shown after the answer. One or two plain sentences."
            count={[form.explanation.length, EXPLANATION_MAX]}
          >
            <textarea
              value={form.explanation}
              rows={2}
              maxLength={EXPLANATION_MAX}
              onChange={(e) => set("explanation", e.target.value)}
              required
            />
          </Field>
          <Field
            label={reference?.label ?? "Reference (optional)"}
            hint={reference?.hint ?? "Where to check it"}
          >
            <input
              value={form.reference ?? ""}
              maxLength={60}
              onChange={(e) => set("reference", e.target.value || null)}
              required={!!reference}
            />
          </Field>

          {problem && (
            <p className="error" role="alert">
              {problem}
            </p>
          )}
          {saved && (
            <p className="form-saved" role="status">
              {saved}
            </p>
          )}
          <div className="form-actions">
            <button className="btn btn-primary" disabled={saving}>
              {saving ? "Saving…" : id ? "Save changes" : "Add question"}
            </button>
            <a className="btn" {...linkTo("/admin/content")}>
              Cancel
            </a>
          </div>
          {id && (
            <p className="admin-note">
              New wording starts with a clean slate: earlier reports and answer numbers stay with
              the old wording.
            </p>
          )}
        </form>
      </section>

      <div className="span-4 editor-side">
        {detail && (
          <>
            <section className="panel admin-panel" aria-labelledby="play-title">
              <PanelHead id="play-title" icon="help" title="How It Plays" />
              <div className="room-stats two">
                <StatBox label="Answers" value={formatNumber(answersOf(detail))} />
                <StatBox
                  label="Right"
                  value={rightShare(detail) === null ? "–" : formatPercent(rightShare(detail)!)}
                />
              </div>
              {detail.stats && detail.stats.wrongPicks.length > 0 && (
                <ul className="share-list plain">
                  {detail.stats.wrongPicks.map((w) => (
                    <li key={w.choice}>
                      <span className="share-name">✗ {w.choice}</span>
                      <span />
                      <span className="share-value">×{w.picks}</span>
                    </li>
                  ))}
                </ul>
              )}
              {detail.stats && detail.stats.timedOut > 0 && (
                <p className="admin-note">Time ran out {detail.stats.timedOut} times.</p>
              )}
            </section>

            <section className="panel admin-panel" aria-labelledby="status-title">
              <PanelHead id="status-title" icon="shield" title="Status" />
              <p className="content-status">
                <span className={`status-pill ${PLAY[detail.play].tone}`}>
                  {PLAY[detail.play].label}
                </span>
                {ORIGIN[detail.origin] && (
                  <span className="status-pill status-admin">{ORIGIN[detail.origin]}</span>
                )}
                {detail.reports > 0 && (
                  <span className="report-count">
                    {detail.reports} {detail.reports === 1 ? "report" : "reports"}
                  </span>
                )}
              </p>
              <div className="form-actions">
                {detail.play === "in_play" ? (
                  <button
                    className="btn btn-small btn-danger"
                    onClick={() => void decide("retire", "Taken out of play.")}
                  >
                    Take out of play
                  </button>
                ) : detail.play === "reported_out" ? (
                  <button
                    className="btn btn-small"
                    onClick={() => void decide("keep", "Checked and put back in play.")}
                  >
                    It’s fine: put it back
                  </button>
                ) : (
                  <button
                    className="btn btn-small"
                    onClick={() => void decide("reopen", "Back in play.")}
                  >
                    Put back in play
                  </button>
                )}
                {detail.origin === "edited" && (
                  <button
                    className="btn btn-small"
                    onClick={() =>
                      void act(() => revertQuestion(detail.id), "Back to how it ships.")
                    }
                  >
                    Undo my edits
                  </button>
                )}
                {detail.origin === "added" && (
                  <button
                    className="btn btn-small btn-danger"
                    onClick={() =>
                      void act(
                        () => revertQuestion(detail.id),
                        "Deleted.",
                        () => navigate("/admin/content"),
                      )
                    }
                  >
                    Delete question
                  </button>
                )}
              </div>
            </section>

            {detail.original && (
              <section className="panel admin-panel" aria-labelledby="original-title">
                <PanelHead id="original-title" icon="repeat" title="How It Ships" />
                <p className="report-prompt">{detail.original.prompt}</p>
                <p className="report-answer">✓ {detail.original.choices[0]}</p>
                <p className="admin-note">
                  {detail.original.choices.slice(1).join(" · ")} ·{" "}
                  {LEVEL_NAMES[detail.original.difficulty]}
                </p>
              </section>
            )}
          </>
        )}
        <Tips />
      </div>
    </div>
  );
}

/** The house rules for questions, from docs/QUESTIONS.md, in short. */
function Tips() {
  return (
    <section className="panel admin-panel" aria-labelledby="tips-title">
      <PanelHead id="tips-title" icon="info" title="A Good Question" />
      <ul className="tips">
        <li>
          <strong>Certain, not likely.</strong> Only if the answer is definitely right.
        </li>
        <li>
          <strong>One right answer.</strong> Wrong answers of the same kind, plausible but clearly
          wrong. No jokes, no “all of the above”.
        </li>
        <li>
          <strong>Built to last.</strong> Nothing that goes out of date: current holders, records,
          rankings.
        </li>
        <li>
          <strong>Levels.</strong> Easy: most adults know it. Medium: someone who enjoys the
          subject. Hard: a real fan might miss it.
        </li>
      </ul>
    </section>
  );
}

function Field({
  label,
  hint,
  count,
  tone,
  children,
}: {
  label: string;
  hint?: string;
  count?: [number, number];
  tone?: "right" | undefined;
  children: ReactNode;
}) {
  return (
    <label className={tone === "right" ? "form-field right" : "form-field"}>
      <span className="form-label">
        {label}
        {count && (
          <span className={count[0] > count[1] * 0.9 ? "form-count near" : "form-count"}>
            {count[0]}/{count[1]}
          </span>
        )}
      </span>
      {children}
      {hint && <span className="form-hint">{hint}</span>}
    </label>
  );
}
