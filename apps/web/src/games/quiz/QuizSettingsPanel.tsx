import {
  QUIZ_CATEGORIES,
  QUIZ_DIFFICULTIES,
  QUIZ_QUESTION_COUNTS,
  QUIZ_TIME_LIMITS_SECONDS,
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
  const category = QUIZ_CATEGORIES.find((c) => c.id === settings.category)!;

  if (!editable) {
    return (
      <p className="summary">
        Quiz · {category.name} · {DIFFICULTY_LABELS[settings.difficulty]} · {settings.count}{" "}
        questions · {settings.timeLimitSeconds}s each
      </p>
    );
  }

  const set = <K extends keyof QuizSettings>(key: K, value: QuizSettings[K]) =>
    onChange({ ...settings, [key]: value });

  return (
    <div className="settings">
      <Setting label="Category" htmlFor="category">
        <CategorySelect value={settings.category} onChange={(value) => set("category", value)} />
      </Setting>
      <Setting label="Level">
        <Segmented
          label="Level"
          options={QUIZ_DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_LABELS[d] }))}
          value={settings.difficulty}
          onChange={(value) => set("difficulty", value)}
        />
      </Setting>
      <Setting label="Questions">
        <Segmented
          label="Questions"
          options={QUIZ_QUESTION_COUNTS.map((n) => ({ value: n, label: String(n) }))}
          value={settings.count}
          onChange={(value) => set("count", value)}
        />
      </Setting>
      <Setting label="Time">
        <Segmented
          label="Time per question"
          options={QUIZ_TIME_LIMITS_SECONDS.map((s) => ({ value: s, label: `${s}s` }))}
          value={settings.timeLimitSeconds}
          onChange={(value) => set("timeLimitSeconds", value)}
        />
      </Setting>
    </div>
  );
}

function CategorySelect({
  value,
  onChange,
}: {
  value: QuizSettings["category"];
  onChange: (value: QuizSettings["category"]) => void;
}) {
  const [available, setAvailable] = useState<QuizCategoryInfo[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchQuizCategories()
      .then((result) => !cancelled && setAvailable(result))
      .catch(() => !cancelled && setAvailable([]));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <select
      id="category"
      value={value}
      onChange={(event) => onChange(event.target.value as QuizSettings["category"])}
    >
      {QUIZ_CATEGORIES.map((c) => {
        const info = available?.find((i) => i.id === c.id);
        const empty =
          !!available &&
          (!info || info.questions.easy + info.questions.medium + info.questions.hard === 0);
        return (
          <option key={c.id} value={c.id} disabled={empty && c.id !== value}>
            {c.name}
            {empty ? " (soon)" : ""}
          </option>
        );
      })}
    </select>
  );
}

function Setting({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="setting">
      {htmlFor ? (
        <label className="setting-name" htmlFor={htmlFor}>
          {label}
        </label>
      ) : (
        <span className="setting-name" aria-hidden="true">
          {label}
        </span>
      )}
      {children}
    </div>
  );
}

function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
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
