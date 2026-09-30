import {
  LEVEL_CHOICES,
  LEVEL_NAMES,
  QUIZ_QUESTION_COUNTS,
  QUIZ_TIME_LIMITS_SECONDS,
  QUIZ_VARIANTS,
  quizSettingsSchema,
  type QuizSettings,
} from "@whizard/game-core";
import {
  eliminationLength,
  FixedTimeRow,
  LengthRow,
  LevelRow,
  ModeRow,
  TimeRow,
} from "../settingRows";

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
  const set = <K extends keyof QuizSettings>(key: K, value: QuizSettings[K]) =>
    onChange({ ...settings, [key]: value });

  return (
    <>
      <ModeRow
        modes={QUIZ_VARIANTS}
        value={settings.variant}
        extra={elimination ? eliminationLength(players, settings.count, "questions") : null}
        editable={editable}
        onChange={(variant) => set("variant", variant)}
      />
      <LevelRow
        choices={LEVEL_CHOICES.map((d) => ({ value: d, label: LEVEL_NAMES[d] }))}
        value={settings.difficulty}
        editable={editable}
        onChange={(difficulty) => set("difficulty", difficulty)}
      />
      {/* In Elimination the number is each round's; played straight through, it's the game's. */}
      <LengthRow
        label={elimination ? "Questions per round" : "Questions"}
        value={settings.count}
        counts={QUIZ_QUESTION_COUNTS}
        editable={editable}
        onChange={(count) => set("count", count as QuizSettings["count"])}
      />
      {settings.variant === "classic" ? (
        <FixedTimeRow label="Time per Question" value="No clock" />
      ) : (
        <TimeRow
          label="Time per Question"
          value={settings.timeLimitSeconds}
          choices={QUIZ_TIME_LIMITS_SECONDS}
          unit="seconds"
          editable={editable}
          onChange={(seconds) =>
            set("timeLimitSeconds", seconds as QuizSettings["timeLimitSeconds"])
          }
        />
      )}
    </>
  );
}
