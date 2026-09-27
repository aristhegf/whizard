import {
  QUIZ_CATEGORIES,
  QUIZ_DIFFICULTIES,
  QUIZ_QUESTION_COUNTS,
  QUIZ_TIME_LIMITS_SECONDS,
  QUIZ_VARIANTS,
  quizSettingsSchema,
  type QuizSettings,
} from "@whizard/game-core";
import { useEffect, useState, type ReactNode } from "react";
import { fetchQuizCategories, type QuizCategoryInfo } from "../../api";

const DIFFICULTY_LABELS = { easy: "Easy", medium: "Medium", hard: "Hard" } as const;

export function parseQuizSettings(settings: unknown): QuizSettings | null {
  const parsed = quizSettingsSchema.safeParse(settings);
  return parsed.success ? parsed.data : null;
}

export function QuizSettingsPanel({
  settings,
  editable,
  onChange,
}: {
  settings: QuizSettings;
  editable: boolean;
  onChange: (settings: QuizSettings) => void;
}) {
  const [categories, setCategories] = useState<QuizCategoryInfo[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchQuizCategories()
      .then((result) => !cancelled && setCategories(result))
      .catch(() => !cancelled && setCategories([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const variant = QUIZ_VARIANTS.find((v) => v.id === settings.variant)!;
  const category = QUIZ_CATEGORIES.find((c) => c.id === settings.category)!;
  const available = categories?.find((c) => c.id === settings.category)?.questions[
    settings.difficulty
  ];

  if (!editable) {
    return (
      <div className="stack settings-summary">
        <h2 className="section-title">Game</h2>
        <p>
          <strong>Quiz · {variant.name}</strong>
          <br />
          {category.name}, {DIFFICULTY_LABELS[settings.difficulty].toLowerCase()}, {settings.count}{" "}
          questions, {settings.timeLimitSeconds} seconds each
        </p>
      </div>
    );
  }

  const set = <K extends keyof QuizSettings>(key: K, value: QuizSettings[K]) =>
    onChange({ ...settings, [key]: value });

  return (
    <div className="stack">
      <h2 className="section-title">Game</h2>

      <Field label="Category">
        <select
          value={settings.category}
          onChange={(event) => set("category", event.target.value as QuizSettings["category"])}
        >
          {QUIZ_CATEGORIES.map((c) => {
            const info = categories?.find((i) => i.id === c.id);
            const total = info
              ? info.questions.easy + info.questions.medium + info.questions.hard
              : 0;
            const ready = categories === null || total > 0 || c.id === settings.category;
            return (
              <option key={c.id} value={c.id} disabled={!ready}>
                {c.name}
                {categories !== null && total === 0 ? " (coming soon)" : ""}
              </option>
            );
          })}
        </select>
      </Field>

      <Field label="Mode">
        <Segmented
          options={QUIZ_VARIANTS.map((v) => ({ value: v.id, label: v.name }))}
          value={settings.variant}
          onChange={(value) => set("variant", value)}
        />
        <p className="hint left">{variant.description}</p>
      </Field>

      <Field label="Difficulty">
        <Segmented
          options={QUIZ_DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_LABELS[d] }))}
          value={settings.difficulty}
          onChange={(value) => set("difficulty", value)}
        />
      </Field>

      <Field label="Questions">
        <Segmented
          options={QUIZ_QUESTION_COUNTS.map((n) => ({ value: n, label: String(n) }))}
          value={settings.count}
          onChange={(value) => set("count", value)}
        />
        {available !== undefined && available < settings.count && (
          <p className="hint left">
            {available === 0
              ? "No questions at this difficulty yet."
              : `Only ${available} questions at this difficulty so far.`}
          </p>
        )}
      </Field>

      <Field label="Time per question">
        <Segmented
          options={QUIZ_TIME_LIMITS_SECONDS.map((s) => ({ value: s, label: `${s}s` }))}
          value={settings.timeLimitSeconds}
          onChange={(value) => set("timeLimitSeconds", value)}
        />
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field" role="group" aria-label={label}>
      <span className="field-label">{label}</span>
      {children}
    </div>
  );
}

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
