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
import { Icon, type IconName } from "../../ui/Icon";

const DIFFICULTY_LABELS = { easy: "Easy", medium: "Medium", hard: "Hard" } as const;

export function parseQuizSettings(settings: unknown): QuizSettings | null {
  const parsed = quizSettingsSchema.safeParse(settings);
  return parsed.success ? parsed.data : null;
}

/** The quiz's rows in the lobby's Room Settings list. Only the host can change them. */
export function QuizSettingsRows({
  settings,
  editable,
  onChange,
}: {
  settings: QuizSettings;
  editable: boolean;
  onChange: (settings: QuizSettings) => void;
}) {
  const speed = settings.variant === "speed";
  const set = <K extends keyof QuizSettings>(key: K, value: QuizSettings[K]) =>
    onChange({ ...settings, [key]: value });

  return (
    <>
      <Row icon="games" id="game-mode" label="Game Mode">
        <select
          id="game-mode"
          value={settings.variant}
          disabled={!editable}
          onChange={(event) => set("variant", event.target.value as QuizSettings["variant"])}
        >
          {QUIZ_VARIANTS.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </Row>
      <p className="setting-hint dim small">
        {QUIZ_VARIANTS.find((v) => v.id === settings.variant)?.description}
      </p>
      <Row icon="star" id="category" label="Category">
        <CategorySelect
          value={settings.category}
          disabled={!editable}
          onChange={(value) => set("category", value)}
        />
      </Row>
      <Row icon="trophy" id="level" label="Level">
        <select
          id="level"
          value={settings.difficulty}
          disabled={!editable}
          onChange={(event) => set("difficulty", event.target.value as QuizSettings["difficulty"])}
        >
          {QUIZ_DIFFICULTIES.map((d) => (
            <option key={d} value={d}>
              {DIFFICULTY_LABELS[d]}
            </option>
          ))}
        </select>
      </Row>
      <Row icon="copy" id="questions" label="Questions">
        <select
          id="questions"
          value={settings.count}
          disabled={!editable}
          onChange={(event) => set("count", Number(event.target.value) as QuizSettings["count"])}
        >
          {QUIZ_QUESTION_COUNTS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </Row>
      {speed && (
        <Row icon="clock" id="time-limit" label="Time per question">
          <select
            id="time-limit"
            value={settings.timeLimitSeconds}
            disabled={!editable}
            onChange={(event) =>
              set(
                "timeLimitSeconds",
                Number(event.target.value) as QuizSettings["timeLimitSeconds"],
              )
            }
          >
            {QUIZ_TIME_LIMITS_SECONDS.map((s) => (
              <option key={s} value={s}>
                {s} seconds
              </option>
            ))}
          </select>
        </Row>
      )}
    </>
  );
}

function Row({
  icon,
  id,
  label,
  children,
}: {
  icon: IconName;
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="setting-row">
      <Icon name={icon} size={20} />
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

function CategorySelect({
  value,
  disabled,
  onChange,
}: {
  value: QuizSettings["category"];
  disabled: boolean;
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
      disabled={disabled}
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
