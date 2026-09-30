import {
  LEVEL_CHOICES,
  LEVEL_NAMES,
  QUIZ_QUESTION_COUNTS,
  QUIZ_TIME_LIMITS_SECONDS,
  QUIZ_VARIANTS,
  quizSettingsSchema,
  type QuizSettings,
} from "@whizard/game-core";
import { SettingRow as Row, SettingSelect } from "../../ui/SettingSelect";
import { AUTO_HINT, EliminationLength } from "../rounds/RoundsSettingsRows";

export function parseQuizSettings(settings: unknown): QuizSettings | null {
  const parsed = quizSettingsSchema.safeParse(settings);
  return parsed.success ? parsed.data : null;
}

/**
 * The quiz's rows in the lobby's Room Settings list. Only the host can change them. The topic is
 * chosen from the pencil on the Quiz card, so it isn't repeated here.
 */
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
      <Row
        icon="games"
        id="game-mode"
        label="Game Mode"
        hint={QUIZ_VARIANTS.find((v) => v.id === settings.variant)?.description}
      >
        <SettingSelect
          id="game-mode"
          label="Game Mode"
          value={settings.variant}
          disabled={!editable}
          options={QUIZ_VARIANTS.map((v) => ({ value: v.id, label: v.name }))}
          onChange={(value) => set("variant", value as QuizSettings["variant"])}
        />
      </Row>
      <Row
        icon="trophy"
        id="level"
        label="Level"
        hint={settings.difficulty === "auto" ? AUTO_HINT : undefined}
      >
        <SettingSelect
          id="level"
          label="Level"
          value={settings.difficulty}
          disabled={!editable}
          options={LEVEL_CHOICES.map((d) => ({ value: d, label: LEVEL_NAMES[d] }))}
          onChange={(value) => set("difficulty", value as QuizSettings["difficulty"])}
        />
      </Row>
      <Row
        icon="copy"
        id="questions"
        label={countLabel}
        hint={
          elimination ? (
            <EliminationLength players={players} perRound={settings.count} noun="questions" />
          ) : undefined
        }
      >
        <SettingSelect
          id="questions"
          label={countLabel}
          value={String(settings.count)}
          disabled={!editable}
          options={QUIZ_QUESTION_COUNTS.map((n) => ({ value: String(n), label: String(n) }))}
          onChange={(value) => set("count", Number(value) as QuizSettings["count"])}
        />
      </Row>
      {speed && (
        <Row icon="clock" id="time-limit" label="Time per Question">
          <SettingSelect
            id="time-limit"
            label="Time per Question"
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
