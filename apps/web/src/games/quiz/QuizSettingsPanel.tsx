import {
  QUIZ_CATEGORIES,
  LEVEL_CHOICES,
  LEVEL_NAMES,
  QUIZ_QUESTION_COUNTS,
  QUIZ_TIME_LIMITS_SECONDS,
  QUIZ_VARIANTS,
  quizSettingsSchema,
  type QuizSettings,
} from "@whizard/game-core";
import { useEffect, useState } from "react";
import { fetchQuizCategories, type QuizCategoryInfo } from "../../api";
import { SettingRow as Row, SettingSelect } from "../../ui/SettingSelect";
import { AUTO_HINT, EliminationLength } from "../rounds/RoundsSettingsRows";

export function parseQuizSettings(settings: unknown): QuizSettings | null {
  const parsed = quizSettingsSchema.safeParse(settings);
  return parsed.success ? parsed.data : null;
}

/** The quiz's rows in the lobby's Room Settings list. Only the host can change them. */
export function QuizSettingsRows({
  settings,
  players,
  editable,
  onChange,
}: {
  settings: QuizSettings;
  /** Players in the room now, for how long an Elimination game will be. */
  players: number;
  editable: boolean;
  onChange: (settings: QuizSettings) => void;
}) {
  const elimination = settings.variant === "elimination";
  const speed = settings.variant === "speed" || elimination;
  // In Elimination the number is each round's; played straight through, it's the game's.
  const countLabel = elimination ? "Questions per round" : "Questions";
  const set = <K extends keyof QuizSettings>(key: K, value: QuizSettings[K]) =>
    onChange({ ...settings, [key]: value });

  return (
    <>
      <Row icon="games" id="game-mode" label="Game Mode">
        <SettingSelect
          id="game-mode"
          label="Game Mode"
          value={settings.variant}
          disabled={!editable}
          options={QUIZ_VARIANTS.map((v) => ({ value: v.id, label: v.name }))}
          onChange={(value) => set("variant", value as QuizSettings["variant"])}
        />
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
        <SettingSelect
          id="level"
          label="Level"
          value={settings.difficulty}
          disabled={!editable}
          options={LEVEL_CHOICES.map((d) => ({ value: d, label: LEVEL_NAMES[d] }))}
          onChange={(value) => set("difficulty", value as QuizSettings["difficulty"])}
        />
      </Row>
      {settings.difficulty === "auto" && <p className="setting-hint dim small">{AUTO_HINT}</p>}
      <Row icon="copy" id="questions" label={countLabel}>
        <SettingSelect
          id="questions"
          label={countLabel}
          value={String(settings.count)}
          disabled={!editable}
          options={QUIZ_QUESTION_COUNTS.map((n) => ({ value: String(n), label: String(n) }))}
          onChange={(value) => set("count", Number(value) as QuizSettings["count"])}
        />
      </Row>
      {elimination && (
        <EliminationLength players={players} perRound={settings.count} noun="questions" />
      )}
      {speed && (
        <Row icon="clock" id="time-limit" label="Time per question">
          <SettingSelect
            id="time-limit"
            label="Time per question"
            value={String(settings.timeLimitSeconds)}
            disabled={!editable}
            options={QUIZ_TIME_LIMITS_SECONDS.map((s) => ({
              value: String(s),
              label: `${s} seconds`,
            }))}
            onChange={(value) =>
              set("timeLimitSeconds", Number(value) as QuizSettings["timeLimitSeconds"])
            }
          />
        </Row>
      )}
    </>
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
    <SettingSelect
      id="category"
      label="Category"
      value={value}
      disabled={disabled}
      options={QUIZ_CATEGORIES.map((c) => {
        const info = available?.find((i) => i.id === c.id);
        const empty =
          !!available &&
          (!info || info.questions.easy + info.questions.medium + info.questions.hard === 0);
        return {
          value: c.id,
          label: empty ? `${c.name} (soon)` : c.name,
          disabled: empty && c.id !== value,
        };
      })}
      onChange={(next) => onChange(next as QuizSettings["category"])}
    />
  );
}
